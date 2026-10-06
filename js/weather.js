/* 天気予報（カレンダーに出す）。Open-Meteo（https://open-meteo.com 登録・キー不要・無料）から16日先までの予報を取る。
   場所は畑ごと（field.loc = {name, lat, lon}）。設定で、県・市町村の名前でさがす・今いる場所 から選ぶ。
   取った予報は端末に3時間おいておき、電波がないときは前に取った分を出す。 */
'use strict';

/* 県庁所在地（名前でさがせないときや、すぐ選びたいとき） */
const WX_PREFS = [
  ['北海道（札幌）', 43.06, 141.35], ['青森', 40.82, 140.74], ['岩手（盛岡）', 39.70, 141.15], ['宮城（仙台）', 38.27, 140.87], ['秋田', 39.72, 140.10],
  ['山形', 38.24, 140.36], ['福島', 37.75, 140.47], ['茨城（水戸）', 36.34, 140.45], ['栃木（宇都宮）', 36.57, 139.88], ['群馬（前橋）', 36.39, 139.06],
  ['埼玉（さいたま）', 35.86, 139.65], ['千葉', 35.61, 140.12], ['東京', 35.69, 139.69], ['神奈川（横浜）', 35.45, 139.64], ['新潟', 37.90, 139.02],
  ['富山', 36.70, 137.21], ['石川（金沢）', 36.59, 136.63], ['福井', 36.07, 136.22], ['山梨（甲府）', 35.66, 138.57], ['長野', 36.65, 138.18],
  ['岐阜', 35.39, 136.72], ['静岡', 34.98, 138.38], ['愛知（名古屋）', 35.18, 136.91], ['三重（津）', 34.73, 136.51], ['滋賀（大津）', 35.00, 135.87],
  ['京都', 35.02, 135.76], ['大阪', 34.69, 135.52], ['兵庫（神戸）', 34.69, 135.18], ['奈良', 34.69, 135.83], ['和歌山', 34.23, 135.17],
  ['鳥取', 35.50, 134.24], ['島根（松江）', 35.47, 133.05], ['岡山', 34.66, 133.93], ['広島', 34.40, 132.46], ['山口', 34.19, 131.47],
  ['徳島', 34.07, 134.56], ['香川（高松）', 34.34, 134.04], ['愛媛（松山）', 33.84, 132.77], ['高知', 33.56, 133.53], ['福岡', 33.61, 130.42],
  ['佐賀', 33.25, 130.30], ['長崎', 32.74, 129.87], ['熊本', 32.79, 130.74], ['大分', 33.24, 131.61], ['宮崎', 31.91, 131.42],
  ['鹿児島', 31.56, 130.56], ['沖縄（那覇）', 26.21, 127.68]
];
/* 天気の番号（WMO）→ 絵とことば */
function wxCode(c) {
  if (c === 0) return ['☀️', '晴れ'];
  if (c === 1) return ['🌤️', 'ほぼ晴れ'];
  if (c === 2) return ['⛅', '晴れ時々くもり'];
  if (c === 3) return ['☁️', 'くもり'];
  if (c === 45 || c === 48) return ['🌫️', '霧'];
  if (c >= 51 && c <= 57) return ['🌦️', '霧雨'];
  if (c === 61 || c === 80) return ['🌦️', '小雨'];
  if (c === 63 || c === 81 || c === 66) return ['🌧️', '雨'];
  if (c === 65 || c === 67) return ['🌧️', '強い雨'];
  if (c === 82) return ['⛈️', '激しいにわか雨'];
  if (c === 71 || c === 85) return ['🌨️', '小雪'];
  if (c === 73 || c === 77 || c === 86) return ['🌨️', '雪'];
  if (c === 75) return ['❄️', '大雪'];
  if (c >= 95) return ['⛈️', '雷雨'];
  return ['🌡️', '—'];
}

