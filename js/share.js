/* 👨‍👩‍👧 家族と共有と、🧺 種・資材・費用。
   共有：共有ファイル（写真つき JSON）を送り、受け取った人は「合わせる」。いまのデータは消さず、
         同じ野菜・記録（同じ id）は1つにまとめ、ないものだけ足す（バックアップから戻すのは「置きかえ」）。
   種・資材：data.stock = [{id, kind, name, plan, date, price, qty, expire, left, memo}]。
         種の有効期限・残り、今年かかったお金を見る。野菜を登録するとき、その野菜の種が残っていれば知らせる。 */
'use strict';

/* ===== 👨‍👩‍👧 共有 ===== */
async function exportShare() {
  const photos = {};
  for (const l of data.logs) if (l.hasPhoto) { const p = await getPhoto(l.id); if (p) photos[l.id] = p; }
  const share = { crops: data.crops, logs: data.logs, fields: data.fields, myPlans: data.myPlans, stock: data.stock };
  const blob = new Blob([JSON.stringify({ app: 'saien-note', kind: 'share', version: 3, exportedAt: new Date().toISOString(), data: share, photos })], { type: 'application/json' });
  await giveFile(blob, `菜園ノート_共有_${today()}.json`);
}
/* 合わせる（足した数を返す） */
async function mergeShare(file) {
  const j = JSON.parse(await file.text());
  if (j.app !== 'saien-note' || !j.data) throw new Error('菜園ノートのファイルではありません');
  const inc = normalize(JSON.parse(JSON.stringify(j.data)));
  const n = { crops: 0, logs: 0, fields: 0, plans: 0, stock: 0 };
  // 畑：同じ id はそのまま（畝は足す）、ないものは足す
  inc.fields.forEach(f => {
    const mine = fieldById(f.id);
    if (!mine) { data.fields.push(f); n.fields++; return; }
    (f.beds || []).forEach(b => { if (!bedsOf(mine).some(x => x.id === b.id)) mine.beds.push(b); });
    if (!mine.loc && f.loc) mine.loc = f.loc;
  });
  if (data.fields.length > 1 && !data.settings.multi && n.fields) data.settings.multi = true;   // 畑がふえたら、畑ごとに見られるように
  inc.myPlans.forEach(p => { if (!planByName(p.n)) { data.myPlans.push(p); n.plans++; } });
  inc.crops.forEach(c => {
    const mine = cropById(c.id);
    if (!mine) { data.crops.push(c); n.crops++; return; }
    Object.entries(c.done || {}).forEach(([i, d]) => { if (!mine.done[i]) mine.done[i] = d; });   // 「やった」は両方の分
    if (c.status === 'done' || (c.status === 'harvesting' && mine.status === 'growing')) mine.status = c.status;
  });
  const have = new Set(data.logs.map(l => l.id));
  for (const l of inc.logs) {
    if (have.has(l.id) || !cropById(l.cropId)) continue;
    if (l.hasPhoto) { const p = (j.photos || {})[l.id]; if (p) await setPhoto(l.id, p); else l.hasPhoto = false; }
    data.logs.push(l); n.logs++;
  }
  (inc.stock || []).forEach(s => { if (!data.stock.some(x => x.id === s.id)) { data.stock.push(s); n.stock++; } });
  await save();
  return n;
}

