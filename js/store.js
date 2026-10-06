/* 保存（端末のブラウザの中だけ。IndexedDB）とバックアップ。
   data = {
     crops: 育てている野菜 [{id, emoji, name, variety, place, plantedAt, status, memo,
                            plan:育て方の予定に使う野菜の名前（VEG_PLANS の n。なければ ''）, as:'seed'（種から）|'nae'（苗から）,
                            area:広さ㎡（肥料の量に使う）, done:{予定の番号: やった日}, fieldId:どの畑か}],
     logs:  作業の記録 [{id, cropId, type, date, memo, amount, unit, hasPhoto, ts}],
     fields: 畑 [{id, name, area:地域, alt:標高m, cold:寒冷地か, loc:天気予報の場所{name, lat, lon}|null}]（地域は畑ごと。予定の日数の補正に使う）,
     settings: {multi:畑ごとに管理するか, cur:いま見ている畑のid（'all' はすべての畑。開いたときは 'all'）}
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

const SETTINGS0 = { multi: false, cur: '' };
let data = { crops: [], logs: [], fields: [], settings: { ...SETTINGS0 } };
/* 前のかたち（菜園ノートの v1）から読んだときも、足りない項目をうめる */
function normalize(d) {
  d = d || {};
  d.crops = Array.isArray(d.crops) ? d.crops : [];
  d.logs = Array.isArray(d.logs) ? d.logs : [];
  const old = d.settings || {};
  d.settings = { multi: !!old.multi, cur: old.cur || '' };
  d.fields = Array.isArray(d.fields) ? d.fields.filter(f => f && f.id) : [];
  // 前のかたちは地域が1つだけ（settings.area）だったので、それを1つめの畑にする
  if (!d.fields.length) d.fields.push({ id: 'f1', name: 'わたしの畑', area: old.area || 'kanto', alt: Number(old.alt) || 0, cold: !!old.cold });
  d.fields.forEach(f => { f.name = String(f.name || '畑'); f.area = f.area || 'kanto'; f.alt = Math.max(0, Number(f.alt) || 0); f.cold = !!f.cold;
    f.loc = f.loc && isFinite(f.loc.lat) && isFinite(f.loc.lon) ? { name: String(f.loc.name || '畑'), lat: +f.loc.lat, lon: +f.loc.lon } : null; });
  if (d.settings.cur !== 'all' && !d.fields.some(f => f.id === d.settings.cur)) d.settings.cur = 'all';
  d.crops.forEach(c => {
    if (c.plan === undefined) c.plan = guessPlan(c.name);   // 名前から育て方の予定をさがす（トマト→トマト）
    if (c.as !== 'nae') c.as = 'seed';
    if (!(c.area > 0)) c.area = 0;
    if (!c.done || typeof c.done !== 'object') c.done = {};
    if (!d.fields.some(f => f.id === c.fieldId)) c.fieldId = d.fields[0].id;
  });
  return d;
}
/* ===== 畑 =====
   「畑ごとに管理する」が切ってあるときは、畑の分け方を気にせず全部の野菜を出す（地域は1つめの畑のもの） */
const fieldById = id => data.fields.find(f => f.id === id) || null;
const fieldOf = c => (c && fieldById(c.fieldId)) || data.fields[0];
const multiOn = () => !!data.settings.multi;
const curField = () => (multiOn() && fieldById(data.settings.cur)) || data.fields[0];   // 地域・新しい野菜に使う畑
const inView = c => !multiOn() || data.settings.cur === 'all' || c.fieldId === data.settings.cur;   // いま見ている畑の野菜か
async function load() {
  try { data = normalize(await kvGet('data')); data.settings.cur = 'all'; }   // 開いたときは、すべての畑を出す
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
  const blob = new Blob([JSON.stringify({ app: 'saien-note', version: 3, exportedAt: new Date().toISOString(), data, photos })], { type: 'application/json' });
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
