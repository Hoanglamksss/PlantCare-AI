import { fixtureEmailProof } from './otp-fixture.mjs';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const origin = new URL(process.argv[2] ?? 'http://localhost:8080').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Chỉ chạy với môi trường local.');

async function request(path, status, { method = 'GET', body, session, csrf = true, requestOrigin = origin, idempotencyKey } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers.Origin = requestOrigin;
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (session) headers.Cookie = session.cookie;
  if (session && csrf && method !== 'GET') headers['X-CSRF-Token'] = session.csrfToken;
  const res = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: multipart || body === undefined ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(res.status, status, `${method} ${path} phải trả ${status}`);
  return res;
}

function testCredentials() {
  return { email: `smoke-${randomUUID()}@example.test`, password: randomBytes(24).toString('base64url') };
}

async function signIn(credentials) {
  const login = await request('/api/v1/auth/login', 200, { method: 'POST', body: credentials });
  const cookie = login.headers.getSetCookie().find((value) => value.startsWith('plantcare_session='));
  assert.ok(cookie?.includes('HttpOnly'), 'Cần có cookie HttpOnly');
  const { csrfToken, user } = await login.json();
  assert.ok(csrfToken && user.role === 'user');
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'role']);
  return { cookie: cookie.split(';')[0], csrfToken };
}

async function registerAndLogin(phone, displayName) {
  const credentials = testCredentials();
  await request('/api/v1/auth/register', 200, { method: 'POST', body: { ...credentials, ...fixtureEmailProof(credentials.email), phone, displayName } });
  return { ...await signIn(credentials), credentials };
}

const docs = await request('/docs/', 200);
assert.match(await docs.text(), /swagger-ui/i);
const spec = await (await request('/openapi.json', 200)).json();
assert.ok(spec.paths['/auth/login'].post && spec.paths['/plants'].post);
assert.ok(spec.paths['/diagnoses'].post && spec.paths['/community/plants'].get && spec.paths['/chat'].post);
assert.ok(spec.paths['/plants/{plantId}/notes'].post && spec.paths['/plants/{plantId}/notes/{logId}'].patch);
assert.ok(spec.paths['/profile/credentials'].patch && spec.paths['/profile/avatar'].put);
assert.ok(spec.paths['/community/plants/{plantId}/notes'].get && spec.paths['/community/plants/{plantId}/diagnoses'].get);
await request('/health/ready', 200);
await request('/api/v1/auth/me', 401);

const passwordErrors = [
  { password: 'a'.repeat(11), code: 'PASSWORD_TOO_SHORT', message: 'Mật khẩu phải có ít nhất 12 ký tự.' },
  { password: 'a'.repeat(129), code: 'PASSWORD_TOO_LONG', message: 'Mật khẩu chỉ được có tối đa 128 ký tự.' },
];
for (const { password, code, message } of passwordErrors) {
  const invalidRegistration = await request('/api/v1/auth/register', 400, {
    method: 'POST', body: { ...testCredentials(), password, challengeId: randomUUID(), code: '123456' },
  });
  const result = await invalidRegistration.json();
  assert.equal(result.code, code);
  assert.equal(result.message, message);
}

const pendingCredentials = testCredentials();
await request('/api/v1/auth/register', 400, { method: 'POST', body: pendingCredentials });
await request('/api/v1/auth/login', 401, { method: 'POST', body: pendingCredentials });
const registerProof = fixtureEmailProof(pendingCredentials.email);
await request('/api/v1/auth/register', 400, { method: 'POST', body: {
  ...pendingCredentials, ...registerProof, code: registerProof.code === '000000' ? '111111' : '000000',
} });
await request('/api/v1/auth/login', 401, { method: 'POST', body: pendingCredentials });

const otherCredentials = testCredentials();
const wrongRecipient = await request('/api/v1/auth/register', 400, {
  method: 'POST', body: { ...otherCredentials, ...registerProof },
});
assert.equal((await wrongRecipient.json()).code, 'EMAIL_CODE_INVALID');
const expiredCredentials = testCredentials();
const expiredProof = fixtureEmailProof(expiredCredentials.email, '', { expired: true });
const expired = await request('/api/v1/auth/register', 400, {
  method: 'POST', body: { ...expiredCredentials, ...expiredProof },
});
assert.equal((await expired.json()).code, 'EMAIL_CODE_INVALID');

