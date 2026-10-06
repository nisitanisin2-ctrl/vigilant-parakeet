/* 畑の上に出す「きょうのひとこと」。
   ① 今月まける・植えられる野菜（VEG_PLANS の sow を、住んでいる地域の早い・おそいでずらして見る）
   ② 天気の注意（霜・大雨・猛暑・強風の予報が、あす・あさってにあれば、気をつける野菜といっしょに）
   ③ 水やりのひとこと（きのう雨が降った・きょう雨の予報なら「水やり不要かも」） */
'use strict';

/* ===== ① 今月まけるもの ===== */
/* '3〜4月・9〜10月' → {3,4,9,10}。'10〜2月' のような年またぎにも対応 */
function sowMonths(v) {
  const set = new Set();
  String(v && v.sow || '').split(/[・、,]/).forEach(p => {
    const m = p.match(/(\d+)\s*(?:〜|~|-)\s*(\d+)/), one = p.match(/(\d+)\s*月/);
    if (m) { let a = +m[1], b = +m[2]; for (let k = 0; k < 12; k++) { set.add(a); if (a === b) break; a = a % 12 + 1; } }
    else if (one) set.add(+one[1]);
  });
  return set;
}
/* その畑（地域）で、いま（+off か月）まける・植えられる野菜 */
function sowList(f = curField(), off = 0, t = today()) {
  const d = new Date(addDays(t, -(areaDef(f).w || 0) * 7) + 'T00:00'); d.setMonth(d.getMonth() + off);
  const mo = d.getMonth() + 1;
  return { mo: (+t.slice(5, 7) + off - 1) % 12 + 1, list: VEG_PLANS.filter(v => sowMonths(v).has(mo)) };
}
function sowHtml(first) {
  const f = curField(), now = sowList(f, 0), next = sowList(f, 1);
  if (!now.list.length && !next.list.length) return '';
  const chips = l => l.map(v => `<button class="chip" data-sow="${esc(v.n)}">${v.i}${esc(v.n)}</button>`).join('');
  return foldHtml('sow', `<h2${first ? ' class="first"' : ''}>🗓 今月まける・植えるもの<small>${now.mo}月・${esc(areaText(f))}の目安。押すと育て方</small></h2>`,
    `<div class="card sowcard">${now.list.length ? `<div class="sowrow">${chips(now.list)}</div>` : '<div class="muted">今月はまく野菜がありません</div>'}
      ${next.list.length ? `<div class="muted small" style="margin:8px 0 4px">来月（${next.mo}月）から</div><div class="sowrow">${chips(next.list.filter(v => !now.list.includes(v)))}</div>` : ''}</div>`);
}
function bindSow(m) { m.querySelectorAll('[data-sow]').forEach(b => b.onclick = () => { guide.n = b.dataset.sow; guide.q = ''; go('guide'); }); }

