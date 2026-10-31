const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('../config');
const { readJson, writeJson } = require('../util/jsonfile');

const FILE = path.join(DATA_DIR, 'codes.json');
// 去掉易混淆字符（0/O、1/I/L）
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function load() {
  return readJson(FILE, { codes: [] });
}

function save(db) {
  writeJson(FILE, db);
}

function normalize(input) {
  return String(input || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

function generatePlain() {
  let s = '';
  for (const b of crypto.randomBytes(8)) s += ALPHABET[b % ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

function isActive(c, now = Date.now()) {
  return !c.revoked && (!c.expiresAt || c.expiresAt > now);
}

function list() {
  return load().codes;
}

function get(id) {
  return load().codes.find((c) => c.id === id) || null;
}

// days 为空表示永不过期
function create({ note = '', days = null, maxIps = 1 } = {}) {
  const db = load();
  const code = {
    id: crypto.randomBytes(4).toString('hex'),
    code: generatePlain(),
    note: String(note).slice(0, 100),
    createdAt: Date.now(),
    expiresAt: days ? Date.now() + Number(days) * 86400000 : null,
    maxIps: Math.max(1, Number(maxIps) || 1),
    boundIps: [],
    revoked: false,
  };
  db.codes.push(code);
  save(db);
  return code;
}

function update(id, patch) {
  const db = load();
  const c = db.codes.find((x) => x.id === id);
  if (!c) return null;
  if (typeof patch.note === 'string') c.note = patch.note.slice(0, 100);
  if (typeof patch.revoked === 'boolean') c.revoked = patch.revoked;
  if (patch.maxIps !== undefined) c.maxIps = Math.max(1, Number(patch.maxIps) || 1);
  if (patch.expiresAt !== undefined) c.expiresAt = patch.expiresAt ? Number(patch.expiresAt) : null;
  if (patch.resetIps) c.boundIps = [];
  save(db);
  return c;
}

function remove(id) {
  const db = load();
  const n = db.codes.length;
  db.codes = db.codes.filter((c) => c.id !== id);
  save(db);
  return db.codes.length < n;
}

// 用户提交验证码：校验通过则把 IP 绑定到该码
function redeem(input, ip) {
  const plain = normalize(input);
  if (!plain) return { ok: false, error: '请输入验证码' };
  const db = load();
  const c = db.codes.find((x) => safeEqual(normalize(x.code), plain));
  if (!c) return { ok: false, error: '验证码不正确' };
  if (c.revoked) return { ok: false, error: '验证码已被吊销' };
  if (!isActive(c)) return { ok: false, error: '验证码已过期' };
  if (!c.boundIps.includes(ip)) {
    if (c.boundIps.length >= c.maxIps) {
      return { ok: false, error: '该验证码已绑定到其他网络，如需更换请联系管理员' };
    }
    c.boundIps.push(ip);
    save(db);
  }
  return { ok: true, code: c };
}

// 每次访问受保护资源时校验：码有效且当前 IP 已绑定
function check(id, ip) {
  const c = get(id);
  return !!c && isActive(c) && c.boundIps.includes(ip) ? c : null;
}

module.exports = { list, get, create, update, remove, redeem, check, isActive };