await request('/api/v1/auth/register', 200, { method: 'POST', body: { ...pendingCredentials, ...registerProof } });
const replayedProof = await request('/api/v1/auth/register', 400, {
  method: 'POST', body: { ...pendingCredentials, ...registerProof },
});
assert.equal((await replayedProof.json()).code, 'EMAIL_CODE_INVALID');

const owner = await registerAndLogin('0900 111 222', '  Người trồng thử nghiệm  ');
const visitor = await registerAndLogin();
const profilePath = '/api/v1/profile';
await request(profilePath, 401);
const initialProfile = await (await request(profilePath, 200, { session: owner })).json();
assert.deepEqual(initialProfile, { email: owner.credentials.email, displayName: 'Người trồng thử nghiệm', phone: '+84900111222', avatarUrl: null });
await request('/api/v1/auth/register', 409, {
  method: 'POST', body: { ...owner.credentials, ...fixtureEmailProof(owner.credentials.email), displayName: 'Tên từ yêu cầu trùng', phone: '0999 999 999' },
});
assert.deepEqual(await (await request(profilePath, 200, { session: owner })).json(), initialProfile);
const profileUpdate = { displayName: 'Người làm vườn', phone: '0912 345 678' };
await request(profilePath, 403, { method: 'PATCH', body: profileUpdate, csrf: false, session: owner });
const updatedProfile = await (await request(profilePath, 200, { method: 'PATCH', body: profileUpdate, session: owner })).json();
assert.equal(updatedProfile.displayName, profileUpdate.displayName);
assert.equal(updatedProfile.phone, '+84912345678');
const visitorProfile = await (await request(profilePath, 200, { session: visitor })).json();
assert.equal(visitorProfile.phone, null);
for (const { password, code, message } of passwordErrors) {
  const invalidChange = await request(`${profilePath}/credentials`, 400, {
    method: 'PATCH', session: owner, body: { currentPassword: owner.credentials.password, newPassword: password },
  });
  const result = await invalidChange.json();
  assert.equal(result.code, code);
  assert.equal(result.message, message);
}
await request('/api/v1/auth/me', 200, { session: owner });
const catalog = await (await request('/api/v1/catalog/species', 200, { session: owner })).json();
for (const crop of ['tomato', 'cucumber', 'chili', 'basil', 'mint']) {
  assert.ok(catalog.items.some(({ code }) => code === crop), `Thiếu loài ${crop}`);
}

const body = { speciesCode: 'tomato', nickname: 'Cà chua thử nghiệm', plantedOn: '2026-11-12' };
await request('/api/v1/plants', 403, { method: 'POST', body, session: owner, csrf: false });
await request('/api/v1/plants', 403, { method: 'POST', body, session: owner, requestOrigin: 'https://example.test' });
await request('/api/v1/plants', 400, { method: 'POST', body: { ...body, nickname: 'invalid\0name' }, session: owner });
const plant = await (await request('/api/v1/plants', 201, { method: 'POST', body, session: owner })).json();
assert.equal(plant.plantedOn, body.plantedOn);
const plantPath = `/api/v1/plants/${plant.id}`;

await request(plantPath, 404, { session: visitor });
await request(plantPath, 404, { method: 'PATCH', body: { nickname: 'Thử sai chủ' }, session: visitor });
await request(`${plantPath}/care-logs`, 404, { session: visitor });
await request(plantPath, 400, { method: 'PATCH', body: { speciesCode: 'cucumber' }, session: owner });
const updated = await (await request(plantPath, 200, {
  method: 'PATCH', body: { nickname: 'Cà chua ban công', plantedOn: null }, session: owner,
})).json();
assert.equal(updated.nickname, 'Cà chua ban công');
assert.equal(updated.plantedOn, null);

