const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config');
const { readJson, writeJson } = require('../util/jsonfile');
const store = require('./store');

const DIR = path.join(cfg.DATA_DIR, 'daily');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AVOID_DAYS = 7; // 尽量不重复最近几天出过的题

function today(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const fileOf = (date) => path.join(DIR, `${date}.json`);

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(date) {
  return crypto.createHash('sha256').update(`daily:${date}`).digest().readUInt32BE(0);
}

function recentIds(date) {
  const used = new Set();
  const d = new Date(`${date}T00:00:00`);
  for (let i = 1; i <= AVOID_DAYS; i++) {
    const prev = new Date(d);
    prev.setDate(d.getDate() - i);
    const paper = readJson(fileOf(today(prev)), null);
    (paper?.questions || []).forEach((q) => used.add(q.id));
  }
  return used;
}

// 以日期为种子，同一天重复调用结果一致；已有文件则不重新生成
function ensure(date = today()) {
  if (!DATE_RE.test(date)) return null;
  const existing = readJson(fileOf(date), null);
  if (existing) return existing;

  const all = store.listQuestions().sort((a, b) => a.id.localeCompare(b.id));
  if (!all.length) return null;

  const used = recentIds(date);
  let pool = all.filter((q) => !used.has(q.id));
  if (pool.length < cfg.dailyCount) pool = all;

  const rand = mulberry32(seedOf(date));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const paper = {
    date,
    generatedAt: Date.now(),
    questions: pool.slice(0, cfg.dailyCount).map((q) => ({
      id: q.id,
      stem: q.stem,
      answer: q.answer,
      keywords: q.keywords,
      source: q.source,
    })),
  };
  writeJson(fileOf(date), paper);
  return paper;
}

// 返回不含答案的版本，答题前不暴露参考答案
function publicView(paper) {
  return {
    date: paper.date,
    questions: paper.questions.map(({ id, stem, source }) => ({ id, stem, source })),
  };
}

function answersOf(paper) {
  return Object.fromEntries(
    paper.questions.map((q) => [q.id, { answer: q.answer, keywords: q.keywords }])
  );
}

function listDates() {
  const t = today();
  return fs
    .readdirSync(DIR)
    .map((f) => f.replace(/\.json$/, ''))
    .filter((d) => DATE_RE.test(d) && d <= t)
    .sort()
    .reverse();
}

function regenerate(date = today()) {
  try {
    fs.unlinkSync(fileOf(date));
  } catch {}
  return ensure(date);
}

// 跨天自动出卷：启动时生成一次，之后每分钟检查日期变化
function startScheduler() {
  let last = '';
  const tick = () => {
    const d = today();
    if (d !== last) {
      try {
        ensure(d);
        last = d;
      } catch (e) {
        console.error('每日出卷失败:', e.message);
      }
    }
  };
  tick();
  setInterval(tick, 60000).unref();
}

module.exports = { today, ensure, publicView, answersOf, listDates, regenerate, startScheduler, DATE_RE };
