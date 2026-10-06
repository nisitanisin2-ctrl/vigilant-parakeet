/* 記録を活かす：📷 写真アルバム・💾 バックアップの声かけ・📊 収穫の見える化（去年とくらべ）・📈 自分の実績で予定を合わせる */
'use strict';

/* ===== 📷 写真アルバム（写真つきの記録を日付順に） ===== */
function photoLogs(crops) { const ids = new Set(crops.map(c => c.id)); return data.logs.filter(l => l.hasPhoto && ids.has(l.cropId)).sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts); }
function albumGrid(logs, withCrop) {
  return `<div class="album">${logs.map(l => { const c = cropById(l.cropId), t = TYPES[l.type] || TYPES.other;
    return `<figure><img data-photo="${l.id}" alt="" loading="lazy"><figcaption>${fmtDate(l.date)}${c && c.plantedAt ? `・${daysBetween(c.plantedAt, l.date)}日目` : ''}<br>${withCrop && c ? c.emoji + esc(c.name) + ' ' : ''}${t.icon}${esc(l.memo || t.label).slice(0, 16)}</figcaption></figure>`; }).join('')}</div>`;
}
/* 記録のタブの「📷 写真」：野菜ごとにまとめる */
function albumTabHtml() {
  const crops = viewCrops().filter(c => photoLogs([c]).length).sort((a, b) => (b.plantedAt || '').localeCompare(a.plantedAt || ''));
  if (!crops.length) return `<div class="empty"><div class="big">📷</div><p>写真つきの記録はまだありません。✏️ の記録で写真を入れると、ここに育ちのアルバムができます。</p></div>`;
  return crops.map(c => `<h2>${c.emoji} ${esc(c.name)}<small>${photoLogs([c]).length}枚・${fmtDate(c.plantedAt)}から</small></h2><div class="card">${albumGrid(photoLogs([c]), false)}</div>`).join('');
}

/* ===== 💾 バックアップの声かけ =====
   前のバックアップから30日（まだしていないときは、使いはじめて14日）たったら、畑の上に知らせる。「あとで」で7日お休み */
const BK_SNOOZE = 'saien_bk_snooze';
function backupAge() {
  const last = data.settings.backupAt || 0;
  if (last) return Math.floor((Date.now() - last) / 86400000);
  const first = Math.min(...data.crops.map(c => c.createdAt || Date.now()), ...data.logs.map(l => l.ts || Date.now()));
  return isFinite(first) ? Math.floor((Date.now() - first) / 86400000) : 0;
}
function backupDue() {
  if (EMBED || (!data.crops.length && !data.logs.length)) return false;
  let snooze = 0; try { snooze = +localStorage.getItem(BK_SNOOZE) || 0; } catch (e) {}
  if (Date.now() < snooze) return false;
  const a = backupAge(); return data.settings.backupAt ? a >= 30 : a >= 14;
}
function backupBannerHtml() {
  if (!backupDue()) return '';
  return `<div class="card bkban"><span>💾</span><p><b>${data.settings.backupAt ? `前のバックアップから${backupAge()}日たちました` : 'まだバックアップしていません'}</b><br><small>機種変更やブラウザのデータ削除に備えて、写真ごと保存しておきましょう</small></p>
    <div class="col"><button class="btn primary" id="bkNow">保存する</button><button class="btn" id="bkLater">あとで</button></div></div>`;
}
function bindBackupBanner() {
  if ($('#bkNow')) $('#bkNow').onclick = async () => { await exportData(); render(); };
  if ($('#bkLater')) $('#bkLater').onclick = () => { try { localStorage.setItem(BK_SNOOZE, String(Date.now() + 7 * 86400000)); } catch (e) {} render(); };
}
const backupText = () => data.settings.backupAt ? `前のバックアップ：${backupAge() === 0 ? '今日' : backupAge() + '日前'}` : '前のバックアップ：まだしていません';

