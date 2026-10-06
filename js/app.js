/* 画面（下のタブ5つ）と、入れる窓。
   🌱 畑 …… 育てている野菜の一覧。上に「近いうちにやること」。押すとその野菜の詳しい画面（予定・肥料・記録）
   📅 予定 … 月のカレンダーに、すべての野菜の予定（色の点）と記録（絵）を出す。日を押すとその日の予定と記録
   📝 記録 … 作業の記録の一覧と、年ごとの集計
   📖 育て方 … 33種類の野菜の育て方（いつまく・予定・肥料・コツ・病気）。ここから畑に登録できる
   ⚙ 設定 …… 地域（予定の日数の補正）・バックアップ・使い方 */
'use strict';
const PRESETS = [
  ['🍅','トマト'],['🥒','キュウリ'],['🍆','ナス'],['🫑','ピーマン'],['🌶️','トウガラシ'],['🥕','ニンジン'],['🥬','葉物'],['🥦','ブロッコリー'],
  ['🧅','タマネギ'],['🧄','ニンニク'],['🥔','ジャガイモ'],['🍠','サツマイモ'],['🌽','トウモロコシ'],['🫛','豆'],['🍓','イチゴ'],['🍉','スイカ'],
  ['🎃','カボチャ'],['🌿','ハーブ'],['🌱','その他']
];
const TYPES = {
  water:     { icon: '💧', label: '水やり' },
  fertilize: { icon: '🧪', label: '追肥' },
  harvest:   { icon: '🧺', label: '収穫' },
  weed:      { icon: '✂️', label: '除草・手入れ' },
  spray:     { icon: '🐛', label: '病害虫・消毒' },
  observe:   { icon: '👀', label: '観察' },
  other:     { icon: '📌', label: 'その他' }
};
const STATUS = { growing: '育成中', harvesting: '収穫中', done: '終了' };
const UNITS = ['個', 'g', 'kg', '本', '株', '束'];
const WATER_WARN_DAYS = 3;   // この日数以上水やりしていなければ目立たせる
const TITLES = { crops: '菜園ノート', plan: '予定', logs: '記録', guide: '育て方', settings: '設定' };

/* ===== データを引く ===== */
const cropById = id => data.crops.find(c => c.id === id);
const viewCrops = () => data.crops.filter(inView);   // いま見ている畑の野菜（畑ごとに管理していなければ全部）
const activeCrops = () => viewCrops().filter(c => c.status !== 'done');
const viewLog = l => { const c = cropById(l.cropId); return !!c && inView(c); };
const logsOf = id => data.logs.filter(l => l.cropId === id).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
const lastOf = (id, type) => logsOf(id).find(l => l.type === type);
function harvestTotals(logs) {
  const t = {};
  logs.filter(l => l.type === 'harvest' && l.amount > 0).forEach(l => { t[l.unit] = (t[l.unit] || 0) + Number(l.amount); });
  return Object.entries(t).map(([u, v]) => `${Math.round(v * 100) / 100}${u}`).join('・');
}
/* やること：まだやっていない予定のうち、時期を過ぎて14日以内〜days日先まで */
function upcoming(days) {
  const t = today(), out = [];
  activeCrops().forEach(c => cropRows(c).forEach(r => {
    if (r.i === 0) return; const s = rowState(c, r, t);
    if (s === 'done' || r.from > addDays(t, days) || r.to < addDays(t, -14)) return;
    out.push({ c, r, s });
  }));
  return out.sort((a, b) => a.r.from.localeCompare(b.r.from));
}

/* ===== 画面の切りかえ ===== */
let view = { tab: 'crops', cropId: null };
let cropFilter = 'active', logTypeFilter = 'all', logSub = 'list';
let cal = { y: 0, m: 0, sel: '' }, cropCal = { id: '', y: 0, m: 0, sel: '' };
let guide = { n: '', q: '', date: '', as: 'seed', area: 1 };

/* ブラウザ（スマホ）の「戻る」はアプリの中で戻る：窓を閉じる → 野菜の画面から一覧へ → ほかのタブから畑へ。
   畑の一覧で戻ると「もう一度でアプリを閉じます」と出し、もう一度押したときだけページを離れる。
   履歴は [いちばん下(base)] [畑] [ほかのタブ] [野菜の画面] の高さまでしか積まない */
function go(tab, cropId = null) {
  const prev = view, d = (history.state && history.state.d) || 1;
  if (!cropId && tab === 'crops' && d > 1) { goingHome = true; history.go(1 - d); return; }   // 畑の一覧へは、履歴をさかのぼって戻る（onPop で出す）
  view = { tab, cropId };
  if (cropId && cropId !== prev.cropId) cropCal = { id: cropId, y: 0, m: 0, sel: '' };
  if (!cropId && tab === 'crops') history.replaceState({ v: view, d: 1 }, '');
  else if (cropId) { if (prev.cropId) history.replaceState({ v: view, d }, ''); else history.pushState({ v: view, d: d + 1 }, ''); }
  else if (d === 1) history.pushState({ v: view, d: 2 }, '');
  else history.replaceState({ v: view, d }, '');
  render(); window.scrollTo(0, 0);
}
/* 見出しの「‹ 戻る」と、ブラウザの戻るを同じ動きに */
function goBack() { if (history.state && history.state.d > 1) history.back(); else go('crops'); }
let goingHome = false;
function onPop(e) {
  const home = goingHome; goingHome = false;
  const vw = document.querySelector('.viewer'), st = e.state || {};
  if (!home && (vw || $('#modalRoot').firstElementChild)) {   // 窓が開いていたら閉じるだけ（今の画面にとどまる）
    if (vw) vw.remove(); else closeModal();
    history.pushState({ v: view, d: st.v ? (st.d || 1) + 1 : 1 }, ''); return;   // 1つ戻った分を積みなおす
  }
  if (st.v) { view = home ? { tab: 'crops', cropId: null } : st.v; render(); window.scrollTo(0, 0); return; }
  // いちばん下まで戻った
  if (home || view.tab !== 'crops' || view.cropId) { view = { tab: 'crops', cropId: null }; history.pushState({ v: view, d: 1 }, ''); render(); window.scrollTo(0, 0); return; }
  if (EMBED) { try { window.parent.closeSaien(); return; } catch (e) {} }   // 表電卓の中：道具を閉じる
  toast('もう一度「戻る」でアプリを閉じます', 2500);
}
function render() {
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === view.tab));
  $('#backBtn').hidden = !view.cropId;
  $('#fab').hidden = !['crops', 'logs', 'plan'].includes(view.tab) || (view.tab === 'logs' && logSub === 'sum');
  const fs = $('#fieldSel'), showFs = multiOn() && !view.cropId && ['crops', 'plan', 'logs'].includes(view.tab);
  fs.hidden = !showFs;
  if (showFs) fs.innerHTML = data.fields.map(f => `<option value="${f.id}">📍${esc(f.name)}</option>`).join('') + `<option value="all">📍すべての畑</option>`, fs.value = data.settings.cur;
  const m = $('#main');
  if (view.cropId && cropById(view.cropId)) { if (cropCal.id !== view.cropId) cropCal = { id: view.cropId, y: 0, m: 0, sel: '' }; return renderDetail(m); }
  view.cropId = null;
  $('#title').textContent = TITLES[view.tab];
  ({ crops: renderCrops, plan: renderPlan, logs: renderLogs, guide: renderGuide, settings: renderSettings })[view.tab](m);
}

/* ===== やることの一行（畑と予定の画面で使う） ===== */
function taskHtml({ c, r, s }) {
  return `<div class="task ${s}"><span class="dot" style="background:${r.kind.c}"></span>
    <div class="tx" data-open="${c.id}"><b>${c.emoji} ${esc(c.name)}：${esc(r.what)}</b><small>${fmtRange(r.from, r.to)}・${esc(stateText(c, r))}</small></div>
    <button class="ok" data-done="${c.id}:${r.i}" aria-label="やった">✓ やった</button></div>`;
}
function bindTasks(m) {
  m.querySelectorAll('[data-done]').forEach(b => b.onclick = e => { e.stopPropagation(); const [id, i] = b.dataset.done.split(':'); doTask(id, +i); });
  m.querySelectorAll('[data-open]').forEach(b => b.onclick = () => go('crops', b.dataset.open));
}
/* 予定を「やった」にする。記録にも残す（収穫は量を入れられるように窓を出す） */
async function doTask(cropId, i) {
  const c = cropById(cropId), r = cropRows(c).find(x => x.i === i); if (!c || !r) return;
  if (r.kind.log === 'harvest') { openLogForm({ cropId, type: 'harvest', memo: r.what }, () => { c.done[i] = today(); }); return; }
  c.done[i] = today();
  data.logs.push({ id: uid(), cropId, type: r.kind.log, date: today(), memo: r.what, ts: Date.now() });
  await save(); render(); toast(`✓ ${c.name}：${r.what} をやったことにしました（記録にも残しました）`, 2600);
}
async function undoTask(cropId, i) {
  const c = cropById(cropId); if (!c || !c.done[i]) return;
  if (!confirm('「やった」を取り消しますか？（記録はそのまま残ります）')) return;
  delete c.done[i]; await save(); render();
}

