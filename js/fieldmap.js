/* 畑の配置図と連作の注意。
   配置図：畑（field）をます目（cols×rows）で表し、畝（beds：[{id, name, x, y, w, h}]）を四角で置く。
           野菜（crop.bed）をどの畝に植えたかを残すと、畝の上に野菜の絵が出る。
   連作：同じ畝（畝がなければ同じ「場所」の文字）に、同じ仲間（科）の野菜を何年か続けて植えると育ちが悪くなる。
         前に植えた分を見て、空けたほうがよい年数より短ければ知らせる。 */
'use strict';

/* ===== 野菜の仲間（科）と、空けたい年数（家庭菜園のふつうの目安） ===== */
const FAMILY = {
  'ナス科': ['トマト', 'ナス', 'ピーマン', 'ジャガイモ', 'トウガラシ'],
  'ウリ科': ['キュウリ', 'カボチャ', 'スイカ', 'ズッキーニ'],
  'アブラナ科': ['ダイコン', 'カブ', 'ラディッシュ', 'キャベツ', 'ハクサイ', 'ブロッコリー', 'コマツナ', 'ミズナ'],
  'マメ科': ['エダマメ', 'エンドウ', 'ソラマメ'],
  'セリ科': ['ニンジン'], 'ヒユ科': ['ホウレンソウ', 'ビーツ'], 'キク科': ['レタス', 'シュンギク'],
  'ネギの仲間': ['タマネギ', 'ネギ', 'ニンニク'], 'イネ科': ['トウモロコシ'], 'ヒルガオ科': ['サツマイモ'],
  'サトイモ科': ['サトイモ'], 'バラ科': ['イチゴ'], 'アオイ科': ['オクラ'], 'シソ科': ['シソ']
};
const FAMILY_YEARS = { 'ナス科': 3, 'ウリ科': 2, 'アブラナ科': 2, 'マメ科': 3, 'セリ科': 1, 'ヒユ科': 1, 'キク科': 1, 'ネギの仲間': 1, 'イネ科': 0, 'ヒルガオ科': 0, 'サトイモ科': 3, 'バラ科': 1, 'アオイ科': 1, 'シソ科': 1 };
const PLAN_YEARS = { 'トマト': 4, 'ナス': 4, 'スイカ': 5, 'エンドウ': 5, 'ソラマメ': 4, 'エダマメ': 2, 'ジャガイモ': 3 };
/* 野菜（予定の名前）→ 科。自分の野菜は「似ている野菜」の科 */
function familyOf(planName) {
  const v = planByName(planName), n = (v && v.base) || planName;
  return Object.keys(FAMILY).find(k => FAMILY[k].includes(n)) || '';
}
function restYears(planName) { const v = planByName(planName), n = (v && v.base) || planName; return PLAN_YEARS[n] != null ? PLAN_YEARS[n] : (FAMILY_YEARS[familyOf(planName)] || 0); }

/* 同じ所か（同じ畑で、同じ畝。畝がないときは同じ場所の文字） */
const samePlot = (a, b) => a.fieldId === b.fieldId && (a.bed ? a.bed === b.bed : (!!a.place && !b.bed && a.place.trim() === String(b.place || '').trim()));
/* 連作の注意：{p:前の野菜, fam, years:空けたい年数, ago:何年前か} か null */
function rotationWarn(c) {
  if (!c || !c.plan || !c.plantedAt || (!c.bed && !c.place)) return null;
  const fam = familyOf(c.plan), years = restYears(c.plan); if (!fam || !years) return null;
  const hit = data.crops.filter(p => p.id !== c.id && p.plan && p.plantedAt && p.plantedAt < c.plantedAt && samePlot(c, p) && familyOf(p.plan) === fam
    && daysBetween(p.plantedAt, c.plantedAt) < years * 365 && daysBetween(p.plantedAt, c.plantedAt) > 20)
    .sort((a, b) => b.plantedAt.localeCompare(a.plantedAt))[0];
  if (!hit) return null;
  return { p: hit, fam, years, ago: Math.max(0, Math.round(daysBetween(hit.plantedAt, c.plantedAt) / 365 * 10) / 10) };
}
const rotationText = w => `${w.ago < 1 ? '1年以内' : w.ago + '年前'}に同じ${w.fam}の${w.p.name}（${w.p.plantedAt.slice(0, 4)}年）を植えた所です。${w.fam}は${w.years}年ほど空けると病気が出にくくなります`;