const happenedAt = new Date().toISOString();
await request(`${plantPath}/care-logs`, 400, {
  method: 'POST', body: { activity: 'watering', happenedAt: '2026-11-12T08:12:00+16:00' }, session: owner,
});
for (const activity of ['watering', 'observation']) {
  await request(`${plantPath}/care-logs`, 201, { method: 'POST', body: { activity, happenedAt }, session: owner });
}
const firstPage = await (await request(`${plantPath}/care-logs?limit=1`, 200, { session: owner })).json();
assert.ok(firstPage.nextCursor);
const secondPage = await (await request(`${plantPath}/care-logs?limit=1&cursor=${firstPage.nextCursor}`, 200, { session: owner })).json();
assert.equal(secondPage.items.length, 1);
assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
assert.equal(secondPage.nextCursor, null);

const sharePath = `${plantPath}/share`;
const community = '/api/v1/community/plants';
const communityPlant = `${community}/${plant.id}`;
const comments = `${communityPlant}/comments`;
const postTitle = `Cà chua chia sẻ thử ${randomUUID()}`;
await request(comments, 404, { session: visitor });
await request(sharePath, 404, { method: 'PUT', body: { shared: true, title: postTitle }, session: visitor });
await request(sharePath, 200, { method: 'PUT', body: { shared: true, title: postTitle }, session: owner });
const publicPlants = await (await request(community, 200, { session: visitor })).json();
const post = publicPlants.items.find((entry) => entry.id === plant.id);
assert.equal(post.title, postTitle);
for (const privateField of ['email', 'phone', 'avatarUrl', 'displayName', 'note', 'nickname', 'ownerId', 'authorId']) {
  assert.ok(!(privateField in post));
}
assert.equal(post.includeHistory, false);
await request(`${communityPlant}/notes`, 404, { session: visitor });
await request(`${communityPlant}/diagnoses`, 404, { session: visitor });
const comment = await (await request(comments, 201, { method: 'POST', body: { body: 'Bạn chăm cây vào lúc nào?' }, session: visitor })).json();
assert.match(comment.author, /^Người trồng /u);
assert.ok((await (await request(comments, 200, { session: owner })).json()).items.some((entry) => entry.id === comment.id));
await request(`${comments}/${comment.id}`, 204, { method: 'DELETE', session: visitor });
await request(sharePath, 200, { method: 'PUT', body: { shared: false }, session: owner });
await request(comments, 404, { session: visitor });

const chat = await (await request('/api/v1/chat', 200, {
  method: 'POST', session: owner, body: { question: 'Cà chua bị đốm nâu, nên kiểm tra gì?' },
})).json();
assert.ok(chat.photoSuggested && chat.source && new URL(chat.source.url).hostname.endsWith('.umn.edu'));
for (const [speciesCode, question] of [
  ['cucumber', 'Dưa leo bị phấn trắng thì xử lý thế nào?'],
  ['chili', 'Lá ớt xoăn và có rệp, nên làm gì?'],
  ['basil', 'Húng quế bị sương mai thì xử lý thế nào?'],
  ['mint', 'Bạc hà bị gỉ sắt xử lý thế nào?'],
]) {
  const answer = await (await request('/api/v1/chat', 200, { method: 'POST', session: owner, body: { question, speciesCode } })).json();
  assert.ok(answer.text.length > 50 && answer.source?.url.startsWith('https://') && answer.speciesCode === speciesCode, `Thiếu gợi ý có nguồn cho ${speciesCode}`);
}
await request('/api/v1/chat', 403, { method: 'POST', session: owner, csrf: false, body: { question: 'Tưới dưa leo thế nào?' } });

const attached = await (await request('/api/v1/chat', 200, {
  method: 'POST', session: owner, body: { question: 'Tưới thế nào?', plantId: plant.id },
})).json();
assert.equal(attached.plantId, plant.id);
assert.equal(attached.speciesCode, plant.speciesCode);
await request('/api/v1/chat', 404, { method: 'POST', session: visitor, body: { question: 'Tưới thế nào?', plantId: plant.id } });