/* ===== 🌱 畑 ===== */
const showFieldName = () => multiOn() && data.settings.cur === 'all';
function renderCrops(m) {
  const list = viewCrops().filter(c => cropFilter === 'all' ? true : cropFilter === 'done' ? c.status === 'done' : c.status !== 'done')
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (b.plantedAt || '').localeCompare(a.plantedAt || ''));
  let h = '';
  if (data.crops.length && !viewCrops().length) {
    m.innerHTML = `<div class="empty"><div class="big">📍</div><p><b>${esc(curField().name)}</b>には、まだ野菜がありません。</p><p>右下の「＋」で登録します。上の 📍 でほかの畑に切りかえられます。</p></div>`;
    return;
  }
  if (!data.crops.length) {
    m.innerHTML = installBanner() + `<div class="empty"><div class="big">🌱</div><p><b>菜園ノートへようこそ</b></p></div>
      <div class="card steps"><div><span>1</span><p>右下の「＋」で、<b>植えた野菜</b>（または、これから植える野菜）を登録します。種や苗を植えた日を入れると、<b>発芽・追肥・収穫などの予定</b>が出ます。</p></div>
      <div><span>2</span><p>「📅 予定」のカレンダーで、<b>いつ何をするか</b>が分かります。やったら「✓ やった」。</p></div>
      <div><span>3</span><p>水やりは 💧 を押すだけ。収穫や手入れは ✏️ で写真といっしょに残せます。</p></div>
      <div><span>📲</span><p>「⚙ 設定」の<b>アプリとして入れる</b>で、表電卓とは別のアプリとしてホーム画面に入れられます。</p></div>
      <div><span>💡</span><p>はじめに「⚙ 設定」で<b>住んでいる地域</b>を選ぶと、予定の日がその地域に合います（いま：${esc(areaText())}）。畑がいくつかあるときは「⚙ 設定」の<b>畑ごとに管理する</b>で分けられます。何を植えるか迷ったら「📖 育て方」へ。</p></div></div>`;
    bindInstall();
    return;
  }
  h += installBanner();
  const up = upcoming(7);
  const nt = simpleOn() ? 3 : 6;
  if (up.length) h += `<h2 class="first">📋 近いうちにやること</h2><div class="card">${up.slice(0, nt).map(taskHtml).join('')}${up.length > nt ? `<button class="link" id="moreTasks">ほか ${up.length - nt}件 → 📅 予定へ</button>` : ''}</div>`;
  h += sickBoardHtml(activeCrops(), !up.length);
  const f = [['active', '育てている'], ['done', '終了'], ['all', 'すべて']];
  h += `<div class="filters">${f.map(([k, l]) => `<button class="chip ${cropFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>`;
  if (!list.length) h += `<div class="empty">該当する野菜はありません</div>`;
  list.forEach(c => {
    const lw = lastOf(c.id, 'water'), tot = harvestTotals(logsOf(c.id)), nx = c.status !== 'done' ? nextTask(c) : null;
    const badges = [`<span class="badge ${c.status === 'harvesting' ? 'acc' : ''}">${STATUS[c.status]}</span>`];
    if (c.plantedAt) { const n = daysBetween(c.plantedAt, today()); badges.push(`<span class="badge">${n >= 0 ? `${c.as === 'nae' ? '植えて' : 'まいて'}${n}日` : `${-n}日後に植える`}</span>`); }
    if (nx) badges.push(`<span class="badge next" style="--k:${nx.kind.c}">📅 ${esc(nx.what)}：${esc(stateText(c, nx))}</span>`);
    if (c.status !== 'done') {
      if (lw) { const n = daysBetween(lw.date, today()); badges.push(`<span class="badge ${n >= WATER_WARN_DAYS ? 'warn' : 'water'}">💧${ago(lw.date)}</span>`); }
      else badges.push(`<span class="badge warn">💧記録なし</span>`);
    }
    if (tot) badges.push(`<span class="badge acc">🧺${tot}</span>`);
    const sk = sickNow(c);
    if (sk.length) badges.push(`<span class="badge ${sk.some(x => x.peak) ? 'sick' : 'sick lo'}">⚠️${esc(sk[0].d.n.replace(/（.*/, ''))}${sk.length > 1 ? ` ほか${sk.length - 1}` : ''}</span>`);
    h += `<div class="card crop">
      ${growBox(c)}
      <div class="info" data-open="${c.id}">
        <div class="name">${esc(c.name)}${c.variety ? `<small>${esc(c.variety)}</small>` : ''}</div>
        ${c.place || showFieldName() ? `<div class="muted">📍${showFieldName() ? esc(fieldOf(c).name) + (c.place ? '・' : '') : ''}${esc(c.place)}</div>` : ''}
        <div class="badges">${badges.join('')}</div>
      </div>
      ${c.status !== 'done' ? `<div class="quick">
        <button class="w" data-water="${c.id}" aria-label="今日水やりした">💧</button>
        <button data-log="${c.id}" aria-label="記録を追加">✏️</button>
      </div>` : ''}
    </div>`;
  });
  m.innerHTML = h;
  bindTasks(m); bindInstall();
  if ($('#moreTasks')) $('#moreTasks').onclick = () => go('plan');
  m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { cropFilter = b.dataset.f; render(); });
  m.querySelectorAll('[data-log]').forEach(b => b.onclick = () => openLogForm({ cropId: b.dataset.log }));
  m.querySelectorAll('[data-water]').forEach(b => b.onclick = () => quickWater(b.dataset.water));
}
async function quickWater(cropId) {
  const exists = data.logs.some(l => l.cropId === cropId && l.type === 'water' && l.date === today());
  if (exists && !confirm('今日はすでに水やりを記録しています。もう1件記録しますか？')) return;
  data.logs.push({ id: uid(), cropId, type: 'water', date: today(), memo: '', ts: Date.now() });
  await save(); render(); toast(`💧 ${cropById(cropId).name} に水やりを記録しました`);
}

