const crypto = require('crypto');
const { tokenSecret } = require('../config');

function mac(body) {
  return crypto.createHmac('sha256', tokenSecret).update(body).digest('base64url');
}

// payload 必须含 exp（毫秒时间戳）
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body)}`;
}

function verify(token) {
  if (typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expect = Buffer.from(mac(body));
  if (given.length !== expect.length || !crypto.timingSafeEqual(given, expect)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
