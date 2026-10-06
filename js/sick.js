/* 病害虫の注意報。育てている野菜の「出やすい病気・害虫」（VEG_CARE の k）のうち、
   いまの時期（月）と育ち具合（grow.js の段階）で出やすいものを出す。
   月は関東・東海・近畿のふつうの目安。地域で早い・おそいがあるので、その畑の地域の w（週）だけずらして見る。 */
'use strict';

/* m：出やすい月、p：とくに多い月（注意報）、w：天気など気をつけるとき、
   st：その育ち具合のときだけ（young＝まいて・植えて間もない、flower＝花が咲いてから、fruit＝実がなってから） */
const SICK_SEASON = {
  udonko:      { m: [5, 6, 7, 8, 9, 10], p: [6, 9],    w: '晴れて乾いた日が続き、朝晩が涼しいとき' },
  beto:        { m: [4, 5, 6, 7, 9, 10, 11], p: [6, 10], w: '雨が続いて、葉がぬれたままのとき' },
  eki:         { m: [5, 6, 7, 9],    p: [6, 7],        w: '梅雨など雨が続くとき。一気に広がります' },
  haiiro:      { m: [3, 4, 5, 6, 11, 12], p: [4, 5],   w: '涼しくてじめじめするとき', st: 'flower' },
  tanso:       { m: [6, 7, 8, 9],    p: [7],           w: '雨のはねかえりが多いとき' },
  kappan:      { m: [6, 7, 8, 9],    p: [7, 8],        w: '蒸し暑いとき' },
  nanpu:       { m: [7, 8, 9, 10],   p: [8, 9],        w: '暑い時期の大雨・台風のあと（傷口から入ります）' },
  nekobu:      { m: [4, 5, 6, 9, 10], p: [9, 10],      w: '土が湿って、地温が20℃前後のとき' },
  tsuruware:   { m: [6, 7, 8],       p: [7],           w: '暑くなって、実がなりはじめたころ' },
  aogare:      { m: [6, 7, 8, 9],    p: [7, 8],        w: '真夏の高温と、大雨のあと' },
  tachigare:   { m: [3, 4, 5, 6, 9, 10], p: [4, 5, 9], w: '芽が出たばかりのころ、土がいつも湿っているとき', st: 'young' },
  sabi:        { m: [4, 5, 6, 9, 10, 11], p: [5, 10],  w: '春と秋の雨が多いとき' },
  souka:       { m: [5, 6, 7],       p: [6],           w: '土が乾いて、アルカリに寄っているとき' },
  mosaic:      { m: [4, 5, 6, 7, 9, 10], p: [5],       w: 'アブラムシが多いとき（アブラムシがうつします）' },
  shirikusare: { m: [6, 7, 8],       p: [7],           w: '雨と日照りがくり返して、水やりがむらになるとき', st: 'fruit' },
  abura:       { m: [4, 5, 6, 7, 9, 10, 11], p: [5, 10], w: 'あたたかくて、窒素肥料が多いとき' },
  aomushi:     { m: [4, 5, 6, 9, 10, 11], p: [5, 9, 10], w: 'モンシロチョウ・コナガが飛んでいるとき' },
  yotou:       { m: [4, 5, 6, 9, 10], p: [5, 9],       w: '夜に葉が食べられ、昼は土の中にかくれています' },
  nekiri:      { m: [4, 5, 6, 9, 10], p: [5],          w: '植えて間もない苗が、根元で切られます', st: 'young' },
  konajirami:  { m: [6, 7, 8, 9, 10], p: [8, 9],       w: '暑くて乾いたとき' },
  hadani:      { m: [6, 7, 8, 9],    p: [7, 8],        w: '暑くて、雨が少ないとき（葉の裏）' },
  hamoguri:    { m: [4, 5, 6, 9, 10], p: [5, 6],       w: '葉に白い線の模様が出てきたら' },
  azamiuma:    { m: [5, 6, 7, 8, 9], p: [6, 7, 8],     w: '暑くて乾いたとき' },
  uriha:       { m: [4, 5, 6, 7],    p: [5],           w: '植えたばかりの苗の葉が、まるく食べられます' },
  kamemushi:   { m: [7, 8, 9],       p: [8],           w: 'さやや実がふくらむころ', st: 'fruit' },
  tentou:      { m: [5, 6, 7],       p: [6],           w: '葉の裏に黄色い卵・幼虫がいないか' },
  awanomeiga:  { m: [6, 7, 8],       p: [7],           w: '雄穂（てっぺんの穂）が出たころ', st: 'flower' },
  senchu:      { m: [6, 7, 8, 9],    p: [7, 8],        w: '暑い時期。同じ畑で続けて作ったとき' },
};