const leaf = new Blob([await readFile(new URL('../frontend/src/assets/balcony-tomato.jpg', import.meta.url))], { type: 'image/jpeg' });
const avatar = new FormData();
avatar.set('image', leaf, 'avatar.jpg');
const profileWithAvatar = await (await request(`${profilePath}/avatar`, 200, { method: 'PUT', body: avatar, session: owner })).json();
assert.ok(profileWithAvatar.avatarUrl);
const privateAvatar = await request(profileWithAvatar.avatarUrl, 200, { session: owner });
assert.match(privateAvatar.headers.get('Cache-Control'), /private, no-store/);
await request(profileWithAvatar.avatarUrl, 404, { session: visitor });
const journalPath = `${plantPath}/notes`;
const journalBody = { note: 'Đã chuyển chậu đến chỗ thoáng', happenedAt: '2026-11-14T09:00:00+07:00' };
const textNote = await (await request(journalPath, 201, { method: 'POST', session: owner, body: journalBody })).json();
assert.ok(textNote.isJournalNote && textNote.photoUrl === null);
assert.deepEqual(textNote.photoUrls, []);
assert.equal(textNote.happenedAt, '2026-11-14T02:00:00.000Z');
await request(journalPath, 404, { method: 'POST', session: visitor, body: journalBody });
await request(journalPath, 403, { method: 'POST', session: owner, csrf: false, body: journalBody });
function noteUpload(note, date) {
  const form = new FormData();
  form.set('image', leaf, 'demo-leaf.jpg');
  form.set('note', note);
  form.set('happenedAt', date);
  return form;
}

const activePhotoNote = await (await request(journalPath, 201, {
  method: 'POST', session: owner, body: noteUpload('Ảnh lúc cây đang được theo dõi', journalBody.happenedAt),
})).json();
assert.ok(activePhotoNote.isJournalNote && activePhotoNote.photoUrl);
assert.equal(activePhotoNote.photoUrls.length, 1);
await request(sharePath, 200, { method: 'PUT', body: { shared: true, title: postTitle }, session: owner });
await request(activePhotoNote.photoUrl, 404, { session: visitor });
await request(sharePath, 200, { method: 'PUT', body: { shared: false }, session: owner });
const upload = (speciesCode = 'tomato') => {
  const body = new FormData();
  body.set('image', leaf, 'demo-leaf.jpg');
  body.set('speciesCode', speciesCode);
  body.set('plantId', plant.id);
  return body;
};
const scans = '/api/v1/diagnoses';
await request(scans, 404, { method: 'POST', body: upload(), idempotencyKey: randomUUID(), session: visitor });
await request(scans, 422, { method: 'POST', body: upload('cucumber'), idempotencyKey: randomUUID(), session: owner });
const idempotencyKey = randomUUID();
const created = await request(scans, 202, { method: 'POST', body: upload(), idempotencyKey, session: owner });
const { id: scanId } = await created.json();
const scanPath = `${scans}/${scanId}`;
assert.equal(created.headers.get('Location'), scanPath);
const replay = await (await request(scans, 200, { method: 'POST', body: upload(), idempotencyKey, session: owner })).json();
assert.equal(replay.id, scanId);
await request(`${scanPath}/photo`, 404, { session: visitor });
const photo = await request(`${scanPath}/photo`, 200, { session: owner });
assert.equal(photo.headers.get('Content-Type'), 'image/jpeg');
assert.match(photo.headers.get('Cache-Control'), /private, no-store/);
assert.ok((await photo.arrayBuffer()).byteLength > 0);
let scan;
for (let count = 0; count < 15; count += 1) {
  scan = await (await request(scanPath, 200, { session: owner })).json();
  if (scan.status === 'completed' || scan.status === 'failed') break;
  await delay(1000);
}
assert.equal(scan?.status, 'completed');
assert.ok(['healthy', 'uncertain'].includes(scan.outcome) && scan.recommendation);
assert.ok(scan.careSteps?.length, 'Kết quả cần có việc thực hiện tại nhà');
assert.ok(Array.isArray(scan.possibleCauses));