/* ===== ② 天気の注意 ===== */
/* 霜に弱い野菜（夏野菜・いも）と、まだ小さい苗 */
const frostWeak = c => ['fruit', 'vine', 'corn', 'bean'].includes(growShape(c)) && c.plan !== 'エンドウ' && c.plan !== 'ソラマメ' || ['サツマイモ', 'サトイモ', 'ジャガイモ'].includes(c.plan);
const tall = c => { const g = growStage(c); return g && ['fruit', 'corn', 'bean'].includes(growShape(c)) && STAGE_NO[g.st] >= 3; };
const isRainCode = c => c >= 61 && c <= 67 || c >= 80;
/* [{d:日, k:'frost'|'rain'|'heat'|'wind', t:見出し, tip:手当て, crops:[c]}]（きょう・あす・あさって） */
function wxAlerts(w, crops, t = today()) {
  if (!w) return [];
  const out = [], act = crops.filter(c => c.status !== 'done' && c.plantedAt && c.plantedAt <= addDays(t, 2));
  for (let k = 0; k <= 2; k++) {
    const ds = addDays(t, k), d = w.days[ds]; if (!d) continue;
    if (d.lo != null && d.lo <= 3) { const cs = act.filter(c => frostWeak(c) || STAGE_NO[(growStage(c) || {}).st] <= 2); if (cs.length) out.push({ d: ds, k: 'frost', t: `霜（最低${Math.round(d.lo)}℃）`, tip: '夕方までに不織布・ビニールをかけるか、鉢は軒下へ', crops: cs }); }
    if (d.hi != null && d.hi >= 33 && act.length) out.push({ d: ds, k: 'heat', t: `猛暑（最高${Math.round(d.hi)}℃）`, tip: '水やりは朝早く。株元に敷きわら、苗には日よけを', crops: act });
    if ((d.c >= 95 || d.c === 65 || d.c === 82 || (d.r != null && d.r >= 30)) && act.length) out.push({ d: ds, k: 'rain', t: `大雨${d.r != null ? `（${Math.round(d.r)}mm）` : ''}`, tip: '水はけの溝を見ておく。実は早めにとる。薬をまくのは別の日に', crops: act });
    if (d.wd != null && d.wd >= 40) { const cs = act.filter(tall); if (cs.length) out.push({ d: ds, k: 'wind', t: `強い風（${Math.round(d.wd)}km/h）`, tip: '支柱とひもをしっかり。背の高い野菜は倒れないように', crops: cs }); }
  }
  return out;
}
const WX_ICON = { frost: '🥶', heat: '🥵', rain: '☔', wind: '🌬️' };
const dayWord = (ds, t = today()) => ds === t ? 'きょう' : ds === addDays(t, 1) ? 'あす' : 'あさって';

/* ===== ③ 水やりのひとこと ===== */
function waterHint(w, t = today()) {
  if (!w) return null;
  const y = w.days[addDays(t, -1)], d = w.days[t];
  if (y && y.r != null && y.r >= 5) return { ok: true, t: `きのう雨（${Math.round(y.r)}mm）が降ったので、畑は水やり不要かも` };
  if (d && ((d.pp != null && d.pp >= 70) || (d.r != null && d.r >= 5))) return { ok: true, t: `きょうは雨の予報${d.pp != null ? `（${d.pp}%）` : ''}。畑は水やりお休みでよさそう` };
  if (d && d.hi != null && d.hi >= 30 && (d.pp == null || d.pp < 30)) return { ok: false, t: `きょうは暑くて晴れ（最高${Math.round(d.hi)}℃）。朝か夕方にたっぷり水やりを` };
  return null;
}

/* 畑の上の「天気の注意」カード（場所を決めていないときは出さない） */
function wxBoardHtml(crops, first) {
  const loc = wxLoc(); if (!loc) return '';
  const w = wxFor(loc, () => { if (window.APP_READY && view.tab === 'crops' && !view.cropId) render(); });
  const al = wxAlerts(w, crops), wh = waterHint(w);
  if (!al.length && !wh) return '';
  return `<h2${first ? ' class="first"' : ''}>🌤 天気の注意<small>${esc(loc.name)}の予報から</small></h2><div class="card wxboard">
    ${al.map(a => `<div class="wxa ${a.k}"><span class="ic">${WX_ICON[a.k]}</span><div><b>${dayWord(a.d)} ${fmtDate(a.d)}：${esc(a.t)}</b><small>${esc(a.tip)}</small>
      <small class="cs">${a.crops.slice(0, 6).map(c => c.emoji + esc(c.name)).join('・')}${a.crops.length > 6 ? ` ほか${a.crops.length - 6}` : ''}</small></div></div>`).join('')}
    ${wh ? `<div class="wxa water ${wh.ok ? 'ok' : ''}"><span class="ic">💧</span><div><b>${esc(wh.t)}</b><small>${wh.ok ? 'プランターや軒下は、土の乾きを見てください' : '日中の水やりは、根をいためることがあります'}</small></div></div>` : ''}</div>`;
}