const WX_TTL = 3 * 3600 * 1000;   // 3時間たったら取り直す
const wxKey = loc => `saien_wx_${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
function wxCached(loc) { try { return JSON.parse(localStorage.getItem(wxKey(loc)) || 'null'); } catch (e) { return null; } }
const wxBusy = new Set();
/* その場所の予報 {at:取った時刻, days:{'2026-05-10':{c, hi, lo, pp}}}。なければ null。古ければ後ろで取り直し、取れたら onNew() */
function wxFor(loc, onNew) {
  if (!loc) return null;
  const c = wxCached(loc);
  if ((!c || Date.now() - c.at > WX_TTL) && !wxBusy.has(wxKey(loc)) && navigator.onLine !== false) {
    wxBusy.add(wxKey(loc));
    wxFetch(loc).then(d => { try { localStorage.setItem(wxKey(loc), JSON.stringify(d)); } catch (e) {} if (onNew) onNew(); })
      .catch(() => {}).finally(() => wxBusy.delete(wxKey(loc)));
  }
  return c;
}
async function wxFetch(loc) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=16`;
  const r = await fetch(u); if (!r.ok) throw new Error('天気予報を取れませんでした');
  const j = await r.json(), d = j.daily || {}, days = {};
  (d.time || []).forEach((t, i) => { days[t] = { c: d.weather_code[i], hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i], pp: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null }; });
  return { at: Date.now(), days };
}
/* 名前でさがす（市町村など）→ [{name, lat, lon}] */
async function wxSearch(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ja&format=json`);
  if (!r.ok) throw new Error('さがせませんでした');
  const j = await r.json();
  return (j.results || []).filter(x => !x.country_code || x.country_code === 'JP').map(x => ({ name: [x.admin1, x.name].filter((v, i, a) => v && a.indexOf(v) === i).join(' '), lat: x.latitude, lon: x.longitude }));
}
const r1 = n => Math.round(n);
/* カレンダーのマスの中（絵と 最高/最低） */
function wxCellHtml(w, ds) {
  const d = w && w.days[ds]; if (!d) return '';
  return `<span class="wx" title="${esc(wxCode(d.c)[1])}">${wxCode(d.c)[0]}<small>${r1(d.hi)}/${r1(d.lo)}</small></span>`;
}
/* えらんだ日の天気（ひとこと付き） */
function wxDayHtml(w, ds, loc) {
  const d = w && w.days[ds]; if (!d) return '';
  const [ic, tx] = wxCode(d.c), tips = [];
  if (d.lo <= 3) tips.push('🥶 霜がおりるかも。苗に不織布やビニールをかけましょう');
  if (d.hi >= 33) tips.push('🥵 とても暑くなります。水やりは朝早くか夕方に');
  if (d.pp != null && d.pp >= 70) tips.push('☔ 雨の予報。水やりはお休みでもよさそう。薬をまくのは別の日に');
  else if (d.c >= 95 || d.c === 65 || d.c === 82) tips.push('⛈ 強い雨・雷。支柱をしっかり、水はけを見ておきましょう');
  return `<div class="card wxday"><div class="wxt"><span class="ic">${ic}</span><div><b>${esc(tx)}</b><small>${esc(loc.name)}の天気予報</small></div>
    <div class="tt"><b class="hi">${r1(d.hi)}℃</b> / <b class="lo">${r1(d.lo)}℃</b>${d.pp != null ? `<small>☂ ${d.pp}%</small>` : ''}</div></div>
    ${tips.map(t => `<div class="tip">${t}</div>`).join('')}</div>`;
}
/* カレンダーの下に出すことわり */
function wxNoteHtml(w, loc) {
  if (!loc) return `<div class="muted small">⚙ 設定で場所を決めると、天気予報（16日先まで）もカレンダーに出ます。</div>`;
  if (!w) return `<div class="muted small">🌤 ${esc(loc.name)}の天気予報を取っています…（電波のある所で）</div>`;
  const h = Math.round((Date.now() - w.at) / 60000);
  return `<div class="muted small">🌤 ${esc(loc.name)}の天気予報（${h < 60 ? h + '分' : Math.round(h / 60) + '時間'}前に取得・天気：Open-Meteo.com）</div>`;
}

/* ===== 場所を選ぶ部品（設定・畑の窓で使う） =====
   get()：いまの場所、set(loc)：選んだとき（null は天気を出さない） */
function locPickerHtml(loc) {
  return `<div class="locnow">${loc ? `📍 <b>${esc(loc.name)}</b> <small>（${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}）</small> <button type="button" class="link" data-loc-off>天気を出さない</button>` : '<span class="muted">まだ決めていません（天気は出ません）</span>'}</div>
    <label class="f">県から選ぶ</label><select data-loc-pref><option value="">― 県を選ぶ ―</option>${WX_PREFS.map((p, i) => `<option value="${i}">${p[0]}</option>`).join('')}</select>
    <label class="f">市町村の名前でさがす</label><div class="row"><input type="text" data-loc-q placeholder="例：つくば・宇都宮・北見" style="flex:1"><button type="button" class="btn" data-loc-find>🔍</button></div>
    <div class="locres" data-loc-res></div>
    <button type="button" class="btn block" data-loc-gps style="margin-top:8px">📍 今いる場所にする</button>
    <p class="muted small">場所（緯度・経度）を天気のサービス Open-Meteo に送って予報を取ります。</p>`;
}
function bindLocPicker(root, get, set) {
  const draw = () => { root.innerHTML = locPickerHtml(get()); bind(); };
  const pick = loc => { set(loc); draw(); };
  const bind = () => {
    const q = root.querySelector('[data-loc-q]'), res = root.querySelector('[data-loc-res]');
    root.querySelector('[data-loc-pref]').onchange = e => { const p = WX_PREFS[e.target.value]; if (p) pick({ name: p[0].replace(/（(.*)）/, ' $1'), lat: p[1], lon: p[2] }); };
    const find = async () => {
      const s = q.value.trim(); if (!s) { q.focus(); return; }
      res.innerHTML = '<span class="muted">さがしています…</span>';
      try {
        const list = await wxSearch(s);
        res.innerHTML = list.length ? list.map((x, i) => `<button type="button" class="chip" data-loc-i="${i}">${esc(x.name)}</button>`).join('') : '<span class="muted">見つかりません。ほかの書き方（漢字など）か、県から選んでください</span>';
        res.querySelectorAll('[data-loc-i]').forEach(b => b.onclick = () => pick(list[+b.dataset.locI]));
      } catch (e) { res.innerHTML = '<span class="muted">さがせませんでした（電波をたしかめてください）</span>'; }
    };
    root.querySelector('[data-loc-find]').onclick = find;
    q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); find(); } };
    root.querySelector('[data-loc-gps]').onclick = () => {
      if (!navigator.geolocation) { toast('この端末では場所を取れません'); return; }
      toast('場所を取っています…');
      navigator.geolocation.getCurrentPosition(p => pick({ name: '今いる場所', lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }),
        () => toast('場所を取れませんでした（位置情報をゆるしてください）'), { timeout: 15000, maximumAge: 600000 });
    };
    const off = root.querySelector('[data-loc-off]'); if (off) off.onclick = () => pick(null);
  };
  draw();
}
