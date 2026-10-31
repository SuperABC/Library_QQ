const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));

for (const sub of ['pdfs/past', 'pdfs/mock', 'daily']) {
  fs.mkdirSync(path.join(DATA_DIR, sub), { recursive: true });
}

// 首次启动自动生成令牌密钥与管理员密码，保存在 data/secrets.json（已被 .gitignore 忽略）
function loadSecrets() {
  const file = path.join(DATA_DIR, 'secrets.json');
  let s = {};
  try {
    s = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  let generatedPassword = null;
  let dirty = false;
  if (!s.tokenSecret) {
    s.tokenSecret = crypto.randomBytes(32).toString('hex');
    dirty = true;
  }
  if (!s.adminPassword) {
    s.adminPassword = crypto.randomBytes(9).toString('base64url');
    generatedPassword = s.adminPassword;
    dirty = true;
  }
  if (dirty) fs.writeFileSync(file, JSON.stringify(s, null, 2));
  return { secrets: s, generatedPassword };
}

const { secrets, generatedPassword } = loadSecrets();

const trustProxy = process.env.TRUST_PROXY
  ? (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY)
  : false;

module.exports = {
  ROOT,
  DATA_DIR,
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  tokenSecret: secrets.tokenSecret,
  adminPassword: process.env.ADMIN_PASSWORD || secrets.adminPassword,
  generatedPassword,
  trustProxy,
  // 默认只允许本机访问 /admin；部署到服务器后如需远程管理，设置 ADMIN_ALLOW_REMOTE=1
  adminAllowRemote: process.env.ADMIN_ALLOW_REMOTE === '1',
  dailyCount: Number(process.env.DAILY_COUNT) || 5,
  userCookieDays: 30,
  adminCookieHours: 12,
};
