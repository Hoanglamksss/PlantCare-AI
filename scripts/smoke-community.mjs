import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const origin = new URL(process.argv[2] ?? 'http://localhost:8080').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Chỉ chạy với môi trường local.');

async function request(path, status, { method = 'GET', body, session, csrf = true, idempotencyKey } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers.Origin = origin;
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (session) headers.Cookie = session.cookie;
  if (session && csrf && method !== 'GET') headers['X-CSRF-Token'] = session.csrfToken;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`${origin}${path}`, {
    method, headers, body: multipart || body === undefined ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, status, `${method} ${path} phải trả ${status}`);
  return response;
}

async function json(path, status, options) {
  return (await request(path, status, options)).json();
}

async function account() {
  const credentials = { email: `community-${randomUUID()}@example.test`, password: randomBytes(24).toString('base64url') };
  await request('/api/v1/auth/register', 200, { method: 'POST', body: credentials });
  const response = await request('/api/v1/auth/login', 200, { method: 'POST', body: credentials });
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('plantcare_session='));
  assert.ok(cookie?.includes('HttpOnly'));
  const { csrfToken } = await response.json();
  return { cookie: cookie.split(';')[0], csrfToken };
}

const leaf = new Blob([await readFile(new URL('../frontend/src/assets/balcony-tomato.jpg', import.meta.url))], { type: 'image/jpeg' });
function multipart(fields, count = 1) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  for (let index = 0; index < count; index++) form.append('images', leaf, `leaf-${index}.jpg`);
  return form;
}

async function checkPhoto(url, session) {
  const response = await request(url, 200, { session });
  assert.match(response.headers.get('content-type'), /^image\/jpeg/);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 2)], [255, 216]);
}

const posts = '/api/v1/community/posts';
await request('/health/ready', 200);
const spec = await json('/openapi.json', 200);
for (const path of ['/community/posts', '/community/posts/{postId}/reaction', '/community/posts/{postId}/comments/{commentId}/like']) {
  assert.ok(spec.paths[path], `OpenAPI thiếu ${path}`);
}
await request(posts, 401);
const owner = await account();
const visitor = await account();
const outsider = await account();
const plant = await json('/api/v1/plants', 201, {
  method: 'POST', session: owner,
  body: { speciesCode: 'tomato', nickname: `Cây riêng ${randomUUID()}`, note: 'Ghi chú riêng ngoài cộng đồng' },
});
const privateNote = await json(`/api/v1/plants/${plant.id}/notes`, 201, {
  method: 'POST', session: owner,
  body: multipart({ note: 'Ảnh nhật ký chỉ chia sẻ khi đồng ý', happenedAt: '2026-11-18T10:00:00+07:00' }),
});
const scanBody = new FormData();
scanBody.set('image', leaf, 'screening.jpg');
scanBody.set('plantId', plant.id);
scanBody.set('speciesCode', 'tomato');
const scan = await json('/api/v1/diagnoses', 202, { method: 'POST', session: owner, body: scanBody, idempotencyKey: randomUUID() });