/* ===== 📊 野菜ごとの収穫（去年とくらべ） ===== */
function harvestCompareHtml(y) {
  const py = String(+y - 1), groups = new Map();
  data.logs.filter(l => l.type === 'harvest' && viewLog(l) && (l.date.startsWith(y) || l.date.startsWith(py))).forEach(l => {
    const c = cropById(l.cropId), key = c.plan || c.name;
    const g = groups.get(key) || { emoji: c.emoji, name: key, units: {} }; groups.set(key, g);
    const u = l.amount > 0 ? l.unit : '回', a = l.amount > 0 ? Number(l.amount) : 1;
    const uu = g.units[u] || (g.units[u] = { [y]: 0, [py]: 0, n: 0 }); uu[l.date.slice(0, 4)] += a; uu.n++;
  });
  const rows = [...groups.values()].map(g => { const [u, v] = Object.entries(g.units).sort((a, b) => b[1].n - a[1].n)[0]; return { g, u, now: Math.round(v[y] * 100) / 100, prev: Math.round(v[py] * 100) / 100 }; })
    .filter(r => r.now || r.prev).sort((a, b) => b.now - a.now);
  if (!rows.length) return '';
  const mx = Math.max(...rows.map(r => Math.max(r.now, r.prev)), 1);
  return `<h2>野菜ごとの収穫（${y}年と${py}年）</h2><div class="card hvc">${rows.map(r => {
    const pct = r.prev ? Math.round((r.now - r.prev) / r.prev * 100) : null;
    return `<div class="hvr"><b>${r.g.emoji} ${esc(r.g.name)}</b>${pct != null ? `<small class="${pct >= 0 ? 'up' : 'dn'}">${pct >= 0 ? '＋' : '−'}${Math.abs(pct)}%</small>` : ''}
      <div class="hvb"><span>${y}</span><i style="width:${Math.round(r.now / mx * 100)}%"></i><em>${r.now}${esc(r.u)}</em></div>
      <div class="hvb prev"><span>${py}</span><i style="width:${Math.round(r.prev / mx * 100)}%"></i><em>${r.prev ? r.prev + esc(r.u) : '—'}</em></div></div>`; }).join('')}
    <div class="muted small">量を入れていない収穫は「回」で数えます。</div></div>`;
}

/* ===== 📈 自分の実績で予定を合わせる =====
   植えてから（苗からは植えてから）はじめて収穫した日までの日数を、前に育てた分から平均する。
   「予定を実績に合わせる」を押すと、その野菜の予定の日数に倍率（data.settings.adj['トマト|nae']）をかける */
const adjKey = (n, as) => `${n}|${as === 'nae' ? 'nae' : 'seed'}`;
const adjFactor = (n, as) => { const a = data.settings.adj || {}; return +a[adjKey(n, as)] || 1; };
function ownDays(n, as) {
  const ds = data.crops.filter(c => c.plan === n && (c.as === 'nae') === (as === 'nae') && c.plantedAt).map(c => {
    const h = data.logs.filter(l => l.cropId === c.id && l.type === 'harvest' && l.date >= c.plantedAt).map(l => l.date).sort()[0];
    return h ? daysBetween(c.plantedAt, h) : null;
  }).filter(d => d != null && d > 0);
  return ds.length ? { n: ds.length, avg: Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) } : null;
}
/* 予定の「収穫はじめ」が何日目か（地域の補正だけ。実績の倍率はかけない） */
function planHarvestDay(v, as) {
  const save = data.settings.adj; data.settings.adj = {};
  const r = planRows(v, '2000-01-01', as).find(x => x.kind.k === 'harvest');
  data.settings.adj = save; return r ? r.d1 : null;
}
function ownHtml(v, as) {
  const o = ownDays(v.n, as), pd = planHarvestDay(v, as), on = adjFactor(v.n, as) !== 1;
  if (!o || !pd) return '';
  const r = Math.round(o.avg / pd * 20) / 20;
  return `<div class="own">📈 <b>あなたの畑では</b>：${as === 'nae' ? '植えて' : 'まいて'}から収穫まで <b>平均${o.avg}日</b>（${o.n}回）。予定は${pd}日です。
    ${on ? `<br><small>いまは予定を実績に合わせています（日数×${adjFactor(v.n, as)}）</small><button class="btn mini" data-adj="${esc(v.n)}" data-adj-as="${as}" data-adj-r="1">予定どおりにもどす</button>`
      : Math.abs(r - 1) >= 0.05 ? `<button class="btn mini primary" data-adj="${esc(v.n)}" data-adj-as="${as}" data-adj-r="${r}">予定を実績に合わせる（日数×${r}）</button>` : '<br><small>予定とほぼ同じです</small>'}</div>`;
}
function bindOwn(m) {
  m.querySelectorAll('[data-adj]').forEach(b => b.onclick = async () => {
    const a = data.settings.adj || (data.settings.adj = {}), k = adjKey(b.dataset.adj, b.dataset.adjAs), r = +b.dataset.adjR;
    if (r === 1) delete a[k]; else a[k] = r;
    await save(); render(); toast(r === 1 ? '予定どおりの日数にもどしました' : `${b.dataset.adj}の予定を、あなたの実績に合わせました（×${r}）`, 2600);
  });
}
