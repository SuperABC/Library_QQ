const express = require('express');
const auth = require('../auth/middleware');
const codes = require('../auth/codes');
const store = require('../bank/store');
const daily = require('../bank/daily');
const { createLimiter } = require('../util/ratelimit');
const { clientIp, fail } = require('../util/http');

const router = express.Router();
const unlockLimiter = createLimiter(8, 15 * 60 * 1000);

const paperView = ({ id, title, year, size }) => ({ id, title, year, size });

function sendPdf(req, res, paper) {
  if (!paper) return fail(res, 404, '试卷不存在');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.sendFile(store.pdfPath(paper), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(paper.title)}.pdf`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ---- 验证码 ----
router.get('/auth/status', (req, res) => {
  res.json({ unlocked: !!auth.userSession(req) });
});

router.post('/auth/unlock', (req, res) => {
  const ip = clientIp(req);
  if (unlockLimiter.blocked(ip)) return fail(res, 429, '尝试次数过多，请 15 分钟后再试');
  const result = codes.redeem((req.body || {}).code, ip);
  if (!result.ok) {
    unlockLimiter.fail(ip);
    return fail(res, 403, result.error);
  }
  unlockLimiter.reset(ip);
  auth.issueUserCookie(req, res, result.code);
  res.json({ ok: true });
});

router.post('/auth/logout', (req, res) => {
  auth.clearUserCookie(res);
  res.json({ ok: true });
});

// ---- 历年真题：公开 ----
router.get('/papers/past', (req, res) => {
  res.json(store.listPapers('past').map(paperView));
});

router.get('/files/past/:id', (req, res) => {
  const p = store.getPaper(req.params.id);
  sendPdf(req, res, p && p.kind === 'past' ? p : null);
});

// ---- 以下需要验证码 ----
router.get('/papers/mock', auth.requireAccess, (req, res) => {
  res.json(store.listPapers('mock').map(paperView));
});

router.get('/files/mock/:id', auth.requireAccess, (req, res) => {
  const p = store.getPaper(req.params.id);
  sendPdf(req, res, p && p.kind === 'mock' ? p : null);
});

router.get('/questions/mock', auth.requireAccess, (req, res) => {
  res.json(
    store.listQuestions('mock').map(({ id, stem, answer, keywords, tags, source }) => ({
      id, stem, answer, keywords, tags, source,
    }))
  );
});

router.get('/daily/dates', auth.requireAccess, (req, res) => {
  daily.ensure();
  res.json({ today: daily.today(), dates: daily.listDates() });
});

function dailyPaper(req, res) {
  const date = req.params.date === 'today' ? daily.today() : req.params.date;
  if (!daily.DATE_RE.test(date) || date > daily.today()) {
    fail(res, 400, '日期不合法');
    return null;
  }
  const paper = daily.ensure(date);
  if (!paper) fail(res, 404, date === daily.today() ? '题库为空，今日暂无试卷' : '该日没有试卷');
  return paper;
}

router.get('/daily/:date', auth.requireAccess, (req, res) => {
  const paper = dailyPaper(req, res);
  if (paper) res.json(daily.publicView(paper));
});

router.get('/daily/:date/answers', auth.requireAccess, (req, res) => {
  const paper = dailyPaper(req, res);
  if (paper) res.json(daily.answersOf(paper));
});

module.exports = router;
