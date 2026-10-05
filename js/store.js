/* 保存（端末のブラウザの中だけ。IndexedDB）とバックアップ。
   data = {
     crops: 育てている野菜 [{id, emoji, name, variety, place, plantedAt, status, memo,
                            plan:育て方の予定に使う野菜の名前（VEG_PLANS の n。なければ ''）, as:'seed'（種から）|'nae'（苗から）,
                            area:広さ㎡（肥料の量に使う）, done:{予定の番号: やった日}}],
     logs:  作業の記録 [{id, cropId, type, date, memo, amount, unit, hasPhoto, ts}],
     settings: {area:地域, alt:標高m, cold:寒冷地か}
   }
   写真は大きいので data とは別に 'photo:記録のid' で入れている。 */
'use strict';
const DB_NAME = 'saien-note', STORE = 'kv';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function kvGet(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvSet(key, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite');
    if (val === undefined) t.objectStore(STORE).delete(key); else t.objectStore(STORE).put(val, key);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}

const SETTINGS0 = { area: 'kanto', alt: 0, cold: false };
let data = { crops: [], logs: [], settings: { ...SETTINGS0 } };
/* 前のかたち（菜園ノートの v1）から読んだときも、足りない項目をうめる */
function normalize(d) {
  d = d || {};
  d.crops = Array.isArray(d.crops) ? d.crops : [];
  d.logs = Array.isArray(d.logs) ? d.logs : [];
  d.settings = Object.assign({ ...SETTINGS0 }, d.settings || {});
  d.crops.forEach(c => {
    if (c.plan === undefined) c.plan = guessPlan(c.name);   // 名前から育て方の予定をさがす（トマト→トマト）
    if (c.as !== 'nae') c.as = 'seed';
    if (!(c.area > 0)) c.area = 0;
    if (!c.done || typeof c.done !== 'object') c.done = {};
  });
  return d;
}
async function load() {
  try { data = normalize(await kvGet('data')); }
  catch (e) { data = normalize(null); toast('データを読み込めませんでした'); }
}
async function save() {
  try { await kvSet('data', data); }
  catch (e) { alert('保存に失敗しました：' + e.message); }
}
const photoCache = new Map();
async function getPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const v = await kvGet('photo:' + id); photoCache.set(id, v); return v;
}
async function setPhoto(id, url) { photoCache.set(id, url); await kvSet('photo:' + id, url); }
async function delPhoto(id) { photoCache.delete(id); await kvSet('photo:' + id, undefined); }

/* ===== バックアップ（写真ごと JSON に） ===== */
async function exportData() {
  const photos = {};
  for (const l of data.logs) if (l.hasPhoto) { const p = await getPhoto(l.id); if (p) photos[l.id] = p; }
  const blob = new Blob([JSON.stringify({ app: 'saien-note', version: 2, exportedAt: new Date().toISOString(), data, photos })], { type: 'application/json' });
  const name = `菜園ノート_${today()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function importData(file) {
  const j = JSON.parse(await file.text());
  if (j.app !== 'saien-note' || !j.data) throw new Error('菜園ノートのバックアップではありません');
  if (!confirm(`野菜${(j.data.crops || []).length}件・記録${(j.data.logs || []).length}件で、今のデータを置き換えます。よろしいですか？`)) return false;
  for (const l of data.logs) if (l.hasPhoto) await delPhoto(l.id);
  photoCache.clear();
  data = normalize(j.data);
  for (const [id, url] of Object.entries(j.photos || {})) await setPhoto(id, url);
  await save();
  return true;
}
