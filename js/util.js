/* 便利な部品（どの画面からも使う）。
   日付は 'YYYY-MM-DD' の文字で持つ（端末の時刻に合わせた「今日」）。 */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const WD = '日月火水木金土';

/* ===== 日付 ===== */
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function today() { return window.APP_TODAY || ymd(new Date()); }   // APP_TODAY はテストで日付を決めるため
function addDays(s, n) { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 86400000); }
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
}
function fmtDateLong(s) { const d = new Date(s + 'T00:00'); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; }
/* 「今日」「昨日」「3日前」「あと2日」 */
function ago(s) {
  const n = daysBetween(s, today());
  return n === 0 ? '今日' : n === 1 ? '昨日' : n > 0 ? `${n}日前` : n === -1 ? '明日' : `${-n}日後`;
}
/* 予定の日の幅：「4/1(火)」か「4/1(火)〜4/10(木)」 */
function fmtRange(a, b) { return a === b ? fmtDate(a) : `${fmtDate(a)}〜${fmtDate(b)}`; }

/* ===== 知らせ（下に少し出る） ===== */
function toast(msg, ms = 2000) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ===== 下から出る窓 ===== */
function openModal(html) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal"><div class="sheet">${html}</div></div>`;
  const md = root.firstElementChild;
  md.addEventListener('click', e => { if (e.target === md) closeModal(); });
  return md.firstElementChild;
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
function showViewer(url) {
  const v = document.createElement('div'); v.className = 'viewer';
  v.innerHTML = `<img src="${url}" alt="">`; v.onclick = () => v.remove();
  document.body.appendChild(v);
}

/* ===== 写真を小さくして JPEG に（容量を抑える） ===== */
function shrinkImage(file, max = 1280, q = 0.75) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('画像を読み込めませんでした')); };
    img.src = url;
  });
}

/* シンプルモード（画面の小さいスマホ用。文字を大きく、出すものを少なく）か。この端末だけ */
function simpleOn() { try { return localStorage.getItem('saien_simple') === '1'; } catch (e) { return false; } }