/* ===== 野菜の詳しい画面 ===== */
function renderDetail(m) {
  const c = cropById(view.cropId), v = planByName(c.plan);
  $('#title').textContent = c.name;
  const logs = logsOf(c.id), lw = logs.find(l => l.type === 'water'), tot = harvestTotals(logs), rows = cropRows(c);
  const n = c.plantedAt ? daysBetween(c.plantedAt, today()) : null;
  let h = `<div class="card">
    <div class="detail-top">
      ${growBox(c, true)}
      <div style="flex:1;min-width:0">
        <div class="name" style="font-size:20px;font-weight:700">${esc(c.name)}</div>
        ${c.variety ? `<div class="muted">品種：${esc(c.variety)}</div>` : ''}
        ${c.place || multiOn() ? `<div class="muted">📍${multiOn() ? esc(fieldOf(c).name) + (c.place ? '・' : '') : ''}${esc(c.place)}</div>` : ''}
        ${c.plantedAt ? `<div class="muted">${v ? esc(startLabel(v, c.as)) : '植付'}：${fmtDateLong(c.plantedAt)}</div>` : ''}
      </div>
      <button class="btn" id="editCrop">編集</button>
    </div>
    <div class="stats">
      <div class="stat"><b>${n == null ? '-' : n >= 0 ? n : `あと${-n}`}</b><span>${c.as === 'nae' ? '植えてからの日数' : 'まいて・植えてからの日数'}</span></div>
      <div class="stat"><b>${lw ? ago(lw.date) : '-'}</b><span>最後の水やり</span></div>
      <div class="stat"><b style="font-size:${tot.length > 6 ? 14 : 20}px">${tot || '-'}</b><span>収穫合計</span></div>
    </div>
    <div class="pick" id="statusPick">${Object.entries(STATUS).map(([k, l]) => `<button data-s="${k}" class="${c.status === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${c.memo ? `<p class="memo" style="white-space:pre-wrap;margin:12px 0 0">${esc(c.memo)}</p>` : ''}
  </div>
  <div class="row">
    <button class="btn" style="flex:1;background:var(--water-soft);color:var(--water)" id="dWater">💧 今日水やり</button>
    <button class="btn primary" style="flex:1" id="dLog">＋ 記録を追加</button>
  </div>`;
  // 予定があるときは、カレンダー → 育て方の予定（表）→ 病気・害虫 → 肥料・コツ の順
  const planHead = `<h2>📋 育て方の予定${v ? `<small>${v.i} ${esc(v.n)}・${c.as === 'nae' && canNae(v) ? '苗から' : (v.from === '植えつけ' ? '植えつけから' : '種から')}・${esc(areaText(fieldOf(c)))}</small>` : ''}</h2>`;
  if (!v) h += planHead + `<div class="card muted">予定は出ていません。「編集」で<b>育て方の予定に使う野菜</b>を選ぶと、発芽・追肥・収穫などの予定日が出ます。</div>`;
  else if (!c.plantedAt) h += planHead + `<div class="card muted">「編集」で<b>種まき・植付けの日</b>を入れると、予定日が出ます。</div>`;
  else h += `<h2>📅 ${esc(c.name)}のカレンダー</h2>${calHtml([c], cropCal, false, fieldOf(c).loc)}${dayHtml([c], cropCal.sel, fieldOf(c).loc)}
      ${planHead}<div class="card plan">${rows.map(r => { const s = rowState(c, r);
      return `<div class="pr ${s}"><span class="dot" style="background:${r.kind.c}"></span><span class="w">${esc(r.what)}</span><span class="d">${fmtRange(r.from, r.to)}</span>
        <span class="s">${esc(stateText(c, r))}</span>${r.i === 0 ? '<span class="b"></span>' : s === 'done' ? `<button class="b undo" data-undo="${r.i}" aria-label="取り消す">↺</button>` : `<button class="b" data-done="${c.id}:${r.i}">✓</button>`}</div>`; }).join('')}
      <div class="muted small">日にちは目安です（${esc(areaText(fieldOf(c)))}で補正 ${esc(factorText(fieldOf(c)))}）。天気や育ち方を見て決めてください。やったら ✓ を押すと、記録にも残ります。</div></div>
      ${(sk => sk.length ? foldHtml('sickc', `<h2>⚠️ いま気をつけたい病気・害虫<small>${sk.filter(a => a.peak).length ? `注意報 ${sk.filter(a => a.peak).length}・` : ''}${sickMonth(fieldOf(c))}月ごろ・${esc(areaText(fieldOf(c)))}</small></h2>`, `<div class="card skboard">${sk.map(a => sickItemHtml(a, false)).join('')}</div>`) : '')(sickNow(c))}
      ${careHtml(v, c.area || 1)}${c.area ? '' : '<div class="muted small" style="margin:-4px 2px 10px">肥料の量は1㎡あたりです。「編集」で畑の広さを入れると、全体の量も出ます。</div>'}`;
  h += `<h2>📝 記録（${logs.length}件）</h2>
  <div class="card" id="logList">${logs.length ? logs.map(l => logHtml(l, false)).join('') : '<div class="empty" style="padding:16px">まだ記録はありません</div>'}</div>`;
  m.innerHTML = h;
  $('#editCrop').onclick = () => openCropForm(c);
  if ($('#growAdj')) $('#growAdj').onclick = () => openGrowForm(c);
  $('#dWater').onclick = () => quickWater(c.id);
  $('#dLog').onclick = () => openLogForm({ cropId: c.id });
  m.querySelectorAll('#statusPick button').forEach(b => b.onclick = async () => { c.status = b.dataset.s; await save(); render(); toast(`「${STATUS[c.status]}」にしました`); });
  m.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => undoTask(c.id, +b.dataset.undo));
  if (v && c.plantedAt) bindCal(m, cropCal);
  bindTasks(m);
  bindLogList(m);
}

/* ===== 育ち具合の絵を実物に合わせる窓 =====
   段階を選ぶか、「小さく・大きく」で少しずつずらす。予定の日（表・カレンダー）はかわらず、絵と病害虫の注意報の時期だけ */
function openGrowForm(c) {
  let shift = c.growShift != null && isFinite(c.growShift) ? c.growShift : null;
  const opts = growOptions(c);
  const s = openModal(`<h3>✋ 育ち具合を実物に合わせる</h3>
    <p class="muted" style="margin-top:0">畑の${esc(c.name)}にいちばん近い絵を選んでください。合わせたあとも、日がたつにつれて絵は育っていきます。</p>
    <div class="gprev" id="gPrev"></div>
    <div class="pick" id="gSt">${opts.map(o => `<button type="button" data-st="${o.st}">${esc(o.label)}</button>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn" style="flex:1" id="gLess">◀ 少し小さく</button><button class="btn" style="flex:1" id="gMore">少し大きく ▶</button></div>
    <p class="muted small">予定の日（表・カレンダー）はかわりません。かわるのは絵と、病気・害虫の注意報の時期（花が咲いてから など）です。</p>
    <div class="actions"><button class="btn" id="gAuto">予定どおりにもどす</button><button class="btn primary" id="gSave">保存</button></div>`);
  const draw = () => {
    const cc = Object.assign({}, c, { growShift: shift }), g = growStage(cc);
    $('#gPrev').innerHTML = `${growSvg(cc, g, 120)}<div><b>${esc(g.label)}</b><small>${shift == null || shift === 0 ? '予定どおり' : `予定より${Math.abs(shift)}日${shift > 0 ? 'おくれ' : 'すすみ'}`}${g.pct != null ? `・収穫まで ${Math.round(g.pct * 100)}%` : ''}</small></div>`;
    s.querySelectorAll('#gSt button').forEach(b => b.classList.toggle('on', b.dataset.st === g.st));
  };
  s.querySelectorAll('#gSt button').forEach(b => b.onclick = () => { shift = growShiftFor(c, b.dataset.st, shift || 0); draw(); });
  $('#gLess').onclick = () => {
    const nx = (shift || 0) + 3, g = growStage(Object.assign({}, c, { growShift: nx }));
    if (g.st === 'before') { toast('これより小さくはできません（植えた日より前になります）'); return; }
    shift = nx; draw();
  };
  $('#gMore').onclick = () => { shift = (shift || 0) - 3; draw(); };
  $('#gAuto').onclick = () => { shift = null; draw(); };
  $('#gSave').onclick = async () => {
    if (shift == null) delete c.growShift; else c.growShift = shift;
    await save(); closeModal(); render();
    toast(shift == null ? '予定どおりの絵にもどしました' : `✋ ${c.name}の育ち具合を合わせました`);
  };
  draw();
}

/* ===== 記録の一行 ===== */
function logHtml(l, showCrop) {
  const t = TYPES[l.type] || TYPES.other, c = cropById(l.cropId);
  const amt = l.type === 'harvest' && l.amount ? ` <b>${l.amount}${esc(l.unit)}</b>` : '';
  return `<div class="log">
    <div class="ic">${t.icon}</div>
    <div class="body">
      <div><b>${t.label}</b>${amt}${showCrop && c ? ` <span class="muted">${c.emoji}${esc(c.name)}</span>` : ''}</div>
      <div class="meta">${fmtDate(l.date)}${showCrop ? '' : '・' + ago(l.date)}</div>
      ${l.memo ? `<div class="memo">${esc(l.memo)}</div>` : ''}
      ${l.hasPhoto ? `<img data-photo="${l.id}" alt="写真" loading="lazy">` : ''}
    </div>
    <button class="edit" data-edit="${l.id}" aria-label="直す">⋯</button>
  </div>`;
}
function bindLogList(m) {
  m.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openLogForm(data.logs.find(l => l.id === b.dataset.edit)));
  m.querySelectorAll('img[data-photo]').forEach(async img => {
    const url = await getPhoto(img.dataset.photo);
    if (url) { img.src = url; img.onclick = () => showViewer(url); } else img.remove();
  });
}

/* ===== 月のカレンダー（予定のタブと、野菜ごとの画面で使う） =====
   予定がはじまる日に「🍅追肥」のような札、その作業の時期が続く日に細い線、記録した日に絵（💧🧺）。
   many=true はいろいろな野菜（札に野菜の絵を出す）、false は1つの野菜（札に作業の名前を出す） */