const chatPhoto = await (await request('/api/v1/chat', 200, {
  method: 'POST', session: owner, body: { question: 'Xem ảnh cây này', plantId: plant.id, diagnosisId: scanId },
})).json();
assert.equal(chatPhoto.plantId, plant.id);
assert.equal(chatPhoto.diagnosisId, scanId);
const chatResult = await (await request(`/api/v1/chat/screening/${scanId}`, 200, { session: owner })).json();
assert.equal(chatResult.plantId, plant.id);
assert.deepEqual(chatResult.plan.map(item => item.when), ['Hôm nay', 'Ngày mai', 'Sau 48–72 giờ']);
await request(`/api/v1/chat/screening/${scanId}`, 404, { session: visitor });
const tomorrow = await (await request('/api/v1/chat', 200, {
  method: 'POST', session: owner,
  body: { question: 'mai lam gi', plantId: plant.id, contextDiagnosisId: scanId },
})).json();
assert.match(tomorrow.text, /^Ngày mai:/);

await request(plantPath, 200, { method: 'PATCH', body: { archived: true }, session: owner });
await request(`${plantPath}/care-logs`, 409, { method: 'POST', body: { activity: 'watering', happenedAt }, session: owner });
const galleryUpload = new FormData();
galleryUpload.set('note', 'Ảnh để so sánh lá sau khi lưu trữ');
galleryUpload.set('happenedAt', '2026-11-15T12:30:00+07:00');
galleryUpload.append('images', leaf, 'first-leaf.jpg');
const cucumber = new Blob([await readFile(new URL('../frontend/src/assets/balcony-cucumber.webp', import.meta.url))], { type: 'image/webp' });
galleryUpload.append('images', cucumber, 'second-leaf.webp');
const imageNote = await (await request(journalPath, 201, {
  method: 'POST', session: owner, body: galleryUpload,
})).json();
assert.ok(imageNote.isJournalNote && imageNote.photoUrl);
assert.equal(new Set(imageNote.photoUrls).size, 2);
await request(imageNote.photoUrl, 404, { session: visitor });
const journalPhoto = await request(imageNote.photoUrl, 200, { session: owner });
assert.match(journalPhoto.headers.get('Cache-Control'), /private, no-store/);
assert.equal(journalPhoto.headers.get('Content-Type'), 'image/jpeg');
const firstPhotoBytes = await journalPhoto.arrayBuffer();
assert.ok(firstPhotoBytes.byteLength > 0);
assert.deepEqual(firstPhotoBytes, await (await request(imageNote.photoUrls[0], 200, { session: owner })).arrayBuffer());
await request(imageNote.photoUrls[1], 200, { session: owner });
await request(imageNote.photoUrls[1], 404, { session: visitor });
const corrected = { happenedAt: '2026-11-13T12:30:00+07:00' };
await request(`${journalPath}/${imageNote.id}`, 404, { method: 'PATCH', session: visitor, body: corrected });
const edited = await (await request(`${journalPath}/${imageNote.id}`, 200, { method: 'PATCH', session: owner, body: corrected })).json();
assert.equal(edited.happenedAt, '2026-11-13T05:30:00.000Z');
assert.equal(edited.photoUrl, imageNote.photoUrl);
assert.deepEqual(edited.photoUrls, imageNote.photoUrls);
const journal = await (await request(`${plantPath}/care-logs`, 200, { session: owner })).json();
assert.ok(journal.items.findIndex(({ id }) => id === imageNote.id) > journal.items.findIndex(({ id }) => id === textNote.id));
assert.equal(journal.items.find(({ id }) => id === imageNote.id).photoUrl, imageNote.photoUrl);
const history = await (await request(`${scans}?plantId=${plant.id}`, 200, { session: owner })).json();
assert.ok(history.items.some((item) => item.id === scanId && item.status === 'completed' && item.careSteps.length > 0));
const foreignHistory = await (await request(`${scans}?plantId=${plant.id}`, 200, { session: visitor })).json();
assert.deepEqual(foreignHistory.items, []);