/* ===== 配置図 ===== */
function bedsOf(f) { if (!Array.isArray(f.beds)) f.beds = []; return f.beds; }
const bedById = (f, id) => bedsOf(f).find(b => b.id === id) || null;
const bedName = c => { const b = bedById(fieldOf(c), c.bed); return b ? b.name : ''; };
let mapEdit = null;   // 畝を描いているとき {fieldId, a:[x,y]}
function mapHtml(f) {
  const cols = f.cols || 8, rows = f.rows || 6, t = today();
  const crops = data.crops.filter(c => c.fieldId === f.id && c.bed && c.status !== 'done' && c.plantedAt && c.plantedAt <= addDays(t, 30));
  let cells = '';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells += `<rect x="${x}" y="${y}" width="1" height="1" class="mc${mapEdit && mapEdit.fieldId === f.id && mapEdit.a && mapEdit.a[0] === x && mapEdit.a[1] === y ? ' a' : ''}" data-cell="${f.id}:${x}:${y}"/>`;
  const beds = bedsOf(f).map(b => {
    const cs = crops.filter(c => c.bed === b.id), warn = cs.some(rotationWarn);
    // 野菜の絵は畝の中に並べる（入りきらない分は「+n」）
    const sz = Math.min(.5, b.w * .42), per = Math.max(1, Math.floor((b.w - .2) / (sz * 1.1))), lines = Math.max(1, Math.floor((b.h - .7) / (sz * 1.15)));
    const cap = per * lines, shown = cs.slice(0, cs.length > cap ? cap - 1 : cap);
    let ems = shown.map((c, i) => { const r = Math.floor(i / per), k = i % per, n = Math.min(per, shown.length - r * per);
      return `<text x="${r2(b.x + b.w / 2 + (k - (n - 1) / 2) * sz * 1.1)}" y="${r2(b.y + .72 + r * sz * 1.15 + sz / 2)}" font-size="${r2(sz)}" text-anchor="middle" dominant-baseline="central">${c.emoji}</text>`; }).join('');
    if (cs.length > shown.length) ems += `<text x="${r2(b.x + b.w / 2)}" y="${r2(b.y + b.h - .25)}" font-size="${r2(sz * .7)}" class="bn">+${cs.length - shown.length}</text>`;
    return `<g class="bed${warn ? ' warn' : ''}" data-bed="${f.id}:${b.id}"><rect x="${b.x + .08}" y="${b.y + .08}" width="${b.w - .16}" height="${b.h - .16}" rx=".18"/>
      <text x="${b.x + b.w / 2}" y="${b.y + (cs.length ? .42 : b.h / 2)}" class="bn" font-size="${r2(Math.min(.42, b.w * .3))}">${esc(b.name)}</text>${ems}</g>`;
  }).join('');
  const editing = mapEdit && mapEdit.fieldId === f.id;
  return `<div class="card fmap"><div class="fmh"><b>🗺 ${esc(f.name)}</b><span class="muted small">${cols}×${rows}ます</span>
      <button class="btn mini" data-mapsize="${f.id}">広さ</button><button class="btn mini${editing ? ' primary' : ''}" data-mapedit="${f.id}">${editing ? '✓ おわる' : '✏️ 畝を描く'}</button></div>
    ${editing ? `<div class="tip">${mapEdit.a ? '畝の反対の角のますを押してください' : '畝の1つの角のますを押してください（四角い畝ができます）'}</div>` : ''}
    <svg viewBox="0 0 ${cols} ${rows}" class="fmsvg" role="img" aria-label="${esc(f.name)}の配置図">${cells}${beds}</svg>
    ${bedsOf(f).length ? '' : '<div class="muted small">「✏️ 畝を描く」で、ます目に畝を置いてください。畝を押すと、そこに植えた野菜と、前に植えた野菜（連作の注意）が見られます。</div>'}</div>`;
}
function renderMap(m) {
  const fs = multiOn() && data.settings.cur === 'all' ? data.fields : [curField()];
  m.innerHTML = cropSegHtml() + fs.map(mapHtml).join('') + `<div class="legend"><span><i class="lg bed"></i>畝（押すと中身）</span><span><i class="lg warn"></i>連作の注意がある畝</span></div>`;
  bindCropSeg(m);
  m.querySelectorAll('[data-mapedit]').forEach(b => b.onclick = () => { const id = b.dataset.mapedit; mapEdit = mapEdit && mapEdit.fieldId === id ? null : { fieldId: id, a: null }; render(); });
  m.querySelectorAll('[data-mapsize]').forEach(b => b.onclick = () => openMapSize(fieldById(b.dataset.mapsize)));
  m.querySelectorAll('[data-cell]').forEach(r => r.onclick = async () => {
    const [fid, x, y] = r.dataset.cell.split(':'), f = fieldById(fid); if (!mapEdit || mapEdit.fieldId !== fid) return;
    if (!mapEdit.a) { mapEdit.a = [+x, +y]; render(); return; }
    const [ax, ay] = mapEdit.a, bx = +x, by = +y, nb = { id: uid(), name: `畝${bedsOf(f).length + 1}`, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx) + 1, h: Math.abs(ay - by) + 1 };
    if (bedsOf(f).some(b => nb.x < b.x + b.w && b.x < nb.x + nb.w && nb.y < b.y + b.h && b.y < nb.y + nb.h)) { toast('ほかの畝と重なっています'); mapEdit.a = null; render(); return; }
    f.beds.push(nb); mapEdit.a = null; await save(); render(); toast(`「${nb.name}」を置きました。押すと名前を変えられます`);
  });
  m.querySelectorAll('[data-bed]').forEach(g => g.onclick = e => { e.stopPropagation(); const [fid, bid] = g.dataset.bed.split(':'); if (mapEdit) mapEdit.a = null; openBed(fieldById(fid), bedById(fieldById(fid), bid)); });
}
function openMapSize(f) {
  const s = openModal(`<h3>🗺 ${esc(f.name)}の広さ（ます目）</h3>
    <p class="muted" style="margin-top:0">1ますを1mなどと決めて、畑の形に合わせてください。畝がはみ出すときは小さくできません。</p>
    <div class="row"><label class="f" style="margin:0">横</label><input type="number" id="msC" min="2" max="30" value="${f.cols || 8}" style="width:80px"><label class="f" style="margin:0">縦</label><input type="number" id="msR" min="2" max="30" value="${f.rows || 6}" style="width:80px"></div>
    <div class="actions"><button class="btn" id="msCancel">やめる</button><button class="btn primary" id="msSave">保存</button></div>`);
  $('#msCancel').onclick = closeModal;
  $('#msSave').onclick = async () => {
    const c = Math.max(2, Math.min(30, +$('#msC').value || 8)), r = Math.max(2, Math.min(30, +$('#msR').value || 6));
    if (bedsOf(f).some(b => b.x + b.w > c || b.y + b.h > r)) { toast('畝がはみ出すので、その広さにはできません'); return; }
    f.cols = c; f.rows = r; await save(); closeModal(); render();
  };
}
/* 畝を押したとき：いまの野菜・前に植えた野菜（年ごと）・ここに植える・名前・消す */
function openBed(f, b) {
  const all = data.crops.filter(c => c.fieldId === f.id && c.bed === b.id).sort((x, y) => (y.plantedAt || '').localeCompare(x.plantedAt || ''));
  const now = all.filter(c => c.status !== 'done'), past = all.filter(c => c.status === 'done');
  const line = c => { const w = rotationWarn(c); return `<div class="bedc" data-open-crop="${c.id}"><span>${c.emoji}</span><div><b>${esc(c.name)}</b><small>${fmtDate(c.plantedAt)}・${esc(familyOf(c.plan) || '—')}${w ? ` <em>⚠️連作</em>` : ''}</small></div></div>`; };
  const s = openModal(`<h3>🗺 ${esc(b.name)}<small class="muted">（${esc(f.name)}）</small></h3>
    <label class="f">名前</label><div class="row"><input type="text" id="bdName" value="${esc(b.name)}" style="flex:1"><button class="btn" id="bdRename">変える</button></div>
    <h4>いま植えている</h4>${now.length ? now.map(line).join('') : '<div class="muted">ありません</div>'}
    <h4>前に植えた（連作を見るとき）</h4>${past.length ? past.map(line).join('') : '<div class="muted">まだありません</div>'}
    <div class="tip">同じ仲間（科）を続けて植えないのがコツです。ナス科・ウリ科・マメ科は2〜5年空けます。</div>
    <div class="actions"><button class="btn" id="bdClose">閉じる</button><button class="btn primary" id="bdPlant">＋ この畝に植える</button></div>
    <div style="margin-top:12px"><button class="btn danger block" id="bdDel">この畝を消す</button></div>`);
  $('#bdClose').onclick = closeModal;
  $('#bdRename').onclick = async () => { const n = $('#bdName').value.trim(); if (!n) return; data.crops.forEach(c => { if (c.bed === b.id && c.place === b.name) c.place = n; }); b.name = n; await save(); closeModal(); render(); toast('名前を変えました'); };
  $('#bdPlant').onclick = () => { closeModal(); openCropForm(null, { fieldId: f.id, bed: b.id, place: b.name }); };
  $('#bdDel').onclick = async () => {
    if (!confirm(`「${b.name}」を消しますか？（植えた野菜と記録は消えません。場所の名前は残ります）`)) return;
    data.crops.forEach(c => { if (c.bed === b.id) delete c.bed; }); f.beds = f.beds.filter(x => x !== b); await save(); closeModal(); render();
  };
  s.querySelectorAll('[data-open-crop]').forEach(d => d.onclick = () => { closeModal(); go('crops', d.dataset.openCrop); });
}
