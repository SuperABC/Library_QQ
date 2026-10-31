// 端到端冒烟测试：临时数据目录 + 真实启动服务；用 X-Forwarded-For 模拟不同 IP
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let proc;
let dataDir;
const jar = { admin: '' };

async function call(method, url, { body, raw, ip = '10.0.0.1', cookie = '' } = {}) {
  const headers = { 'X-Forwarded-For': ip };
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (raw) { payload = raw; headers['Content-Type'] = 'application/pdf'; }
  else if (body) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const setCookie = res.headers.get('set-cookie');
  let data = null;
  if ((res.headers.get('content-type') || '').includes('json')) data = await res.json();
  return { status: res.status, data, cookie: setCookie ? setCookie.split(';')[0] : '', res };
}

const admin = (method, url, opts = {}) => call(method, '/admin/api' + url, { ip: '127.0.0.1', cookie: jar.admin, ...opts });

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-test-'));
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, TRUST_PROXY: '1', ADMIN_PASSWORD: 'pw-test', DAILY_COUNT: '2' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/auth/status'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('服务未能启动');
});

after(() => {
  proc.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('管理员登录与权限', async () => {
  assert.strictEqual((await admin('GET', '/bank')).status, 401);
  assert.strictEqual((await admin('POST', '/login', { body: { password: 'bad' } })).status, 403);
  const r = await admin('POST', '/login', { body: { password: 'pw-test' } });
  assert.strictEqual(r.status, 200);
  jar.admin = r.cookie;
  assert.strictEqual((await admin('GET', '/bank')).status, 200);
  // 非本机 IP 不能访问后台
  assert.strictEqual((await call('GET', '/admin/api/me', { ip: '8.8.8.8' })).status, 403);
});

let pastId;
let mockId;

test('上传 PDF：真题公开，模拟题需验证码', async () => {
  const pdf = Buffer.from('%PDF-1.4\n%test\n');
  const bad = await admin('POST', '/papers?kind=past&title=x', { raw: Buffer.from('nope') });
  assert.strictEqual(bad.status, 400);
  pastId = (await admin('POST', '/papers?kind=past&title=2023%E7%9C%9F%E9%A2%98&year=2023', { raw: pdf })).data.id;
  mockId = (await admin('POST', '/papers?kind=mock&title=%E6%A8%A1%E6%8B%9F1', { raw: pdf })).data.id;

  assert.strictEqual((await call('GET', '/api/papers/past')).data.length, 1);
  assert.strictEqual((await call('GET', `/api/files/past/${pastId}`)).status, 200);
  assert.strictEqual((await call('GET', `/api/files/past/${mockId}`)).status, 404);
  assert.strictEqual((await call('GET', '/api/papers/mock')).status, 401);
  assert.strictEqual((await call('GET', `/api/files/mock/${mockId}`)).status, 401);
});

test('验证码：解锁、IP 绑定、吊销、重置', async () => {
  const [code] = (await admin('POST', '/codes', { body: { note: 't', maxIps: 1 } })).data;

  assert.strictEqual((await call('POST', '/api/auth/unlock', { body: { code: 'WRONG' } })).status, 403);
  const ok = await call('POST', '/api/auth/unlock', { body: { code: code.code.toLowerCase() } });
  assert.strictEqual(ok.status, 200);
  const ck = ok.cookie;

  assert.strictEqual((await call('GET', '/api/papers/mock', { cookie: ck })).status, 200);
  assert.strictEqual((await call('GET', `/api/files/mock/${mockId}`, { cookie: ck })).status, 200);
  // 同一 cookie 换 IP 失效
  assert.strictEqual((await call('GET', '/api/papers/mock', { cookie: ck, ip: '10.0.0.2' })).status, 401);
  // 另一个 IP 用同一验证码：超出绑定上限
  assert.strictEqual((await call('POST', '/api/auth/unlock', { body: { code: code.code }, ip: '10.0.0.2' })).status, 403);
  // 重置绑定后新 IP 可用
  await admin('PATCH', `/codes/${code.id}`, { body: { resetIps: true } });
  assert.strictEqual((await call('GET', '/api/papers/mock', { cookie: ck })).status, 401);
  assert.strictEqual((await call('POST', '/api/auth/unlock', { body: { code: code.code }, ip: '10.0.0.2' })).status, 200);
  // 吊销立即生效
  const again = await call('POST', '/api/auth/unlock', { body: { code: code.code }, ip: '10.0.0.2' });
  await admin('PATCH', `/codes/${code.id}`, { body: { revoked: true } });
  assert.strictEqual((await call('GET', '/api/papers/mock', { cookie: again.cookie, ip: '10.0.0.2' })).status, 401);
});

test('每日出卷：同日稳定，答题前不含答案', async () => {
  const [code] = (await admin('POST', '/codes', { body: {} })).data;
  const ck = (await call('POST', '/api/auth/unlock', { body: { code: code.code } })).cookie;

  assert.strictEqual((await call('GET', '/api/daily/today', { cookie: ck })).status, 404); // 题库为空

  const items = Array.from({ length: 6 }, (_, i) => ({ stem: `题${i}`, answer: `答${i}`, keywords: `答${i}`, from: i < 2 ? 'mock' : 'past' }));
  assert.strictEqual((await admin('POST', '/questions', { body: { items } })).data.added, 6);

  const a = await call('GET', '/api/daily/today', { cookie: ck });
  const b = await call('GET', '/api/daily/today', { cookie: ck });
  assert.strictEqual(a.data.questions.length, 2);
  assert.deepStrictEqual(a.data, b.data);
  assert.ok(!JSON.stringify(a.data).includes('答'), '答题前不应含参考答案');

  const ans = await call('GET', '/api/daily/today/answers', { cookie: ck });
  assert.ok(ans.data[a.data.questions[0].id].answer.startsWith('答'));
  assert.strictEqual((await call('GET', '/api/daily/2999-01-01', { cookie: ck })).status, 400);
  assert.strictEqual((await call('GET', '/api/daily/today')).status, 401);

  // 模拟题接口只返回 mock 题
  assert.strictEqual((await call('GET', '/api/questions/mock', { cookie: ck })).data.length, 2);
});
