/* 天気予報（カレンダーに出す）。Open-Meteo（https://open-meteo.com 登録・キー不要・無料）から16日先までの予報を取る。
   場所は畑ごと（field.loc = {name, lat, lon}）。設定で、県・市町村の名前でさがす・今いる場所 から選ぶ。
   取った予報は端末に3時間おいておき、電波がないときは前に取った分を出す。 */
'use strict';

/* 県から選ぶ：気象庁の予報の地域（一次細分区域）ごとに、その地域の代表の町。[県, [[地域（町）, 緯度, 経度], …]] */
const WX_PREFS = [
  ['北海道', [['石狩（札幌）', 43.06, 141.35], ['空知（岩見沢）', 43.20, 141.76], ['後志（倶知安）', 42.90, 140.76], ['上川（旭川）', 43.77, 142.37], ['留萌（留萌）', 43.94, 141.64],
    ['宗谷（稚内）', 45.42, 141.67], ['網走（網走）', 44.02, 144.27], ['北見（北見）', 43.80, 143.90], ['紋別（紋別）', 44.36, 143.35], ['根室（根室）', 43.33, 145.58],
    ['釧路（釧路）', 42.98, 144.38], ['十勝（帯広）', 42.92, 143.20], ['胆振（室蘭）', 42.32, 140.97], ['胆振（苫小牧）', 42.63, 141.60], ['日高（浦河）', 42.17, 142.77],
    ['渡島（函館）', 41.77, 140.73], ['檜山（江差）', 41.87, 140.13]]],
  ['青森', [['津軽（青森）', 40.82, 140.74], ['津軽（弘前）', 40.60, 140.46], ['下北（むつ）', 41.29, 141.18], ['三八上北（八戸）', 40.51, 141.49]]],
  ['岩手', [['内陸（盛岡）', 39.70, 141.15], ['内陸南部（一関）', 38.93, 141.13], ['沿岸北部（宮古）', 39.64, 141.95], ['沿岸南部（大船渡）', 39.08, 141.71]]],
  ['宮城', [['東部（仙台）', 38.27, 140.87], ['東部（石巻）', 38.43, 141.30], ['西部（白石）', 38.00, 140.62]]],
  ['秋田', [['沿岸（秋田）', 39.72, 140.10], ['内陸（横手）', 39.31, 140.55], ['内陸（大館）', 40.27, 140.56]]],
  ['山形', [['村山（山形）', 38.24, 140.36], ['置賜（米沢）', 37.92, 140.12], ['庄内（酒田）', 38.91, 139.84], ['最上（新庄）', 38.76, 140.30]]],
  ['福島', [['中通り（福島）', 37.75, 140.47], ['中通り（郡山）', 37.40, 140.38], ['中通り（白河）', 37.13, 140.21], ['浜通り（いわき）', 37.05, 140.89], ['浜通り（相馬）', 37.80, 140.92], ['会津（会津若松）', 37.49, 139.93]]],
  ['茨城', [['北部（水戸）', 36.34, 140.45], ['北部（日立）', 36.60, 140.65], ['南部（土浦）', 36.08, 140.20], ['南部（つくば）', 36.08, 140.08]]],
  ['栃木', [['南部（宇都宮）', 36.57, 139.88], ['南部（小山）', 36.31, 139.80], ['北部（日光）', 36.72, 139.70], ['北部（那須塩原）', 36.96, 140.05]]],
  ['群馬', [['南部（前橋）', 36.39, 139.06], ['南部（高崎）', 36.32, 139.00], ['北部（沼田）', 36.65, 139.04], ['北部（みなかみ）', 36.68, 138.97]]],
  ['埼玉', [['南部（さいたま）', 35.86, 139.65], ['北部（熊谷）', 36.15, 139.39], ['秩父（秩父）', 35.99, 139.09]]],
  ['千葉', [['北西部（千葉）', 35.61, 140.12], ['北東部（銚子）', 35.73, 140.83], ['北東部（成田）', 35.78, 140.32], ['南部（館山）', 34.99, 139.87]]],
  ['東京', [['東京（23区）', 35.69, 139.69], ['多摩（八王子）', 35.66, 139.32], ['伊豆諸島北部（大島）', 34.75, 139.36], ['伊豆諸島南部（八丈島）', 33.11, 139.79], ['小笠原（父島）', 27.09, 142.19]]],
  ['神奈川', [['東部（横浜）', 35.45, 139.64], ['西部（小田原）', 35.26, 139.15], ['西部（厚木）', 35.44, 139.36]]],
  ['新潟', [['下越（新潟）', 37.90, 139.02], ['下越（村上）', 38.22, 139.48], ['中越（長岡）', 37.45, 138.85], ['中越（魚沼）', 37.23, 138.96], ['上越（上越）', 37.15, 138.24], ['佐渡（佐渡）', 38.02, 138.37]]],
  ['富山', [['東部（富山）', 36.70, 137.21], ['西部（高岡）', 36.75, 137.02], ['西部（砺波）', 36.65, 136.96]]],
  ['石川', [['加賀（金沢）', 36.59, 136.63], ['加賀（小松）', 36.41, 136.45], ['能登（七尾）', 37.04, 136.97], ['能登（輪島）', 37.39, 136.90]]],
  ['福井', [['嶺北（福井）', 36.07, 136.22], ['嶺北（大野）', 35.98, 136.49], ['嶺南（敦賀）', 35.65, 136.06], ['嶺南（小浜）', 35.50, 135.75]]],
  ['山梨', [['中・西部（甲府）', 35.66, 138.57], ['東部・富士五湖（富士吉田）', 35.49, 138.81], ['東部・富士五湖（大月）', 35.61, 138.94]]],
  ['長野', [['北部（長野）', 36.65, 138.18], ['北部（上田）', 36.40, 138.25], ['中部（松本）', 36.24, 137.97], ['中部（諏訪）', 36.04, 138.11], ['中部（佐久）', 36.25, 138.48], ['南部（飯田）', 35.51, 137.82], ['南部（伊那）', 35.83, 137.95]]],
  ['岐阜', [['美濃（岐阜）', 35.39, 136.72], ['美濃（大垣）', 35.36, 136.62], ['美濃（多治見）', 35.33, 137.13], ['飛騨（高山）', 36.15, 137.25]]],
  ['静岡', [['中部（静岡）', 34.98, 138.38], ['東部（三島）', 35.12, 138.92], ['東部（富士）', 35.16, 138.68], ['伊豆（伊東）', 34.97, 139.10], ['伊豆（下田）', 34.68, 138.95], ['西部（浜松）', 34.71, 137.73]]],
  ['愛知', [['西部（名古屋）', 35.18, 136.91], ['西部（一宮）', 35.30, 136.80], ['東部（豊橋）', 34.77, 137.39], ['東部（豊田）', 35.08, 137.16]]],
  ['三重', [['北中部（津）', 34.73, 136.51], ['北中部（四日市）', 34.97, 136.62], ['北中部（伊賀）', 34.77, 136.13], ['南部（尾鷲）', 34.07, 136.19], ['南部（熊野）', 33.89, 136.10]]],
  ['滋賀', [['南部（大津）', 35.00, 135.87], ['南部（甲賀）', 34.97, 136.17], ['北部（彦根）', 35.27, 136.26], ['北部（長浜）', 35.38, 136.27]]],
  ['京都', [['南部（京都）', 35.02, 135.76], ['南部（亀岡）', 35.01, 135.57], ['北部（舞鶴）', 35.47, 135.39], ['北部（福知山）', 35.30, 135.13], ['北部（京丹後）', 35.62, 135.06]]],
  ['大阪', [['大阪（大阪）', 34.69, 135.52], ['大阪（堺）', 34.57, 135.48], ['大阪（枚方）', 34.81, 135.65]]],
  ['兵庫', [['南部（神戸）', 34.69, 135.18], ['南部（姫路）', 34.82, 134.69], ['南部（三田）', 34.89, 135.23], ['南部（洲本・淡路）', 34.34, 134.89], ['北部（豊岡）', 35.54, 134.82],
    ['北部（香美）', 35.63, 134.63], ['北部（新温泉）', 35.62, 134.45], ['北部（養父）', 35.40, 134.77], ['北部（朝来）', 35.34, 134.85], ['北部（丹波篠山）', 35.08, 135.22]]],
  ['奈良', [['北部（奈良）', 34.69, 135.83], ['北部（橿原）', 34.51, 135.79], ['南部（五條）', 34.35, 135.69], ['南部（十津川）', 33.99, 135.79]]],
  ['和歌山', [['北部（和歌山）', 34.23, 135.17], ['北部（橋本）', 34.31, 135.61], ['南部（田辺）', 33.73, 135.38], ['南部（新宮）', 33.72, 135.99]]],
  ['鳥取', [['東部（鳥取）', 35.50, 134.24], ['中・西部（倉吉）', 35.43, 133.83], ['中・西部（米子）', 35.43, 133.33]]],
  ['島根', [['東部（松江）', 35.47, 133.05], ['東部（出雲）', 35.37, 132.75], ['西部（浜田）', 34.90, 132.08], ['西部（益田）', 34.68, 131.84], ['隠岐（隠岐の島）', 36.20, 133.32]]],
  ['岡山', [['南部（岡山）', 34.66, 133.93], ['南部（倉敷）', 34.59, 133.77], ['北部（津山）', 35.07, 134.00], ['北部（真庭）', 35.08, 133.75]]],
  ['広島', [['南部（広島）', 34.40, 132.46], ['南部（福山）', 34.49, 133.36], ['南部（東広島）', 34.43, 132.74], ['北部（三次）', 34.81, 132.85], ['北部（庄原）', 34.86, 133.02]]],
  ['山口', [['西部（下関）', 33.96, 130.94], ['中部（山口）', 34.19, 131.47], ['東部（岩国）', 34.17, 132.22], ['北部（萩）', 34.41, 131.40]]],
  ['徳島', [['北部（徳島）', 34.07, 134.56], ['北部（三好）', 34.03, 133.81], ['南部（阿南）', 33.92, 134.66], ['南部（美波）', 33.73, 134.54]]],
  ['香川', [['香川（高松）', 34.34, 134.04], ['香川（丸亀）', 34.29, 133.80], ['香川（観音寺）', 34.13, 133.66]]],
  ['愛媛', [['中予（松山）', 33.84, 132.77], ['東予（新居浜）', 33.96, 133.28], ['東予（今治）', 34.07, 133.00], ['南予（宇和島）', 33.22, 132.56], ['南予（大洲）', 33.51, 132.54]]],
  ['高知', [['中部（高知）', 33.56, 133.53], ['東部（安芸）', 33.50, 133.90], ['東部（室戸）', 33.29, 134.15], ['西部（四万十）', 32.99, 132.93], ['西部（宿毛）', 32.94, 132.73]]],
  ['福岡', [['福岡（福岡）', 33.59, 130.40], ['北九州（北九州）', 33.88, 130.88], ['筑豊（飯塚）', 33.65, 130.69], ['筑後（久留米）', 33.32, 130.51], ['筑後（大牟田）', 33.03, 130.45]]],
  ['佐賀', [['南部（佐賀）', 33.25, 130.30], ['南部（鹿島）', 33.10, 130.10], ['北部（唐津）', 33.45, 129.97], ['北部（伊万里）', 33.26, 129.88]]],
  ['長崎', [['南部（長崎）', 32.74, 129.87], ['南部（諫早）', 32.84, 130.05], ['南部（島原）', 32.79, 130.37], ['北部（佐世保）', 33.18, 129.72], ['壱岐・対馬（対馬）', 34.20, 129.29], ['壱岐・対馬（壱岐）', 33.75, 129.69], ['五島（五島）', 32.70, 128.84]]],
  ['熊本', [['熊本（熊本）', 32.79, 130.74], ['熊本（菊池）', 32.98, 130.81], ['阿蘇（阿蘇）', 32.95, 131.12], ['天草・芦北（天草）', 32.46, 130.19], ['天草・芦北（水俣）', 32.21, 130.41], ['球磨（人吉）', 32.21, 130.76]]],
  ['大分', [['中部（大分）', 33.24, 131.61], ['北部（中津）', 33.60, 131.19], ['西部（日田）', 33.32, 130.94], ['南部（佐伯）', 32.96, 131.90], ['南部（豊後大野）', 32.98, 131.58]]],
  ['宮崎', [['南部平野部（宮崎）', 31.91, 131.42], ['南部平野部（日南）', 31.60, 131.38], ['北部平野部（延岡）', 32.58, 131.66], ['北部平野部（日向）', 32.42, 131.62], ['南部山沿い（都城）', 31.72, 131.06], ['南部山沿い（小林）', 31.99, 130.97], ['北部山沿い（高千穂）', 32.71, 131.31]]],
  ['鹿児島', [['薩摩（鹿児島）', 31.56, 130.56], ['薩摩（薩摩川内）', 31.81, 130.30], ['薩摩（出水）', 32.09, 130.35], ['薩摩（南九州）', 31.38, 130.44], ['大隅（鹿屋）', 31.38, 130.85], ['大隅（霧島）', 31.74, 130.76],
    ['種子島・屋久島（種子島）', 30.73, 131.00], ['種子島・屋久島（屋久島）', 30.37, 130.65], ['奄美（奄美）', 28.38, 129.49], ['奄美（徳之島）', 27.73, 128.98]]],
  ['沖縄', [['本島中南部（那覇）', 26.21, 127.68], ['本島中南部（沖縄市）', 26.33, 127.80], ['本島北部（名護）', 26.59, 127.98], ['久米島（久米島）', 26.34, 126.80], ['大東島（南大東）', 25.85, 131.23],
    ['宮古島（宮古島）', 24.81, 125.28], ['八重山（石垣島）', 24.34, 124.16], ['八重山（与那国）', 24.47, 123.00]]],
];
function wxPrefName(pref, area) { const r = area.replace(/（(.*)）/, ' $1').replace(/^(\S+) \1$/, '$1'); return r.startsWith(pref) ? r : `${pref} ${r}`; }   // 「兵庫 北部 豊岡」「大阪」
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
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=Asia%2FTokyo&forecast_days=16&past_days=1`;
  const r = await fetch(u); if (!r.ok) throw new Error('天気予報を取れませんでした');
  const j = await r.json(), d = j.daily || {}, days = {};
  (d.time || []).forEach((t, i) => { days[t] = { c: d.weather_code[i], hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i], pp: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
    r: d.precipitation_sum ? d.precipitation_sum[i] : null, wd: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null }; });   // r：雨の量mm、wd：いちばん強い風 km/h（きのうの分もある）
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
/* 地図の座標を読みとる：「35.3858049, 134.5715248」、全角やスペース区切り、
   Googleマップのリンク（…/@35.38,134.57,17z・?q=35.38,134.57・!3d35.38!4d134.57）にも対応。読めなければ null */
function parseLatLon(raw) {
  const s = String(raw || '').replace(/[０-９．，－]/g, c => ({ '．': '.', '，': ',', '－': '-' })[c] || String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).trim();
  let m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) || s.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,、\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || (lat === 0 && lon === 0)) return null;
  return { lat: Math.round(lat * 10000) / 10000, lon: Math.round(lon * 10000) / 10000 };
}
function locPickerHtml(loc) {
  return `<div class="locnow">${loc ? `📍 <b>${esc(loc.name)}</b> <small>（${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}）</small> <button type="button" class="link" data-loc-off>天気を出さない</button>` : '<span class="muted">まだ決めていません（天気は出ません）</span>'}</div>
    <label class="f">県と地域から選ぶ（気象庁の予報の分け方）</label><select data-loc-pref><option value="">― 県と地域を選ぶ ―</option>${WX_PREFS.map(([pf, list], i) => `<optgroup label="${pf}">${list.map((a, j) => `<option value="${i}-${j}">${pf}・${a[0]}</option>`).join('')}</optgroup>`).join('')}</select>
    <label class="f">市町村の名前でさがす</label><div class="row"><input type="text" data-loc-q placeholder="例：つくば・宇都宮・北見" style="flex:1"><button type="button" class="btn" data-loc-find>🔍</button></div>
    <div class="locres" data-loc-res></div>
    <label class="f">地図の座標（緯度, 経度）で決める</label>
    <div class="row"><input type="text" data-loc-ll inputmode="decimal" placeholder="例：35.3858049, 134.5715248" style="flex:1"><button type="button" class="btn" data-loc-llset>決める</button></div>
    <input type="text" data-loc-llname placeholder="地点の名前（なくてもよい。例：家の畑）" style="margin-top:6px">
    <p class="muted small" style="margin:4px 0 0">Googleマップで畑の所を長押しすると、上に「35.38…, 134.57…」と座標が出ます。それをコピーして貼ってください（地図のリンクを貼っても読みとります）。</p>
    <button type="button" class="btn block" data-loc-gps style="margin-top:8px">📍 今いる場所にする</button>
    <p class="muted small">場所（緯度・経度）を天気のサービス Open-Meteo に送って予報を取ります。</p>`;
}
function bindLocPicker(root, get, set) {
  const draw = () => { root.innerHTML = locPickerHtml(get()); bind(); };
  const pick = loc => { set(loc); draw(); };
  const bind = () => {
    const q = root.querySelector('[data-loc-q]'), res = root.querySelector('[data-loc-res]');
    root.querySelector('[data-loc-pref]').onchange = e => {
      const [i, j] = e.target.value.split('-').map(Number), g = WX_PREFS[i], a = g && g[1][j];
      if (a) pick({ name: wxPrefName(g[0], a[0]), lat: a[1], lon: a[2] });
    };
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
    root.querySelector('[data-loc-llset]').onclick = () => {
      const ll = parseLatLon(root.querySelector('[data-loc-ll]').value);
      if (!ll) { toast('座標を読みとれませんでした。「35.3858, 134.5715」のように入れてください'); root.querySelector('[data-loc-ll]').focus(); return; }
      const nm = root.querySelector('[data-loc-llname]').value.trim();
      pick({ name: nm || `地図の地点（${ll.lat.toFixed(3)}, ${ll.lon.toFixed(3)}）`, lat: ll.lat, lon: ll.lon });
    };
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
