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
  if (ok) pass++; else { fail++; console.log(`✗ ${name}\n   出た : ${JSON.stringify(got)}\n   期待 : ${JSON.stringify(want)}`); }
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
  await page.addInitScript(() => { window.APP_TODAY = '2026-05-10'; });
  const w = ms => page.waitForTimeout(ms);
  const open = async () => { await page.goto(URL); await page.waitForFunction(() => window.APP_READY); };
  try {
    // ── 前の菜園ノート（v1）のデータを引き継ぐ ──
    await open();
    await page.evaluate(async () => { await kvSet('data', { crops: [{ id: 'old1', emoji: '🍒', name: 'ミニトマト', variety: '', place: '', plantedAt: '2026-04-01', status: 'growing', memo: '' }], logs: [{ id: 'l1', cropId: 'old1', type: 'water', date: '2026-05-09', memo: '', ts: 1 }] }); });
    await open();
    check('前のデータを読める・名前から予定の野菜をさがす（ミニトマト→トマト）', await page.evaluate(() => { const c = data.crops[0]; return [c.name, c.plan, c.as, JSON.stringify(c.done), data.logs.length, data.settings.area].join('/'); }), 'ミニトマト/トマト/seed/{}/1/kanto');
    await page.evaluate(async () => { await kvSet('data', undefined); }); await open();

    // ── はじめて ──
    check('はじめは使い方の3つの手順', await page.evaluate(() => document.querySelectorAll('.steps > div').length + '/' + document.querySelector('.steps').textContent.includes('植えた野菜')), '4/true');
    check('下のタブ5つ', await page.evaluate(() => [...document.querySelectorAll('nav.tabs button')].map(b => b.textContent.trim()).join(',')), '🌱畑,📅予定,📝記録,📖育て方,⚙️設定');

    // ── 野菜を登録（苗から） ──
    await page.click('#fab'); await w(150);
    check('登録の窓：33種類の野菜＋その他', await page.evaluate(() => document.querySelectorAll('#cVeg button').length), 34);
    await page.click('#cVeg [data-p="トマト"]');
    check('野菜を押すと名前が入り、苗からを選べる', await page.evaluate(() => $('#cName').value + '/' + !$('#cAsBox').hidden + '/' + $('#cEmoBox').hidden), 'トマト/true/true');
    await page.click('#cAs [data-a="nae"]'); await page.fill('#cDate', '2026-04-25'); await page.fill('#cArea', '3');
    check('苗からにすると日の欄が「苗を植えるの日」', await page.evaluate(() => $('#cDateLb').textContent), '苗を植えるの日');
    await page.click('#cSave'); await w(250);
    const prs = () => page.evaluate(() => [...document.querySelectorAll('.plan .pr')].map(r => r.querySelector('.w').textContent + ' ' + r.querySelector('.d').textContent + ' ' + r.querySelector('.s').textContent));
    check('登録すると詳しい画面：苗から（植えるまでの作業は出さない）の予定', await prs(), ['苗を植える 4/25(土) 済', '花が咲く 5/10(日)〜5/25(月) いま（15日まで）', '追肥 5/25(月)〜6/4(木) あと15日', '収穫はじめ 6/9(火)〜6/24(水) あと30日', '収穫おわり 7/29(水)〜8/23(日) あと80日']);
    check('肥料・コツ・病気（広さ3㎡で全体の量）', await page.evaluate(() => [...document.querySelectorAll('details.more summary')].map(s => s.textContent.replace(/（.*/, '')).join(',') + '/' + document.querySelector('details.more').textContent.includes('3㎡で 360〜450g')), '🧪 肥料,💡 育て方のコツ,🐛 出やすい病気・害虫/true');

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
    await page.evaluate(async () => { data.settings.area = 'kanto'; await save(); }); await page.evaluate(() => render()); await w(150);

    // ── 畑の一覧 ──
    await page.click('#backBtn'); await w(200);
    await page.click('#fab'); await w(150); await page.click('#cVeg [data-p="ダイコン"]'); await page.fill('#cDate', '2026-04-20');
    check('種からしかない野菜は「どこから育てる」を出さない', await page.evaluate(() => $('#cAsBox').hidden), true);
    await page.click('#cSave'); await w(250); await page.click('#backBtn'); await w(200);
    check('一覧に「つぎの予定」のしるし', await page.evaluate(() => [...document.querySelectorAll('.crop')].map(c => c.querySelector('.name').textContent + ':' + (c.querySelector('.badge.next') || {}).textContent).join(' / ')), 'トマト:📅 花が咲く：いま（15日まで） / ダイコン:📅 2回目の間引き：あと5日');
    check('上に「近いうちにやること」（時期を過ぎたものも）', await page.evaluate(() => [...document.querySelectorAll('.task .tx b')].map(b => b.textContent).join(',')), '🥬 ダイコン：1回目の間引き,🍅 トマト：花が咲く,🥬 ダイコン：2回目の間引き');
    await page.click('.crop [data-water]'); await w(200);
    check('💧で今日の水やり', await page.evaluate(() => data.logs.filter(l => l.type === 'water').length + '/' + document.querySelector('.badge.water').textContent), '1/💧今日');

    // ── 予定（カレンダー） ──
    await page.click('nav [data-tab="plan"]'); await w(250);
    check('予定：2週間にやること', await page.evaluate(() => document.querySelectorAll('.task').length >= 4), true);
    check('カレンダー：5月・今日に印・予定の点', await page.evaluate(() => $('.calhead b').textContent + '/' + $('.cd.today .n').textContent + '/' + document.querySelector('[data-d="2026-05-15"] .mk').children.length), '2026年 5月/10/2');
    await page.click('[data-d="2026-05-15"]'); await w(200);
    check('日を押すとその日の予定', await page.evaluate(() => $('main h2:last-of-type').textContent + '/' + [...document.querySelectorAll('main .card .task .tx b')].slice(-2).map(b => b.textContent).join(',')), '2026年5月15日(金)/🍅 トマト：花が咲く,🥬 ダイコン：2回目の間引き');
    await page.click('#calNext'); await w(150);
    check('次の月へ', await page.evaluate(() => $('.calhead b').textContent), '2026年 6月');
    await page.click('#fab'); await w(150);
    check('予定の画面の＋は、選んだ日で記録', await page.evaluate(() => $('#lDate').value), '2026-05-15');
    await page.click('#lCancel');

    // ── 記録・集計 ──
    await page.click('nav [data-tab="logs"]'); await w(200);
    check('記録の一覧（観察・収穫・水やり）', await page.evaluate(() => document.querySelectorAll('.log').length), 3);
    await page.click('[data-sub="sum"]'); await w(200);
    check('集計：収穫の表', await page.evaluate(() => [...document.querySelectorAll('table')[0].querySelectorAll('td')].slice(0, 3).map(t => t.textContent).join('/')), '🍅 トマト/1回/5個');

    // ── 育て方 ──
    await page.click('nav [data-tab="guide"]'); await w(200);
    check('育て方：33種類', await page.evaluate(() => document.querySelectorAll('.vgrid button').length), 33);
    await page.fill('#gQ', 'イモ'); await w(150);
    check('名前でさがす', await page.evaluate(() => [...document.querySelectorAll('.vgrid button')].map(b => b.textContent).join(',')), '🥔ジャガイモ,🍠サツマイモ,🥔サトイモ');
    await page.click('[data-v="ジャガイモ"]'); await w(250);
    check('選ぶと向く時期・収穫まで・予定', await page.evaluate(() => $('.gsel').textContent.includes('2〜3月・8〜9月') + '/' + $('.gbig').textContent), 'true/収穫は 90〜110日後（8/8(土)〜8/28(金)）');
    await page.click('#gAdd'); await w(200);
    check('「畑に登録する」で登録の窓（中身が入っている）', await page.evaluate(() => $('#cName').value + '/' + document.querySelector('#cVeg .on').dataset.p + '/' + $('#cDate').value + '/' + $('#cDateLb').textContent), 'ジャガイモ/ジャガイモ/2026-05-10/植えつけの日');
    await page.click('#cSave'); await w(250);
    check('登録できた', await page.evaluate(() => data.crops.map(c => c.name).join(',')), 'トマト,ダイコン,ジャガイモ');

    // ── その他の野菜（予定なし） ──
    await page.click('#backBtn'); await w(150); await page.click('#fab'); await w(150);
    await page.click('#cVeg [data-p=""]'); await page.fill('#cName', 'バジル'); await page.click('#emo [data-e="🌿"]'); await page.click('#cSave'); await w(250);
    check('その他の野菜は予定の代わりに案内', await page.evaluate(() => document.querySelector('main').textContent.includes('予定は出ていません') + '/' + data.crops[3].emoji + data.crops[3].plan), 'true/🌿');

    // ── バックアップ ──
    const json = await page.evaluate(async () => JSON.stringify({ app: 'saien-note', version: 2, data, photos: {} }));
    await page.evaluate(async () => { data.crops = []; data.logs = []; await save(); });
    await page.evaluate(async j => { await importData(new File([j], 'b.json')); }, json); await w(100);
    check('バックアップから戻す', await page.evaluate(() => data.crops.length + '/' + data.logs.length + '/' + data.settings.area), '4/3/kanto');
    await open();
    check('開き直しても残る', await page.evaluate(() => data.crops.length), 4);
    check('エラーなし', errs.join(' | '), '');
  } catch (e) { fail++; console.log('✗ 止まりました：', e.message); }
  await browser.close(); srv.close();
  console.log(`\n合計 ${pass + fail} 件 : 通った ${pass} / 通らなかった ${fail}`);
  process.exit(fail ? 1 : 0);
});
