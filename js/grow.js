/* 育ち具合の絵。植えた日からの予定（plan.js の cropRows）で、いまどこまで育ったかを決めて、SVG で描く。
   8段階：種をまいた（苗を植えた）→ 芽が出た → 本葉が出た（根づいた）→ 育ってきた → 大きく育った
          → 花が咲いた（結球・穂など）→ 実がなった（根・いもが太ってきた など）→ 収穫できる。ほかに「これから」「おわり」。
   段階の区切りは、予定の 発芽・花・収穫 の日から決める（花のない野菜は 花 をとばす）。
   予定のない野菜は、植えてからの日数でおおまかに決める。 */
'use strict';

/* ===== 野菜の形 =====
   fruit：実がなる（支柱）、vine：つるが地面をはう（カボチャ・スイカ）、corn：トウモロコシ、bean：豆、berry：イチゴ、
   root：根を食べる、tuber：いも、leaf：葉物、head：結球する（キャベツなど）、allium：タマネギ・ネギ */
const GROW_SHAPE_BY_NAME = { 'カボチャ': 'vine', 'スイカ': 'vine', 'トウモロコシ': 'corn', 'キャベツ': 'head', 'ハクサイ': 'head', 'レタス': 'head', 'ブロッコリー': 'head' };
const GROW_SHAPE_BY_F = { fruit: 'fruit', corn: 'corn', bean: 'bean', berry: 'berry', root: 'root', potato: 'tuber', sweet: 'tuber', taro: 'tuber', leaf: 'leaf', allium: 'allium' };
const growShape = c => GROW_SHAPE_BY_NAME[c.plan] || GROW_SHAPE_BY_F[careOf(planByName(c.plan)).f] || 'leaf';
/* 実・根の色と形（r：丸い、l：長い） */
const GROW_LOOK = {
  'トマト': ['#e53935', 'r'], 'キュウリ': ['#2e7d32', 'l'], 'ナス': ['#4a148c', 'l'], 'ピーマン': ['#2e7d32', 'r'], 'オクラ': ['#689f38', 'l'], 'ズッキーニ': ['#33691e', 'l'],
  'カボチャ': ['#33691e', 'r'], 'スイカ': ['#2e7d32', 'r'], 'イチゴ': ['#e53935', 'r'], 'エダマメ': ['#7cb342', 'l'], 'エンドウ': ['#7cb342', 'l'], 'ソラマメ': ['#689f38', 'l'],
  'ダイコン': ['#e3eecf', 'l'], 'ニンジン': ['#ef6c00', 'l'], 'カブ': ['#f7f5ef', 'r'], 'ラディッシュ': ['#d81b60', 'r'], 'ビーツ': ['#6a1b4d', 'r'],
  'ジャガイモ': ['#c9a46a', 'r'], 'サツマイモ': ['#9c2f5b', 'l'], 'サトイモ': ['#8d6e63', 'r'], 'タマネギ': ['#d9a441', 'r'], 'ニンニク': ['#efe9dc', 'r'], 'ネギ': ['#f2f2ea', 'l'],
  'キャベツ': ['#a5d6a7', 'r'], 'ハクサイ': ['#e6f0c8', 'l'], 'レタス': ['#c5e1a5', 'r'], 'ブロッコリー': ['#2e6b2e', 'r']
};
const FLOWER_COL = { 'ナス': '#9575cd', 'ジャガイモ': '#f3f0ff', 'エダマメ': '#efe6ff', 'エンドウ': '#f8f0ff', 'ソラマメ': '#fafafa', 'イチゴ': '#ffffff', 'オクラ': '#fff59d' };

const STAGE_NO = { seed: 0, nae: 1, sprout: 1, leaf: 2, young: 3, big: 4, flower: 5, fruit: 6, harvest: 7 };
const STAGE_LABEL = { before: 'これから', seed: '種をまいた', nae: '苗を植えた', sprout: '芽が出た', leaf: '本葉が出た', young: '育ってきた', big: '大きく育った',
  flower: '花が咲いた', fruit: '実がなった', harvest: '収穫できる', end: 'おわり' };