const KIND_LABEL = { harvest: '収穫', feed: '追肥', care: '手入れ', sprout: '発芽', flower: '花', plant: '植える' };
function calHtml(crops, st, many, loc) {
  const t = today(), wx = wxFor(loc, () => { if (window.APP_READY && !$('#modalRoot').firstElementChild) render(); });
  if (!st.y) { const b = st.sel || t; st.y = +b.slice(0, 4); st.m = +b.slice(5, 7); if (!st.sel) st.sel = t; }
  const ym = `${st.y}-${String(st.m).padStart(2, '0')}`, first = ym + '-01', days = new Date(st.y, st.m, 0).getDate(), last = ym + '-' + String(days).padStart(2, '0');
  const startW = new Date(first + 'T00:00').getDay(), ids = new Set(crops.map(c => c.id));
  const marks = {};   // 日 → [{c, r, start, s}]
  crops.forEach(c => cropRows(c).forEach(r => {
    if (r.to < first || r.from > last) return;
    const s = rowState(c, r, t);
    for (let d = r.from < first ? first : r.from; d <= r.to && d <= last; d = addDays(d, 1)) (marks[d] = marks[d] || []).push({ c, r, s, start: d === r.from });
  }));
  const lg = {}; data.logs.forEach(l => { if (l.date.slice(0, 7) === ym && ids.has(l.cropId)) (lg[l.date] = lg[l.date] || []).push(l); });
  let cells = '';
  for (let i = 0; i < startW; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const ds = `${ym}-${String(d).padStart(2, '0')}`, wd = (startW + d - 1) % 7;
    const mk = (marks[ds] || []).sort((a, b) => b.start - a.start), ls = lg[ds] || [];
    const icons = [...new Set(ls.map(l => (TYPES[l.type] || TYPES.other).icon))].slice(0, 3).join('');
    const show = mk.slice(0, 3), rest = mk.length - show.length;
    const cls = ['cd', ds === t ? 'today' : '', ds === st.sel ? 'sel' : '', ds < t ? 'pastday' : '', wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-d="${ds}"><span class="n">${d}</span>${wxCellHtml(wx, ds)}${show.map(x => x.start
        ? `<span class="ev ${x.s}" style="--k:${x.r.kind.c}">${many ? x.c.emoji + KIND_LABEL[x.r.kind.k] : esc(x.r.what)}</span>`
        : `<span class="bar ${x.s}" style="--k:${x.r.kind.c}"></span>`).join('')}${rest > 0 ? `<span class="more">ほか${rest}</span>` : ''}${icons ? `<span class="lg">${icons}</span>` : ''}</button>`;
  }
  return `<div class="calhead"><button class="btn" id="calPrev" aria-label="前の月">‹</button><b>${st.y}年 ${st.m}月</b><button class="btn" id="calNext" aria-label="次の月">›</button><button class="btn" id="calToday">今日</button></div>
    <div class="card calcard"><div class="wd">${[...WD].map(w => `<span>${w}</span>`).join('')}</div><div class="grid" id="calGrid">${cells}</div>
    <div class="legend">${[['sprout', '芽・根づく'], ['care', '手入れ'], ['feed', '追肥'], ['flower', '花など'], ['harvest', '収穫'], ['plant', '植える']].map(([k, lb]) =>
      `<span><i class="ev" style="--k:${kindOf({ sprout: '発芽', care: '間引き', feed: '追肥', flower: '花', harvest: '収穫', plant: '植える' }[k]).c}"></i>${lb}</span>`).join('')}
      <span><i class="bar" style="--k:#888"></i>その作業の時期が続く日</span><span>💧🧺 記録した日</span><span class="dim">うすい色＝やった・すぎた</span></div>
    <div class="muted small" style="margin-top:4px">日を押すと、その日の予定と記録が下に出ます。左右になぞると月がかわります。</div>${wxNoteHtml(wx, loc)}</div>`;
}
function bindCal(m, st) {
  const mv = d => { const x = st.y * 12 + st.m - 1 + d; st.y = Math.floor(x / 12); st.m = x % 12 + 1; render(); };
  $('#calPrev').onclick = () => mv(-1); $('#calNext').onclick = () => mv(1);
  $('#calToday').onclick = () => { st.y = 0; st.sel = ''; render(); };
  m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { st.sel = b.dataset.d; render(); });
  const g = $('#calGrid'); let x0 = null, y0 = 0;
  g.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  g.addEventListener('touchend', e => {
    if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) mv(dx < 0 ? 1 : -1);
  });
}
/* えらんだ日の予定と記録 */
function dayHtml(crops, sel, loc) {
  const ids = new Set(crops.map(c => c.id)), mk = [];
  crops.forEach(c => cropRows(c).forEach(r => { if (r.i > 0 && sel >= r.from && sel <= r.to) mk.push({ c, r, s: rowState(c, r) }); }));
  const ls = data.logs.filter(l => l.date === sel && ids.has(l.cropId));
  return `<h2>${fmtDateLong(sel)}</h2>${wxDayHtml(loc && wxCached(loc), sel, loc)}
    <div class="card">${mk.length ? mk.map(taskHtml).join('') : '<div class="muted">この日の予定はありません</div>'}</div>
    <div class="card">${ls.length ? ls.map(l => logHtml(l, crops.length > 1)).join('') : '<div class="muted">この日の記録はありません。右下の「＋」で入れられます</div>'}</div>`;
}

/* 予定のタブの天気：いま見ている畑の場所（すべての畑のときは、場所を決めてある最初の畑） */
const wxLoc = () => curField().loc || (multiOn() && data.settings.cur === 'all' ? (data.fields.find(f => f.loc) || {}).loc : null) || null;

/* ===== 📅 予定（カレンダー） ===== */
function renderPlan(m) {
  const up = upcoming(14);
  let h = `<h2 class="first">📋 これから2週間にやること</h2><div class="card">${up.length ? up.map(taskHtml).join('')
    : `<div class="muted">${activeCrops().some(c => c.plan && c.plantedAt) ? 'この2週間にやる予定はありません 🌤' : '野菜を登録すると、ここにやることが出ます（「🌱 畑」の ＋ から）'}</div>`}</div>`;
  const loc = wxLoc();
  h += calHtml(activeCrops(), cal, true, loc);
  h += dayHtml(activeCrops(), cal.sel, loc);
  m.innerHTML = h;
  bindCal(m, cal);
  bindTasks(m); bindLogList(m);
}

/* ===== 📝 記録・📊 集計 ===== */
function renderLogs(m) {
  let h = `<div class="seg"><button class="${logSub === 'list' ? 'on' : ''}" data-sub="list">📝 記録の一覧</button><button class="${logSub === 'sum' ? 'on' : ''}" data-sub="sum">📊 集計</button></div>`;
  if (logSub === 'sum') { m.innerHTML = h + summaryHtml(); bindSub(m); m.querySelectorAll('[data-y]').forEach(b => b.onclick = () => { summaryHtml.year = b.dataset.y; render(); }); return; }
  const logs = data.logs.filter(l => viewLog(l) && (logTypeFilter === 'all' || l.type === logTypeFilter)).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  h += `<div class="filters"><button class="chip ${logTypeFilter === 'all' ? 'on' : ''}" data-t="all">すべて</button>${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${logTypeFilter === k ? 'on' : ''}" data-t="${k}">${t.icon}${t.label}</button>`).join('')}</div>`;
  if (!logs.length) h += `<div class="empty"><div class="big">📝</div><p>記録はまだありません</p></div>`;
  let day = null, open = false;
  logs.slice(0, 300).forEach(l => {
    if (l.date !== day) { if (open) h += '</div>'; day = l.date; h += `<div class="dayhead">${fmtDateLong(l.date)}・${ago(l.date)}</div><div class="card">`; open = true; }
    h += logHtml(l, true);
  });
  if (open) h += '</div>';
  if (logs.length > 300) h += `<p class="muted" style="text-align:center">新しい300件を出しています</p>`;
  m.innerHTML = h;
  bindSub(m);
  m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { logTypeFilter = b.dataset.t; render(); });
  bindLogList(m);
}
function bindSub(m) { m.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { logSub = b.dataset.sub; render(); }); }
function summaryHtml() {
  const years = [...new Set(data.logs.filter(viewLog).map(l => l.date.slice(0, 4)))].sort().reverse();
  if (!summaryHtml.year || !years.includes(summaryHtml.year)) summaryHtml.year = years[0] || today().slice(0, 4);
  const y = summaryHtml.year, ylogs = data.logs.filter(l => l.date.startsWith(y) && viewLog(l));
  let h = years.length > 1 ? `<div class="filters">${years.map(v => `<button class="chip ${v === y ? 'on' : ''}" data-y="${v}">${v}年</button>`).join('')}</div>` : '';
  h += `<h2>${y}年の収穫</h2><div class="card">`;
  const rows = viewCrops().map(c => {
    const ls = ylogs.filter(l => l.cropId === c.id), hv = ls.filter(l => l.type === 'harvest');
    return { c, tot: harvestTotals(ls), times: hv.length, first: hv.map(l => l.date).sort()[0], last: hv.map(l => l.date).sort().pop() };
  }).filter(r => r.times);
  h += rows.length ? `<table><tr><th>野菜</th><th class="num">回数</th><th class="num">合計</th><th class="num">期間</th></tr>${rows.map(r => `<tr><td>${r.c.emoji} ${esc(r.c.name)}</td><td class="num">${r.times}回</td><td class="num">${r.tot || '-'}</td><td class="num">${fmtDate(r.first).replace(/\(.\)/, '')}〜${fmtDate(r.last).replace(/\(.\)/, '')}</td></tr>`).join('')}</table>`
    : `<div class="empty" style="padding:16px">収穫の記録はまだありません</div>`;
  h += `</div><h2>${y}年の作業回数</h2><div class="card"><table><tr><th>作業</th><th class="num">回数</th></tr>${Object.entries(TYPES).map(([k, t]) => `<tr><td>${t.icon} ${t.label}</td><td class="num">${ylogs.filter(l => l.type === k).length}回</td></tr>`).join('')}</table></div>`;
  const months = Array.from({ length: 12 }, (_, i) => ylogs.filter(l => l.type === 'harvest' && Number(l.date.slice(5, 7)) === i + 1).length), mx = Math.max(1, ...months);
  h += `<h2>月ごとの収穫回数</h2><div class="card"><div class="bars">${months.map((n, i) => `<div><small>${n || ''}</small><i style="height:${Math.round(n / mx * 70)}px"></i><span>${i + 1}</span></div>`).join('')}</div></div>`;
  return h;
}

/* ===== 📖 育て方 ===== */
function renderGuide(m) {
  if (!guide.date) guide.date = today();
  const q = guide.q.trim(), list = VEG_PLANS.filter(v => !q || v.n.includes(q));
  let h = `<input type="text" id="gQ" placeholder="🔍 野菜の名前でさがす" value="${esc(guide.q)}">
    <div class="vgrid">${list.map(v => `<button class="${v.n === guide.n ? 'on' : ''}" data-v="${esc(v.n)}"><span>${v.i}</span>${esc(v.n)}</button>`).join('') || '<div class="muted">見つかりません</div>'}</div>`;
  const v = planByName(guide.n);
  if (!v) h += `<div class="card muted">野菜を押すと、<b>いつまくか・予定・肥料・育て方のコツ・病気</b>が出ます（${VEG_PLANS.length}種類）。</div>`;
  else {
    if (guide.as === 'nae' && !canNae(v)) guide.as = 'seed';
    const rows = planRows(v, guide.date, guide.as), harv = rows.filter(r => r.kind.k === 'harvest')[0];
    h += `<div class="card gsel" id="gSel"><div class="gt">${v.i} <b>${esc(v.n)}</b></div>
      <div class="fl"><b>${esc(v.from || '種まき')}に向く時期</b><span>${esc(v.sow)}${shiftText() ? `<br><small>${esc(areaText())}では標準の地域より ${esc(shiftText())}</small>` : ''}</span></div>
      <div class="gform"><label>${canNae(v) ? `<span class="seg mini">${['seed', 'nae'].map(a => `<button class="${guide.as === a ? 'on' : ''}" data-as="${a}">${a === 'seed' ? '種から' : '苗から'}</button>`).join('')}</span>` : ''}
        <span>${esc(startLabel(v, guide.as))}の日</span><input type="date" id="gDate" value="${guide.date}"></label></div>
      ${harv ? `<div class="gbig">${esc(harv.what)}は <b>${harv.d1 === harv.d2 ? harv.d1 : harv.d1 + '〜' + harv.d2}日後</b>（${fmtRange(harv.from, harv.to)}）</div>` : ''}
      <div class="plan">${rows.map(r => `<div class="pr"><span class="dot" style="background:${r.kind.c}"></span><span class="w">${esc(r.what)}</span><span class="d">${fmtRange(r.from, r.to)}</span><span class="s">${r.d1 === r.d2 ? r.d1 : r.d1 + '〜' + r.d2}日</span></div>`).join('')}</div>
      <button class="btn primary block" id="gAdd">🌱 この内容で畑に登録する</button>
      <div class="gform"><label><span>肥料の量を出す広さ</span><input type="number" id="gArea" inputmode="decimal" min="0.1" step="any" value="${guide.area}" style="width:90px">㎡</label></div></div>
      ${careHtml(v, guide.area, true)}`;
  }
  m.innerHTML = h;
  const qi = $('#gQ'); qi.oninput = () => { guide.q = qi.value; const pos = qi.selectionStart; render(); const e = $('#gQ'); e.focus(); e.setSelectionRange(pos, pos); };
  m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { guide.n = b.dataset.v; render(); setTimeout(() => { const s = $('#gSel'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); });
  m.querySelectorAll('[data-as]').forEach(b => b.onclick = () => { guide.as = b.dataset.as; render(); });
  if ($('#gDate')) $('#gDate').onchange = e => { if (e.target.value) { guide.date = e.target.value; render(); } };
  if ($('#gArea')) $('#gArea').onchange = e => { const n = Number(e.target.value); guide.area = n > 0 ? Math.min(10000, n) : 1; render(); };
  if ($('#gAdd')) $('#gAdd').onclick = () => openCropForm(null, { plan: v.n, name: v.n, emoji: v.i, plantedAt: guide.date, as: guide.as, area: guide.area > 1 ? guide.area : 0 });
}

/* ===== 📲 アプリとして入れる（ホーム画面に追加） =====
   菜園ノートは表電卓とは別のアプリ（manifest の id が別）。入れると別のアイコンで開き、データも別に残る */
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (window.APP_READY && ['crops', 'settings'].includes(view.tab) && !view.cropId) render(); });
addEventListener('appinstalled', () => { installEvt = null; toast('🌱 菜園ノートをホーム画面に入れました'); if (window.APP_READY) render(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function doInstall() {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch (e) {}
  installEvt = null; render();
}
function installHtml() {
  if (EMBED) return `<p style="margin:0">いまは<b>表電卓の道具「🌱 野菜」</b>として開いています。データは表電卓の中に残ります。<br><small class="muted">単独のアプリ（菜園ノート）としても使えます：nisitanisin2-ctrl.github.io/vigilant-parakeet/（データは別々です）</small></p>`;
  if (isStandalone()) return `<p style="margin:0">✅ いまはアプリとして開いています。表電卓とは別のアプリです。</p>`;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return `<p style="margin-top:0">菜園ノートは<b>表電卓とは別のアプリ</b>です。ホーム画面に入れると、表電卓とは別の 🌱 アイコンで開けます（データも別に残ります）。電波がなくても使えます。</p>
    ${installEvt ? `<button class="btn primary block" id="instBtn">📲 ホーム画面に入れる（インストール）</button>`
      : ios ? `<p class="muted">iPhone・iPad：<b>Safari</b> で開き、下の共有ボタン（□に↑）→「<b>ホーム画面に追加</b>」→「追加」。</p>`
      : `<p class="muted">Android：<b>Chrome</b> で開き、右上の「⋮」→「<b>アプリをインストール</b>」（または「ホーム画面に追加」）。<br>パソコン：アドレス欄の右にある「インストール」のしるし。</p>`}`;
}
function installBanner() {
  let hide = false; try { hide = localStorage.getItem('saien-install-hide') === '1'; } catch (e) {}
  if (EMBED || !installEvt || isStandalone() || hide) return '';
  return `<div class="card inst"><span>📲</span><p><b>菜園ノートをアプリとして入れる</b><br><small>表電卓とは別のアイコンで、すぐ開けます</small></p><button class="btn primary" id="instBtn">入れる</button><button class="x" id="instHide" aria-label="出さない">×</button></div>`;
}
function bindInstall() {
  if ($('#instBtn')) $('#instBtn').onclick = doInstall;
  if ($('#instHide')) $('#instHide').onclick = () => { try { localStorage.setItem('saien-install-hide', '1'); } catch (e) {} render(); };
}

/* ===== ⚙ 設定 ===== */
/* 地域の入力欄（畑1つぶん） */
function areaFormHtml(f) {
  return `<label class="f">地域</label><select id="sArea">${VEG_AREAS.map(a => `<option value="${a.id}" ${a.id === f.area ? 'selected' : ''}>${esc(a.n)}</option>`).join('')}</select>
      <div class="row" style="margin-top:8px"><label class="f" style="margin:0;flex:1">畑の標高（m）</label><input type="number" id="sAlt" inputmode="numeric" min="0" max="2000" value="${f.alt}" style="width:110px"></div>
      <label class="sw"><input type="checkbox" id="sCold" ${f.cold ? 'checked' : ''}> 霜がおりやすい寒冷地</label>
      <p class="muted" id="sFix">補正 <b>${esc(factorText(f))}</b>${shiftText(f) ? `／種まきの時期は標準より <b>${esc(shiftText(f))}</b>` : ''}</p>`;
}
function readAreaForm(f) {
  let a = parseInt($('#sAlt').value, 10); if (!(a >= 0)) a = 0; if (a > 2000) a = 2000;
  Object.assign(f, { area: $('#sArea').value, alt: a, cold: $('#sCold').checked });
}
async function renderSettings(m) {
  const multi = multiOn(), f0 = data.fields[0];
  let est = '';
  try { if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); est = `使用容量：約${(e.usage / 1048576).toFixed(1)}MB`; } } catch (e) {}
  const cnt = f => data.crops.filter(c => c.fieldId === f.id).length;
  m.innerHTML = `<h2 class="first">📲 アプリとして入れる</h2><div class="card">${installHtml()}</div>
    <h2>👀 見やすさ</h2><div class="card">
      <label class="sw" style="margin-top:0"><input type="checkbox" id="sSimple" ${simpleOn() ? 'checked' : ''}> <b>シンプルモード</b></label>
      <p class="muted small">画面の小さいスマホ用。文字とボタンを大きくして、出すものを少なくします（カードは名前・つぎの予定・水やり・注意だけ、カレンダーは色の帯と天気の絵だけ）。この端末だけの設定です。</p></div>
    <h2>📍 畑</h2><div class="card">
      <label class="sw" style="margin-top:0"><input type="checkbox" id="sMulti" ${multi ? 'checked' : ''}> <b>畑ごとに管理する</b></label>
      <p class="muted small">畑がいくつかあるときに入れます。畑ごとに野菜・予定・記録を分けて見られ、地域（予定の日の補正）も畑ごとに決められます。上の 📍 で畑を切りかえます。</p>
      ${multi ? `<div class="flist">${data.fields.map(f => `<div class="fitem"><div><b>📍${esc(f.name)}</b><small>${esc(areaText(f))}・補正 ${esc(factorText(f).replace(/（.*/, ''))}・野菜 ${cnt(f)}件<br>🌤 ${f.loc ? esc(f.loc.name) : '天気予報の場所なし'}</small></div><button class="btn" data-fedit="${f.id}">直す</button></div>`).join('')}</div>
        <button class="btn block" id="fAdd">＋ 畑を足す</button>` : ''}
    </div>
    ${multi ? '' : `<h2>🌡 住んでいる地域（予定の日の補正）</h2><div class="card">${areaFormHtml(f0)}
      <p class="muted small">寒いところほど育ちがゆっくりなので、予定の日数をのばして出します（標高100mごとに約2%）。</p></div>
    <h2>🌤 天気予報の場所</h2><div class="card"><p class="muted small" style="margin-top:0">決めると、📅 予定と野菜の画面のカレンダーに<b>16日先までの天気予報</b>（天気・最高/最低気温・雨の確率）が出ます。霜や大雨の日はひとことも出ます。</p><div id="sLoc"></div></div>`}
    <h2>💾 データ</h2><div class="card">
      <p style="margin-top:0">${multi ? `畑 ${data.fields.length}つ・` : ''}野菜 ${data.crops.length}件・記録 ${data.logs.length}件・写真 ${data.logs.filter(l => l.hasPhoto).length}枚</p>
      <p class="muted">${est}<br>データはこの端末のブラウザの中だけに保存されます。機種変更やブラウザのデータ削除に備えて、ときどきバックアップしてください。</p>
      <button class="btn primary block" id="exp">📤 バックアップを保存（写真ごと）</button>
      <div style="height:8px"></div>
      <button class="btn block" id="imp">📥 バックアップから戻す</button></div>
    <h2>📘 使い方</h2><div class="card help">
      <p><b>🌱 畑</b>：育てている野菜の一覧。上に「近いうちにやること」。💧で今日の水やり、✏️で記録。野菜を押すと、予定の表とカレンダー・肥料・コツ・記録が見られます。</p>
      <p><b>📅 予定</b>：すべての野菜の予定をカレンダーで。作業が始まる日に「🍅追肥」の札、時期が続く日に色の線、記録した日に絵。日を押すとその日の予定と記録。</p>
      <p><b>📝 記録</b>：作業の記録と、年ごとの収穫・作業の集計。</p>
      <p><b>📖 育て方</b>：${VEG_PLANS.length}種類の野菜の、まく時期・予定・肥料・コツ・病気と害虫。「この内容で畑に登録する」で畑に入れられます。</p>
      <p><b>📍 畑ごとに管理</b>：ここ（設定）で入れると、畑を足して、畑ごとに野菜・予定・記録・地域を分けられます。「すべての畑」でまとめても見られます。</p>
      <p><b>↩ 戻る</b>：スマホの「戻る」で1つ前の画面に戻ります。畑の一覧でもう一度押すとアプリを閉じます。</p>
      <p class="muted small">予定の日数は家庭菜園のふつうの目安です。天気や育ち方を見て決めてください。農薬は、ラベルで「使ってよい作物」と「収穫の何日前まで」を必ず確かめてください。</p></div>
    <h2>ℹ️ バージョン</h2><div class="card">
      <div class="ver"><span>🌱</span><div><b>菜園ノート ${APP_VERSION}</b><small>${esc(WHATSNEW[0].t)}</small></div></div>
      <button class="btn block" id="wnBtn">🆕 新しくなったこと</button>${EMBED ? '<p class="muted small">表電卓の更新といっしょに新しくなります。</p></div>' : `<div style="height:8px"></div>
      <button class="btn block" id="updBtn">🔄 更新をたしかめる</button>
      <p class="muted small">新しい版が届くと、下に「新しい版が用意できました」と出ます。「いま更新」を押すと新しくなります。</p></div>`}`;
  bindInstall();
  $('#sSimple').onchange = e => { setSimple(e.target.checked); render(); toast(e.target.checked ? '👀 シンプルモードにしました' : 'ふつうの表示にもどしました'); };
  $('#wnBtn').onclick = openWhatsNew;
  if ($('#updBtn')) $('#updBtn').onclick = checkUpdate;
  $('#sMulti').onchange = async e => {
    data.settings.multi = e.target.checked;
    data.settings.cur = 'all';   // はじめは、すべての畑を出す
    await save(); render();
    toast(e.target.checked ? '畑ごとに管理します。「＋ 畑を足す」で畑を足せます' : '畑を分けずに、すべての野菜を出します');
  };
  if (!multi) {
    const upd = async () => { readAreaForm(f0); await save(); render(); toast(`地域を「${areaText(f0)}」にしました`); };
    $('#sArea').onchange = upd; $('#sAlt').onchange = upd; $('#sCold').onchange = upd;
    bindLocPicker($('#sLoc'), () => f0.loc, async loc => { f0.loc = loc; await save(); toast(loc ? `🌤 ${loc.name}の天気予報を出します（📅 予定のカレンダー）` : '天気予報を出さないようにしました'); });
  } else {
    m.querySelectorAll('[data-fedit]').forEach(b => b.onclick = () => openFieldForm(fieldById(b.dataset.fedit)));
    $('#fAdd').onclick = () => openFieldForm(null);
  }
  $('#exp').onclick = exportData;
  $('#imp').onclick = () => $('#importFile').click();
}
/* 畑を足す・直す窓 */
function openFieldForm(f) {
  const isNew = !f, base = curField();
  f = f || { name: '', area: base.area, alt: base.alt, cold: base.cold };
  const others = data.fields.filter(x => x.id !== f.id), n = isNew ? 0 : data.crops.filter(c => c.fieldId === f.id).length;
  const s = openModal(`<h3>${isNew ? '📍 畑を足す' : '畑を直す'}</h3>
    <label class="f">畑の名前</label><input type="text" id="fName" value="${esc(f.name)}" placeholder="例：家の畑・市民農園・ベランダ">
    <div id="fArea">${areaFormHtml(f)}</div>
    <label class="f" style="margin-top:12px"><b>🌤 天気予報の場所</b>（カレンダーに出す）</label><div id="fLoc"></div>
    <div class="actions"><button class="btn" id="fCancel">やめる</button><button class="btn primary" id="fSave">${isNew ? '足す' : '保存'}</button></div>
    ${!isNew && others.length ? `<div style="margin-top:16px"><button class="btn danger block" id="fDel">この畑を消す</button>
      ${n ? `<p class="muted small">この畑の野菜${n}件は「${esc(others[0].name)}」に移ります（野菜と記録は消えません）。</p>` : ''}</div>` : ''}`);
  const prev = () => { const t = { ...f }; readAreaForm(t); $('#sFix').innerHTML = `補正 <b>${esc(factorText(t))}</b>${shiftText(t) ? `／種まきの時期は標準より <b>${esc(shiftText(t))}</b>` : ''}`; };
  ['#sArea', '#sAlt', '#sCold'].forEach(k => s.querySelector(k).onchange = prev);
  let loc = f.loc || null;
  bindLocPicker(s.querySelector('#fLoc'), () => loc, v => { loc = v; });
  $('#fCancel').onclick = closeModal;
  $('#fSave').onclick = async () => {
    const name = $('#fName').value.trim();
    if (!name) { $('#fName').focus(); toast('畑の名前を入れてください'); return; }
    f.name = name; readAreaForm(f); f.loc = loc;
    if (isNew) { f.id = uid(); data.fields.push(f); data.settings.cur = f.id; }
    await save(); closeModal(); render();
    toast(isNew ? `📍${name} を足しました。上の 📍 で切りかえられます` : '保存しました');
  };
  if ($('#fDel')) $('#fDel').onclick = async () => {
    if (!confirm(`畑「${f.name}」を消しますか？${n ? `\n野菜${n}件は「${others[0].name}」に移ります。` : ''}`)) return;
    data.crops.forEach(c => { if (c.fieldId === f.id) c.fieldId = others[0].id; });
    data.fields = others;
    if (data.settings.cur === f.id) data.settings.cur = 'all';
    await save(); closeModal(); render(); toast('消しました');
  };
}

/* ===== 野菜を登録・直す窓 ===== */
function openCropForm(c, pre) {
  const isNew = !c;
  c = c || Object.assign({ emoji: '🌱', name: '', variety: '', place: '', plantedAt: today(), status: 'growing', memo: '', plan: '', as: 'seed', area: 0, done: {}, fieldId: curField().id }, pre || {});
  const s = openModal(`<h3>${isNew ? '🌱 野菜を登録' : '野菜を直す'}</h3>
    <label class="f">野菜（押すと名前と予定が入ります）</label>
    <div class="pick veg" id="cVeg">${VEG_PLANS.map(v => `<button type="button" data-p="${esc(v.n)}" class="${c.plan === v.n ? 'on' : ''}">${v.i}${esc(v.n)}</button>`).join('')}<button type="button" data-p="" class="${!c.plan ? 'on' : ''}">🌱その他</button></div>
    <div id="cEmoBox" ${c.plan ? 'hidden' : ''}><label class="f">絵</label><div class="pick emoji" id="emo">${PRESETS.map(([e, n]) => `<button type="button" data-e="${e}" title="${n}" class="${c.emoji === e ? 'on' : ''}">${e}</button>`).join('')}</div></div>
    <label class="f">名前</label><input type="text" id="cName" value="${esc(c.name)}" placeholder="例：トマト">
    <label class="f">品種（なくてもよい）</label><input type="text" id="cVar" value="${esc(c.variety)}" placeholder="例：桃太郎">
    ${multiOn() ? `<label class="f">畑</label><select id="cField">${data.fields.map(f => `<option value="${f.id}" ${f.id === c.fieldId ? 'selected' : ''}>📍${esc(f.name)}（${esc(areaText(f))}）</option>`).join('')}</select>` : ''}
    <label class="f">${multiOn() ? '畑の中の場所' : '場所'}（なくてもよい）</label><input type="text" id="cPlace" value="${esc(c.place)}" placeholder="例：南の畝・プランター1">
    <div id="cAsBox"><label class="f">どこから育てる？</label><div class="pick" id="cAs"><button type="button" data-a="seed">種から</button><button type="button" data-a="nae">苗から</button></div></div>
    <label class="f" id="cDateLb">種まき・植付けの日</label><input type="date" id="cDate" value="${esc(c.plantedAt)}">
    <label class="f">畑の広さ（㎡・なくてもよい。肥料の量に使います）</label><input type="number" id="cArea" inputmode="decimal" min="0" step="any" value="${c.area || ''}" placeholder="例：3">
    <label class="f">メモ（なくてもよい）</label><textarea id="cMemo" placeholder="苗を買った店、株間など">${esc(c.memo)}</textarea>
    <div class="actions"><button class="btn" id="cCancel">やめる</button><button class="btn primary" id="cSave">${isNew ? '登録' : '保存'}</button></div>
    ${isNew ? '' : '<div style="margin-top:16px"><button class="btn danger block" id="cDel">この野菜を削除</button></div>'}`);
  let emoji = c.emoji, plan = c.plan, as = c.as;
  const sync = () => {
    const v = planByName(plan);
    $('#cEmoBox').hidden = !!plan;
    $('#cAsBox').hidden = !canNae(v);
    if (!canNae(v)) as = 'seed';
    s.querySelectorAll('#cAs button').forEach(b => b.classList.toggle('on', b.dataset.a === as));
    $('#cDateLb').textContent = v ? `${startLabel(v, as)}の日` : '種まき・植付けの日';
  };
  sync();
  s.querySelectorAll('#cVeg button').forEach(b => b.onclick = () => {
    s.querySelectorAll('#cVeg button').forEach(x => x.classList.remove('on')); b.classList.add('on');
    const v = planByName(b.dataset.p), nm = $('#cName'), names = VEG_PLANS.map(x => x.n);
    plan = v ? v.n : '';
    if (v) { emoji = v.i; if (!nm.value.trim() || names.includes(nm.value.trim())) nm.value = v.n; }
    else if (names.includes(nm.value.trim())) nm.value = '';
    sync();
  });
  s.querySelectorAll('#emo button').forEach(b => b.onclick = () => { s.querySelectorAll('#emo button').forEach(x => x.classList.remove('on')); b.classList.add('on'); emoji = b.dataset.e; });
  s.querySelectorAll('#cAs button').forEach(b => b.onclick = () => { as = b.dataset.a; sync(); });
  $('#cCancel').onclick = closeModal;
  $('#cSave').onclick = async () => {
    const name = $('#cName').value.trim();
    if (!name) { $('#cName').focus(); toast('名前を入れてください'); return; }
    const area = Number($('#cArea').value);
    const fieldId = $('#cField') ? $('#cField').value : c.fieldId;
    const moved = !isNew && (c.plantedAt !== $('#cDate').value || c.plan !== plan || c.as !== as);
    Object.assign(c, { emoji, name, plan, as, fieldId, variety: $('#cVar').value.trim(), place: $('#cPlace').value.trim(), plantedAt: $('#cDate').value, area: area > 0 ? Math.min(10000, area) : 0, memo: $('#cMemo').value.trim() });
    if (moved) { c.done = {}; delete c.growShift; }   // 予定が変わったら「やった」と育ち具合の合わせはつけ直す
    if (isNew) { c.id = uid(); c.createdAt = Date.now(); data.crops.push(c); }
    await save(); closeModal();
    if (isNew) { cropFilter = 'active'; go('crops', c.id); toast(`${c.emoji} ${c.name} を登録しました${plan ? '。予定が出ています' : ''}`, 2600); } else render();
  };
  if (!isNew) $('#cDel').onclick = async () => {
    const n = data.logs.filter(l => l.cropId === c.id).length;
    if (!confirm(`「${c.name}」と記録${n}件を削除します。元に戻せません。よろしいですか？`)) return;
    for (const l of data.logs) if (l.cropId === c.id && l.hasPhoto) await delPhoto(l.id);
    data.logs = data.logs.filter(l => l.cropId !== c.id);
    data.crops = data.crops.filter(x => x.id !== c.id);
    await save(); closeModal(); go('crops'); toast('削除しました');
  };
}

/* ===== 記録を入れる・直す窓。onSaved は保存したあとに呼ぶ（予定を「やった」にするときなど） ===== */
async function openLogForm(l, onSaved) {
  const active = data.crops.filter(c => (c.status !== 'done' && inView(c)) || c.id === l.cropId);
  if (!active.length) { toast('先に野菜を登録してください'); go('crops'); openCropForm(); return; }
  const isNew = !l.id;
  l = Object.assign({ type: 'water', date: (view.cropId ? cropCal.sel : view.tab === 'plan' ? cal.sel : '') || today(), memo: '', amount: '', unit: '個', cropId: active[0].id }, l);
  let photo = l.hasPhoto ? await getPhoto(l.id) : null, photoChanged = false;
  const s = openModal(`<h3>${isNew ? '📝 記録を入れる' : '記録を直す'}</h3>
    <label class="f">野菜</label>
    <select id="lCrop">${active.map(c => `<option value="${c.id}" ${c.id === l.cropId ? 'selected' : ''}>${c.emoji} ${esc(c.name)}${c.variety ? '（' + esc(c.variety) + '）' : ''}${showFieldName() ? '・' + esc(fieldOf(c).name) : ''}</option>`).join('')}</select>
    <label class="f">作業</label>
    <div class="pick" id="lType">${Object.entries(TYPES).map(([k, t]) => `<button type="button" data-t="${k}" class="${l.type === k ? 'on' : ''}">${t.icon}${t.label}</button>`).join('')}</div>
    <div id="hvBox"><label class="f">収穫量（なくてもよい）</label>
      <div class="row"><input type="number" id="lAmt" inputmode="decimal" min="0" step="any" value="${esc(l.amount)}" placeholder="数" style="flex:2">
      <select id="lUnit" style="flex:1">${UNITS.map(u => `<option ${u === l.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
    <label class="f">日付</label><input type="date" id="lDate" value="${esc(l.date)}">
    <label class="f">メモ（なくてもよい）</label><textarea id="lMemo" placeholder="例：液肥を500倍で、実が5つ色づいた">${esc(l.memo)}</textarea>
    <label class="f">写真（なくてもよい）</label>
    <div class="row"><label class="btn" style="flex:1;text-align:center">📷 撮る・選ぶ<input type="file" id="lPhoto" accept="image/*" hidden></label>
    <button class="btn" id="lPhotoDel" ${photo ? '' : 'hidden'}>写真を外す</button></div>
    <img id="lPrev" class="photo-prev" ${photo ? `src="${photo}"` : 'hidden'} alt="">
    <div class="actions"><button class="btn" id="lCancel">やめる</button><button class="btn primary" id="lSave">${isNew ? '記録' : '保存'}</button></div>
    ${isNew ? '' : '<div style="margin-top:16px"><button class="btn danger block" id="lDel">この記録を削除</button></div>'}`);
  let type = l.type;
  const syncHv = () => { $('#hvBox').hidden = type !== 'harvest'; };
  syncHv();
  s.querySelectorAll('#lType button').forEach(b => b.onclick = () => { s.querySelectorAll('#lType button').forEach(x => x.classList.remove('on')); b.classList.add('on'); type = b.dataset.t; syncHv(); });
  $('#lPhoto').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { photo = await shrinkImage(f); photoChanged = true; $('#lPrev').src = photo; $('#lPrev').hidden = false; $('#lPhotoDel').hidden = false; }
    catch (err) { alert(err.message); }
  };
  $('#lPhotoDel').onclick = () => { photo = null; photoChanged = true; $('#lPrev').hidden = true; $('#lPhotoDel').hidden = true; };
  $('#lCancel').onclick = closeModal;
  $('#lSave').onclick = async () => {
    const date = $('#lDate').value;
    if (!date) { toast('日付を入れてください'); return; }
    const amt = $('#lAmt').value;
    Object.assign(l, { cropId: $('#lCrop').value, type, date, memo: $('#lMemo').value.trim(), amount: type === 'harvest' && amt !== '' ? Number(amt) : '', unit: $('#lUnit').value });
    if (isNew) { l.id = uid(); l.ts = Date.now(); data.logs.push(l); }
    if (photoChanged) { if (photo) await setPhoto(l.id, photo); else await delPhoto(l.id); l.hasPhoto = !!photo; }
    const c = cropById(l.cropId);
    if (type === 'harvest' && c.status === 'growing') c.status = 'harvesting';   // 収穫を記録したら「収穫中」に
    if (onSaved) onSaved();
    await save(); closeModal(); render();
    toast(`${TYPES[type].icon} ${c.name}：${TYPES[type].label}を${isNew ? '記録' : '保存'}しました`);
  };
  if (!isNew) $('#lDel').onclick = async () => {
    if (!confirm('この記録を削除しますか？')) return;
    if (l.hasPhoto) await delPhoto(l.id);
    data.logs = data.logs.filter(x => x.id !== l.id);
    await save(); closeModal(); render(); toast('削除しました');
  };
}

/* ===== シンプルモード（この端末だけ。localStorage） ===== */
function setSimple(on) { try { localStorage.setItem('saien_simple', on ? '1' : '0'); } catch (e) {} document.body.classList.toggle('simple', on); }

/* ===== はじめに ===== */
function start() {
  document.body.classList.toggle('simple', simpleOn());
  $('#backBtn').onclick = goBack;
  $('#fieldSel').onchange = async e => { data.settings.cur = e.target.value; await save(); render(); };
  document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
  history.replaceState({ base: 1 }, ''); history.pushState({ v: view, d: 1 }, '');
  addEventListener('popstate', onPop);
  $('#fab').onclick = () => {
    if (view.cropId) openLogForm({ cropId: view.cropId });
    else if (view.tab === 'logs' || view.tab === 'plan') openLogForm({});
    else openCropForm();
  };
  $('#importFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { if (await importData(f)) { go('crops'); toast('戻しました'); } } catch (err) { alert('戻せませんでした：' + err.message); }
  };
  render();
}
(async () => {
  await load();
  if (EMBED) await migrateExcalc();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  start();
  window.APP_READY = true;
  if (!EMBED) setTimeout(maybeTellWhatsNew, 600);
})();
/* ===== 下に出るお知らせ（新しい版・新しくなったこと）。表電卓と同じ ===== */
function showNotice(o) {
  let el = $('#noticeBar');
  if (!el) { el = document.createElement('div'); el.id = 'noticeBar'; el.className = 'notice-bar'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = `<div class="nb-t">${esc(o.title)}</div>${o.sub ? `<div class="nb-s">${esc(o.sub)}</div>` : ''}<div class="nb-row"><button class="btn nb-no">${esc(o.no || 'あとで')}</button><button class="btn primary nb-yes">${esc(o.yes || 'OK')}</button></div>`;
  el.querySelector('.nb-no').onclick = () => { hideNotice(); if (o.onNo) o.onNo(); };
  el.querySelector('.nb-yes').onclick = () => { hideNotice(); if (o.onYes) o.onYes(); };
  requestAnimationFrame(() => el.classList.add('show'));
}
function hideNotice() { const el = $('#noticeBar'); if (el) el.classList.remove('show'); }

/* ===== 新しくなったこと =====
   前に使っていた版と違っていたら、下に一度だけ知らせる。はじめて使う人には出さない。「あとで」でもその版は見たことにする */
const SEEN_VER_KEY = 'saien_seen_ver';
function seenVer() { try { return localStorage.getItem(SEEN_VER_KEY) || ''; } catch (e) { return ''; } }
function markSeenVer() { try { localStorage.setItem(SEEN_VER_KEY, APP_VERSION); } catch (e) {} }
function openWhatsNew() {
  markSeenVer();
  const s = openModal(`<h3>🆕 新しくなったこと</h3><p class="muted" style="margin-top:0">いまの版：<b>${APP_VERSION}</b></p>
    ${WHATSNEW.map((w, i) => `<details class="more wn"${i === 0 ? ' open' : ''}><summary>${w.v}　${esc(w.t)}</summary><ul>${w.li.map(x => `<li>${x}</li>`).join('')}</ul></details>`).join('')}
    <div class="actions"><button class="btn primary" id="wnClose">閉じる</button></div>`);
  s.querySelector('#wnClose').onclick = closeModal;
}
function maybeTellWhatsNew() {
  const prev = seenVer();
  // はじめて使う人には出さない（v6 までは版をおぼえていなかったので、野菜か記録があれば前から使っている人）
  if (!prev && !data.crops.length && !data.logs.length) { markSeenVer(); return false; }
  if (prev === APP_VERSION) return false;
  const w = WHATSNEW.find(x => x.v === APP_VERSION);
  if (!w) { markSeenVer(); return false; }
  showNotice({ title: `${APP_VERSION} に新しくなりました`, sub: w.t, yes: '見る', no: 'あとで', onYes: openWhatsNew, onNo: markSeenVer });
  return true;
}

/* ===== 新しい版の入れかえ =====
   新しい版が届いても勝手に読み込み直さず、「いま更新」を押したときだけ入れ替える（入力の途中で画面が変わらないように）。
   「あとで」を押したら、開き直すまでは聞かない */
let swReg = null, swUpdateDeclined = false;
function swOfferUpdate(worker, force) {
  if (!worker || (swUpdateDeclined && !force)) return;
  showNotice({ title: '新しい版が用意できました', sub: '「いま更新」を押すと読み込み直します。入力の途中なら「あとで」を選んでください。',
    yes: 'いま更新', no: 'あとで', onYes: () => { try { worker.postMessage('SKIP_WAITING'); } catch (e) { location.reload(); } }, onNo: () => { swUpdateDeclined = true; } });
}
/* 設定の「🔄 更新をたしかめる」 */
async function checkUpdate() {
  if (!swReg) { toast('ここでは更新をたしかめられません（電波・ブラウザをたしかめてください）'); return; }
  toast('たしかめています…');
  try { await swReg.update(); } catch (e) { toast('たしかめられませんでした。電波のある所でもう一度どうぞ'); return; }
  setTimeout(() => {
    const w = swReg.waiting || swReg.installing;
    if (w) { if (w.state === 'installed') swOfferUpdate(w, true); else toast('新しい版を取りこんでいます。少しすると「いま更新」が出ます'); }
    else toast(`いまの版（${APP_VERSION}）がいちばん新しい版です`);
  }, 800);
}
if (!EMBED && 'serviceWorker' in navigator && location.protocol !== 'file:' && !/[?&]nosw/.test(location.search)) {   // nosw はテストのとき
  let swRefreshing = false;
  const hadCtrl = !!navigator.serviceWorker.controller;   // はじめて開いたとき（まだ入っていない）は読み込み直さない
  // 入れ替わったら読み込み直す。入れ替わるのは「いま更新」を押したときだけ
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (swRefreshing || !hadCtrl) return; swRefreshing = true; location.reload(); });
  navigator.serviceWorker.register('./service-worker.js').then(reg => {
    swReg = reg;
    reg.update();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); });
    if (reg.waiting && navigator.serviceWorker.controller) swOfferUpdate(reg.waiting);   // 前に「あとで」を押したまま開き直した
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing; if (!nw) return;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) swOfferUpdate(nw); });   // はじめて入れたときは聞かない
    });
  }).catch(() => {});
}
