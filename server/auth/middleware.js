const cfg = require('../config');
const token = require('./token');
const codes = require('./codes');
const { clientIp, parseCookies, fail } = require('../util/http');

const USER_COOKIE = 'access';
const ADMIN_COOKIE = 'adm';

function cookieOpts(req, maxAgeMs) {
  return { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: maxAgeMs, path: '/' };
}

// ---- 普通用户（验证码）----
function issueUserCookie(req, res, code) {
  const exp = Math.min(Date.now() + cfg.userCookieDays * 86400000, code.expiresAt || Infinity);
  const t = token.sign({ t: 'user', cid: code.id, ip: clientIp(req), exp });
  res.cookie(USER_COOKIE, t, cookieOpts(req, exp - Date.now()));
}

function userSession(req) {
  const p = token.verify(parseCookies(req)[USER_COOKIE]);
  if (!p || p.t !== 'user' || p.ip !== clientIp(req)) return null;
  return codes.check(p.cid, p.ip);
}

function requireAccess(req, res, next) {
  const code = userSession(req);
  if (!code) return fail(res, 401, '需要验证码，请先解锁');
  req.accessCode = code;
  next();
}

function clearUserCookie(res) {
  res.clearCookie(USER_COOKIE, { path: '/' });
}

// ---- 管理员 ----
function isLocal(req) {
  if (!cfg.trustProxy && req.headers['x-forwarded-for']) return false;
  const ip = clientIp(req);
  return ip === '127.0.0.1' || ip === '::1';
}

function adminNetworkGuard(req, res, next) {
  if (cfg.adminAllowRemote || isLocal(req)) return next();
  fail(res, 403, '管理后台仅允许本机访问（部署后可设置 ADMIN_ALLOW_REMOTE=1）');
}

function issueAdminCookie(req, res) {
  const exp = Date.now() + cfg.adminCookieHours * 3600000;
  res.cookie(ADMIN_COOKIE, token.sign({ t: 'admin', ip: clientIp(req), exp }), cookieOpts(req, exp - Date.now()));
}

function isAdmin(req) {
  const p = token.verify(parseCookies(req)[ADMIN_COOKIE]);
  return !!p && p.t === 'admin' && p.ip === clientIp(req);
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return fail(res, 401, '请先登录管理后台');
  next();
}

function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
}

module.exports = {
  issueUserCookie,
  userSession,
  requireAccess,
  clearUserCookie,
  adminNetworkGuard,
  issueAdminCookie,
  isAdmin,
  requireAdmin,
  clearAdminCookie,
};