/* 形ごとの「花」「実」の段階のことば */
const SHAPE_LABEL = {
  corn: { flower: '穂が出た', fruit: '実がついた' }, bean: { fruit: 'さやがついた' }, berry: { fruit: '実がなった' },
  root: { fruit: '根が太ってきた' }, tuber: { fruit: 'いもが太ってきた' }, leaf: { fruit: '収穫まぢか' },
  head: { flower: '巻きはじめた', fruit: '巻いてきた' }, allium: { fruit: '玉が太ってきた' }
};
const PLAN_LABEL = { 'ブロッコリー': { fruit: 'つぼみが育った' }, 'ネギ': { fruit: '太ってきた' }, 'レタス': { fruit: '収穫まぢか' } };
const stageLabel = (shape, st, c) => (st === 'leaf' && c.as === 'nae' ? '根づいた' : (PLAN_LABEL[c.plan] || {})[st] || (SHAPE_LABEL[shape] || {})[st]) || STAGE_LABEL[st];
const KIND_STAGE = { sprout: 'sprout', flower: 'flower', harvest: 'harvest' };

/* いまの育ち具合 {st:段階, label:ことば, v:0〜1（絵の大きさ）, pct:収穫はじめまでの進み（0〜1。分からなければ null）, manual}
   growShift：実物に合わせた分（日）。＋なら予定よりおくれている（絵は前の段階）、−なら進んでいる。
   合わせたあとも、その日数ずらしたまま日がたつにつれて育っていく。合わせているときは「✓ やった」で段階を進めない */
function growStage(c, t = today()) {
  if (!c || !c.plantedAt) return null;
  if (c.status === 'done') return { st: 'end', label: STAGE_LABEL.end, v: 1, pct: 1 };
  const manual = c.growShift != null && isFinite(c.growShift);
  if (manual && c.growShift) t = addDays(t, -c.growShift);
  const n = daysBetween(c.plantedAt, t);
  if (n < 0) return { st: 'before', label: `あと${-n}日`, v: 0, pct: 0 };
  const shape = growShape(c), rows = cropRows(c).filter(r => r.i > 0), nae = c.as === 'nae';
  // 区切りの日（植えた日から何日目）
  const first = re => { const r = rows.find(x => re(x)); return r ? r.d1 : null; };
  let sproutD = nae ? 0 : first(r => r.kind.k === 'sprout');
  let flowerD = first(r => r.kind.k === 'flower' && !/倒れる/.test(r.what));
  let harvestD = first(r => r.kind.k === 'harvest' || /倒れる/.test(r.what));
  if (!rows.length) { sproutD = nae ? 0 : 7; flowerD = null; harvestD = 60; }
  if (sproutD == null) sproutD = 5;
  if (harvestD == null) harvestD = Math.max(sproutD + 30, ...rows.map(r => r.d1));
  if (flowerD != null && (flowerD <= sproutD || flowerD >= harvestD)) flowerD = null;
  const flowerLabel = flowerD != null ? rows.find(r => r.d1 === flowerD && r.kind.k === 'flower').what : '';
  // 段階を決める
  let st;
  const gap = Math.max(1, (flowerD != null ? flowerD : harvestD) - sproutD), x = (n - sproutD) / gap;
  if (!nae && n < sproutD) st = 'seed';
  else if (x < 0.12) st = nae ? 'nae' : 'sprout';   // 苗から：植えてしばらくは「苗を植えた」
  else if (flowerD != null) st = x < 0.3 ? 'leaf' : x < 0.6 ? 'young' : x < 1 ? 'big'
    : n < flowerD + (harvestD - flowerD) * 0.45 ? 'flower' : n < harvestD ? 'fruit' : 'harvest';
  else st = x < 0.3 ? 'leaf' : x < 0.55 ? 'young' : x < 0.8 ? 'big' : x < 1 ? 'fruit' : 'harvest';
  // 「✓ やった」で先に進めたとき（合わせていないときだけ）
  if (!manual) rows.forEach(r => {
    const s = KIND_STAGE[r.kind.k]; if (!s || !c.done[r.i] || (s === 'flower' && /倒れる/.test(r.what))) return;
    if (STAGE_NO[s] > STAGE_NO[st]) st = s;
  });
  if (c.status === 'harvesting') st = 'harvest';
  const label = st === 'flower' && flowerLabel ? flowerLabel.replace(/はじめ$/, '').replace(/が咲く$/, 'が咲いた').replace(/が見える$/, 'が見えた').replace(/が出る$/, 'が出た') : stageLabel(shape, st, c);
  const pct = rows.length ? Math.max(0, Math.min(1, n / Math.max(1, harvestD))) : null;
  const v = STAGE_NO[st] >= 5 ? 1 : Math.max(0.15, Math.min(1, (n - sproutD) / Math.max(1, (flowerD != null ? flowerD : harvestD * 0.85) - sproutD)));
  return { st, label, v, pct, manual, shape };
}
/* 合わせられる段階 [{st, label}]（その野菜でありうるもの） */
function growOptions(c) {
  const seen = new Map();
  for (let s = 400; s >= -400; s -= 2) {
    const g = growStage(Object.assign({}, c, { growShift: s, status: 'growing' }));
    if (g && !['before', 'end'].includes(g.st) && !seen.has(g.st)) seen.set(g.st, g.label);
  }
  return [...seen].map(([st, label]) => ({ st, label })).sort((a, b) => STAGE_NO[a.st] - STAGE_NO[b.st]);
}
/* その段階の絵になる、いちばん小さいずらし（日） */
function growShiftFor(c, st, from = 0) {
  for (let k = 0; k <= 400; k++) for (const s of [from + k, from - k]) {
    const g = growStage(Object.assign({}, c, { growShift: s, status: 'growing' }));
    if (g && g.st === st) return s;
  }
  return from;
}

