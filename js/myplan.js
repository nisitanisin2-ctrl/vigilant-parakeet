/* 自分の野菜・品種を足す・直す窓（data.myPlans）。
   一覧にない野菜や、日数がちがう品種を、作業（発芽・追肥・収穫など）と「何日目から何日目まで」で登録する。
   「似ている野菜」を選ぶと、その日数を写せて、絵・肥料・病気と害虫・コツもその野菜のものを使う */
'use strict';
function openMyPlanForm(p) {
  const isNew = !p;
  const w = isNew ? { n: '', i: '🌱', from: '種まき', sow: '', s: [['発芽', 5, 8], ['追肥', 30, 35], ['収穫', 60, 80]], base: '' } : JSON.parse(JSON.stringify(p));
  const s = openModal(`<h3>${isNew ? '⭐ 自分の野菜・品種を足す' : '⭐ 自分の野菜を直す'}</h3>
    <label class="f">名前（品種の名前でも）</label><input type="text" id="mpName" value="${esc(w.n)}" placeholder="例：アイコ（ミニトマト）・聖護院かぶ">
    <label class="f">似ている野菜（絵・肥料・病気と害虫・コツに使う）</label>
    <div class="row"><select id="mpBase" style="flex:1"><option value="">なし</option>${VEG_PLANS.map(v => `<option value="${esc(v.n)}" ${w.base === v.n ? 'selected' : ''}>${v.i} ${esc(v.n)}</option>`).join('')}</select>
      <button type="button" class="btn" id="mpCopy">日数を写す</button></div>
    <label class="f">絵</label><div class="pick emoji" id="mpEmo">${[...new Set([w.i, ...PRESETS.map(x => x[0]), '🫘', '🥗', '🌾', '🍈', '🍑', '🫐'])].map(e => `<button type="button" data-e="${e}" class="${w.i === e ? 'on' : ''}">${e}</button>`).join('')}</div>
    <label class="f">はじめの作業</label><div class="pick" id="mpFrom">${['種まき', '植えつけ'].map(x => `<button type="button" data-f="${x}" class="${w.from === x ? 'on' : ''}">${x}</button>`).join('')}</div>
    <label class="f">まく・植える時期（なくてもよい）</label><input type="text" id="mpSow" value="${esc(w.sow || '')}" placeholder="例：3〜4月・9〜10月">
    <label class="f">作業と日数（${'はじめの作業'}から何日目〜何日目）</label>
    <div id="mpSteps"></div>
    <button type="button" class="btn block" id="mpAdd" style="margin-top:6px">＋ 作業を足す</button>
    <p class="muted small">作業の名前に「発芽・間引き・追肥・花・収穫」などの言葉を入れると、カレンダーの色と育ち具合の絵がその作業に合います。「畑に植える」を入れると「苗から」も選べます。</p>
    <div class="actions"><button class="btn" id="mpCancel">やめる</button><button class="btn primary" id="mpSave">${isNew ? '足す' : '保存'}</button></div>
    ${isNew ? '' : '<div style="margin-top:16px"><button class="btn danger block" id="mpDel">この野菜を消す</button></div>'}`);
  const drawSteps = () => {
    $('#mpSteps').innerHTML = w.s.map(([what, a, b], i) => `<div class="mpstep"><input type="text" data-k="0" data-i="${i}" value="${esc(what)}" placeholder="作業"><input type="number" inputmode="numeric" data-k="1" data-i="${i}" value="${a}" min="0"><span>〜</span><input type="number" inputmode="numeric" data-k="2" data-i="${i}" value="${b}" min="0"><span>日</span><button type="button" class="x" data-del="${i}" aria-label="この作業を消す">✕</button></div>`).join('') || '<div class="muted">作業がありません。「＋ 作業を足す」で足してください</div>';
    s.querySelectorAll('#mpSteps input').forEach(inp => inp.oninput = () => { const i = +inp.dataset.i, k = +inp.dataset.k; w.s[i][k] = k ? Math.max(0, Math.round(Number(inp.value) || 0)) : inp.value; });
    s.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { w.s.splice(+b.dataset.del, 1); drawSteps(); });
  };
  drawSteps();
  s.querySelectorAll('#mpEmo button').forEach(b => b.onclick = () => { s.querySelectorAll('#mpEmo button').forEach(x => x.classList.remove('on')); b.classList.add('on'); w.i = b.dataset.e; });
  s.querySelectorAll('#mpFrom button').forEach(b => b.onclick = () => { s.querySelectorAll('#mpFrom button').forEach(x => x.classList.remove('on')); b.classList.add('on'); w.from = b.dataset.f; });
  $('#mpAdd').onclick = () => { const last = w.s[w.s.length - 1]; w.s.push(['', last ? last[2] : 0, last ? last[2] + 5 : 5]); drawSteps(); };
  $('#mpCopy').onclick = () => {
    const b = planByName($('#mpBase').value); if (!b) { toast('先に「似ている野菜」を選んでください'); return; }
    if (w.s.length && !confirm(`${b.n}の作業と日数を写します（いまの作業は置きかわります）。よろしいですか？`)) return;
    w.s = JSON.parse(JSON.stringify(b.s)); w.from = b.from || '種まき'; if (!$('#mpSow').value.trim()) $('#mpSow').value = b.sow || '';
    s.querySelectorAll('#mpFrom button').forEach(x => x.classList.toggle('on', x.dataset.f === w.from));
    if (w.i === '🌱') { w.i = b.i; s.querySelectorAll('#mpEmo button').forEach(x => x.classList.toggle('on', x.dataset.e === w.i)); }
    drawSteps(); toast(`${b.n}の日数を写しました。品種に合わせて直してください`);
  };
  $('#mpCancel').onclick = closeModal;
  $('#mpSave').onclick = async () => {
    const name = $('#mpName').value.trim();
    if (!name) { $('#mpName').focus(); toast('名前を入れてください'); return; }
    if (allPlans().some(x => x.n === name && x !== p)) { toast('同じ名前の野菜があります。ほかの名前にしてください'); return; }
    const steps = w.s.map(([what, a, b]) => [String(what).trim(), Math.max(0, +a || 0), Math.max(+a || 0, +b || 0)]).filter(x => x[0]).sort((x, y) => x[1] - y[1]);
    if (!steps.length) { toast('作業を1つ以上入れてください'); return; }
    const np = { n: name, i: w.i, from: w.from, sow: $('#mpSow').value.trim(), s: steps, base: $('#mpBase').value };
    if (isNew) data.myPlans.push(np);
    else {
      Object.assign(p, np);
      if (w.n !== name) data.crops.forEach(c => { if (c.plan === w.n) c.plan = name; });   // 名前を変えたら、その野菜を使っている畑の野菜も
    }
    await save(); closeModal(); guide.n = name; render();
    toast(isNew ? `⭐ ${name} を足しました。「この内容で畑に登録する」で畑に入れられます` : '保存しました', 2600);
  };
  if (!isNew) $('#mpDel').onclick = async () => {
    const n = data.crops.filter(c => c.plan === p.n).length;
    if (!confirm(`「${p.n}」を消しますか？${n ? `\n畑の野菜${n}件は、予定のない野菜になります（記録は残ります）。` : ''}`)) return;
    data.myPlans = data.myPlans.filter(x => x !== p);
    data.crops.forEach(c => { if (c.plan === p.n) { c.plan = ''; c.done = {}; } });
    await save(); closeModal(); guide.n = ''; render(); toast('消しました');
  };
}
