/* 育ち具合の絵。植えた日からの予定（plan.js の cropRows）で、いまどこまで育ったかを決めて、SVG で描く。
   種 → 芽 → 育つ → 花（葉物は結球・タマネギは葉が倒れる）→ 収穫 → おわり。
   苗から植えたときは「苗」から始まる。予定のない野菜は、植えてからの日数でおおまかに決める。 */
'use strict';

/* 野菜の育ち方の形：実がなる（fruit）・土の中にできる（root）・葉を食べる（leaf）・タマネギなど（allium） */
const GROW_SHAPE = { fruit: 'fruit', corn: 'fruit', bean: 'fruit', berry: 'fruit', root: 'root', potato: 'root', sweet: 'root', taro: 'root', leaf: 'leaf', allium: 'allium' };
const growShape = c => GROW_SHAPE[careOf(planByName(c.plan)).f] || 'leaf';
const STAGE_NO = { seed: 0, nae: 1, sprout: 1, grow: 2, flower: 3, harvest: 4 };
const STAGE_LABEL = { before: 'これから', seed: '種をまいた', nae: '苗を植えた', sprout: '芽が出た', grow: '育っている', flower: '花が咲いた', harvest: '収穫できる', end: 'おわり' };
const KIND_STAGE = { sprout: 'sprout', care: 'grow', feed: 'grow', plant: 'grow', flower: 'flower', harvest: 'harvest' };

/* いまの育ち具合 {st:段階, label:ことば, size:0〜1（育つの中での大きさ）, pct:収穫はじめまでの進み（0〜1。分からなければ null）} */
function growStage(c, t = today()) {
  if (!c || !c.plantedAt) return null;
  if (c.status === 'done') return { st: 'end', label: STAGE_LABEL.end, size: 1, pct: 1 };
  const n = daysBetween(c.plantedAt, t);
  if (n < 0) return { st: 'before', label: `あと${-n}日`, size: 0, pct: 0 };
  const rows = cropRows(c);
  let st = c.as === 'nae' && (rows.length ? canNae(planByName(c.plan)) : true) ? 'nae' : 'seed', label = '', pct = null, size = 0;
  if (rows.length) {
    rows.forEach(r => {
      if (r.i === 0 || !(c.done[r.i] || r.from <= t)) return;
      const s = KIND_STAGE[r.kind.k] || 'grow';
      if (STAGE_NO[s] >= STAGE_NO[st]) { st = s; label = s === 'flower' ? r.what.replace(/はじめ$|が咲く$/, m => m === 'が咲く' ? 'が咲いた' : '') : ''; }
    });
    const hv = rows.find(r => r.kind.k === 'harvest');
    if (hv) { pct = Math.max(0, Math.min(1, n / Math.max(1, hv.d1))); size = pct; }
  } else {
    // 予定のない野菜：日数でおおまかに
    if (st === 'seed') st = n < 7 ? 'seed' : n < 21 ? 'sprout' : 'grow'; else if (n >= 14) st = 'grow';
    size = Math.min(1, n / 60);
  }
  if (c.status === 'harvesting' && st !== 'harvest') { st = 'harvest'; label = ''; }
  return { st, label: label || STAGE_LABEL[st], size: Math.max(0.3, size), pct };
}

