/* 育て方の予定の計算（表電卓の「🌱 野菜」と同じ考え方）。
   まいた・植えた日に、野菜ごとの日数（VEG_PLANS）を足して、発芽・間引き・追肥・収穫などの日を出す。
   寒い地域・標高が高い畑・寒冷地では育ちがゆっくりなので、日数に倍率（areaFactor）をかける。
   地域は畑ごと（st は畑。data.fields の1つ）。 */
'use strict';

/* ===== 野菜をさがす ===== */
/* 野菜の一覧：もとからの33種類と、自分で足した野菜・品種（data.myPlans。{n, i, from, sow, s, base:似ている野菜}） */
const allPlans = () => VEG_PLANS.concat((typeof data !== 'undefined' && data.myPlans) || []);
const planByName = n => allPlans().find(v => v.n === n) || null;
/* 名前から、予定に使う野菜をさがす（「ミニトマト」→トマト、「エダマメ・豆」→エダマメ）。なければ '' */
function guessPlan(name) {
  const s = String(name || '').trim(); if (!s) return '';
  if (planByName(s)) return s;
  const hit = VEG_PLANS.filter(v => s.includes(v.n) || v.n.includes(s)).sort((a, b) => b.n.length - a.n.length)[0];
  return hit ? hit.n : '';
}

/* ===== 地域の補正 ===== */
function areaDef(st = curField()) { return VEG_AREAS.find(a => a.id === st.area) || VEG_AREAS[3]; }
function areaFactor(st = curField()) {
  const alt = Math.max(0, Math.min(2000, Number(st.alt) || 0));
  let f = areaDef(st).f * (1 + alt / 100 * 0.02);   // 標高100mごとに約2%おそく（気温が約0.6℃下がる目安）
  if (st.cold) f *= 1.05;                           // 霜がおりる畑はさらに少しおそく
  return Math.round(f * 100) / 100;
}
function areaText(st = curField()) {
  let t = areaDef(st).n.replace('（標準）', '');
  const alt = Math.max(0, Math.round(Number(st.alt) || 0));
  if (alt > 0) t += '・標高' + alt + 'm';
  if (st.cold) t += '・寒冷地';
  return t;
}
function factorText(st = curField()) {
  const f = areaFactor(st); if (f === 1) return 'なし（そのままの日数）';
  const pct = Math.round((f - 1) * 100);
  return (pct > 0 ? '＋' : '−') + Math.abs(pct) + '%（日数を' + f.toFixed(2) + '倍）';
}
/* 春まきの時期をどれだけずらすとよいか（「2週間おそめ」） */
function shiftText(st = curField()) { const w = areaDef(st).w; return w ? Math.abs(w) + '週間' + (w > 0 ? 'おそめ' : 'はやめ') : ''; }

/* ===== 種から／苗から ===== */
/* 苗から植えられる野菜なら、種まきから「畑に植える」までの日数。できないなら -1 */
function transplantDay(v) {
  if (!v || (v.from || '種まき') !== '種まき') return -1;
  const i = (v.s || []).findIndex(x => /畑に植える|植えつけ/.test(String(x[0])));
  return i < 0 ? -1 : Math.max(0, Math.round(Number(v.s[i][1]) || 0));
}
const canNae = v => transplantDay(v) >= 0;
function startLabel(v, as) { return as === 'nae' && canNae(v) ? '苗を植える' : (v ? (v.from || '種まき') : '種まき'); }

/* ===== 作業の種類（色・記録の種類） ===== */
function kindOf(label) {
  const t = String(label);
  if (/収穫|掘り/.test(t)) return { k: 'harvest', c: '#2e7d32', log: 'harvest' };
  if (/追肥|肥/.test(t)) return { k: 'feed', c: '#ef6c00', log: 'fertilize' };
  if (/間引|芽かき|つる|支柱|土寄せ|摘芯|わき芽|整理|受粉|花芽/.test(t)) return { k: 'care', c: '#1565c0', log: 'weed' };
  if (/発芽|芽が出る|根づく|本葉/.test(t)) return { k: 'sprout', c: '#7cb342', log: 'observe' };
  if (/花|結球|花蕾|雄穂|倒れる/.test(t)) return { k: 'flower', c: '#c2185b', log: 'observe' };
  return { k: 'plant', c: '#6d4c41', log: 'other' };
}

/* ===== 予定表 =====
   [{i:番号, what:作業, from:はじめの日, to:おわりの日, d1, d2:何日後, kind}]。i=0 は種まき（植えた日）そのもの */
