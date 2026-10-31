// 取客户端 IP（去掉 IPv4-mapped 前缀）；反向代理场景需设置 TRUST_PROXY
function clientIp(req) {
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

module.exports = { clientIp, parseCookies, fail };
