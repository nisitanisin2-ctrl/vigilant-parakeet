/* 菜園ノートのテスト。  NODE_PATH=（playwright のある所） node tests/run.js
   その場で小さなサーバーを立てて（IndexedDB は file:// では使えないため）、Chromium で動かして確かめる。
   「今日」は APP_TODAY で 2026-05-10 に決めている。 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (process.env.V) console.log('・', name); if (ok) pass++; else { fail++; console.log(`✗ ${name}\n   出た : ${JSON.stringify(got)}\n   期待 : ${JSON.stringify(want)}`); }
}
const srv = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith(path.sep) || f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
srv.listen(0, async () => {
  const URL = `http://localhost:${srv.address().port}/index.html?nosw`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept());
  const VER = fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8').match(/APP_VERSION = '(v\d+)'/)[1];
  // 「新しくなりました」のお知らせは、たしかめるところ以外では出さない（見たことにしておく）
  await page.addInitScript(v => { window.APP_TODAY = '2026-05-10'; try { if (!sessionStorage.getItem('keepSeen')) localStorage.setItem('saien_seen_ver', v); } catch (e) {} }, VER);
  const w = ms => page.waitForTimeout(ms);
  // 天気予報（Open-Meteo）はテストではにせの答えを返す
  let wxCalls = 0;
  await page.route('https://api.open-meteo.com/**', r => {
    wxCalls++;
    const time = [...Array(16)].map((_, i) => { const d = new Date(2026, 4, 10 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ daily: { time, weather_code: time.map((_, i) => [0, 3, 63][i % 3]), temperature_2m_max: time.map((_, i) => 25 + (i % 2)), temperature_2m_min: time.map((_, i) => i === 2 ? 2 : 14), precipitation_probability_max: time.map((_, i) => [10, 30, 80][i % 3]), precipitation_sum: time.map((_, i) => [0, 2, 35][i % 3]), wind_speed_10m_max: time.map((_, i) => i === 1 ? 45 : 12) } }) });
  });
  await page.route('https://geocoding-api.open-meteo.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ name: 'つくば市', admin1: '茨城県', latitude: 36.08, longitude: 140.08, country_code: 'JP' }, { name: 'Tsukuba', latitude: 1, longitude: 1, country_code: 'XX' }] }) }));
  const open = async () => { await page.goto(URL); await page.waitForFunction(() => window.APP_READY); };
  try {
    // ── 前の菜園ノート（v1）のデータを引き継ぐ ──
    await open();
    await page.evaluate(async () => { await kvSet('data', { settings: { area: 'tohoku', alt: 300, cold: false }, crops: [{ id: 'old1', emoji: '🍒', name: 'ミニトマト', variety: '', place: '', plantedAt: '2026-04-01', status: 'growing', memo: '' }], logs: [{ id: 'l1', cropId: 'old1', type: 'water', date: '2026-05-09', memo: '', ts: 1 }] }); });
    await open();
    check('前のデータを読める・名前から予定の野菜をさがす（ミニトマト→ミニトマト）', await page.evaluate(() => { const c = data.crops[0]; return [c.name, c.plan, c.as, JSON.stringify(c.done), data.logs.length, data.fields.length, data.fields[0].area, data.fields[0].alt, c.fieldId === data.fields[0].id, data.settings.multi].join('/'); }), 'ミニトマト/ミニトマト/seed/{}/1/1/tohoku/300/true/false');
    await page.evaluate(async () => { await kvSet('data', undefined); }); await open();

    // ── はじめて ──
    check('はじめは使い方の3つの手順', await page.evaluate(() => document.querySelectorAll('.steps > div').length + '/' + document.querySelector('.steps').textContent.includes('植えた野菜')), '5/true');
    check('下のタブ5つ', await page.evaluate(() => [...document.querySelectorAll('nav.tabs button')].map(b => b.textContent.trim()).join(',')), '🌱畑,📅予定,📝記録,📖育て方,⚙️設定');

    // ── 野菜を登録（苗から） ──
    await page.click('#fab'); await w(150);
    check('登録の窓：61種類の野菜＋その他', await page.evaluate(() => document.querySelectorAll('#cVeg button').length), 62);
    await page.fill('#cVegQ', 'トマ'); await w(50);
    check('登録の窓で野菜をさがす', await page.evaluate(() => [...document.querySelectorAll('#cVeg button')].filter(b => !b.hidden).map(b => b.textContent).join(',')), '🍅トマト,🍅ミニトマト,🌱その他');
    await page.fill('#cVegQ', '');
    await page.click('#cVeg [data-p="トマト"]');
    check('野菜を押すと名前が入り、苗からを選べる', await page.evaluate(() => $('#cName').value + '/' + !$('#cAsBox').hidden + '/' + $('#cEmoBox').hidden), 'トマト/true/true');
    await page.click('#cAs [data-a="nae"]'); await page.fill('#cDate', '2026-04-25'); await page.fill('#cArea', '3');
    check('苗からにすると日の欄が「苗を植えるの日」', await page.evaluate(() => $('#cDateLb').textContent), '苗を植えるの日');
    await page.click('#cSave'); await w(250);
    const prs = () => page.evaluate(() => [...document.querySelectorAll('.plan .pr')].map(r => r.querySelector('.w').textContent + ' ' + r.querySelector('.d').textContent + ' ' + r.querySelector('.s').textContent));
    check('登録すると詳しい画面：苗から（植えるまでの作業は出さない）の予定', await prs(), ['苗を植える 4/25(土) 済', '花が咲く 5/10(日)〜5/25(月) いま（15日まで）', '追肥 5/25(月)〜6/4(木) あと15日', '収穫はじめ 6/9(火)〜6/24(水) あと30日', '収穫おわり 7/29(水)〜8/23(日) あと80日']);
    check('野菜の画面に「いま気をつけたい病気・害虫」', await page.evaluate(() => [...document.querySelectorAll('main h2')].some(h => h.textContent.startsWith('⚠️ いま気をつけたい病気・害虫注意報 2・5月ごろ')) + '/' + [...document.querySelectorAll('.skboard details.sk b')].map(b => b.textContent).join(',')), 'true/🦠 灰色かび病,🐛 アブラムシ,🦠 疫病');
    check('肥料・コツ・病気（広さ3㎡で全体の量）', await page.evaluate(() => [...document.querySelectorAll('details.more summary')].map(s => s.textContent.replace(/（.*/, '')).join(',') + '/' + document.querySelector('details.more').textContent.includes('3㎡で 360〜450g')), '🧪 肥料,💡 育て方のコツ,🐛 出やすい病気・害虫/true');

    check('野菜の画面：カレンダーのあとに育て方の予定', await page.evaluate(() => [...document.querySelectorAll('main h2')].map(h => h.textContent.replace(/[^📅📋⚠️📝].*$/u, '').trim()).filter(Boolean).slice(0, 2).join(',')), '📅,📋');
    await page.click('#growAdj'); await w(150);
    check('実物に合わせる窓：その野菜の段階', await page.evaluate(() => [...document.querySelectorAll('#gSt button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(',')), '苗を植えた,根づいた,育ってきた,大きく育った,花が咲いた*,実がなった,収穫できる');
    await page.click('#gSt [data-st="nae"]'); await w(100);
    check('段階を選ぶと絵と「予定より○日おくれ」', await page.evaluate(() => $('#gPrev b').textContent + '/' + /予定より\d+日おくれ/.test($('#gPrev small').textContent)), '苗を植えた/true');
    await page.click('#gLess'); await w(100);
    check('植えた日より前には小さくできない', await page.evaluate(() => $('#gPrev b').textContent + '/' + $('#toast').textContent.slice(0, 13)), '苗を植えた/これより小さくはできません');
    await page.click('#gSave'); await w(200);
    check('保存すると絵が変わる（✋合わせ中）', await page.evaluate(() => { const c = data.crops[0]; return (c.growShift > 0) + '/' + $('.detail-top .emo.grow small').textContent + '/' + $('#growAdj').textContent; }), 'true/苗を植えた/✋ 合わせ中');
    check('合わせたあとも日がたつと育つ', await page.evaluate(() => [10, 20, 35].map(d => growStage(data.crops[0], addDays(today(), d)).st).join(',')), 'big,flower,fruit');
    await page.click('#growAdj'); await w(100); await page.click('#gAuto'); await page.click('#gSave'); await w(200);
    check('予定どおりにもどす', await page.evaluate(() => ('growShift' in data.crops[0]) + '/' + $('.detail-top .emo.grow small').textContent), 'false/花が咲いた');
    check('野菜の画面に育ち具合の絵（苗から15日・花が咲いた）', await page.evaluate(() => { const g = $('.detail-top .emo.grow'); return g.dataset.st + '/' + g.querySelector('.e').textContent + '/' + !!g.querySelector('svg.growpic') + '/' + g.querySelector('small').textContent; }), 'flower/🍅/true/花が咲いた');
    check('育ち具合：段階の決まり方', await page.evaluate(() => {
      const mk = (plan, d, as, st) => ({ plan, plantedAt: d, as, status: st || 'growing', done: {}, emoji: '🌱', fieldId: data.fields[0].id });
      return [mk('ダイコン', '2026-05-20', 'seed'), mk('ダイコン', '2026-05-09', 'seed'), mk('ダイコン', '2026-05-06', 'seed'), mk('ダイコン', '2026-04-01', 'seed'), mk('キャベツ', '2026-03-01', 'nae'), mk('キャベツ', '2026-03-25', 'nae'), mk('トマト', '2026-05-09', 'nae'), mk('トマト', '2026-05-09', 'nae', 'harvesting'), mk('トマト', '2026-05-09', 'nae', 'done'), mk('', '2026-05-01', 'seed')]
        .map(c => { const g = growStage(c); return g.st + ':' + g.label; }).join(',');
    }), 'before:あと10日,seed:種をまいた,sprout:芽が出た,big:大きく育った,harvest:収穫できる,fruit:巻いてきた,nae:苗を植えた,harvest:収穫できる,end:おわり,sprout:芽が出た');
    // ── やった ──
    await page.click('.plan [data-done$=":4"]'); await w(250);
    check('✓ やった：予定に印・記録にも残る', await page.evaluate(() => { const c = data.crops[0]; return JSON.stringify(c.done) + '/' + data.logs.map(l => l.type + ':' + l.memo + ':' + l.date).join(','); }), '{"4":"2026-05-10"}/observe:花が咲く:2026-05-10');
    await page.click('.plan [data-undo="4"]'); await w(200);
    check('取り消せる（記録は残る）', await page.evaluate(() => JSON.stringify(data.crops[0].done) + '/' + data.logs.length), '{}/1');
    // 収穫の予定は量を入れる窓
    await page.evaluate(() => doTask(data.crops[0].id, 6)); await w(200);
    check('収穫の「やった」は量を入れる窓（収穫が選ばれている）', await page.evaluate(() => document.querySelector('#lType .on').dataset.t + '/' + $('#lMemo').value + '/' + !$('#hvBox').hidden), 'harvest/収穫はじめ/true');
    await page.fill('#lAmt', '5'); await page.click('#lSave'); await w(250);
    check('保存すると予定に印・収穫中・収穫合計', await page.evaluate(() => { const c = data.crops[0]; return (c.done[6] === '2026-05-10') + '/' + c.status + '/' + document.querySelectorAll('.stat b')[2].textContent; }), 'true/harvesting/5個');

    // ── 地域で日数を補正 ──
    await page.click('nav [data-tab="settings"]'); await w(200);
    await page.selectOption('#sArea', 'hokkaido'); await w(250);
    check('地域を北海道にすると補正＋20%（春まきは4週間おそめ）', await page.evaluate(() => $('#sFix').textContent.replace(/\s+/g, '')), '補正＋20%（日数を1.20倍）／種まきの時期は標準より4週間おそめ');
    await page.evaluate(() => go('crops', data.crops[0].id)); await w(200);
    check('予定の日数ものびる（花が咲く 18〜36日後）', (await prs())[1], '花が咲く 5/13(水)〜5/31(日) あと3日');
    await page.evaluate(async () => { data.fields[0].area = 'kanto'; await save(); }); await page.evaluate(() => render()); await w(150);

    // ── 畑の一覧 ──
    await page.click('#backBtn'); await w(200);
    check('「‹ 戻る」は前の画面（設定）へ', await page.evaluate(() => view.tab), 'settings');
    await page.click('nav [data-tab="crops"]'); await w(200);
    await page.click('#fab'); await w(150); await page.click('#cVeg [data-p="ダイコン"]'); await page.fill('#cDate', '2026-04-20');
    check('種からしかない野菜は「どこから育てる」を出さない', await page.evaluate(() => $('#cAsBox').hidden), true);
    await page.click('#cSave'); await w(250); await page.click('#backBtn'); await w(200);
    check('畑のカードに小さい野菜の絵と育ち具合', await page.evaluate(() => [...document.querySelectorAll('.crop .emo.grow')].map(g => g.querySelector('.e').textContent + g.querySelector('small').textContent).join(',')), '🍅収穫できる,🥬本葉が出た');
    check('病気・害虫の注意報：畑の上に（多い時期が先・5つ＋ほか）', await page.evaluate(() => [...document.querySelectorAll('.skboard > details.sk:not(.more) > summary')].map(x => x.querySelector('.lv').textContent + ':' + x.querySelector('b').textContent + ':' + x.querySelector('small').textContent).join(' / ') + '/' + $('.skboard details.more summary').textContent),
      '注意報:🦠 灰色かび病:🍅トマト / 注意報:🐛 アブラムシ:🍅トマト / 注意報:🐛 アオムシ・コナガ:🥬ダイコン / 注意報:🐛 ヨトウムシ:🥬ダイコン / 注意:🦠 疫病:🍅トマト/ほか 1つ');
    check('カードに⚠️のしるし', await page.evaluate(() => [...document.querySelectorAll('.crop .badge.sick')].map(b => b.textContent).join(',')), '⚠️灰色かび病 ほか2,⚠️アオムシ・コナガ ほか2');
    check('注意報を押すと見分け方・手当て', await page.evaluate(() => { const d = document.querySelector('.skboard details.sk'); d.open = true; return d.querySelector('.skb').textContent.includes('見分け方') && d.querySelector('.skb').textContent.includes('涼しくてじめじめ'); }), true);
    check('注意報と今月まけるものは野菜の一覧の下', await page.evaluate(() => { const cs = document.querySelectorAll('.crop'), last = cs[cs.length - 1], sk = $('details.fold[data-fold="sick"]'), sw = $('details.fold[data-fold="sow"]');
      return !!(last.compareDocumentPosition(sk) & Node.DOCUMENT_POSITION_FOLLOWING) + '/' + !!(sk.compareDocumentPosition(sw) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'true/true');
    check('注意報の見出し（数）', await page.evaluate(() => $('details.fold[data-fold="sick"] > summary h2').textContent + '/' + $('details.fold[data-fold="sick"]').open), '⚠️ 病気・害虫の注意報注意報 4・注意 2・5月/true');
    await page.click('details.fold[data-fold="sick"] > summary'); await w(150);
    check('見出しを押すと折りたたむ・おぼえる', await page.evaluate(() => $('details.fold[data-fold="sick"]').open + '/' + localStorage.getItem('saien_fold_sick')), 'false/0');
    await page.evaluate(() => render()); await w(100);
    check('描き直しても閉じたまま', await page.evaluate(() => $('details.fold[data-fold="sick"]').open), false);
    await page.click('details.fold[data-fold="sick"] > summary'); await w(150);
    check('育ち具合と地域で変わる', await page.evaluate(() => {
      const mk = (plan, d, as) => ({ plan, plantedAt: d, as, status: 'growing', done: {}, emoji: '🌱', fieldId: data.fields[0].id });
      const ks = c => sickNow(c).map(x => x.k + (x.peak ? '!' : '')).join(',');
      const a = ks(mk('ニンジン', '2026-05-01', 'seed')), b = ks(mk('ニンジン', '2026-03-01', 'seed'));
      data.fields[0].area = 'hokkaido'; const h = ks(mk('ニンジン', '2026-05-01', 'seed')) + ' ' + sickMonth(data.fields[0]); data.fields[0].area = 'kanto';
      return [a, b, h, ks(mk('ニンジン', '2026-05-20', 'seed')), ks(Object.assign(mk('ニンジン', '2026-05-01', 'seed'), { status: 'done' }))].join(' | ');
    }), 'tachigare!,yotou!,abura! | yotou!,abura! | tachigare!,yotou,abura 4 |  | ');
    check('一覧に「つぎの予定」のしるし', await page.evaluate(() => [...document.querySelectorAll('.crop')].map(c => c.querySelector('.name').textContent + ':' + (c.querySelector('.badge.next') || {}).textContent).join(' / ')), 'トマト:📅 花が咲く：いま（15日まで） / ダイコン:📅 2回目の間引き：あと5日');
    check('上に「近いうちにやること」（時期を過ぎたものも）', await page.evaluate(() => [...document.querySelectorAll('.task .tx b')].map(b => b.textContent).join(',')), '🥬 ダイコン：1回目の間引き,🍅 トマト：花が咲く,🥬 ダイコン：2回目の間引き');
    await page.click('.crop [data-water]'); await w(200);
    check('💧で今日の水やり', await page.evaluate(() => data.logs.filter(l => l.type === 'water').length + '/' + document.querySelector('.badge.water').textContent), '1/💧今日');

    // ── 野菜ごとのカレンダー ──
    await page.click('.crop [data-open]'); await w(200);
    check('野菜の画面にもカレンダー（作業の名前の札）', await page.evaluate(() => $('main').textContent.includes('トマトのカレンダー') + '/' + $('.calhead b').textContent + '/' + [...document.querySelectorAll('.cd .ev')].map(e => e.textContent).join(',')), 'true/2026年 5月/花が咲く,追肥');
    await page.click('#calNext'); await w(150);
    check('次の月：収穫はじめ', await page.evaluate(() => [...document.querySelectorAll('.cd .ev')].map(e => e.textContent).join(',')), '収穫はじめ');
    await page.click('[data-d="2026-06-12"]'); await w(150);
    check('日を押すとその野菜のその日の予定', await page.evaluate(() => [...document.querySelectorAll('main h2')].map(h => h.textContent).includes('2026年6月12日(金)') + '/' + [...document.querySelectorAll('.task .tx b')].map(b => b.textContent).join(',')), 'true/🍅 トマト：収穫はじめ');
    await page.click('#fab'); await w(150);
    check('野菜の画面の＋は、選んだ日・その野菜で記録', await page.evaluate(() => $('#lDate').value + '/' + ($('#lCrop').value === data.crops[0].id)), '2026-06-12/true');
    // ── ブラウザの戻る ──
    await page.goBack(); await w(200);
    check('戻る：窓が開いていたら窓を閉じるだけ（野菜の画面のまま）', await page.evaluate(() => !$('#modalRoot').firstElementChild && view.cropId === data.crops[0].id), true);
    await page.goBack(); await w(200);
    check('戻る：野菜の画面 → 畑の一覧', await page.evaluate(() => view.tab + '/' + view.cropId + '/' + !!document.querySelector('.crop')), 'crops/null/true');
    await page.click('nav [data-tab="logs"]'); await w(150); await page.click('nav [data-tab="guide"]'); await w(150);
    await page.goBack(); await w(200);
    check('戻る：ほかのタブ → 畑（タブを何回かえても1回で）', await page.evaluate(() => view.tab), 'crops');
    await page.goBack(); await w(200);
    check('戻る：畑の一覧ではページを離れず、知らせを出す', await page.evaluate(() => location.pathname.endsWith('index.html') + '/' + $('#toast').textContent), 'true/もう一度「戻る」でアプリを閉じます');

    // ── 予定（カレンダー） ──
    await page.click('nav [data-tab="plan"]'); await w(250);
    check('予定：2週間にやること', await page.evaluate(() => document.querySelectorAll('.task').length >= 4), true);
    check('カレンダー：5月・今日に印・その日の札と線', await page.evaluate(() => $('.calhead b').textContent + '/' + $('.cd.today .n').textContent + '/' + [...document.querySelectorAll('[data-d="2026-05-15"] .ev, [data-d="2026-05-15"] .bar')].map(e => e.className + ':' + e.textContent).join(',')), '2026年 5月/10/ev soon:🥬手入れ,bar now:');
    check('カレンダー：始まる日は野菜の絵＋作業、日曜は赤', await page.evaluate(() => document.querySelector('[data-d="2026-05-10"] .ev').textContent + '/' + document.querySelector('[data-d="2026-05-10"]').classList.contains('sun') + '/' + document.querySelector('[data-d="2026-05-03"]').classList.contains('pastday')), '🍅花/true/true');
    await page.click('[data-d="2026-05-15"]'); await w(200);
    check('日を押すとその日の予定', await page.evaluate(() => $('main h2:last-of-type').textContent + '/' + [...document.querySelectorAll('main .card .task .tx b')].slice(-2).map(b => b.textContent).join(',')), '2026年5月15日(金)/🍅 トマト：花が咲く,🥬 ダイコン：2回目の間引き');
    await page.click('#calNext'); await w(150);
    check('次の月へ', await page.evaluate(() => $('.calhead b').textContent), '2026年 6月');
    await page.click('#fab'); await w(150);
    check('予定の画面の＋は、選んだ日で記録', await page.evaluate(() => $('#lDate').value), '2026-05-15');
    await page.click('#lCancel');

    // ── 書き出し ──
    await page.evaluate(() => { window.giveFile = async (b, n) => { window.__f = { n, type: b.type, text: b.type.startsWith('image') ? '' : await b.text(), size: b.size, head: [...new Uint8Array(await b.slice(0, 3).arrayBuffer())].join(',') }; }; });
    await page.click('#exPlan'); await w(150);
    check('書き出しの窓（5つ）', await page.evaluate(() => document.querySelectorAll('[data-ex]').length + '/' + document.querySelectorAll('[data-ex]:not([disabled])').length), '5/5');
    await page.click('[data-ex="plancsv"]'); await w(200);
    check('予定表を Excel（CSV・BOM つき）', await page.evaluate(() => __f.n.replace(/_\d{4}-\d\d-\d\d/, '') + '|' + __f.head + '|' + __f.text.split('\r\n')[0] + '|' + __f.text.split('\r\n')[2]), '菜園ノート_予定表.csv|239,187,191|野菜,畑,場所,植えた日,作業,はじめ,おわり,いま|トマト,,,2026/04/25,花が咲く,2026/05/10,2026/05/25,いま（15日まで）');
    await page.click('[data-ex="logcsv"]'); await w(200);
    check('記録を Excel（収穫の量も）', await page.evaluate(() => __f.text.split('\r\n').length > 2 && __f.text.includes('収穫,5,個')), true);
    await page.click('[data-ex="ics"]'); await w(200);
    check('スマホのカレンダー（.ics：これからの予定・前の日の知らせ）', await page.evaluate(() => __f.type + '/' + /^BEGIN:VCALENDAR/.test(__f.text) + '/' + (__f.text.match(/BEGIN:VEVENT/g) || []).length + '/' + __f.text.includes('DTSTART;VALUE=DATE:20260510') + '/' + __f.text.includes('TRIGGER:-PT15H')), 'text/calendar/true/' + await page.evaluate(() => { let n = 0; activeCrops().forEach(c => cropRows(c).forEach(r => { if (r.i > 0 && rowState(c, r) !== 'done' && r.to >= today()) n++; })); return n; }) + '/true/true');
    check('予定表の画像と印刷の中身', await page.evaluate(() => { const cv = scheduleCanvas(activeCrops(), '予定表'); const h = printHtml(activeCrops(), '予定表'); return (cv.width === 1080 && cv.height > 400) + '/' + (h.match(/<table>/g) || []).length; }), 'true/2');
    await page.click('#exClose'); await w(100);

    // ── 記録・集計 ──
    await page.click('nav [data-tab="logs"]'); await w(200);
    check('記録の一覧（観察・収穫・水やり）', await page.evaluate(() => document.querySelectorAll('.log').length), 3);
    await page.click('[data-sub="sum"]'); await w(200);
    check('集計：収穫の表', await page.evaluate(() => [...document.querySelectorAll('table')[0].querySelectorAll('td')].slice(0, 3).map(t => t.textContent).join('/')), '🍅 トマト/1回/5個');

    // ── 今月まけるもの ──
    check('まく時期を月に（年またぎも）', await page.evaluate(() => [...sowMonths({ sow: '3〜4月・9〜10月' })].join(',') + '/' + [...sowMonths({ sow: '10〜2月' })].join(',')), '3,4,9,10/10,11,12,1,2');
    check('今月（5月）まける野菜・北海道は4週間おそめ（4月の分）', await page.evaluate(() => { const a = sowList(data.fields[0]); const h = sowList(Object.assign({}, data.fields[0], { area: 'hokkaido' })); return a.mo + ':' + a.list.some(v => v.n === 'オクラ') + '/' + h.mo + ':' + h.list.some(v => v.n === 'オクラ') + ':' + h.list.some(v => v.n === 'ジャガイモ'); }), '5:true/5:false:false');
    // ── 育て方 ──
    await page.click('nav [data-tab="guide"]'); await w(200);
    check('育て方：61種類', await page.evaluate(() => document.querySelectorAll('.vgrid button').length), 61);
    check('ふえた野菜は、予定・肥料・絵・連作の仲間・病気がそろっている', await page.evaluate(() => VEG_MORE.filter(m => { const v = planByName(m.n), c = { plan: m.n, plantedAt: '2026-01-01', as: 'seed', status: 'growing', done: {}, emoji: m.i, fieldId: data.fields[0].id };
      try { return !(v && VEG_FERT[VEG_CARE[m.n].f] && VEG_TIPS[m.n] && familyOf(m.n) && m.k.every(k => VEG_SICK[k] && SICK_SEASON[k]) && growOptions(c).length >= 5 && growSvg(c, growStage(c, '2026-03-01')).startsWith('<svg') && sowMonths(v).size); } catch (e) { return true; } }).map(m => m.n).join(',') || 'そろっている'), 'そろっている');
    await page.click('[data-gg="negi"]'); await w(100);
    check('種類でしぼる（ねぎ）', await page.evaluate(() => [...document.querySelectorAll('.vgrid button')].map(b => b.textContent).join(',')), '🧅タマネギ,🌱ネギ,🧄ニンニク,🌿ニラ,🧅ラッキョウ,🌱ワケギ');
    await page.click('[data-gg="all"]'); await w(100);
    check('育て方の上に「今月まける・植えるもの」', await page.evaluate(() => $('details.fold[data-fold="sow"] summary h2').textContent.startsWith('🗓 今月まける・植えるもの5月') + '/' + (document.querySelectorAll('[data-sow]').length > 5)), 'true/true');
    await page.fill('#gQ', 'イモ'); await w(150);
    check('名前でさがす', await page.evaluate(() => [...document.querySelectorAll('.vgrid button')].map(b => b.textContent).join(',')), '🥔ジャガイモ,🍠サツマイモ,🥔サトイモ,🍠ナガイモ');
    await page.click('[data-v="ジャガイモ"]'); await w(250);
    check('選ぶと向く時期・収穫まで・予定', await page.evaluate(() => $('.gsel').textContent.includes('2〜3月・8〜9月') + '/' + $('.gbig').textContent), 'true/収穫は 90〜110日後（8/8(土)〜8/28(金)）');
    await page.click('#gAdd'); await w(200);
    check('「畑に登録する」で登録の窓（中身が入っている）', await page.evaluate(() => $('#cName').value + '/' + document.querySelector('#cVeg .on').dataset.p + '/' + $('#cDate').value + '/' + $('#cDateLb').textContent), 'ジャガイモ/ジャガイモ/2026-05-10/植えつけの日');
    await page.click('#cSave'); await w(250);
    check('登録できた', await page.evaluate(() => data.crops.map(c => c.name).join(',')), 'トマト,ダイコン,ジャガイモ');

    // ── その他の野菜（予定なし） ──
    await page.click('#backBtn'); await w(150);
    check('育て方から登録した野菜の「戻る」は育て方へ', await page.evaluate(() => view.tab + '/' + $('#title').textContent), 'guide/育て方');
    await page.click('nav [data-tab="crops"]'); await w(150); await page.click('#fab'); await w(150);
    await page.click('#cVeg [data-p=""]'); await page.fill('#cName', 'バジル'); await page.click('#emo [data-e="🌿"]'); await page.click('#cSave'); await w(250);
    check('その他の野菜は予定の代わりに案内', await page.evaluate(() => document.querySelector('main').textContent.includes('予定は出ていません') + '/' + data.crops[3].emoji + data.crops[3].plan), 'true/🌿');

    // ── 自分の野菜・品種 ──
    await page.click('nav [data-tab="guide"]'); await w(200); await page.fill('#gQ', ''); await w(150); await page.click('#gMine'); await w(150);
    await page.fill('#mpName', 'アイコ'); await page.selectOption('#mpBase', 'トマト'); await page.click('#mpCopy'); await w(100);
    check('似ている野菜の日数を写す', await page.evaluate(() => document.querySelectorAll('#mpSteps .mpstep').length === planByName('トマト').s.length && document.querySelector('#mpFrom .on').dataset.f), '種まき');
    await page.fill('#mpSteps [data-i="0"][data-k="1"]', '4'); await page.click('#mpSave'); await w(250);
    check('⭐自分の野菜を足す（育て方の一覧と、えらんだ所）', await page.evaluate(() => data.myPlans.length + '/' + data.myPlans[0].s[0].join(',') + '/' + document.querySelector('.vgrid .mine').textContent + '/' + !!$('#gEditMine') + '/' + document.querySelectorAll('details.more').length), '1/発芽,4,8/🍅⭐アイコ/true/3');
    await page.click('#gAdd'); await w(200);
    check('畑に登録の窓にも出る', await page.evaluate(() => document.querySelector('#cVeg .on').textContent), '🍅⭐アイコ');
    await page.click('#cSave'); await w(250);
    check('自分の野菜で予定・絵（トマトの形）', await page.evaluate(() => { const c = data.crops.find(x => x.plan === 'アイコ'); return (cropRows(c).length === planByName('トマト').s.length + 1) + '/' + growShape(c) + '/' + careOf(planByName('アイコ')).k.length; }), 'true/fruit/6');
    await page.click('#backBtn'); await w(150); await page.click('[data-v="アイコ"]'); await w(150); await page.click('#gEditMine'); await w(150);
    await page.fill('#mpName', 'アイコ（ミニ）'); await page.click('#mpSave'); await w(200);
    check('名前を変えると畑の野菜もついてくる', await page.evaluate(() => data.crops.filter(c => c.plan === 'アイコ（ミニ）').length + '/' + planByName('アイコ')), '1/null');
    await page.click('#gEditMine'); await w(150); await page.click('#mpDel'); await w(250);
    check('消すと畑の野菜は予定なしに（記録は残る）', await page.evaluate(() => data.myPlans.length + '/' + data.crops.filter(c => c.name === 'アイコ' && !c.plan).length), '0/1');
    await page.evaluate(async () => { data.crops = data.crops.filter(c => c.name !== 'アイコ'); await save(); });
    await page.click('nav [data-tab="crops"]'); await w(150);

    // ── 配置図・連作 ──
    await page.click('nav [data-tab="crops"]'); await w(150); await page.click('[data-csub="map"]'); await w(150);
    check('配置図：ます目（8×6）', await page.evaluate(() => document.querySelectorAll('.fmsvg .mc').length + '/' + !!$('[data-mapedit]')), '48/true');
    await page.click('[data-mapedit]'); await w(100);
    const fid = await page.evaluate(() => curField().id);
    await page.click(`[data-cell="${fid}:0:0"]`); await w(100); await page.click(`[data-cell="${fid}:1:2"]`); await w(200);
    check('2つの角を押すと畝ができる', await page.evaluate(() => JSON.stringify(curField().beds.map(b => [b.name, b.x, b.y, b.w, b.h]))), '[["畝1",0,0,2,3]]');
    await page.click(`[data-cell="${fid}:2:2"]`); await w(50); await page.click(`[data-cell="${fid}:0:4"]`); await w(200);
    check('重なる畝はつくらない', await page.evaluate(() => curField().beds.length + '/' + $('#toast').textContent), '1/ほかの畝と重なっています');
    await page.click('[data-mapedit]'); await w(100);
    await page.click('.fmsvg .bed'); await w(150);
    await page.fill('#bdName', '南の畝'); await page.click('#bdRename'); await w(200);
    await page.click('.fmsvg .bed'); await w(150); await page.click('#bdPlant'); await w(150);
    check('畝から植える：畝と場所が入っている', await page.evaluate(() => $('#cBed').selectedOptions[0].textContent + '/' + $('#cPlace').value), '南の畝/南の畝');
    // 去年ここにトマト（ナス科）
    await page.evaluate(async () => { const b = curField().beds[0]; data.crops.push({ id: 'old-t', emoji: '🍅', name: 'トマト', plan: 'トマト', as: 'nae', plantedAt: '2025-05-01', status: 'done', done: {}, fieldId: curField().id, bed: b.id, place: b.name, memo: '', variety: '', area: 0 }); await save(); });
    await page.click('#cVeg [data-p="ナス"]'); await page.fill('#cDate', '2026-05-01'); await w(150);
    check('連作の注意（登録の窓）', await page.evaluate(() => !$('#cRot').hidden && $('#cRot').textContent), '⚠️ 連作の注意：1年前に同じナス科のトマト（2025年）を植えた所です。ナス科は4年ほど空けると病気が出にくくなります');
    await page.click('#cSave'); await w(250);
    check('野菜の画面にも連作の注意', await page.evaluate(() => !!$('.rotw')), true);
    await page.click('#backBtn'); await w(200);
    check('配置図：畝に野菜の絵・連作の畝は赤', await page.evaluate(() => document.querySelector('.fmsvg .bed').textContent.includes('🍆') + '/' + document.querySelector('.fmsvg .bed').classList.contains('warn')), 'true/true');
    await page.click('[data-csub="list"]'); await w(150);
    check('一覧のカードに⚠️連作', await page.evaluate(() => [...document.querySelectorAll('.crop')].some(c => c.textContent.includes('ナス') && c.textContent.includes('⚠️連作'))), true);
    check('仲間と年数（自分の野菜は似ている野菜の仲間）', await page.evaluate(() => [familyOf('キャベツ'), restYears('スイカ'), familyOf('トウモロコシ') + restYears('トウモロコシ')].join('/')), 'アブラナ科/5/イネ科0');
    await page.evaluate(async () => { data.crops = data.crops.filter(c => c.id !== 'old-t' && c.name !== 'ナス'); curField().beds = []; await save(); render(); });

    // ── アルバム・バックアップの声かけ・収穫のくらべ・実績 ──
    const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await page.evaluate(async png => { const c = data.crops[0], l = { id: 'ph1', cropId: c.id, type: 'observe', date: '2026-05-05', memo: '花が咲いた', amount: '', unit: '個', hasPhoto: true, ts: 1 }; data.logs.push(l); await setPhoto('ph1', png); await save(); go('crops', c.id); }, PNG1); await w(400);
    check('野菜の画面に写真アルバム（植えてからの日数つき）', await page.evaluate(() => document.querySelectorAll('details.fold[data-fold="album"] .album figure').length + '/' + $('.album figcaption').textContent + '/' + !!$('.album img').src), '1/5/5(火)・10日目👀花が咲いた/true');
    await page.click('#backBtn'); await w(150); await page.click('nav [data-tab="logs"]'); await w(150); await page.click('[data-sub="photo"]'); await w(300);
    check('記録のタブの「📷 写真」', await page.evaluate(() => document.querySelectorAll('main .album figure').length + '/' + $('main h2').textContent.startsWith('🍅 トマト')), '1/true');
    await page.click('[data-sub="list"]'); await w(100);
    await page.evaluate(async () => { data.settings.backupAt = Date.now() - 40 * 86400000; await save(); }); await page.click('nav [data-tab="crops"]'); await w(200);
    check('前のバックアップから30日でお知らせ', await page.evaluate(() => $('.bkban b').textContent), '前のバックアップから40日たちました');
    await page.click('#bkLater'); await w(150);
    check('「あとで」で7日お休み', await page.evaluate(() => !$('.bkban') && +localStorage.getItem('saien_bk_snooze') > Date.now() + 6 * 86400000), true);
    await page.evaluate(async () => { localStorage.removeItem('saien_bk_snooze'); await exportData(); });
    check('保存するとバックアップの日がつく', await page.evaluate(() => Date.now() - data.settings.backupAt < 60000 && backupText()), '前のバックアップ：今日');
    await page.evaluate(async () => { const c = data.crops[0];
      data.logs.push({ id: 'h25a', cropId: c.id, type: 'harvest', date: '2025-07-01', memo: '', amount: 4, unit: '個', ts: 2 }, { id: 'h26b', cropId: c.id, type: 'harvest', date: '2026-05-20', memo: '', amount: 2, unit: '個', ts: 3 }); await save(); });
    await page.click('nav [data-tab="logs"]'); await w(150); await page.click('[data-sub="sum"]'); await w(200);
    check('野菜ごとの収穫を去年とくらべ', await page.evaluate(() => { const r = document.querySelector('.hvc .hvr'); return r.querySelector('b').textContent + '/' + r.querySelector('small').textContent + '/' + [...r.querySelectorAll('em')].map(e => e.textContent).join(','); }), '🍅 トマト/＋75%/7個,4個');
    await page.click('[data-sub="list"]'); await w(100);
    // 自分の実績：去年のトマト（苗から 2025/5/1 → 6/30 に収穫＝60日）
    await page.evaluate(async () => { data.crops.push({ id: 't25', emoji: '🍅', name: 'トマト', plan: 'トマト', as: 'nae', plantedAt: '2025-05-01', status: 'done', done: {}, fieldId: data.fields[0].id, place: '', memo: '', variety: '', area: 0 });
      data.logs.push({ id: 'h25t', cropId: 't25', type: 'harvest', date: '2025-06-30', memo: '', amount: 3, unit: '個', ts: 4 }); window.__keep = data.logs.filter(l => l.cropId === data.crops[0].id && l.type === 'harvest'); data.logs = data.logs.filter(l => !window.__keep.includes(l)); await save(); go('crops', data.crops[0].id); }); await w(300);
    check('自分の実績（平均日数）と予定', await page.evaluate(() => $('.own').textContent.replace(/\s+/g, '').slice(0, 38)), '📈あなたの畑では：植えてから収穫まで平均60日（1回）。予定は45日です。');
    const before = await page.evaluate(() => cropRows(data.crops[0]).find(r => r.kind.k === 'harvest').d1);
    await page.click('.own [data-adj]'); await w(250);
    check('「予定を実績に合わせる」で収穫の日がのびる', await page.evaluate(b => adjFactor('トマト', 'nae') + '/' + (cropRows(data.crops[0]).find(r => r.kind.k === 'harvest').d1 > b), before), '1.35/true');
    await page.click('.own [data-adj]'); await w(250);
    check('予定どおりにもどす', await page.evaluate(() => adjFactor('トマト', 'nae')), 1);
    await page.evaluate(async () => { data.crops = data.crops.filter(c => c.id !== 't25'); data.logs = data.logs.filter(l => !['ph1', 'h25a', 'h26b', 'h25t'].includes(l.id)).concat(window.__keep.filter(l => !['h25a', 'h26b'].includes(l.id))); await save(); });
    await page.click('#backBtn'); await w(150);

    // ── 種・資材・費用 ──
    await page.click('nav [data-tab="logs"]'); await w(150); await page.click('[data-sub="stock"]'); await w(150);
    await page.click('#stAdd'); await w(150); await page.selectOption('#stPlan', 'キュウリ'); await w(50);
    check('種：野菜を選ぶと名前が入る', await page.evaluate(() => $('#stName').value + '/' + !$('#stExBox').hidden), 'キュウリの種/true');
    await page.fill('#stDate', '2026-03-01'); await page.fill('#stPrice', '330'); await page.fill('#stEx', '2026-06-30'); await page.click('#stSave'); await w(200);
    await page.click('#stAdd'); await w(150); await page.click('#stK [data-k="fert"]'); await page.fill('#stName', '化成肥料'); await page.fill('#stDate', '2026-04-01'); await page.fill('#stPrice', '980'); await page.click('#stSave'); await w(200);
    check('今年かかったお金・残っている種（期限もうすぐ）', await page.evaluate(() => $('.spent b').textContent + '/' + $('.spk').textContent.replace(/\s+/g, '') + '/' + document.querySelectorAll('h2')[1].textContent + '/' + !!document.querySelector('.stl .near')), '1,310円/🌰種330円🧪肥料980円/🌰 残っている種1種類/true');
    await page.click('[data-sub="list"]'); await w(100); await page.click('nav [data-tab="crops"]'); await w(150); await page.click('#fab'); await w(150);
    await page.click('#cVeg [data-p="キュウリ"]'); await w(100);
    check('登録の窓で「種が残っています」', await page.evaluate(() => !$('#cSeed').hidden && $('#cSeed').textContent), '🌰 種が残っています：キュウリの種（期限 6/30(火)）');
    await page.click('#cCancel'); await w(100);
    // ── 家族と共有（合わせる） ──
    const shareJson = await page.evaluate(() => { const c0 = data.crops[0]; return JSON.stringify({ app: 'saien-note', kind: 'share', data: {
      fields: [{ id: 'famF', name: '実家の畑', area: 'tohoku', alt: 0, cold: false }], myPlans: [], stock: [],
      crops: [Object.assign({}, c0, { done: Object.assign({}, c0.done, { 9: '2026-05-09' }) }), { id: 'famC', emoji: '🥔', name: 'ジャガイモ', plan: 'ジャガイモ', as: 'seed', plantedAt: '2026-03-10', status: 'growing', done: {}, fieldId: 'famF', place: '', memo: '', variety: '', area: 0 }],
      logs: [{ id: 'famL', cropId: 'famC', type: 'water', date: '2026-05-09', memo: '母', amount: '', unit: '個', hasPhoto: true, ts: 9 }] },
      photos: { famL: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } }); });
    const before2 = await page.evaluate(() => data.crops.length + '/' + data.logs.length);
    check('共有ファイルを合わせる（消さずに足す）', await page.evaluate(async j => { const n = await mergeShare(new File([j], 's.json')); return [n.crops, n.logs, n.fields, data.crops.length, data.logs.length, data.crops[0].done[9], data.settings.multi, !!(await getPhoto('famL'))].join('/'); }, shareJson), (() => { const [c, l] = before2.split('/').map(Number); return `1/1/1/${c + 1}/${l + 1}/2026-05-09/true/true`; })());
    check('もう一度合わせても増えない', await page.evaluate(async j => { const n = await mergeShare(new File([j], 's.json')); return n.crops + n.logs + n.fields; }, shareJson), 0);
    await page.evaluate(async () => { data.crops = data.crops.filter(c => c.id !== 'famC'); data.logs = data.logs.filter(l => l.id !== 'famL'); data.fields = data.fields.filter(f => f.id !== 'famF'); delete data.crops[0].done[9]; data.settings.multi = false; data.settings.cur = 'all'; data.stock = []; await save(); render(); });

    // ── 🎤 声で記録 ──
    check('声を読みとる（野菜・作業・量・日）', await page.evaluate(() => [
      'トマトとダイコンに水やり', 'トマトを五個収穫した', 'きのうダイコンに追肥', 'みんなに水やり', '5月3日 トマトを1.5キロとった', 'ナスに水やり'
    ].map(t => { const r = voiceParse(t); return r.date.slice(5) + ':' + r.items.map(i => i.c.name + i.type + (i.amount ? i.amount + i.unit : '')).join('+'); }).join(' | ')),
      '05-10:トマトwater+ダイコンwater | 05-10:トマトharvest5個 | 05-09:ダイコンfertilize | 05-10:' + await page.evaluate(() => activeCrops().map(c => c.name + 'water').join('+')) + ' | 05-03:トマトharvest1.5kg | 05-10:');
    await page.click('nav [data-tab="crops"]'); await w(150);
    check('🎤 のボタン', await page.evaluate(() => !$('#micFab').hidden), true);
    await page.click('#micFab'); await w(150);
    await page.fill('#vText', 'ダイコンに水やり'); await page.click('#vRead'); await w(100);
    check('読みとった中身を見せる', await page.evaluate(() => $('.vres .vit').textContent.replace(/\s+/g, '') + '/' + $('#vSave').disabled), '🥬ダイコン：💧水やり/false');
    const nl = await page.evaluate(() => data.logs.length);
    await page.click('#vSave'); await w(200);
    check('記録する', await page.evaluate(n => (data.logs.length - n) + '/' + data.logs[data.logs.length - 1].memo, nl), '1/ダイコンに水やり');
    await page.evaluate(async () => { data.logs.pop(); await save(); render(); });

    // ── バックアップ ──
    const json = await page.evaluate(async () => JSON.stringify({ app: 'saien-note', version: 2, data, photos: {} }));
    await page.evaluate(async () => { data.crops = []; data.logs = []; await save(); });
    await page.evaluate(async j => { await importData(new File([j], 'b.json')); }, json); await w(100);
    check('バックアップから戻す', await page.evaluate(() => data.crops.length + '/' + data.logs.length + '/' + data.fields[0].area), '4/3/kanto');
    await open();
    check('開き直しても残る', await page.evaluate(() => data.crops.length), 4);
    // ── 畑ごとに管理 ──
    await page.click('nav [data-tab="settings"]'); await w(200);
    check('設定に「アプリとして入れる」（表電卓とは別）', await page.evaluate(() => document.querySelector('main').textContent.includes('表電卓とは別のアプリ')), true);
    check('はじめは畑を分けない（📍の切りかえなし）', await page.evaluate(() => $('#fieldSel').hidden + '/' + !!$('#sArea')), 'true/true');
    await page.click('#sMulti'); await w(200);
    check('畑ごとに管理を入れると畑の一覧', await page.evaluate(() => data.settings.multi + '/' + [...document.querySelectorAll('.fitem b')].map(b => b.textContent).join(',') + '/' + !!$('#sArea')), 'true/📍わたしの畑/false');
    check('畑ごとに管理を入れたときは、すべての畑', await page.evaluate(() => data.settings.cur), 'all');
    await page.click('#fAdd'); await w(150);
    await page.fill('#fName', '山の畑'); await page.selectOption('#sArea', 'hokkaido'); await w(50);
    check('畑の窓：地域を選ぶと補正が出る', await page.evaluate(() => $('#sFix').textContent.includes('1.20倍')), true);
    await page.click('#fSave'); await w(200);
    check('畑を足すと、その畑を見ている', await page.evaluate(() => data.fields.length + '/' + (data.settings.cur === data.fields[1].id) + '/' + data.fields[1].area), '2/true/hokkaido');
    await page.click('nav [data-tab="crops"]'); await w(200);
    check('新しい畑は空・上に📍の切りかえ', await page.evaluate(() => !$('#fieldSel').hidden + '/' + $('#fieldSel').selectedOptions[0].textContent + '/' + document.querySelectorAll('.crop').length + '/' + $('main').textContent.includes('まだ野菜がありません')), 'true/📍山の畑/0/true');
    await page.click('#fab'); await w(150);
    check('登録の窓に畑の選択（いまの畑）', await page.evaluate(() => $('#cField').selectedOptions[0].textContent), '📍山の畑（北海道）');
    await page.click('#cVeg [data-p="トマト"]'); await page.click('#cAs [data-a="nae"]'); await page.fill('#cDate', '2026-04-25'); await page.click('#cSave'); await w(250);
    check('その畑の地域で予定（北海道は花が 5/13〜）', (await prs())[1], '花が咲く 5/13(水)〜5/31(日) あと3日');
    await page.click('#backBtn'); await w(200);
    check('山の畑には1件だけ', await page.evaluate(() => document.querySelectorAll('.crop').length), 1);
    await page.selectOption('#fieldSel', 'all'); await w(200);
    check('すべての畑：全部と畑の名前', await page.evaluate(() => document.querySelectorAll('.crop').length + '/' + [...document.querySelectorAll('.crop .muted')].some(e => e.textContent.includes('山の畑'))), '5/true');
    await page.selectOption('#fieldSel', await page.evaluate(() => data.fields[0].id)); await w(200);
    check('わたしの畑に切りかえ', await page.evaluate(() => document.querySelectorAll('.crop').length), 4);
    await page.click('nav [data-tab="logs"]'); await w(150);
    check('記録もその畑のぶんだけ', await page.evaluate(() => document.querySelectorAll('.log').length), 3);
    await open(); await page.click('nav [data-tab="settings"]'); await page.click('nav [data-tab="crops"]'); await w(200);
    check('開き直すと、すべての畑が出る', await page.evaluate(() => data.settings.cur + '/' + $('#fieldSel').value + '/' + document.querySelectorAll('.crop').length), 'all/all/5');
    await page.click('nav [data-tab="settings"]'); await w(150);
    await page.click(`[data-fedit="${await page.evaluate(() => data.fields[1].id)}"]`); await w(150);
    await page.click('#fDel'); await w(250);
    check('畑を消すと野菜はほかの畑へ', await page.evaluate(() => data.fields.length + '/' + data.crops.filter(c => c.fieldId === data.fields[0].id).length), '1/5');
    await page.click('#sMulti'); await w(150);
    check('畑ごとに管理を切る', await page.evaluate(() => data.settings.multi + '/' + !!$('#sArea')), 'false/true');
    // ── シンプルモード ──
    await page.click('nav [data-tab="settings"]'); await w(150);
    await page.click('#sSimple'); await w(150);
    check('シンプルモードにする（この端末だけ）', await page.evaluate(() => document.body.classList.contains('simple') + '/' + localStorage.getItem('saien_simple')), 'true/1');
    await page.click('nav [data-tab="crops"]'); await w(200);
    check('シンプル：文字が大きい・カードは名前とつぎの予定など', await page.evaluate(() => getComputedStyle(document.body).fontSize + '/' + [...document.querySelectorAll('.crop')][0].querySelectorAll('.badge').length + '>' + [...[...document.querySelectorAll('.crop')][0].querySelectorAll('.badge')].filter(b => getComputedStyle(b).display !== 'none').length), '18px/' + await page.evaluate(() => [...document.querySelectorAll('.crop')][0].querySelectorAll('.badge').length) + '>' + await page.evaluate(() => [...[...document.querySelectorAll('.crop')][0].querySelectorAll('.badge')].filter(b => /next|sick|warn/.test(b.className)).length));
    check('シンプル：やることは3つまで', await page.evaluate(() => document.querySelectorAll('.task').length <= 3), true);
    await open(); await w(200);
    check('開き直してもシンプルモード', await page.evaluate(() => document.body.classList.contains('simple')), true);
    await page.click('nav [data-tab="plan"]'); await w(200);
    check('シンプル：カレンダーの札は字を出さない', await page.evaluate(() => { const e = document.querySelector('.cd .ev'); return !e || getComputedStyle(e).fontSize === '0px'; }), true);
    await page.click('nav [data-tab="settings"]'); await w(150); await page.click('#sSimple'); await w(150);
    check('シンプルモードを切る', await page.evaluate(() => document.body.classList.contains('simple')), false);

    // ── アドレスのQRコード ──
    await page.click('nav [data-tab="settings"]'); await w(150); await page.click('#qrBtn'); await w(200);
    check('アドレスのQRコード（この端末だけのアドレスのときは公開しているアドレス）', await page.evaluate(() => { const c = $('#qrCv'); return $('#qrUrl').textContent + '/' + (c.width > 200 && c.width === c.height); }), 'https://nisitanisin2-ctrl.github.io/vigilant-parakeet//true');
    check('QRコードの中身（型番・読み取りの目印）', await page.evaluate(() => { const q = qrEncode(SAIEN_URL, 'M'); const m = q.modules; return q.size + '/' + [m[0][0], m[0][6], m[6][6], m[1][1], m[2][2]].map(v => v ? 1 : 0).join(''); }), '33/11101');
    await page.click('#qrClose'); await w(100);

    // ── 天気予報 ──
    await page.click('nav [data-tab="plan"]'); await w(200);
    check('場所を決めていないときは案内だけ（取りにいかない）', await page.evaluate(() => document.querySelectorAll('.cd .wx').length + '/' + $('.calcard').textContent.includes('設定で場所を決めると')) + '/' + wxCalls, '0/true/0');
    await page.click('nav [data-tab="settings"]'); await w(200);
    await page.selectOption('#sLoc [data-loc-pref]', '8-0'); await w(200);
    check('県から選ぶ', await page.evaluate(() => JSON.stringify(data.fields[0].loc) + '/' + $('#sLoc .locnow b').textContent), '{"name":"栃木 南部 宇都宮","lat":36.57,"lon":139.88}/栃木 南部 宇都宮');
    check('県と地域：47県・地域ごと（気象庁の分け方）', await page.evaluate(() => document.querySelectorAll('#sLoc optgroup').length + '/' + [...document.querySelectorAll('#sLoc optgroup[label="兵庫"] option')].map(o => o.textContent.replace('兵庫・', '')).slice(0, 6).join(',') + '/' + wxPrefName('大阪', '大阪（大阪）')), '47/南部（神戸）,南部（姫路）,南部（三田）,南部（洲本・淡路）,北部（豊岡）,北部（香美）/大阪');
    await page.selectOption('#sLoc [data-loc-pref]', { label: '兵庫・北部（豊岡）' }); await w(200);
    check('兵庫の北部（豊岡）', await page.evaluate(() => JSON.stringify(data.fields[0].loc)), '{"name":"兵庫 北部 豊岡","lat":35.54,"lon":134.82}');
    await page.fill('#sLoc [data-loc-q]', 'つくば'); await page.click('#sLoc [data-loc-find]'); await w(300);
    check('名前でさがす（日本だけ）', await page.evaluate(() => [...document.querySelectorAll('#sLoc [data-loc-i]')].map(b => b.textContent).join(',')), '茨城県 つくば市');
    await page.click('#sLoc [data-loc-i="0"]'); await w(200);
    check('さがした場所にする', await page.evaluate(() => data.fields[0].loc.name + '/' + data.fields[0].loc.lat), '茨城県 つくば市/36.08');
    await page.click('nav [data-tab="plan"]'); await w(200); await page.click('#calToday'); await w(500);
    check('カレンダーに16日ぶんの天気（絵と最高/最低）', await page.evaluate(() => document.querySelectorAll('.cd .wx').length + '/' + $('[data-d="2026-05-10"] .wx').textContent + '/' + $('[data-d="2026-05-12"] .wx').textContent + '/' + !document.querySelector('[data-d="2026-05-09"] .wx')), '16/☀️25/14/🌧️25/2/true');
    check('えらんだ日の天気', await page.evaluate(() => $('.wxday').textContent.replace(/\s+/g, '')), '☀️晴れ茨城県つくば市の天気予報25℃/14℃☂10%');
    await page.click('[data-d="2026-05-12"]'); await w(200);
    check('霜と雨の日はひとこと', await page.evaluate(() => [...document.querySelectorAll('.wxday .tip')].map(t => t.textContent.slice(0, 2)).join(',')), '🥶,☔ ');
    check('いちど取ったら3時間は取り直さない・出どころを書く', await page.evaluate(() => $('.calcard').textContent.includes('Open-Meteo.com')) + '/' + wxCalls, 'true/1');
    await page.click('nav [data-tab="crops"]'); await w(300);
    check('畑の上に天気の注意（霜・大雨・強風、気をつける野菜）', await page.evaluate(() => { return [...document.querySelectorAll('.wxboard .wxa b')].map(b => b.textContent).join(' / '); }), 'あす 5/11(月)：強い風（45km/h） / あさって 5/12(火)：霜（最低2℃） / あさって 5/12(火)：大雨（35mm）');
    check('霜は夏野菜と小さい苗だけ', await page.evaluate(() => document.querySelectorAll('.wxboard .wxa.frost small.cs')[0].textContent.includes('トマト')), true);
    check('水やりのひとこと（きのう雨・きょう雨の予報）', await page.evaluate(() => { const w = { days: {} }; w.days[addDays(today(), -1)] = { r: 12 }; const a = waterHint(w).t; w.days[addDays(today(), -1)] = { r: 0 }; w.days[today()] = { pp: 80, hi: 20 }; return a + ' | ' + waterHint(w).t; }), 'きのう雨（12mm）が降ったので、畑は水やり不要かも | きょうは雨の予報（80%）。畑は水やりお休みでよさそう');
    await page.click('.crop [data-open]'); await w(300);
    check('野菜の画面のカレンダーにも天気', await page.evaluate(() => document.querySelectorAll('.cd .wx').length > 0), true);
    await page.click('#backBtn'); await w(150);
    // ── バージョン・新しくなったこと ──
    const verJs = fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8').match(/APP_VERSION = '(v\d+)'/)[1];
    const swJs = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
    check('版と service-worker の CACHE が同じ・ASSETS に version.js', [swJs.includes(`'saien-note-${verJs}'`), swJs.includes("'./js/version.js'"), swJs.includes("'./js/grow.js'")], [true, true, true]);
    check('いちばん新しい「新しくなったこと」は今の版', await page.evaluate(() => WHATSNEW[0].v === APP_VERSION), true);
    await page.click('nav [data-tab="settings"]'); await w(200);
    check('設定にバージョン', await page.evaluate(() => $('.ver b').textContent), '菜園ノート ' + verJs);
    await page.click('#wnBtn'); await w(150);
    check('「新しくなったこと」の窓', await page.evaluate(() => document.querySelectorAll('#modalRoot details.wn').length === WHATSNEW.length && $('#modalRoot details.wn[open] summary').textContent.startsWith(APP_VERSION)), true);
    await page.click('#wnClose'); await w(100);
    const keep = json => page.evaluate(async j => { sessionStorage.setItem('keepSeen', '1'); localStorage.removeItem('saien_seen_ver'); await kvSet('data', j); }, json);
    await keep({ crops: [], logs: [] }); await open(); await w(900);
    check('はじめて使う人には新しくなったことを出さない', await page.evaluate(() => !document.querySelector('#noticeBar.show') && localStorage.getItem('saien_seen_ver') === APP_VERSION), true);
    await keep(JSON.parse(json).data); await open(); await w(900);
    check('v6 まで使っていた人（版をおぼえていない・野菜あり）には出す', await page.evaluate(() => !!document.querySelector('#noticeBar.show')), true);
    await page.evaluate(() => localStorage.setItem('saien_seen_ver', 'v1')); await open(); await w(900);
    check('前の版から開くと、下に「新しくなりました」', await page.evaluate(() => $('#noticeBar.show .nb-t').textContent + '/' + $('#noticeBar .nb-s').textContent), verJs + ' に新しくなりました/' + await page.evaluate(() => WHATSNEW[0].t));
    await page.click('#noticeBar .nb-yes'); await w(200);
    check('「見る」で中身・見たことになる', await page.evaluate(() => !!$('#modalRoot details.wn') + '/' + localStorage.getItem('saien_seen_ver')), 'true/' + verJs);
    await open(); await w(900);
    check('もう一度開いても出ない', await page.evaluate(() => !document.querySelector('#noticeBar.show')), true);
    await page.evaluate(() => swOfferUpdate({ postMessage: m => { window.__msg = m; } })); await w(100);
    check('新しい版：「いま更新」で入れかえを頼む', await page.evaluate(() => $('#noticeBar .nb-t').textContent), '新しい版が用意できました');
    await page.click('#noticeBar .nb-yes'); await w(100);
    check('SKIP_WAITING を送る', await page.evaluate(() => window.__msg), 'SKIP_WAITING');
    check('エラーなし', errs.join(' | '), '');
  } catch (e) { fail++; console.log('✗ 止まりました：', e.message.split('\n')[0], pass, await page.evaluate(() => JSON.stringify([view, history.state, history.length])).catch(() => '')); }
  await browser.close(); srv.close();
  console.log(`\n合計 ${pass + fail} 件 : 通った ${pass} / 通らなかった ${fail}`);
  process.exit(fail ? 1 : 0);
});
