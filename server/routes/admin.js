const express = require('express');
const auth = require('../auth/middleware');
const codes = require('../auth/codes');
const cfg = require('../config');
const store = require('../bank/store');
const daily = require('../bank/daily');
const { createLimiter } = require('../util/ratelimit');
const { clientIp, fail } = require('../util/http');

const router = express.Router();
const loginLimiter = createLimiter(5, 15 * 60 * 1000);

router.post('/login', (req, res) => {
  const ip = clientIp(req);
  if (loginLimiter.blocked(ip)) return fail(res, 429, '尝试次数过多，请稍后再试');
  const given = String((req.body || {}).password || '');
  if (given !== cfg.adminPassword) {
    loginLimiter.fail(ip);
    return fail(res, 403, '密码错误');
  }
  loginLimiter.reset(ip);
  auth.issueAdminCookie(req, res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  auth.clearAdminCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => res.json({ admin: auth.isAdmin(req) }));

// 以下全部需要管理员登录
router.use(auth.requireAdmin);

const wrap = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (e) {
    fail(res, 400, e.message);
  }
};

// ---- 试卷 PDF ----
router.get('/bank', (req, res) => res.json(store.load()));

// 客户端以 application/pdf 原始字节上传，元数据放在查询参数里
router.post(
  '/papers',
  express.raw({ type: 'application/pdf', limit: '100mb' }),
  wrap((req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('请上传 PDF 文件');
    const { kind, title, year } = req.query;
    res.json(store.addPaper({ kind, title, year, buffer: req.body }));
  })
);

router.patch('/papers/:id', wrap((req, res) => {
  const p = store.updatePaper(req.params.id, req.body || {});
  if (!p) return fail(res, 404, '试卷不存在');
  res.json(p);
}));

router.delete('/papers/:id', wrap((req, res) => {
  if (!store.removePaper(req.params.id)) return fail(res, 404, '试卷不存在');
  res.json({ ok: true });
}));

// ---- 简答题 ----
router.post('/questions', wrap((req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body) ? body : body.items || [body];
  const added = store.addQuestions(items);
  if (!added.length) throw new Error('没有有效题目（题干和参考答案不能为空）');
  res.json({ added: added.length, items: added });
}));

router.put('/questions/:id', wrap((req, res) => {
  const q = store.updateQuestion(req.params.id, req.body || {});
  if (!q) return fail(res, 404, '题目不存在');
  res.json(q);
}));

router.delete('/questions/:id', wrap((req, res) => {
  if (!store.removeQuestion(req.params.id)) return fail(res, 404, '题目不存在');
  res.json({ ok: true });
}));

// ---- 验证码 ----
router.get('/codes', (req, res) => res.json(codes.list()));

router.post('/codes', wrap((req, res) => {
  const { note, days, maxIps, count } = req.body || {};
  const n = Math.min(Math.max(Number(count) || 1, 1), 50);
  res.json(Array.from({ length: n }, () => codes.create({ note, days, maxIps })));
}));

router.patch('/codes/:id', wrap((req, res) => {
  const c = codes.update(req.params.id, req.body || {});
  if (!c) return fail(res, 404, '验证码不存在');
  res.json(c);
}));

router.delete('/codes/:id', wrap((req, res) => {
  if (!codes.remove(req.params.id)) return fail(res, 404, '验证码不存在');
  res.json({ ok: true });
}));

// ---- 每日试卷 ----
router.get('/daily', (req, res) => {
  daily.ensure();
  res.json({ today: daily.today(), dates: daily.listDates(), count: cfg.dailyCount });
});

router.post('/daily/regenerate', wrap((req, res) => {
  const paper = daily.regenerate();
  if (!paper) throw new Error('题库为空，无法出卷');
  res.json({ date: paper.date, questions: paper.questions.length });
}));

module.exports = router;