/* その日のその畑で、何月とみるか（寒い地域はおそく、暖かい地域は早くずらす） */
function sickMonth(f, t = today()) { const w = areaDef(f).w || 0; return +addDays(t, -w * 7).slice(5, 7); }
/* 育ち具合の条件に合うか */
function sickStageOk(c, g, st) {
  if (!st) return true;
  const no = { before: -1, seed: 0, nae: 1, sprout: 1, grow: 2, flower: 3, harvest: 4, end: 5 }[g.st];
  if (st === 'young') return no <= 1 || daysBetween(c.plantedAt, today()) <= 25;
  if (st === 'flower') return no >= 3;
  if (st === 'fruit') return no >= 4 || (no === 3 && growShape(c) === 'fruit');
  return true;
}
/* その野菜の、いま気をつけたい病気・害虫 [{k, d:VEG_SICK, s:SICK_SEASON, peak}]（多い時期が先） */
function sickNow(c, t = today()) {
  if (!c || c.status === 'done' || !c.plan) return [];
  const g = growStage(c, t); if (!g || g.st === 'before' || g.st === 'end') return [];
  const mo = sickMonth(fieldOf(c), t), out = [];
  careOf(planByName(c.plan)).k.forEach(k => {
    const s = SICK_SEASON[k], d = VEG_SICK[k];
    if (!s || !d || !s.m.includes(mo) || !sickStageOk(c, g, s.st)) return;
    out.push({ k, d, s, peak: s.p.includes(mo) });
  });
  return out.sort((a, b) => b.peak - a.peak);
}
/* 畑ぜんたいの注意報：病気・害虫ごとに、どの野菜か [{k, d, s, peak, crops:[c]}] */
function sickAlerts(crops, t = today()) {
  const m = new Map();
  crops.forEach(c => sickNow(c, t).forEach(x => {
    const a = m.get(x.k) || Object.assign({ crops: [] }, x, { peak: false });
    a.peak = a.peak || x.peak; a.crops.push(c); m.set(x.k, a);
  }));
  return [...m.values()].sort((a, b) => b.peak - a.peak || b.crops.length - a.crops.length);
}
const SICK_IS_BUG = k => ['abura', 'aomushi', 'yotou', 'nekiri', 'konajirami', 'hadani', 'hamoguri', 'azamiuma', 'uriha', 'kamemushi', 'tentou', 'awanomeiga', 'senchu'].includes(k);
/* 1つぶんの中身（開け閉め） */
function sickItemHtml(a, withCrops) {
  return `<details class="sk ${a.peak ? 'peak' : ''}"><summary><span class="lv">${a.peak ? '注意報' : '注意'}</span><b>${SICK_IS_BUG(a.k) ? '🐛' : '🦠'} ${esc(a.d.n)}</b>
      ${withCrops ? `<small>${a.crops.map(c => c.emoji + esc(c.name)).join('・')}</small>` : `<small>${a.peak ? 'いまがいちばん多い時期' : '出やすい時期'}</small>`}</summary>
    <div class="skb"><div><span>気をつける</span>${esc(a.s.w)}</div><div><span>見分け方</span>${esc(a.d.sign)}</div><div><span>手当て</span>${esc(a.d.care)}</div><div><span>薬の例</span>${esc(a.d.med)}</div></div></details>`;
}
/* 畑の一覧の上の注意報 */
function sickBoardHtml(crops, first) {
  const al = sickAlerts(crops); if (!al.length) return '';
  const peak = al.filter(a => a.peak).length, show = al.slice(0, 5);
  return `<h2${first ? ' class="first"' : ''}>⚠️ 病気・害虫の注意報<small>${peak ? `いま多い時期 ${peak}つ・` : ''}${today().slice(5, 7).replace(/^0/, '')}月</small></h2>
    <div class="card skboard">${show.map(a => sickItemHtml(a, true)).join('')}
      ${al.length > show.length ? `<details class="sk more"><summary><small>ほか ${al.length - show.length}つ</small></summary>${al.slice(5).map(a => sickItemHtml(a, true)).join('')}</details>` : ''}
      <div class="muted small">押すと見分け方と手当て。毎朝、葉の裏まで見ると早く気づけます。時期は${esc(areaText(curField()))}の目安です。</div></div>`;
}