/* ===== 絵（64×64）=====
   地面（y=50 から下）・茎・葉（すじ入り）・花・実を、グラデーションで少し立体的に描く */
const r2 = n => Math.round(n * 10) / 10;
const G_DEFS = `<defs>
  <linearGradient id="ggSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f4fb"/><stop offset="1" stop-color="#f6fbef"/></linearGradient>
  <linearGradient id="ggSoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a6446"/><stop offset=".25" stop-color="#6f4e36"/><stop offset="1" stop-color="#4e3626"/></linearGradient>
  <linearGradient id="ggLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8bc34a"/><stop offset=".6" stop-color="#4f9a2f"/><stop offset="1" stop-color="#2f6f1f"/></linearGradient>
  <linearGradient id="ggLeafD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5c9e37"/><stop offset="1" stop-color="#245a17"/></linearGradient>
  <linearGradient id="ggLeafY" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4c25a"/><stop offset="1" stop-color="#8f8a2e"/></linearGradient>
  <linearGradient id="ggStem" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3f7f27"/><stop offset=".5" stop-color="#6aab3c"/><stop offset="1" stop-color="#3f7f27"/></linearGradient>
  <radialGradient id="ggShine" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>`;
function gSoil(mound) {
  return `<rect x="0" y="0" width="64" height="50" fill="url(#ggSky)"/>
    ${mound ? '<path d="M8 51 Q32 40 56 51 Z" fill="#7a573c"/>' : ''}<rect x="0" y="50" width="64" height="14" fill="url(#ggSoil)"/>
    <path d="M0 50.5 H64" stroke="#a07a58" stroke-width="1"/>
    <g fill="#9c7b5d" opacity=".8"><ellipse cx="7" cy="55" rx="1.6" ry="1"/><ellipse cx="22" cy="59" rx="1.2" ry=".8"/><ellipse cx="45" cy="56" rx="1.8" ry="1.1"/><ellipse cx="57" cy="60" rx="1.1" ry=".7"/><ellipse cx="34" cy="61" rx="1" ry=".6"/></g>`;
}
/* 葉1枚：付け根 (x,y) から ang 度の向きに長さ len。w は幅、fill は塗り */
function gLeaf(x, y, len, ang, w = 0.4, fill = 'url(#ggLeaf)', vein = true) {
  const a = r2(len * w), L = r2(len);
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(ang)})"><path d="M0 0 C${a} ${-L * .25} ${r2(a * .8)} ${-L * .8} 0 ${-L} C${r2(-a * .8)} ${-L * .8} ${-a} ${-L * .25} 0 0Z" fill="${fill}"/>${vein ? `<path d="M0 0 L0 ${r2(-L * .9)}" stroke="#2e5e1a" stroke-opacity=".45" stroke-width=".6"/>` : ''}</g>`;
}
/* 茎（下から上へ、少し曲げる） */
const gStem = (x, y0, h, bend = 2, w = 2.2) => { const d = `M${x} ${y0} Q${r2(x + bend)} ${r2(y0 - h / 2)} ${x} ${r2(y0 - h)}`;
  return `<path d="${d}" stroke="#467f27" stroke-width="${w}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#8cc75a" stroke-opacity=".6" stroke-width="${r2(w * .35)}" fill="none" transform="translate(-.3 0)"/>`; };
