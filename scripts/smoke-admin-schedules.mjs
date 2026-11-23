import { fixtureEmailProof } from './otp-fixture.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const origin = new URL(process.argv[2] ?? 'http://localhost:8080').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Chỉ kiểm thử trên môi trường local.');
const marker = `smoke-admin-schedules-${randomUUID()}`;
const accounts = [];
const postIds = [];

function inBackend(code, args = []) {
  return execFileSync('docker', ['compose', 'exec', '-T', 'backend', '/usr/local/bin/plantcare-entrypoint',
    'node', '--input-type=module', '-', ...args], {
    cwd: project, input: code, encoding: 'utf8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function database(sql, params = []) {
  const code = `import { Client } from 'pg';
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      const result = await client.query(${JSON.stringify(sql)}, ${JSON.stringify(params)});
      console.log(JSON.stringify({ rows: result.rows, rowCount: result.rowCount }));
    } catch { console.error('Fixture database operation failed.'); process.exitCode = 1; }
    finally { await client.end(); }`;
  return JSON.parse(inBackend(code));
}

async function request(path, status, { method = 'GET', body, session, csrf = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers.Cookie = session.cookie;
  if (session && csrf && method !== 'GET') headers['X-CSRF-Token'] = session.csrfToken;
  const response = await fetch(`${origin}/api/v1${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, status, `${method} ${path} phải trả ${status}`);
  return response.status === 204 ? null : response.json();
}

async function login(account) {
  const response = await fetch(`${origin}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(account.credentials), signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, 'Đăng nhập tài khoản kiểm thử');
  const payload = await response.json();
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('plantcare_session='));
  assert.ok(cookie);
  return { ...payload, cookie: cookie.split(';')[0] };
}

async function createAccount(label) {
  const credentials = { email: `${marker}-${label}@example.test`, password: randomBytes(24).toString('base64url') };
  await request('/auth/register', 200, { method: 'POST', body: { ...credentials, ...fixtureEmailProof(credentials.email), displayName: `Người thử ${label}` } });
  const account = { credentials, session: null };
  account.session = await login(account);
  account.id = account.session.user.id;
  accounts.push(account);
  return account;
}

function promote(account) {
  assert.ok(account.credentials.email.startsWith(marker) && account.credentials.email.endsWith('@example.test'));
  execFileSync('docker', ['compose', 'exec', '-T', 'backend', '/usr/local/bin/plantcare-entrypoint',
    'node', 'dist/modules/admin/bootstrap.js', '--email', account.credentials.email], {
    cwd: project, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runWorker() {
  inBackend(`import { Pool } from 'pg';
    import { processDueSchedules } from './dist/modules/schedules/worker.js';
    const pool = new Pool({connectionString:process.env.DATABASE_URL,max:2});
    try { await Promise.all([processDueSchedules(pool),processDueSchedules(pool)]); }
    finally { await pool.end(); }`);
}

async function createPlant(account) {
  return request('/plants', 201, { method: 'POST', session: account.session,
    body: { speciesCode: 'tomato', nickname: 'Cà chua kiểm thử lịch' } });
}

try {
  const admin = await createAccount('admin');
  const secondAdmin = await createAccount('admin-2');
  const owner = await createAccount('owner');
  const visitor = await createAccount('visitor');
  promote(admin);
  promote(secondAdmin);
  await request('/auth/me', 401, { session: admin.session });
  admin.session = await login(admin);
  secondAdmin.session = await login(secondAdmin);
  assert.equal(admin.session.user.role, 'admin');
  await request('/admin/accounts', 401);
  await request('/admin/accounts', 403, { session: owner.session });
  await request('/admin/posts', 403, { session: owner.session });
  const firstAccounts = await request(`/admin/accounts?search=${marker}&limit=2`, 200, { session: admin.session });
  assert.equal(firstAccounts.items.length, 2);
  assert.ok(firstAccounts.nextCursor);
  const lastAccounts = await request(`/admin/accounts?search=${marker}&limit=2&cursor=${firstAccounts.nextCursor}`, 200, { session: admin.session });
  assert.equal(new Set([...firstAccounts.items, ...lastAccounts.items].map(item => item.id)).size, 4);
  for (const account of firstAccounts.items) {
    assert.deepEqual(Object.keys(account).sort(), ['disabled', 'displayName', 'email', 'id', 'phone', 'role']);
  }

  await request(`/admin/accounts/${owner.id}`, 403, { method: 'PATCH', body: { disabled: true }, session: admin.session, csrf: false });
  await request(`/admin/accounts/${owner.id}`, 200, { method: 'PATCH', body: { disabled: true }, session: admin.session });
  await request('/auth/me', 401, { session: owner.session });
  await request('/auth/login', 401, { method: 'POST', body: owner.credentials });
  await request(`/admin/accounts/${owner.id}`, 200, { method: 'PATCH', body: { disabled: false }, session: admin.session });
  await request('/auth/me', 401, { session: owner.session });
  owner.session = await login(owner);
  await request(`/admin/accounts/${admin.id}`, 409, { method: 'PATCH', body: { disabled: true }, session: admin.session });

  const plant = await createPlant(owner);
  const foreignPlant = await createPlant(visitor);
  const post = await request('/community/posts', 201, { method: 'POST', session: owner.session,
    body: { plantId: plant.id, title: `${marker} bài đăng`, note: 'Nội dung kiểm thử kiểm duyệt', happenedAt: new Date().toISOString() } });
  postIds.push(post.id);
  await request(`/community/posts/${post.id}`, 200, { session: visitor.session });
  const adminPosts = await request(`/admin/posts?search=${marker}`, 200, { session: admin.session });
  assert.ok(adminPosts.items.some(item => item.id === post.id));
  await request(`/admin/posts/${post.id}`, 200, { method: 'PATCH', body: { hidden: true }, session: admin.session });
  await request(`/community/posts/${post.id}`, 404, { session: visitor.session });
  assert.equal((await request(`/community/posts/${post.id}`, 200, { session: owner.session })).moderationHidden, true);
  await request(`/community/posts/${post.id}`, 200, { method: 'PATCH', body: { note: 'Sửa nội dung vẫn chờ kiểm duyệt' }, session: owner.session });
  await request(`/community/posts/${post.id}`, 404, { session: visitor.session });
  await request(`/admin/posts/${post.id}`, 200, { method: 'PATCH', body: { hidden: false }, session: admin.session });
  await request(`/community/posts/${post.id}`, 200, { session: visitor.session });

  const rule = { plantId: plant.id, activity: 'watering', title: 'Lịch kiểm thử', startDate: '2028-01-31', time: '08:15',
    recurrence: 'monthly', interval: 1, active: true, clientId: randomUUID() };
  await request('/schedules', 401);
  await request('/schedules', 403, { method: 'POST', body: rule, session: owner.session, csrf: false });
  const created = await request('/schedules', 201, { method: 'POST', body: rule, session: owner.session });
  assert.equal(created.timezone, 'Asia/Ho_Chi_Minh');
  assert.equal((await request('/schedules', 200, { method: 'POST', body: rule, session: owner.session })).id, created.id);
  await request('/schedules', 404, { method: 'POST', body: { ...rule, clientId: randomUUID(), plantId: foreignPlant.id }, session: owner.session });
  await request(`/schedules/${created.id}`, 404, { method: 'PATCH', body: { active: false }, session: visitor.session });
  await request(`/schedules/${created.id}`, 404, { method: 'DELETE', session: visitor.session });
  assert.equal((await request(`/schedules/${created.id}`, 200, { method: 'PATCH', body: { active: false }, session: owner.session })).nextRunAt, null);
  await request(`/schedules/${created.id}`, 200, { method: 'PATCH', body: { active: true, title: 'Lịch đã sửa' }, session: owner.session });
  const onceRule = { ...rule, clientId: randomUUID(), recurrence: 'once', startDate: '2001-01-01' };
  const due = await request('/schedules', 201, { method: 'POST', body: onceRule, session: owner.session });
  const otherDue = await request('/schedules', 201, { method: 'POST', body: { ...onceRule, clientId: randomUUID(), plantId: foreignPlant.id }, session: visitor.session });
  runWorker();
  runWorker();
  const notifications = await request('/notifications', 200, { session: owner.session });
  assert.equal(notifications.items.length, 1);
  assert.equal(notifications.unreadCount, 1);
  const notification = notifications.items[0];
  assert.equal(notification.plantId, plant.id);
  await request(`/notifications/${notification.id}/read`, 404, { method: 'PATCH', body: {}, session: visitor.session });
  assert.equal((await request('/notifications/read-all', 200, { method: 'PATCH', body: {}, session: owner.session })).updated, 1);
  assert.equal((await request('/notifications', 200, { session: visitor.session })).unreadCount, 1);
  assert.equal((await request('/notifications/read-all', 200, { method: 'PATCH', body: {}, session: owner.session })).updated, 0);
  assert.equal(database('SELECT count(*)::int AS count FROM notifications WHERE lich_id = $1', [due.id]).rows[0].count, 1);
  assert.equal(database('SELECT dang_bat FROM care_schedules WHERE id = $1', [due.id]).rows[0].dang_bat, false);
  const freshOwnerSession = await login(owner);
  assert.equal((await request('/notifications', 200, { session: freshOwnerSession })).items[0].readAt !== null, true);
  await request(`/schedules/${created.id}`, 204, { method: 'DELETE', session: freshOwnerSession });
  await request('/schedules', 410, { method: 'POST', body: rule, session: freshOwnerSession });
  assert.equal((await request('/schedules', 200, { session: freshOwnerSession })).items.some(item => item.id === created.id), false);
  assert.equal(database('SELECT count(*)::int AS count FROM notifications WHERE lich_id = $1', [otherDue.id]).rows[0].count, 1);

  inBackend(`import assert from 'node:assert/strict';
    import { nextOccurrence } from './dist/modules/schedules/recurrence.js';
    const rule={startDate:'2028-01-31',time:'08:15',recurrence:'monthly',interval:1};
    assert.equal(nextOccurrence(rule,new Date('2028-02-01T00:00:00Z')).toISOString(),'2028-02-29T01:15:00.000Z');
    assert.equal(nextOccurrence(rule,new Date('2028-03-01T00:00:00Z')).toISOString(),'2028-03-31T01:15:00.000Z');`);

  const crossDisable = async (actor, target) => {
    const response = await fetch(`${origin}/api/v1/admin/accounts/${target.id}`, {
      method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: actor.session.cookie,
        'X-CSRF-Token': actor.session.csrfToken }, body: JSON.stringify({ disabled: true }), signal: AbortSignal.timeout(15_000),
    });
    return response.status;
  };
  const races = await Promise.all([crossDisable(admin, secondAdmin), crossDisable(secondAdmin, admin)]);
  assert.deepEqual([...races].sort(), [200, 401]);
  const survivor = races[0] === 200 ? admin : secondAdmin;
  const blocked = survivor === admin ? secondAdmin : admin;
  await request(`/admin/accounts/${survivor.id}`, 409, { method: 'PATCH', body: { disabled: true }, session: survivor.session });
  await request(`/admin/accounts/${blocked.id}`, 200, { method: 'PATCH', body: { disabled: false }, session: survivor.session });
  console.log('Đạt kiểm thử Admin, phân quyền, kiểm duyệt bài, lịch máy chủ, chống trùng thông báo, trạng thái đã đọc và tháng nhuận.');
} finally {
  if (accounts.length) {
    const ids = accounts.map(account => account.id);
    const safe = database('SELECT id FROM accounts WHERE id = ANY($1::uuid[]) AND email LIKE $2', [ids, `${marker}-%@example.test`]).rows;
    assert.equal(safe.length, ids.length, 'Chỉ dọn tài khoản giả do lần kiểm thử này tạo.');
    database(`DELETE FROM admin_audit_logs WHERE nguoi_thuc_hien_id = ANY($1::uuid[]) OR doi_tuong_id = ANY($2::uuid[])`, [ids, [...ids, ...postIds]]);
    database('DELETE FROM notifications WHERE tai_khoan_id = ANY($1::uuid[])', [ids]);
    database('DELETE FROM care_schedules WHERE tai_khoan_id = ANY($1::uuid[])', [ids]);
    database('DELETE FROM user_plants WHERE tai_khoan_id = ANY($1::uuid[])', [ids]);
    database('DELETE FROM accounts WHERE id = ANY($1::uuid[])', [ids]);
  }
}