/* ===== 🧺 種・資材・費用 ===== */
const STOCK_KINDS = { seed: '🌰 種', nae: '🌱 苗', fert: '🧪 肥料', tool: '🧰 資材・道具', other: '📌 その他' };
const expireState = s => !s.expire ? '' : s.expire < today() ? 'out' : daysBetween(today(), s.expire) <= 60 ? 'near' : '';
/* その野菜の種で、まだ残っているもの */
const seedsFor = plan => data.stock.filter(s => s.kind === 'seed' && s.left !== false && plan && (s.plan === plan || s.name.includes(plan)));
function stockTabHtml() {
  const y = today().slice(0, 4), list = data.stock.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const spent = k => data.stock.filter(s => (s.date || '').startsWith(y) && (!k || s.kind === k)).reduce((a, s) => a + (Number(s.price) || 0), 0);
  const seeds = list.filter(s => s.kind === 'seed' && s.left !== false);
  let h = `<button class="btn primary block" id="stAdd" style="margin-bottom:10px">＋ 種・苗・肥料・資材を足す</button>
    <h2 class="first">💴 ${y}年にかかったお金<small>種・苗・肥料・資材の合計</small></h2><div class="card"><div class="spent"><b>${spent().toLocaleString()}円</b></div>
      <div class="spk">${Object.entries(STOCK_KINDS).map(([k, l]) => spent(k) ? `<span>${l} ${spent(k).toLocaleString()}円</span>` : '').join('')}</div>
      ${(() => { const hv = data.logs.filter(l => l.type === 'harvest' && l.date.startsWith(y) && viewLog(l)).length; return hv && spent() ? `<div class="muted small">収穫 ${hv}回。1回あたり約${Math.round(spent() / hv).toLocaleString()}円</div>` : ''; })()}</div>
    <h2>🌰 残っている種<small>${seeds.length}種類</small></h2><div class="card">${seeds.length ? seeds.map(stockLine).join('') : '<div class="muted">まだありません。種を買ったら「＋」で残しておくと、まくときに分かります</div>'}</div>
    <h2>📋 すべて<small>${list.length}件</small></h2><div class="card">${list.length ? list.map(stockLine).join('') : '<div class="muted">まだありません</div>'}</div>`;
  return h;
}
function stockLine(s) {
  const ex = expireState(s);
  return `<div class="stl" data-st-edit="${s.id}"><span class="k">${STOCK_KINDS[s.kind].split(' ')[0]}</span><div><b>${esc(s.name)}${s.left === false ? ' <small class="muted">（使いきった）</small>' : ''}</b>
    <small>${s.date ? fmtDate(s.date) : ''}${s.qty ? '・' + esc(s.qty) : ''}${s.expire ? `・<span class="${ex}">期限 ${fmtDate(s.expire)}${ex === 'out' ? '（切れています）' : ex === 'near' ? '（もうすぐ）' : ''}</span>` : ''}${s.memo ? '・' + esc(s.memo) : ''}</small></div>
    <span class="pr">${s.price ? (+s.price).toLocaleString() + '円' : ''}</span></div>`;
}
function bindStock(m) {
  if ($('#stAdd')) $('#stAdd').onclick = () => openStockForm(null);
  m.querySelectorAll('[data-st-edit]').forEach(d => d.onclick = () => openStockForm(data.stock.find(s => s.id === d.dataset.stEdit)));
}
function openStockForm(s) {
  const isNew = !s, w = s ? Object.assign({}, s) : { kind: 'seed', name: '', plan: '', date: today(), price: '', qty: '', expire: '', left: true, memo: '' };
  const m = openModal(`<h3>${isNew ? '🧺 種・資材を足す' : '🧺 直す'}</h3>
    <label class="f">種類</label><div class="pick" id="stK">${Object.entries(STOCK_KINDS).map(([k, l]) => `<button type="button" data-k="${k}" class="${w.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="stPlanBox"><label class="f">どの野菜の種・苗？</label><select id="stPlan"><option value="">えらばない</option>${allPlans().map(v => `<option value="${esc(v.n)}" ${w.plan === v.n ? 'selected' : ''}>${v.i} ${esc(v.n)}</option>`).join('')}</select></div>
    <label class="f">名前</label><input type="text" id="stName" value="${esc(w.name)}" placeholder="例：桃太郎の種・化成肥料8-8-8・支柱">
    <div class="row"><div style="flex:1"><label class="f">買った日</label><input type="date" id="stDate" value="${esc(w.date || '')}"></div><div style="flex:1"><label class="f">値段（円）</label><input type="number" id="stPrice" inputmode="numeric" min="0" value="${esc(w.price)}"></div></div>
    <label class="f">量（なくてもよい）</label><input type="text" id="stQty" value="${esc(w.qty)}" placeholder="例：1袋（20粒）・5kg">
    <div id="stExBox"><label class="f">種の有効期限（袋のうらに書いてあります）</label><input type="date" id="stEx" value="${esc(w.expire || '')}"></div>
    <label class="sw"><input type="checkbox" id="stLeft" ${w.left !== false ? 'checked' : ''}> まだ残っている</label>
    <label class="f">メモ</label><input type="text" id="stMemo" value="${esc(w.memo)}" placeholder="買った店など">
    <div class="actions"><button class="btn" id="stCancel">やめる</button><button class="btn primary" id="stSave">${isNew ? '足す' : '保存'}</button></div>
    ${isNew ? '' : '<div style="margin-top:14px"><button class="btn danger block" id="stDel">消す</button></div>'}`);
  const sync = () => { $('#stPlanBox').hidden = !['seed', 'nae'].includes(w.kind); $('#stExBox').hidden = w.kind !== 'seed'; };
  sync();
  m.querySelectorAll('#stK button').forEach(b => b.onclick = () => { m.querySelectorAll('#stK button').forEach(x => x.classList.remove('on')); b.classList.add('on'); w.kind = b.dataset.k; sync(); });
  $('#stPlan').onchange = e => { const v = planByName(e.target.value); if (v && !$('#stName').value.trim()) $('#stName').value = v.n + (w.kind === 'nae' ? 'の苗' : 'の種'); };
  $('#stCancel').onclick = closeModal;
  $('#stSave').onclick = async () => {
    const name = $('#stName').value.trim(); if (!name) { $('#stName').focus(); toast('名前を入れてください'); return; }
    Object.assign(w, { name, plan: ['seed', 'nae'].includes(w.kind) ? $('#stPlan').value : '', date: $('#stDate').value, price: $('#stPrice').value === '' ? '' : Math.max(0, +$('#stPrice').value), qty: $('#stQty').value.trim(), expire: w.kind === 'seed' ? $('#stEx').value : '', left: $('#stLeft').checked, memo: $('#stMemo').value.trim() });
    if (isNew) { w.id = uid(); data.stock.push(w); } else Object.assign(s, w);
    await save(); closeModal(); render(); toast(isNew ? '足しました' : '保存しました');
  };
  if (!isNew) $('#stDel').onclick = async () => { if (!confirm(`「${s.name}」を消しますか？`)) return; data.stock = data.stock.filter(x => x !== s); await save(); closeModal(); render(); };
}