const shared = await (await request(sharePath, 200, {
  method: 'PUT', body: { shared: true, title: postTitle, includeHistory: true }, session: owner,
})).json();
assert.equal(shared.includeHistory, true);
const detail = await (await request(communityPlant, 200, { session: visitor })).json();
assert.ok(detail.archived && detail.includeHistory);
const sharedNotes = await (await request(`${communityPlant}/notes`, 200, { session: visitor })).json();
const sharedNote = sharedNotes.items.find(({ id }) => id === imageNote.id);
assert.equal(sharedNote.note, 'Ảnh để so sánh lá sau khi lưu trữ');
assert.equal(sharedNote.photoUrls.length, 2);
const sharedScans = await (await request(`${communityPlant}/diagnoses`, 200, { session: visitor })).json();
const sharedScan = sharedScans.items.find(({ id }) => id === scanId);
assert.ok(sharedScan.status === 'completed' && sharedScan.photoUrl);
await request(sharedScan.photoUrl, 401);
for (const url of [...sharedNote.photoUrls, sharedScan.photoUrl]) {
  const image = await request(url, 200, { session: visitor });
  assert.match(image.headers.get('Cache-Control'), /private, no-store/);
  assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
}
await request(imageNote.photoUrls[1], 404, { session: visitor });
await request(`${scanPath}/photo`, 404, { session: visitor });
await request(sharePath, 200, { method: 'PUT', body: { shared: true, title: postTitle, includeHistory: false }, session: owner });
await request(communityPlant, 200, { session: visitor });
await request(sharedScan.photoUrl, 404, { session: visitor });
await request(sharedNote.photoUrls[1], 404, { session: visitor });
await request(sharePath, 200, { method: 'PUT', body: { shared: false }, session: owner });
await request(communityPlant, 404, { session: visitor });

await request(`${scanPath}/photo`, 200, { session: owner });
await request(scanPath, 204, { method: 'DELETE', session: owner });
await request(`${scanPath}/photo`, 404, { session: owner });
await request(scans, 410, { method: 'POST', body: upload(), idempotencyKey, session: owner });
const active = await (await request('/api/v1/plants', 200, { session: owner })).json();
const archived = await (await request('/api/v1/plants?archived=true', 200, { session: owner })).json();
assert.deepEqual(active.items, []);
assert.equal(archived.items[0].id, plant.id);
await request('/api/v1/chat', 404, {
  method: 'POST', session: owner, body: { question: 'Kiểm tra cây', plantId: plant.id },
});
const secondary = await signIn(owner.credentials);
const newCredentials = testCredentials();
const accountId = (await (await request('/api/v1/auth/me', 200, { session: owner })).json()).user.id;
const changeCredentials = (currentPassword, credentials, status, proof = {}) => request(`${profilePath}/credentials`, status, {
  method: 'PATCH', session: owner, body: { currentPassword, email: credentials.email, newPassword: credentials.password, ...proof },
});
await changeCredentials(randomBytes(24).toString('base64url'), newCredentials, 403);
await changeCredentials(owner.credentials.password, visitor.credentials, 409, fixtureEmailProof(visitor.credentials.email, accountId));
await changeCredentials(owner.credentials.password, newCredentials, 400);
const changeProof = fixtureEmailProof(newCredentials.email, accountId);
await changeCredentials(owner.credentials.password, newCredentials, 400, { ...changeProof, code: changeProof.code === '000000' ? '111111' : '000000' });
await request('/api/v1/auth/me', 200, { session: owner });
await changeCredentials(owner.credentials.password, newCredentials, 204, changeProof);
await request('/api/v1/auth/me', 401, { session: owner });
await request('/api/v1/auth/me', 401, { session: secondary });
await request('/api/v1/auth/login', 401, { method: 'POST', body: owner.credentials });
const newSession = await signIn(newCredentials);
const savedProfile = await (await request(profilePath, 200, { session: newSession })).json();
assert.deepEqual(savedProfile, { ...profileWithAvatar, email: newCredentials.email });
await request(`${profilePath}/avatar`, 204, { method: 'DELETE', session: newSession });
await request(savedProfile.avatarUrl, 404, { session: newSession });
await request('/api/v1/auth/logout', 204, { method: 'POST', session: newSession });
await request('/api/v1/auth/logout', 204, { method: 'POST', session: visitor });

console.log('PASS: Swagger, hồ sơ, đổi thông tin đăng nhập, nhật ký nhiều ảnh, chia sẻ lịch sử, thu hồi quyền xem ảnh và chatbot.');