const input = { plantId: plant.id, title: 'Nhật ký cây thử nghiệm', note: 'Lá mới sau một tuần', happenedAt: '2026-11-18T08:30:00+07:00', includeHistory: false };
await request(posts, 403, { method: 'POST', session: owner, csrf: false, body: input });
await request(posts, 404, { method: 'POST', session: visitor, body: input });
await request(posts, 400, { method: 'POST', session: owner, body: { ...input, note: '' } });
await request(posts, 400, { method: 'POST', session: owner, body: multipart(input, 5) });
const oversized = new FormData();
for (const [key, value] of Object.entries(input)) oversized.set(key, String(value));
oversized.append('images', new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/jpeg' }), 'oversized.jpg');
await request(posts, 413, { method: 'POST', session: owner, body: oversized });

const first = await json(posts, 201, { method: 'POST', session: owner, body: multipart(input, 2) });
const firstPath = `${posts}/${first.id}`;
assert.equal(first.plantId, plant.id);
assert.equal(first.happenedAt, '2026-11-18T01:30:00.000Z');
assert.equal(first.photos.length, 2);
assert.equal(first.includeHistory, false);
assert.equal(first.myReaction, null);
assert.deepEqual(first.reactions, { heart: 0, cry: 0, laugh: 0 });
await request(`${firstPath}/notes`, 404, { session: visitor });
await request(`${firstPath}/diagnoses`, 404, { session: visitor });
await request(privateNote.photoUrls[0], 404, { session: visitor });
for (const photo of first.photos) await checkPhoto(photo.url, visitor);
const publicPost = await json(firstPath, 200, { session: visitor });
assert.equal(publicPost.isOwner, false);
assert.match(publicPost.author, /^Người trồng /u);
for (const field of ['email', 'phone', 'avatarUrl', 'displayName', 'nickname', 'authorId', 'ownerId', 'tai_khoan_id']) assert.ok(!(field in publicPost));
await request(firstPath, 404, { method: 'PATCH', session: visitor, body: { title: 'Sửa sai chủ' } });
await request(firstPath, 404, { method: 'DELETE', session: visitor });

const second = await json(posts, 201, { method: 'POST', session: owner, body: { ...input, title: 'Bài thứ hai', note: 'Cùng cây, một mốc khác' } });
assert.notEqual(first.id, second.id);
const mine = await json(`${posts}?mine=true&limit=1`, 200, { session: owner });
assert.equal(mine.items.length, 1);
assert.ok(mine.nextCursor);
const mineNext = await json(`${posts}?mine=true&limit=1&cursor=${mine.nextCursor}`, 200, { session: owner });
assert.ok(mineNext.items.some(post => post.id === first.id));
const notMine = await json(`${posts}?mine=true`, 200, { session: visitor });
assert.ok(!notMine.items.some(post => [first.id, second.id].includes(post.id)));

const visitorPlant = await json('/api/v1/plants', 201, { method: 'POST', session: visitor, body: { speciesCode: 'mint', nickname: 'Bạc hà thử nghiệm' } });
const visitorPost = await json(posts, 201, { method: 'POST', session: visitor, body: multipart({ ...input, plantId: visitorPlant.id, title: 'Bài của tài khoản khác' }) });
await request(firstPath, 404, { method: 'PATCH', session: owner, body: { retainedPhotoIds: [visitorPost.photos[0].id] } });
const removedPhoto = first.photos[1];
const edited = await json(firstPath, 200, {
  method: 'PATCH', session: owner,
  body: multipart({ title: 'Đã sửa bài', note: 'Ghi chú cập nhật', happenedAt: '2026-11-17T09:00:00+07:00', retainedPhotoIds: [first.photos[0].id] }),
});
assert.equal(edited.title, 'Đã sửa bài');
assert.equal(edited.happenedAt, '2026-11-17T02:00:00.000Z');
assert.equal(edited.photos.length, 2);
assert.equal(edited.photos[0].id, first.photos[0].id);
assert.notEqual(edited.photos[1].id, removedPhoto.id);
await request(removedPhoto.url, 404, { session: owner });
for (const photo of edited.photos) await checkPhoto(photo.url, visitor);

for (const reaction of ['heart', 'cry', 'laugh', 'laugh']) {
  const result = await json(`${firstPath}/reaction`, 200, { method: 'PUT', session: visitor, body: { reaction } });
  assert.equal(result.myReaction, reaction);
  assert.equal(Object.values(result.reactions).reduce((sum, value) => sum + value, 0), 1);
}
const unreacted = await json(`${firstPath}/reaction`, 200, { method: 'PUT', session: visitor, body: { reaction: null } });
assert.deepEqual(unreacted.reactions, { heart: 0, cry: 0, laugh: 0 });
assert.equal(unreacted.myReaction, null);

const comments = `${firstPath}/comments`;
const rootComment = await json(comments, 201, { method: 'POST', session: visitor, body: multipart({ body: 'Ảnh lá của tôi để đối chiếu' }, 2) });
assert.equal(rootComment.photos.length, 2);
assert.equal(rootComment.parentId, null);
for (const photo of rootComment.photos) await checkPhoto(photo.url, owner);
await request(`${comments}/${rootComment.id}`, 404, { method: 'DELETE', session: outsider });
const reply = await json(comments, 201, { method: 'POST', session: owner, body: { body: 'Cảm ơn bạn đã chia sẻ', parentId: rootComment.id } });
const nestedReply = await json(comments, 201, { method: 'POST', session: visitor, body: { body: 'Một câu trả lời tiếp', parentId: reply.id } });
const roots = await json(comments, 200, { session: owner });
assert.equal(roots.items.find(comment => comment.id === rootComment.id).replyCount, 1);
assert.ok(!roots.items.some(comment => comment.id === reply.id));
const replies = await json(`${comments}?parentId=${rootComment.id}&limit=1`, 200, { session: visitor });
assert.equal(replies.items[0].id, reply.id);
assert.equal(replies.items[0].replyCount, 1);
await request(`${posts}/${second.id}/comments`, 404, { method: 'POST', session: visitor, body: { body: 'Sai bài', parentId: rootComment.id } });
for (const liked of [true, true, false]) {
  const result = await json(`${comments}/${rootComment.id}/like`, 200, { method: 'PUT', session: owner, body: { liked } });
  assert.deepEqual(result, { likeCount: Number(liked), liked });
}
await request(`${comments}/${rootComment.id}/like`, 403, { method: 'PUT', session: owner, csrf: false, body: { liked: true } });

await json(firstPath, 200, { method: 'PATCH', session: owner, body: { includeHistory: true } });
const sharedNotes = await json(`${firstPath}/notes`, 200, { session: visitor });
const sharedNote = sharedNotes.items.find(note => note.id === privateNote.id);
assert.ok(sharedNote?.photoUrls.length === 1);
await checkPhoto(sharedNote.photoUrls[0], visitor);
const sharedScans = await json(`${firstPath}/diagnoses`, 200, { session: visitor });
const sharedScan = sharedScans.items.find(item => item.id === scan.id);
assert.ok(sharedScan?.photoUrl);
await checkPhoto(sharedScan.photoUrl, visitor);
await request(`${posts}/${second.id}/notes`, 404, { session: visitor });

const sharePath = `/api/v1/plants/${plant.id}/share`;
await request(sharePath, 200, { method: 'PUT', session: owner, body: { shared: false } });
for (const path of [firstPath, comments, edited.photos[0].url, rootComment.photos[0].url, `${firstPath}/notes`, sharedNote.photoUrls[0], sharedScan.photoUrl]) {
  await request(path, 404, { session: visitor });
}
await request(`${firstPath}/reaction`, 404, { method: 'PUT', session: visitor, body: { reaction: 'heart' } });
await request(comments, 404, { method: 'POST', session: visitor, body: { body: 'Không đăng khi đã ẩn' } });
assert.equal((await json(firstPath, 200, { session: owner })).isPublished, false);
await checkPhoto(privateNote.photoUrls[0], owner);

await request(sharePath, 200, { method: 'PUT', session: owner, body: { shared: true, title: 'Chia sẻ thử để kiểm tra tương thích', includeHistory: true } });
await request(firstPath, 200, { session: visitor });
await request(`${comments}/${rootComment.id}`, 204, { method: 'DELETE', session: visitor });
for (const photo of rootComment.photos) await request(photo.url, 404, { session: owner });
await request(`${comments}?parentId=${reply.id}`, 404, { session: owner });
assert.ok(!(await json(comments, 200, { session: owner })).items.some(comment => [rootComment.id, reply.id, nestedReply.id].includes(comment.id)));

await request(firstPath, 204, { method: 'DELETE', session: owner });
await request(firstPath, 404, { session: owner });
for (const photo of edited.photos) await request(photo.url, 404, { session: owner });
await request(`${posts}/${second.id}`, 200, { session: visitor });
await request(`${posts}/${second.id}`, 204, { method: 'DELETE', session: owner });
await request(`/api/v1/community/plants/${plant.id}/notes`, 200, { session: visitor });
await request(sharePath, 200, { method: 'PUT', session: owner, body: { shared: false } });
await request(`/api/v1/community/plants/${plant.id}/notes`, 404, { session: visitor });

await request(`${posts}/${visitorPost.id}`, 204, { method: 'DELETE', session: visitor });
await request(`/api/v1/community/plants/${visitorPlant.id}`, 404, { session: owner });
await request(visitorPost.photos[0].url, 404, { session: owner });
await request(`/api/v1/diagnoses/${scan.id}`, 204, { method: 'DELETE', session: owner });
for (const session of [owner, visitor, outsider]) await request('/api/v1/auth/logout', 204, { method: 'POST', session });
console.log('PASS: bài viết, gallery, sửa ảnh, biểu cảm, bình luận ảnh, trả lời, lượt thích, quyền lịch sử, thu hồi chia sẻ và cách ly tài khoản.');
