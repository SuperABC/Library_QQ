const path = require('path');
const express = require('express');
const cfg = require('./config');
const auth = require('./auth/middleware');
const daily = require('./bank/daily');

const app = express();
app.set('trust proxy', cfg.trustProxy);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  });
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

app.use(express.json({ limit: '5mb' }));

app.use('/api', require('./routes/public'));

app.use('/admin', auth.adminNetworkGuard);
app.use('/admin/api', require('./routes/admin'));
app.use('/admin', express.static(path.join(cfg.ROOT, 'admin')));

app.use(express.static(path.join(cfg.ROOT, 'public')));

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// 统一错误出口（如 JSON 格式错误）
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.status ? err.message : '服务器错误' });
});

app.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`考试辅助站已启动：http://localhost:${cfg.PORT}`);
  console.log(`管理后台：http://localhost:${cfg.PORT}/admin/ ${cfg.adminAllowRemote ? '' : '（仅本机）'}`);
  if (cfg.generatedPassword) {
    console.log(`首次启动，已生成管理员密码：${cfg.generatedPassword}（保存在 data/secrets.json，也可用环境变量 ADMIN_PASSWORD 覆盖）`);
  }
  daily.startScheduler();
});