/* 花（5まい） */
function gFlower(x, y, col = '#fdd835', r = 2.6) {
  let s = '';
  for (let k = 0; k < 5; k++) { const a = (k * 72 - 90) * Math.PI / 180; s += `<ellipse cx="${r2(x + r * .8 * Math.cos(a))}" cy="${r2(y + r * .8 * Math.sin(a))}" rx="${r2(r * .62)}" ry="${r2(r * .45)}" transform="rotate(${k * 72} ${r2(x + r * .8 * Math.cos(a))} ${r2(y + r * .8 * Math.sin(a))})" fill="${col}" stroke="#00000018" stroke-width=".3"/>`; }
  return s + `<circle cx="${x}" cy="${y}" r="${r2(r * .38)}" fill="#e0a000"/>`;
}
/* 実（丸い・長い）。ripe=false は小さい緑の実 */
function gFruit(x, y, look, size, ripe) {
  const [col, form] = look, c = ripe ? col : '#8bc34a';
  if (form === 'l') return `<g transform="rotate(8 ${x} ${y})"><ellipse cx="${x}" cy="${r2(y + size)}" rx="${r2(size * .42)}" ry="${r2(size * 1.25)}" fill="${c}"/><ellipse cx="${x}" cy="${r2(y + size)}" rx="${r2(size * .42)}" ry="${r2(size * 1.25)}" fill="url(#ggShine)"/><path d="M${r2(x - size * .4)} ${r2(y - size * .1)} Q${x} ${r2(y - size * .5)} ${r2(x + size * .4)} ${r2(y - size * .1)}" fill="#3e7b22"/></g>`;
  return `<circle cx="${x}" cy="${y}" r="${r2(size)}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r2(size)}" fill="url(#ggShine)"/><path d="M${r2(x - size * .5)} ${r2(y - size * .8)} L${x} ${r2(y - size * .55)} L${r2(x + size * .5)} ${r2(y - size * .8)} L${x} ${r2(y - size * 1.05)}Z" fill="#3e7b22"/>`;
}
/* 茎のある草（支柱つき）：v で高さ、葉の数がふえる */
function gBush(v, opts = {}) {
  const h = 10 + 32 * v, pairs = 1 + Math.round(v * 4), x = 32;
  let s = opts.stake && v > 0.35 ? `<path d="M37 51 V${r2(51 - h - 4)}" stroke="#c9b48a" stroke-width="1.6" stroke-linecap="round"/><path d="M33 ${r2(51 - h * .45)} L37 ${r2(51 - h * .45)} M33 ${r2(51 - h * .8)} L37 ${r2(51 - h * .8)}" stroke="#a1887f" stroke-width=".7"/>` : '';
  s += gStem(x, 51, h, opts.bend || 1.5, 1.6 + v * 1.4);
  for (let k = 0; k < pairs; k++) {
    const y = 51 - h * (0.22 + 0.68 * k / Math.max(1, pairs)), len = (opts.leafLen || 9) * (0.75 + v * 0.45) * (1 - k * 0.08);
    s += gLeaf(x, y, len, -62 + (k % 2) * 8, opts.w || 0.42, k % 2 ? 'url(#ggLeafD)' : 'url(#ggLeaf)') + gLeaf(x, y - 2, len * .92, 60 - (k % 2) * 8, opts.w || 0.42, k % 2 ? 'url(#ggLeaf)' : 'url(#ggLeafD)');
  }
  s += gLeaf(x, 51 - h, 4 + v * 2, -20, 0.45) + gLeaf(x, 51 - h, 4 + v * 2, 22, 0.45, 'url(#ggLeafD)');
  return { s, top: 51 - h, h };
}
/* 地面から葉が広がる（葉物・根もの・イチゴ） */
function gRosette(v, opts = {}) {
  const n = opts.n || 7, len = (opts.len || 22) * (0.35 + 0.65 * v);
  let s = '';
  for (let k = 0; k < n; k++) {
    const a = -75 + 150 * k / (n - 1);
    s += gLeaf(32 + a / 30, 51, len * (1 - Math.abs(a) / 260), a, opts.w || 0.42, Math.abs(a) > 40 ? 'url(#ggLeafD)' : (opts.fill || 'url(#ggLeaf)'));
  }
  return s;
}
/* 双葉（芽） */
const gSprout = (h = 7) => gStem(32, 51, h, 1.5, 1.6) + `<ellipse cx="28.2" cy="${51 - h - 1}" rx="4" ry="2.1" transform="rotate(-18 28.2 ${51 - h - 1})" fill="url(#ggLeaf)"/><ellipse cx="35.8" cy="${51 - h - 1}" rx="4" ry="2.1" transform="rotate(18 35.8 ${51 - h - 1})" fill="url(#ggLeaf)"/>`;
/* 種（まいたところ） */
const gSeed = () => `<path d="M14 51 Q32 47 50 51" stroke="#5a3e2a" stroke-width="1.2" fill="none"/>
  ${[22, 32, 42].map(x => `<ellipse cx="${x}" cy="53.5" rx="2.4" ry="1.6" fill="#5d4037"/><ellipse cx="${x - .7}" cy="53" rx=".8" ry=".5" fill="#a1887f"/>`).join('')}
  <g fill="#64b5f6" opacity=".85"><path d="M47 34 q2 3 0 4 q-2-1 0-4z"/><path d="M52 39 q2 3 0 4 q-2-1 0-4z"/><path d="M43 40 q1.6 2.4 0 3.2 q-1.6-.8 0-3.2z"/></g>`;

