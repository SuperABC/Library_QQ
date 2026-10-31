const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('../config');
const { readJson, writeJson } = require('../util/jsonfile');

const FILE = path.join(DATA_DIR, 'bank.json');
const KINDS = ['past', 'mock'];

const newId = () => crypto.randomBytes(5).toString('hex');

function load() {
  const db = readJson(FILE, null) || {};
  return { papers: db.papers || [], questions: db.questions || [] };
}

const save = (db) => writeJson(FILE, db);

// ---- PDF 试卷 ----
function pdfPath(paper) {
  return path.join(DATA_DIR, 'pdfs', paper.kind, paper.file);
}

function listPapers(kind) {
  return load()
    .papers.filter((p) => !kind || p.kind === kind)
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title, 'zh'));
}

function getPaper(id) {
  return load().papers.find((p) => p.id === id) || null;
}

function addPaper({ kind, title, year, buffer }) {
  if (!KINDS.includes(kind)) throw new Error('kind 必须是 past 或 mock');
  if (!title) throw new Error('标题不能为空');
  if (buffer.slice(0, 4).toString() !== '%PDF') throw new Error('不是有效的 PDF 文件');
  const id = newId();
  const paper = {
    id,
    kind,
    title: String(title).slice(0, 120),
    year: year ? Number(year) || null : null,
    file: `${id}.pdf`,
    size: buffer.length,
    createdAt: Date.now(),
  };
  fs.writeFileSync(pdfPath(paper), buffer);
  const db = load();
  db.papers.push(paper);
  save(db);
  return paper;
}

function updatePaper(id, patch) {
  const db = load();
  const p = db.papers.find((x) => x.id === id);
  if (!p) return null;
  if (typeof patch.title === 'string' && patch.title.trim()) p.title = patch.title.trim().slice(0, 120);
  if (patch.year !== undefined) p.year = patch.year ? Number(patch.year) || null : null;
  save(db);
  return p;
}

function removePaper(id) {
  const db = load();
  const p = db.papers.find((x) => x.id === id);
  if (!p) return false;
  db.papers = db.papers.filter((x) => x.id !== id);
  save(db);
  try {
    fs.unlinkSync(pdfPath(p));
  } catch {}
  return true;
}

// ---- 简答题 ----
function cleanQuestion(q) {
  const keywords = Array.isArray(q.keywords)
    ? q.keywords
    : String(q.keywords || '').split(/[,，;；、\n]/);
  const tags = Array.isArray(q.tags) ? q.tags : String(q.tags || '').split(/[,，;；\s]+/);
  return {
    stem: String(q.stem || '').trim(),
    answer: String(q.answer || '').trim(),
    keywords: keywords.map((s) => String(s).trim()).filter(Boolean),
    tags: tags.map((s) => String(s).trim()).filter(Boolean),
    source: String(q.source || '').trim().slice(0, 100),
    from: q.from === 'mock' ? 'mock' : 'past',
  };
}

function listQuestions(from) {
  return load().questions.filter((q) => !from || q.from === from);
}

function addQuestions(items) {
  const db = load();
  const added = [];
  for (const raw of items) {
    const q = cleanQuestion(raw);
    if (!q.stem || !q.answer) continue;
    const item = { id: newId(), ...q, createdAt: Date.now() };
    db.questions.push(item);
    added.push(item);
  }
  save(db);
  return added;
}

function updateQuestion(id, patch) {
  const db = load();
  const i = db.questions.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const q = cleanQuestion({ ...db.questions[i], ...patch });
  if (!q.stem || !q.answer) throw new Error('题干和参考答案不能为空');
  db.questions[i] = { ...db.questions[i], ...q };
  save(db);
  return db.questions[i];
}

function removeQuestion(id) {
  const db = load();
  const n = db.questions.length;
  db.questions = db.questions.filter((x) => x.id !== id);
  save(db);
  return db.questions.length < n;
}

module.exports = {
  KINDS,
  load,
  pdfPath,
  listPapers,
  getPaper,
  addPaper,
  updatePaper,
  removePaper,
  listQuestions,
  addQuestions,
  updateQuestion,
  removeQuestion,
};
