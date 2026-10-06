/* 書き出し：予定表・記録を 🖨 印刷（PDF）・🖼 画像・📊 Excel（CSV）に、予定を 📅 スマホのカレンダー（.ics）に。
   畑の予定の画面（すべての野菜）と、野菜の画面（その野菜だけ）から開く */
'use strict';

/* ファイルを渡す（スマホは「共有」で LINE・メール・ファイルへ。だめならダウンロード） */
async function giveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`「${name}」を保存しました`);
}
/* 書き出す野菜の予定（やった・いま・これから） */
function exportRows(crops) {
  return crops.filter(c => c.plan && c.plantedAt).map(c => ({ c, rows: cropRows(c).map(r => ({ r, s: stateText(c, r) })) }));
}
const ymdSlash = d => d ? d.replace(/-/g, '/') : '';

/* ===== 📊 Excel（CSV。Excel で文字化けしないよう先頭に BOM） ===== */
const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvBlob = rows => new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' });
function planCsv(crops) {
  const out = [['野菜', '畑', '場所', '植えた日', '作業', 'はじめ', 'おわり', 'いま']];
  exportRows(crops).forEach(({ c, rows }) => rows.forEach(({ r, s }) => out.push([c.name, multiOn() ? fieldOf(c).name : '', c.place, ymdSlash(c.plantedAt), r.what, ymdSlash(r.from), ymdSlash(r.to), s])));
  return csvBlob(out);
}
function logCsv(crops) {
  const ids = new Set(crops.map(c => c.id)), out = [['日付', '野菜', '作業', '量', '単位', 'メモ', '写真']];
  data.logs.filter(l => ids.has(l.cropId)).sort((a, b) => a.date.localeCompare(b.date)).forEach(l => {
    const c = cropById(l.cropId), t = TYPES[l.type] || TYPES.other;
    out.push([ymdSlash(l.date), c ? c.name : '', t.label, l.amount === '' || l.amount == null ? '' : l.amount, l.amount ? l.unit : '', l.memo, l.hasPhoto ? 'あり' : '']);
  });
  return csvBlob(out);
}

/* ===== 📅 スマホのカレンダー（.ics）=====
   まだやっていない予定を、終日の予定として入れる。前の日の朝9時に知らせ（ブザー）を付ける */