function growSvg(c, g, px = 56) {
  if (!g) return '';
  const shape = g.shape || growShape(c), look = GROW_LOOK[c.plan] || ['#7cb342', 'r'], v = g.v != null ? g.v : 1, st = g.st;
  const fcol = FLOWER_COL[c.plan] || '#fdd835';
  let s = '';
  if (st === 'before') s = `<path d="M32 50 V36" stroke="#9e9e9e" stroke-width="1.4" stroke-dasharray="2 2"/><text x="32" y="30" font-size="12" text-anchor="middle">❔</text>`;
  else if (st === 'seed') s = gSeed();
  else if (st === 'sprout') s = gSprout(6);
  else if (st === 'nae' || st === 'leaf') {
    s = shape === 'leaf' || shape === 'head' || shape === 'root' || shape === 'berry' ? gRosette(0.3, { n: 5, len: 20 })
      : shape === 'allium' ? gAllium(0.3) : gSprout(9) + gLeaf(32, 41, 6, -40, .45) + gLeaf(32, 41, 6, 40, .45, 'url(#ggLeafD)');
  } else {
    const ripe = st === 'harvest' || st === 'end', fr = STAGE_NO[st] >= 6 || st === 'end', fl = st === 'flower';
    switch (shape) {
      case 'fruit': {
        const b = gBush(v, { stake: true, leafLen: look[1] === 'l' ? 10 : 9 }); s = b.s;
        if (fl) s += gFlower(26, b.top + 10, fcol) + gFlower(38, b.top + 17, fcol) + gFlower(30, b.top + 3, fcol, 2.2);
        if (fr) { const z = ripe ? 4.2 : 3.2; s += gFruit(24, b.top + 16, look, z, ripe) + gFruit(40, b.top + 22, look, z * .9, ripe) + (ripe ? gFruit(30, b.top + 28, look, z * .85, ripe) : gFlower(33, b.top + 6, fcol, 2.2)); }
        break;
      }
      case 'vine': {   // 地面をはうつる
        const L = 0.4 + 0.6 * v;
        s = `<path d="M32 50 Q${r2(32 - 20 * L)} ${r2(48 - 2 * L)} ${r2(32 - 28 * L)} 49 M32 50 Q${r2(32 + 20 * L)} ${r2(47 - 2 * L)} ${r2(32 + 28 * L)} 48" stroke="url(#ggStem)" stroke-width="1.6" fill="none"/>`;
        for (const [x, a] of [[32, 0], [32 - 13 * L, -40], [32 + 13 * L, 40], [32 - 24 * L, -55], [32 + 24 * L, 55]]) s += gLeaf(x, 50, 8 + 8 * v, a, 0.55, a % 80 ? 'url(#ggLeafD)' : 'url(#ggLeaf)');
        if (fl) s += gFlower(20, 40, fcol, 3.2) + gFlower(44, 41, fcol, 3);
        if (fr) s += ripe ? `<ellipse cx="40" cy="45" rx="8.5" ry="6.5" fill="${look[0]}"/>${c.plan === 'スイカ' ? '<path d="M34 41 Q36 45 34 49 M38 39.5 Q40 45 38 51 M42 39.5 Q44 45 42 51 M46 41 Q47.5 45 46 49" stroke="#1b4d1b" stroke-width="1.3" fill="none"/>' : '<path d="M36 40 Q37 45 36 50 M40 38.6 V51 M44 40 Q43 45 44 50" stroke="#24521b" stroke-width=".8" fill="none"/>'}<ellipse cx="40" cy="45" rx="8.5" ry="6.5" fill="url(#ggShine)"/>`
          : `<circle cx="40" cy="46" r="3.6" fill="#8bc34a"/><circle cx="40" cy="46" r="3.6" fill="url(#ggShine)"/>`;
        break;
      }
      case 'corn': {
        const h = 12 + 28 * v; s = gStem(32, 51, h, 0.6, 2.8);
        for (let k = 0; k < 2 + Math.round(v * 3); k++) { const y = 51 - h * (0.2 + 0.18 * k); s += `<path d="M32 ${r2(y)} Q${k % 2 ? 46 : 18} ${r2(y - 8)} ${k % 2 ? 52 : 12} ${r2(y + 2)}" stroke="${k % 2 ? '#3f7f27' : '#5aa832'}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`; }
        if (STAGE_NO[st] >= 5 || st === 'end') s += `<path d="M32 ${r2(51 - h)} l-4 -6 M32 ${r2(51 - h)} l0 -7 M32 ${r2(51 - h)} l4 -6 M32 ${r2(51 - h)} l-2 -7 M32 ${r2(51 - h)} l2 -7" stroke="#c9a33f" stroke-width="1.1"/>`;
        if (fr) s += `<g transform="rotate(-25 36 ${r2(51 - h * .5)})"><ellipse cx="37" cy="${r2(51 - h * .5)}" rx="${ripe ? 3.6 : 2.6}" ry="${ripe ? 8 : 6}" fill="${ripe ? '#f2c94c' : '#9ccc65'}"/><path d="M33.6 ${r2(51 - h * .5 + 6)} Q37 ${r2(51 - h * .5 - 2)} 40.4 ${r2(51 - h * .5 + 6)}" fill="#6aa84f"/><path d="M37 ${r2(51 - h * .5 - 7)} l-1 -4 M37 ${r2(51 - h * .5 - 7)} l1.4 -3.6" stroke="#b07a3a" stroke-width=".8"/></g>`;
        break;
      }
      case 'bean': {
        const b = gBush(v * .8, { leafLen: 8, w: 0.6 }); s = b.s;
        if (fl) s += gFlower(26, b.top + 12, fcol, 2) + gFlower(38, b.top + 16, fcol, 2) + gFlower(33, b.top + 6, fcol, 1.8);
        if (fr) for (const [x, y, a] of [[25, b.top + 14, 18], [39, b.top + 18, -16], [31, b.top + 24, 6]]) s += `<path d="M${x} ${r2(y)} q${r2(a / 6)} 8 ${r2(a / 4)} ${ripe ? 13 : 9}" stroke="${ripe ? '#7cb342' : '#a5d66a'}" stroke-width="${ripe ? 3.4 : 2.4}" stroke-linecap="round" fill="none"/>`;
        break;
      }
      case 'berry': {
        s = gRosette(0.5 + v * 0.5, { n: 7, len: 18, w: 0.65 });
        if (fl) s += gFlower(24, 40, fcol, 2.8) + gFlower(41, 42, fcol, 2.6);
        if (fr) for (const [x, y] of [[23, 45], [41, 46], [33, 47]]) s += `<path d="M${x - 3} ${y - 2.5} Q${x} ${y + 5} ${x + 3} ${y - 2.5} Z" fill="${ripe ? '#e53935' : '#e8f5c8'}"/><path d="M${x - 2.6} ${y - 2.8} L${x} ${y - 1.4} L${x + 2.6} ${y - 2.8}" stroke="#2e7d32" stroke-width="1.2" fill="none"/>${ripe ? `<g fill="#ffeb3b"><circle cx="${x - 1}" cy="${y}" r=".3"/><circle cx="${x + 1}" cy="${y + .6}" r=".3"/><circle cx="${x}" cy="${y + 2}" r=".3"/></g>` : ''}`;
        break;
      }
      case 'root': {
        s = gRosette(0.45 + v * 0.55, { n: 7, len: 24, w: c.plan === 'ニンジン' ? 0.28 : 0.38 });
        if (STAGE_NO[st] >= 4 || st === 'end') { const z = st === 'big' ? 3 : fr && !ripe ? 4.5 : 6; s = `<ellipse cx="32" cy="50" rx="${z}" ry="${r2(z * 1.1)}" fill="${look[0]}" stroke="#00000030" stroke-width=".6"/><ellipse cx="32" cy="50" rx="${z}" ry="${r2(z * 1.1)}" fill="url(#ggShine)"/>` + s; }
        break;
      }
      case 'tuber': {
        const sweet = c.plan === 'サツマイモ', taro = c.plan === 'サトイモ';
        if (sweet) { s = `<path d="M32 50 Q18 47 6 49 M32 50 Q46 46 58 48" stroke="url(#ggStem)" stroke-width="1.5" fill="none"/>`; for (const x of [10, 18, 26, 38, 46, 54]) s += gLeaf(x, 49, 6 + 6 * v, (x - 32) * 2, 0.6, x % 3 ? 'url(#ggLeafD)' : 'url(#ggLeaf)'); }
        else if (taro) { s = ''; for (const [x, a] of [[30, -18], [34, 16], [32, 0]]) s += `<path d="M32 51 L${r2(x + a / 3)} ${r2(51 - 18 * v - 10)}" stroke="#7a9a4a" stroke-width="1.5"/>` + `<ellipse cx="${r2(x + a / 3)}" cy="${r2(51 - 18 * v - 14)}" rx="${r2(5 + 4 * v)}" ry="${r2(4 + 3 * v)}" fill="${a ? 'url(#ggLeafD)' : 'url(#ggLeaf)'}"/>`; }
        else s = gBush(v * .75, { leafLen: 8, w: 0.55 }).s.replace(/url\(#ggLeaf\)/g, ripe ? 'url(#ggLeafY)' : 'url(#ggLeaf)');
        if (fl && !sweet && !taro) s += gFlower(27, 28, fcol, 2.4) + gFlower(37, 31, fcol, 2.2);
        if (fr) { const z = ripe ? 3.4 : 2.2; for (const [x, y] of [[24, 56], [34, 58], [42, 55]]) s += `<ellipse cx="${x}" cy="${y}" rx="${r2(z * (look[1] === 'l' ? 1.6 : 1.15))}" ry="${z}" fill="${look[0]}" stroke="#00000033" stroke-width=".4"/>`; s += '<path d="M32 51 Q28 54 24 56 M32 51 Q33 55 34 58 M32 51 Q38 53 42 55" stroke="#c8b08a" stroke-width=".6" fill="none"/>'; }
        break;
      }
      case 'head': {
        const broc = c.plan === 'ブロッコリー';
        s = gRosette(0.5 + v * 0.5, { n: 8, len: 22, w: 0.62, fill: broc ? 'url(#ggLeafD)' : 'url(#ggLeaf)' });
        if (STAGE_NO[st] >= 5 || st === 'end') {
          const z = fl ? 5 : fr && !ripe ? 7 : 9.5;
          s += broc ? [[-z * .5, 2], [z * .5, 2], [0, -z * .25], [-z * .25, -z * .5 + 1], [z * .25, -z * .5 + 1]].map(([dx, dy]) => `<circle cx="${r2(32 + dx)}" cy="${r2(40 + dy)}" r="${r2(z * .42)}" fill="#2e6b2e"/><circle cx="${r2(32 + dx)}" cy="${r2(40 + dy)}" r="${r2(z * .42)}" fill="url(#ggShine)"/>`).join('')
            : (() => { const cy = r2(47 - z * .55), ry = r2(z * (look[1] === 'l' ? 1.25 : .9));
              return `<ellipse cx="32" cy="${cy}" rx="${z}" ry="${ry}" fill="${look[0]}" stroke="#5f9a3c" stroke-width="1"/>
                <path d="M${r2(32 - z * .75)} ${r2(cy + ry * .3)} Q${r2(32 - z * .2)} ${r2(cy - ry * 1.1)} ${r2(32 + z * .5)} ${r2(cy - ry * .2)}" stroke="#6aa84f" stroke-width=".9" fill="none"/>
                <path d="M${r2(32 + z * .75)} ${r2(cy + ry * .35)} Q${r2(32 + z * .3)} ${r2(cy - ry * .9)} ${r2(32 - z * .45)} ${r2(cy - ry * .45)}" stroke="#7cb342" stroke-width=".8" fill="none"/>
                <ellipse cx="32" cy="${cy}" rx="${z}" ry="${ry}" fill="url(#ggShine)"/>`; })();
        }
        break;
      }
      case 'allium': s = gAllium(v, st, look, c.plan); break;
      default: {   // 葉物
        s = gRosette(0.35 + v * 0.65, { n: 9, len: 24, w: 0.5 });
      }
    }
  }
  const body = st === 'end' ? `<g opacity=".45">${s}</g><text x="52" y="12" font-size="11" text-anchor="middle">✔️</text>` : s;
  return `<svg class="growpic" viewBox="0 0 64 64" width="${px}" height="${px}" role="img" aria-label="${esc(g.label)}">${G_DEFS}${gSoil(c.plan === 'ネギ' && STAGE_NO[st] >= 4)}${body}</svg>`;
}
/* タマネギ・ニンニク・ネギ：細長い葉。玉が太り、収穫のころは葉が倒れる */
function gAllium(v, st, look = ['#d9a441', 'r'], plan) {
  const negi = plan === 'ネギ', h = 12 + 26 * (v || 0.3), fallen = !negi && (st === 'harvest' || st === 'end'), fr = STAGE_NO[st] >= 6 || st === 'harvest' || st === 'end';
  let s = '';
  for (const [dx, a, col] of [[-2.5, -12, '#5d9b38'], [0, 0, '#79b84a'], [2.5, 12, '#4f8a2f'], [-1, -5, '#6aa843'], [1, 6, '#5d9b38']]) {
    s += fallen ? `<path d="M${32 + dx} 49 Q${r2(32 + dx + a)} ${r2(49 - h * .45)} ${r2(32 + dx + a * 2.4 + (a >= 0 ? 14 : -14))} ${r2(49 - h * .15)}" stroke="${col}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
      : `<path d="M${32 + dx} 50 Q${r2(32 + dx + a * .3)} ${r2(50 - h * .5)} ${r2(32 + dx + a * .7)} ${r2(50 - h)}" stroke="${col}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  }
  if (negi) return `<rect x="29.5" y="${r2(50 - h * .3)}" width="5" height="${r2(h * .3)}" rx="2" fill="#f2f2ea"/>` + s;
  if (fr) { const z = fallen ? 6.5 : 4.5; s = `<ellipse cx="32" cy="${r2(51 - z * .6)}" rx="${z}" ry="${r2(z * .85)}" fill="${look[0]}" stroke="#00000022" stroke-width=".5"/><ellipse cx="32" cy="${r2(51 - z * .6)}" rx="${z}" ry="${r2(z * .85)}" fill="url(#ggShine)"/>` + s; }
  return s;
}

/* カードの左の絵：上に小さく野菜の絵、その下に育ち具合の絵とことば */
function growBox(c, big) {
  const g = growStage(c);
  if (!g) return `<div class="emo">${c.emoji}</div>`;
  return `<div class="emo grow${big ? ' big' : ''}" data-st="${g.st}"><span class="e">${c.emoji}</span>${growSvg(c, g, big ? 84 : 56)}<small>${g.manual && !big ? '✋' : ''}${esc(g.label)}</small>${g.st !== 'before' && g.st !== 'end' ? `<i class="gsteps" aria-label="8段階の${STAGE_NO[g.st] + 1}">${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<b${k <= STAGE_NO[g.st] ? ' class="on"' : ''}></b>`).join('')}</i>` : ''}${g.pct != null && g.st !== 'end' && big ? `<small class="gp">収穫まで ${Math.round(g.pct * 100)}%</small>` : ''}${big && !['before', 'end'].includes(g.st) ? `<button class="gadj" id="growAdj">✋ ${g.manual ? '合わせ中' : '合わせる'}</button>` : ''}</div>`;
}
