// 公共工具：接口请求、转义、关键词高亮
async function api(url, opts = {}) {
  const init = { credentials: 'same-origin', method: opts.method || 'GET', headers: {} };
  if (opts.raw !== undefined) {
    init.body = opts.raw;
    init.headers['Content-Type'] = opts.contentType;
  } else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, init);
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && !opts.noRedirect) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = (api.on401 || '/unlock.html?next=') + (api.on401 ? '' : next);
    throw new Error('需要验证');
  }
  if (!res.ok) throw new Error((data && data.error) || `请求失败（${res.status}）`);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 在已转义文本里高亮关键词
function highlight(text, words) {
  let html = esc(text);
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    if (!w) continue;
    const re = new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    html = html.replace(re, (m) => `<mark>${m}</mark>`);
  }
  return html;
}

function fmtSize(n) {
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB';
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function setMsg(el, text, kind = '') {
  el.textContent = text || '';
  el.className = 'msg ' + kind;
}

const $ = (sel, root = document) => root.querySelector(sel);