function planRows(v, start, as, st = curField()) {
  if (!v || !start) return [];
  const f = areaFactor(st) * (typeof adjFactor === 'function' ? adjFactor(v.n, as) : 1), base =   // 地域の補正 × 自分の実績に合わせた分（records.js）
    as === 'nae' && canNae(v) ? transplantDay(v) : 0, bf = Math.round(base * f);
  const rows = [{ i: 0, what: startLabel(v, as), from: start, to: start, d1: 0, d2: 0, kind: kindOf('植える') }];
  (v.s || []).forEach(([what, a, b], k) => {
    const b1 = Math.max(0, Math.round(Number(a) || 0)), b2 = Math.max(b1, Math.round(Number(b) || b1));
    if (base > 0 && b1 <= base) return;   // 苗から始めたときは、植えるまでの作業は出さない
    const d1 = Math.max(0, Math.round(b1 * f) - bf), d2 = Math.max(d1, Math.round(b2 * f) - bf);
    rows.push({ i: k + 1, what, from: addDays(start, d1), to: addDays(start, d2), d1, d2, kind: kindOf(what) });
  });
  return rows;
}
function cropRows(c) { return c && c.plan && c.plantedAt ? planRows(planByName(c.plan), c.plantedAt, c.as, fieldOf(c)) : []; }
/* その予定は今どうか：done（やった）・now（いまの時期）・soon（7日以内）・later・past（時期を過ぎた） */
function rowState(c, r, t = today()) {
  if (c.done && c.done[r.i]) return 'done';
  if (r.i === 0) return r.from <= t ? 'done' : 'later';
  if (t >= r.from && t <= r.to) return 'now';
  if (t > r.to) return 'past';
  return daysBetween(t, r.from) <= 7 ? 'soon' : 'later';
}
function stateText(c, r, t = today()) {
  const s = rowState(c, r, t);
  if (s === 'done') return r.i === 0 ? '済' : `✓ やった${c.done[r.i] ? '（' + fmtDate(c.done[r.i]) + '）' : ''}`;
  if (s === 'now') return r.from === r.to ? '今日' : `いま（${daysBetween(t, r.to)}日まで）`;
  if (s === 'past') return '時期を過ぎた';
  return `あと${daysBetween(t, r.from)}日`;
}
/* つぎにやること（まだやっていない予定のうち、いちばん早いもの）。収穫がおわれば null */
function nextTask(c, t = today()) {
  const rows = cropRows(c).filter(r => r.i > 0 && rowState(c, r, t) !== 'done');
  return rows.find(r => r.to >= t) || null;
}

/* ===== 肥料・病気・コツ ===== */
const careOf = v => (v && (VEG_CARE[v.n] || VEG_CARE[v.base])) || { f: 'leaf', k: [] };
const fertOf = v => VEG_FERT[careOf(v).f] || VEG_FERT.leaf;
/* 「100〜150g/㎡（3㎡で 300〜450g）」 */
function amtText(range, unit, area) {
  if (!range) return '';
  const [a, b] = range, one = a === b ? `${a}${unit}/㎡` : `${a}〜${b}${unit}/㎡`;
  if (!(area > 0) || area === 1) return one;
  let ta = Math.round(a * area * 10) / 10, tb = Math.round(b * area * 10) / 10, u = unit;
  for (const [from, to] of [['g', 'kg'], ['kg', 't']]) if (u === from && Math.min(ta, tb) >= 1000) { ta = Math.round(ta / 100) / 10; tb = Math.round(tb / 100) / 10; u = to; }
  return one + `（${area}㎡で ${ta === tb ? ta : ta + '〜' + tb}${u}）`;
}
/* 肥料・コツ・病気をまとめた HTML（野菜の詳しい画面と、育て方の画面で使う） */
function careHtml(v, area, open) {
  if (!v) return '';
  if (!VEG_CARE[v.n] && !VEG_CARE[v.base]) return `<div class="card muted">肥料・コツ・病気と害虫は、自分の野菜の「似ている野菜」を選ぶと出ます（📖 育て方 → ✏️ 直す）。</div>`;
  const f = fertOf(v), tips = VEG_TIPS[v.n] || VEG_TIPS[v.base], sick = careOf(v).k.map(k => VEG_SICK[k]).filter(Boolean);
  const lime = f.lime[1] === 0 ? 'まきません（土をアルカリに寄せないため）' : amtText(f.lime, 'g', area);
  return `<details class="more"${open ? ' open' : ''}><summary>🧪 肥料（${esc(f.n)}・土のpH ${esc(f.ph)}）</summary>
      <div class="fl"><b>① 土づくり</b><span>苦土石灰 ${esc(lime)}<br>完熟たい肥 ${esc(amtText(f.compost, 'kg', area))}<br><small>石灰は植える2週間前、たい肥と元肥は1週間前までに混ぜます</small></span></div>
      <div class="fl"><b>② 元肥</b><span>化成肥料 ${esc(f.base.npk)} を ${esc(amtText(f.base.g, 'g', area))}</span></div>
      <div class="fl"><b>③ 追肥</b><span>${f.side ? `化成肥料 ${esc(f.side.npk)} を ${esc(amtText(f.side.g, 'g', area))}<br><small>${esc(f.side.when)}</small>` : 'やりません<br><small>肥料が多いと実（いも）が太らなくなります</small>'}</span></div>
      <div class="tip">💡 ${esc(f.tip)}</div></details>
    ${tips ? `<details class="more"${open ? ' open' : ''}><summary>💡 育て方のコツ</summary>${VEG_TIP_LABELS.map(([k, lb]) => `<div class="fl"><b>${lb}</b><span>${esc(tips[k])}</span></div>`).join('')}</details>` : ''}
    ${sick.length ? `<details class="more"><summary>🐛 出やすい病気・害虫（${sick.length}）</summary>${sick.map(d => `<div class="sick"><b>${esc(d.n)}</b>
        <div><span>見分け方</span>${esc(d.sign)}</div><div><span>手当て</span>${esc(d.care)}</div><div><span>薬の例</span>${esc(d.med)}</div></div>`).join('')}
        <div class="tip warn">⚠ ${esc(VEG_MED_NOTE)}</div></details>` : ''}`;
}