/* ===== 絵（64×64） ===== */
const G_LEAF = '#5aa832', G_LEAF2 = '#3f8a22', G_STEM = '#4c8f2a', G_SOIL = '#8d6e4f', G_SOIL2 = '#6d4c35';
function gLeaf(x, y, len, ang, col = G_LEAF) {   // 葉1枚（x,y から ang 度の向きに）
  return `<ellipse cx="${x}" cy="${y - len / 2}" rx="${len * 0.32}" ry="${len / 2}" fill="${col}" transform="rotate(${ang} ${x} ${y})"/>`;
}
function gPlant(h, pairs, wide = 1) {   // 茎と葉（h：高さ、pairs：葉の組の数）
  let s = `<path d="M32 52 V${52 - h}" stroke="${G_STEM}" stroke-width="2.4" stroke-linecap="round"/>`;
  for (let k = 0; k < pairs; k++) {
    const y = 52 - h * (0.35 + 0.6 * (k + 1) / (pairs + 0.5)), len = (8 + 4 * wide) * (1 - k * 0.12);
    s += gLeaf(32, y, len, -58, k % 2 ? G_LEAF2 : G_LEAF) + gLeaf(32, y + 2, len, 58, k % 2 ? G_LEAF : G_LEAF2);
  }
  return s;
}
function gRosette(r, col = G_LEAF) {   // 葉物（地面から葉が広がる）
  let s = '';
  for (const a of [-70, -40, -12, 12, 40, 70]) s += gLeaf(32, 52, r * (1 - Math.abs(a) / 220), a, Math.abs(a) > 30 ? G_LEAF2 : col);
  return s;
}
const gFlower = (x, y, col = '#f9d71c') => `<g>${[0, 72, 144, 216, 288].map(a => `<circle cx="${x + 3 * Math.cos(a * Math.PI / 180)}" cy="${y + 3 * Math.sin(a * Math.PI / 180)}" r="2.4" fill="${col}"/>`).join('')}<circle cx="${x}" cy="${y}" r="1.6" fill="#e08a00"/></g>`;
const gEmoji = (x, y, size, e) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${esc(e)}</text>`;

function growSvg(c, g, px = 56) {
  if (!g) return '';
  const shape = growShape(c), e = c.emoji || '🌱';
  let s = `<rect x="2" y="50" width="60" height="12" rx="4" fill="${G_SOIL}"/><path d="M6 53 h8 M22 56 h6 M40 54 h9 M52 58 h5" stroke="${G_SOIL2}" stroke-width="1.4" stroke-linecap="round"/>`;
  const sz = g.size;
  switch (g.st) {
    case 'before':
      s += `<path d="M32 50 V36" stroke="#9e9e9e" stroke-width="1.6" stroke-dasharray="2 2"/>${gEmoji(32, 28, 13, '❔')}`; break;
    case 'seed':
      s += `<ellipse cx="24" cy="55" rx="2.6" ry="1.8" fill="#4e342e"/><ellipse cx="32" cy="56" rx="2.6" ry="1.8" fill="#4e342e"/><ellipse cx="40" cy="55" rx="2.6" ry="1.8" fill="#4e342e"/>
        <path d="M20 46 q4 -3 8 0 M30 44 q4 -3 8 0" stroke="#90a4ae" stroke-width="1.2" fill="none"/>${gEmoji(46, 38, 10, '💧')}`; break;
    case 'nae':
      s += shape === 'leaf' ? gRosette(12) : gPlant(14, 2, 0.6); break;
    case 'sprout':
      s += `<path d="M32 52 V42" stroke="${G_STEM}" stroke-width="2.2" stroke-linecap="round"/>${gLeaf(32, 43, 9, -62)}${gLeaf(32, 43, 9, 62, G_LEAF2)}`; break;
    case 'grow':
      s += shape === 'leaf' ? gRosette(12 + 12 * sz) : shape === 'allium' ? gAllium(18 + 18 * sz) : gPlant(16 + 22 * sz, 2 + Math.round(sz * 2), 0.6 + sz * 0.5); break;
    case 'flower':
      if (shape === 'leaf') s += gRosette(24) + `<circle cx="32" cy="42" r="${8}" fill="#9ccc65" stroke="${G_LEAF2}" stroke-width="1.5"/>`;   // 結球・花蕾
      else if (shape === 'allium') s += gAllium(30, true);
      else s += gPlant(38, 4, 1) + gFlower(25, 22) + gFlower(40, 28) + gFlower(32, 13, shape === 'root' ? '#fff' : '#f9d71c');
      break;
    case 'harvest': case 'end':
      if (shape === 'fruit') s += gPlant(38, 4, 1) + gEmoji(23, 30, 13, e) + gEmoji(42, 24, 13, e) + gEmoji(33, 42, 11, e);
      else if (shape === 'root') s += gPlant(20, 2, 1) + gEmoji(32, 50, 22, e);
      else if (shape === 'allium') s += gAllium(28, true) + gEmoji(32, 50, 18, e);
      else s += gRosette(26) + gEmoji(32, 38, 20, e);
      if (g.st === 'end') s = `<g opacity=".45">${s}</g>${gEmoji(50, 12, 12, '✔️')}`;
      break;
  }
  return `<svg class="growpic" viewBox="0 0 64 64" width="${px}" height="${px}" role="img" aria-label="${esc(g.label)}">${s}</svg>`;
}
function gAllium(h, fallen) {   // ネギ・タマネギ（細長い葉。倒れたもの）
  let s = '';
  for (const [dx, a] of [[-3, -14], [0, 0], [3, 14]]) {
    s += fallen ? `<path d="M${32 + dx} 52 q${a / 2} ${-h * 0.5} ${a * 1.6 + (a >= 0 ? 12 : -12)} ${-h * 0.35}" stroke="${G_LEAF}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
      : `<path d="M${32 + dx} 52 l${a * 0.5} ${-h}" stroke="${dx ? G_LEAF2 : G_LEAF}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
  return s;
}

/* カードの左の絵：上に小さく野菜の絵、その下に育ち具合の絵とことば */
function growBox(c, big) {
  const g = growStage(c);
  if (!g) return `<div class="emo">${c.emoji}</div>`;
  return `<div class="emo grow${big ? ' big' : ''}" data-st="${g.st}"><span class="e">${c.emoji}</span>${growSvg(c, g, big ? 84 : 56)}<small>${esc(g.label)}</small>${g.pct != null && g.st !== 'end' && big ? `<i class="gbar"><b style="width:${Math.round(g.pct * 100)}%"></b></i><small>収穫まで ${Math.round(g.pct * 100)}%</small>` : ''}</div>`;
}