function icsBlob(crops) {
  const t = today(), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), esc2 = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//saien-note//JA', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:菜園ノート'];
  let n = 0;
  exportRows(crops).forEach(({ c, rows }) => rows.forEach(({ r }) => {
    if (r.i === 0 || rowState(c, r) === 'done' || r.to < t) return;
    L.push('BEGIN:VEVENT', `UID:${c.id}-${r.i}@saien-note`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${r.from.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(r.to, 1).replace(/-/g, '')}`,
      `SUMMARY:${esc2(`${c.emoji}${c.name}：${r.what}`)}`, `DESCRIPTION:${esc2(`菜園ノートの予定（${fmtRange(r.from, r.to)}）`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc2(`${c.name}：${r.what}`)}`, 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
    n++;
  }));
  L.push('END:VCALENDAR');
  return { blob: new Blob([L.join('\r\n')], { type: 'text/calendar' }), n };
}

/* ===== 🖨 印刷（PDF）と 🖼 画像：同じ中身の表 ===== */
function printHtml(crops, title) {
  return `<h1>🌱 ${esc(title)}</h1><p class="pm">${fmtDateLong(today())} 現在・${esc(areaText(curField()))}</p>
    ${exportRows(crops).map(({ c, rows }) => `<h2>${c.emoji} ${esc(c.name)}${c.variety ? `（${esc(c.variety)}）` : ''}<small>${esc(startLabel(planByName(c.plan), c.as))}：${fmtDate(c.plantedAt)}${c.place ? '・' + esc(c.place) : ''}</small></h2>
      <table><tr><th>作業</th><th>時期</th><th>いま</th></tr>${rows.map(({ r, s }) => `<tr><td>${esc(r.what)}</td><td>${fmtRange(r.from, r.to)}</td><td>${esc(s)}</td></tr>`).join('')}</table>`).join('')}`;
}
function doPrint(crops, title) {
  let el = $('#printArea'); if (!el) { el = document.createElement('div'); el.id = 'printArea'; document.body.appendChild(el); }
  el.innerHTML = printHtml(crops, title);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); el.innerHTML = ''; removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch (e) { done(); } }, 50);
  setTimeout(() => { if (!matchMedia('print').matches) done(); }, 60000);
}
/* 画像：表をそのまま canvas に描く（幅1080） */
function scheduleCanvas(crops, title) {
  const list = exportRows(crops), W = 1080, P = 48, LH = 46;
  let H = P * 2 + 110; list.forEach(({ rows }) => { H += 96 + rows.length * LH + 24; });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Math.min(H, 16000);
  const x = cv.getContext('2d'), font = (sz, b) => `${b ? 'bold ' : ''}${sz}px "Hiragino Sans","Yu Gothic UI","Noto Sans JP",sans-serif`;
  x.fillStyle = '#f6f8f2'; x.fillRect(0, 0, W, cv.height);
  x.fillStyle = '#2e7d32'; x.font = font(44, true); x.fillText('🌱 ' + title, P, P + 40);
  x.fillStyle = '#666'; x.font = font(26); x.fillText(`${fmtDateLong(today())} 現在・${areaText(curField())}`, P, P + 86);
  let y = P + 130;
  list.forEach(({ c, rows }) => {
    x.fillStyle = '#fff'; x.fillRect(P - 12, y - 8, W - 2 * P + 24, 84 + rows.length * LH);
    x.fillStyle = '#222'; x.font = font(34, true); x.fillText(`${c.emoji} ${c.name}`, P, y + 36);
    x.fillStyle = '#666'; x.font = font(24); x.fillText(`${startLabel(planByName(c.plan), c.as)}：${fmtDate(c.plantedAt)}`, P + 420, y + 34);
    y += 72;
    rows.forEach(({ r, s }) => {
      x.fillStyle = r.kind.c; x.beginPath(); x.arc(P + 10, y + 14, 9, 0, 7); x.fill();
      x.fillStyle = s.startsWith('✓') || s === '済' ? '#999' : '#222'; x.font = font(28); x.fillText(r.what, P + 32, y + 24);
      x.fillText(fmtRange(r.from, r.to), P + 380, y + 24);
      x.fillStyle = /いま|過ぎた|今日/.test(s) ? '#e65100' : '#666'; x.fillText(s, P + 760, y + 24);
      y += LH;
    });
    y += 36;
  });
  return cv;
}

/* ===== 書き出しの窓 ===== */
function openExport(crops, title) {
  const has = exportRows(crops).length, logs = data.logs.filter(l => crops.some(c => c.id === l.cropId)).length;
  const s = openModal(`<h3>📤 ${esc(title)}を書き出す</h3>
    <p class="muted" style="margin-top:0">予定のある野菜 ${has}件・記録 ${logs}件</p>
    <div class="exlist">
      <button class="btn block" data-ex="print" ${has ? '' : 'disabled'}>🖨 予定表を印刷・PDFに<small>印刷の画面で「PDFに保存」を選ぶとPDFになります</small></button>
      <button class="btn block" data-ex="img" ${has ? '' : 'disabled'}>🖼 予定表を画像に<small>LINE やメールで送るときに</small></button>
      <button class="btn block" data-ex="plancsv" ${has ? '' : 'disabled'}>📊 予定表を Excel に（CSV）</button>
      <button class="btn block" data-ex="logcsv" ${logs ? '' : 'disabled'}>📊 記録を Excel に（CSV）<small>水やり・収穫の量・メモ</small></button>
      <button class="btn block" data-ex="ics" ${has ? '' : 'disabled'}>📅 予定をスマホのカレンダーに入れる<small>.ics ファイル。開くとカレンダーに入り、前の日の朝に知らせが来ます</small></button>
    </div>
    <div class="actions"><button class="btn primary" id="exClose">閉じる</button></div>`);
  $('#exClose').onclick = closeModal;
  const name = ext => `菜園ノート_${title.replace(/[\\/:*?"<>|]/g, '')}_${today()}.${ext}`;
  s.querySelectorAll('[data-ex]').forEach(b => b.onclick = async () => {
    const k = b.dataset.ex;
    if (k === 'print') { closeModal(); doPrint(crops, title); }
    else if (k === 'img') scheduleCanvas(crops, title).toBlob(bl => bl ? giveFile(bl, name('png')) : toast('画像にできませんでした'), 'image/png');
    else if (k === 'plancsv') giveFile(planCsv(crops), name('csv'));
    else if (k === 'logcsv') giveFile(logCsv(crops), name('csv').replace('.csv', '_記録.csv'));
    else if (k === 'ics') { const r = icsBlob(crops); if (!r.n) { toast('これからの予定がありません'); return; } await giveFile(r.blob, name('ics')); toast(`これからの予定 ${r.n}件をカレンダーのファイルにしました`, 2600); }
  });
}
