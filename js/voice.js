/* 🎤 声で記録。「トマトとキュウリに水やり」「キュウリを5本収穫」「きのうナスに追肥」のように話すと、
   野菜・作業・量・日を読みとって記録にする（書いても同じ）。読みとった中身をたしかめてから記録する。
   声を文字にするのはブラウザの音声認識（Chrome・Safari）。使えないときは書いて入れる */
'use strict';
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const KANJI_NUM = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
/* 漢数字（二十五・百二十）を数字に */
function kanjiToNum(s) {
  if (!/[〇一二三四五六七八九十百千]/.test(s)) return s;
  return s.replace(/[〇一二三四五六七八九十百千]+/g, m => {
    let n = 0, cur = 0;
    for (const ch of m) {
      if (ch in KANJI_NUM) cur = cur * 10 + KANJI_NUM[ch];
      else { const u = ch === '十' ? 10 : ch === '百' ? 100 : 1000; n += (cur || 1) * u; cur = 0; }
    }
    return String(n + cur);
  });
}
const VOICE_TYPES = [
  ['harvest', /収穫|とった|取った|採った|とれた|取れた|採れた|穫れた|もいだ/],
  ['fertilize', /追肥|肥料|液肥/],
  ['spray', /消毒|農薬|薬を|虫/],
  ['weed', /草取り|草とり|除草|草を|間引|支柱|芽かき|わき芽|脇芽|摘芯|手入れ|土寄せ|誘引/],
  ['water', /水やり|水を|水まき|みずやり|水/],
  ['observe', /咲いた|芽が出|芽がで|観察|見た|ついた|なった|大きく/]
];
const UNIT_WORDS = [['kg', /キロ(?:グラム)?|kg/i], ['g', /グラム|g/], ['個', /個|こ/], ['本', /本/], ['株', /株/], ['束', /束/]];
/* 読みとる：{date, items:[{c, type, amount, unit}], text} */
function voiceParse(raw, t = today()) {
  const text = kanjiToNum(String(raw || '').replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).trim());
  let date = t;
  if (/おととい|一昨日/.test(raw)) date = addDays(t, -2);
  else if (/きのう|昨日/.test(raw)) date = addDays(t, -1);
  const md = text.match(/(\d{1,2})月(\d{1,2})日/); if (md) { const y = +t.slice(0, 4), d = `${y}-${String(md[1]).padStart(2, '0')}-${String(md[2]).padStart(2, '0')}`; date = d > t ? `${y - 1}${d.slice(4)}` : d; }
  // 野菜：名前・品種・予定の野菜の名前で、長いものから
  const act = activeCrops();
  let cs = [];
  if (/みんな|全部|ぜんぶ|全体|畑じゅう/.test(text)) cs = act.slice();
  else {
    const names = [];
    act.forEach(c => [c.name, c.variety, c.plan].filter(Boolean).forEach(n => names.push([n, c])));
    names.sort((a, b) => b[0].length - a[0].length);
    let rest = text;
    const pos = new Map();
    names.forEach(([n, c]) => { const i = rest.indexOf(n); if (i >= 0) { if (!cs.includes(c)) { cs.push(c); pos.set(c, i); } rest = rest.split(n).join('　'.repeat(n.length)); } });
    cs.sort((a, b) => pos.get(a) - pos.get(b));   // 話した順
  }
  const type = (VOICE_TYPES.find(([, re]) => re.test(text)) || ['observe'])[0];
  let amount = '', unit = '個';
  if (type === 'harvest') {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(キロ(?:グラム)?|kg|グラム|g|個|こ|本|株|束)/i);
    if (m) { amount = Number(m[1]); unit = (UNIT_WORDS.find(([, re]) => re.test(m[2])) || ['個'])[0]; }
  }
  return { date, text: String(raw || '').trim(), items: cs.map(c => ({ c, type, amount, unit })) };
}
let voiceRec = null;
function openVoice() {
  const act = activeCrops();
  if (!act.length) { toast('先に野菜を登録してください'); return; }
  const s = openModal(`<h3>🎤 声で記録</h3>
    <p class="muted" style="margin-top:0">例：「トマトとキュウリに水やり」「キュウリを5本収穫」「きのうナスに追肥」「みんなに水やり」</p>
    ${SpeechRec ? '<button class="btn primary block vbig" id="vMic">🎤 押して話す</button>' : '<div class="tip">この端末のブラウザでは声を文字にできません。下に書いて入れてください（スマホのキーボードのマイクも使えます）</div>'}
    <label class="f">話したこと（書いても入れられます）</label>
    <div class="row"><input type="text" id="vText" placeholder="例：トマトに水やり" style="flex:1"><button class="btn" id="vRead">読みとる</button></div>
    <div id="vOut"></div>
    <div class="actions"><button class="btn" id="vCancel">やめる</button><button class="btn primary" id="vSave" disabled>記録する</button></div>`);
  let parsed = null;
  const show = () => {
    const txt = $('#vText').value.trim(); if (!txt) { $('#vOut').innerHTML = ''; $('#vSave').disabled = true; return; }
    parsed = voiceParse(txt);
    const t = TYPES[parsed.items[0] ? parsed.items[0].type : 'observe'];
    $('#vOut').innerHTML = parsed.items.length ? `<div class="card vres"><div class="muted small">${fmtDateLong(parsed.date)}・この内容で記録します（外したいものは押して ✓ を外す）</div>
        ${parsed.items.map((it, i) => `<label class="vit"><input type="checkbox" data-vi="${i}" checked><span>${it.c.emoji} <b>${esc(it.c.name)}</b>：${TYPES[it.type].icon}${TYPES[it.type].label}${it.amount ? ` <b>${it.amount}${esc(it.unit)}</b>` : ''}</span></label>`).join('')}</div>`
      : `<div class="tip warn">どの野菜か分かりませんでした。野菜の名前（${act.slice(0, 4).map(c => esc(c.name)).join('・')}など）を入れて話してください。</div>`;
    $('#vSave').disabled = !parsed.items.length;
  };
  $('#vRead').onclick = show;
  $('#vText').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); show(); } };
  $('#vCancel').onclick = () => { try { voiceRec && voiceRec.abort(); } catch (e) {} closeModal(); };
  if ($('#vMic')) $('#vMic').onclick = () => {
    try {
      voiceRec = new SpeechRec(); voiceRec.lang = 'ja-JP'; voiceRec.interimResults = true; voiceRec.maxAlternatives = 1;
      $('#vMic').textContent = '👂 聞いています…'; $('#vMic').disabled = true;
      voiceRec.onresult = e => { $('#vText').value = [...e.results].map(r => r[0].transcript).join(''); if (e.results[e.results.length - 1].isFinal) show(); };
      voiceRec.onerror = e => toast(e.error === 'not-allowed' ? 'マイクを使えません（マイクをゆるしてください）' : '聞きとれませんでした。もう一度どうぞ');
      voiceRec.onend = () => { if ($('#vMic')) { $('#vMic').textContent = '🎤 押して話す'; $('#vMic').disabled = false; } };
      voiceRec.start();
    } catch (e) { toast('声を使えませんでした。書いて入れてください'); }
  };
  $('#vSave').onclick = async () => {
    if (!parsed) return;
    const keep = parsed.items.filter((it, i) => { const cb = s.querySelector(`[data-vi="${i}"]`); return !cb || cb.checked; });
    keep.forEach((it, k) => {
      data.logs.push({ id: uid(), cropId: it.c.id, type: it.type, date: parsed.date, memo: parsed.text, amount: it.type === 'harvest' && it.amount !== '' ? it.amount : '', unit: it.unit, ts: Date.now() + k });
      if (it.type === 'harvest' && it.c.status === 'growing') it.c.status = 'harvesting';
    });
    await save(); closeModal(); render();
    toast(`🎤 ${keep.length}件を記録しました`);
  };
}
