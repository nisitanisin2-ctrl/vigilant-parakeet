/* QRコードを作る（表電卓の v408 のものをそのまま使う）。
   電波のない所でも出せるよう、外の道具は使わずここで作る。文字は UTF-8 のバイトで入れ、
   型番（大きさ）は入る最小のもの、マスクは読み取りやすさの減点がいちばん少ないもの（JIS X 0510 の決まりどおり）。 */
'use strict';
const QR_ECL={ L:0, M:1, Q:2, H:3 };
const QR_FMT_BITS={ L:1, M:0, Q:3, H:2 };   // 形式情報に入れる誤り訂正レベルの2ビット
/* 型番ごと・レベルごとの「1ブロックの誤り訂正の数」と「ブロックの数」（型番1〜40） */
const QR_EC_PER_BLOCK=[
  [7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  [10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  [13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  [17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]];
const QR_NUM_BLOCKS=[
  [1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
  [1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
  [1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
  [1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]];
/* 型番 v の、データと誤り訂正を合わせた使えるビット数 */
function qrRawModules(v){
  let n=(16*v+128)*v+64;
  if(v>=2){ const na=Math.floor(v/7)+2; n-=(25*na-10)*na-55; if(v>=7) n-=36; }
  return n;
}
function qrDataCodewords(v, e){
  return Math.floor(qrRawModules(v)/8) - QR_EC_PER_BLOCK[e][v-1]*QR_NUM_BLOCKS[e][v-1];
}
/* リード・ソロモン（GF(256)、原始多項式 0x11D） */
function qrGfMul(x, y){
  let z=0;
  for(let i=7;i>=0;i--){ z=(z<<1)^((z>>>7)*0x11D); z^=((y>>>i)&1)*x; }
  return z&0xFF;
}
function qrRsDivisor(deg){
  const r=new Array(deg).fill(0); r[deg-1]=1;
  let root=1;
  for(let i=0;i<deg;i++){
    for(let j=0;j<r.length;j++){ r[j]=qrGfMul(r[j], root); if(j+1<r.length) r[j]^=r[j+1]; }
    root=qrGfMul(root, 0x02);
  }
  return r;
}
function qrRsRemainder(data, div){
  const r=div.map(()=>0);
  for(const b of data){
    const f=b^r.shift(); r.push(0);
    div.forEach((c,i)=>{ r[i]^=qrGfMul(c, f); });
  }
  return r;
}
/* 文字 → QR のマス目（true＝黒）。ecl は 'L'|'M'|'Q'|'H'。入りきらなければ null。
   forceMask はテスト用（マスクを決め打ちにする） */
function qrEncode(text, ecl, forceMask){
  ecl=QR_ECL[ecl]!=null?ecl:'M';
  const e=QR_ECL[ecl];
  const bytes=Array.from(new TextEncoder().encode(String(text)));
  // 入る最小の型番
  let ver=0;
  for(let v=1; v<=40; v++){
    const ccBits=(v<=9)?8:16;
    if(4+ccBits+bytes.length*8 <= qrDataCodewords(v,e)*8){ ver=v; break; }
  }
  if(!ver) return null;
  // ビット列：モード(0100)・文字数・データ・終端・0詰め・埋め草
  const bits=[];
  const put=(val,len)=>{ for(let i=len-1;i>=0;i--) bits.push((val>>>i)&1); };
  put(4,4); put(bytes.length, ver<=9?8:16); bytes.forEach(b=>put(b,8));
  const cap=qrDataCodewords(ver,e)*8;
  put(0, Math.min(4, cap-bits.length));
  put(0, (8-bits.length%8)%8);
  for(let pad=0xEC; bits.length<cap; pad^=0xEC^0x11) put(pad,8);
  const data=[];
  for(let i=0;i<bits.length;i+=8){ let b=0; for(let j=0;j<8;j++) b=(b<<1)|bits[i+j]; data.push(b); }
  // ブロックに分けて誤り訂正を付け、交互に並べる
  const nb=QR_NUM_BLOCKS[e][ver-1], ecLen=QR_EC_PER_BLOCK[e][ver-1];
  const rawCw=Math.floor(qrRawModules(ver)/8);
  const nShort=nb - rawCw%nb, shortLen=Math.floor(rawCw/nb);
  const div=qrRsDivisor(ecLen);
  const blocks=[];
  for(let i=0,k=0;i<nb;i++){
    const dl=shortLen-ecLen+(i<nShort?0:1);
    const d=data.slice(k,k+dl); k+=dl;
    const ec=qrRsRemainder(d, div);
    if(i<nShort) d.push(0);                   // 短いブロックは詰め物（並べるときに飛ばす）
    blocks.push(d.concat(ec));
  }
  const cw=[];
  for(let i=0;i<blocks[0].length;i++){
    blocks.forEach((bl,j)=>{ if(i!==shortLen-ecLen || j>=nShort) cw.push(bl[i]); });
  }
  // マス目
  const size=ver*4+17;
  const mod=[...Array(size)].map(()=>new Array(size).fill(false));
  const fn=[...Array(size)].map(()=>new Array(size).fill(false));   // 決まった模様のマス（データを入れない）
  const set=(x,y,dark)=>{ mod[y][x]=dark; fn[y][x]=true; };
  // タイミングパターン
  for(let i=0;i<size;i++){ set(6,i,i%2===0); set(i,6,i%2===0); }
  // 位置検出パターン（三隅）
  const finder=(x,y)=>{
    for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++){
      const d=Math.max(Math.abs(dx),Math.abs(dy)), xx=x+dx, yy=y+dy;
      if(xx>=0&&xx<size&&yy>=0&&yy<size) set(xx,yy, d!==2&&d!==4);
    }
  };
  finder(3,3); finder(size-4,3); finder(3,size-4);
  // 位置合わせパターン
  const align=[];
  if(ver>1){
    const n=Math.floor(ver/7)+2;
    const step=(ver===32)?26:Math.ceil((ver*4+4)/(n*2-2))*2;
    align.push(6);
    for(let p=size-7; align.length<n; p-=step) align.splice(1,0,p);
  }
  align.forEach((ax,i)=>align.forEach((ay,j)=>{
    if((i===0&&j===0)||(i===0&&j===align.length-1)||(i===align.length-1&&j===0)) return;
    for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) set(ax+dx, ay+dy, Math.max(Math.abs(dx),Math.abs(dy))!==1);
  }));
  // 形式情報（あとで本当の値を入れる。ここでは場所をおさえるだけ）
  const drawFormat=(mask)=>{
    const d=(QR_FMT_BITS[ecl]<<3)|mask;
    let r=d; for(let i=0;i<10;i++) r=(r<<1)^((r>>>9)*0x537);
    const b=((d<<10)|r)^0x5412;
    const bit=i=>((b>>>i)&1)!==0;
    for(let i=0;i<=5;i++) set(8,i,bit(i));
    set(8,7,bit(6)); set(8,8,bit(7)); set(7,8,bit(8));
    for(let i=9;i<15;i++) set(14-i,8,bit(i));
    for(let i=0;i<8;i++) set(size-1-i,8,bit(i));
    for(let i=8;i<15;i++) set(8,size-15+i,bit(i));
    set(8,size-8,true);                         // いつも黒の1マス
  };
  drawFormat(0);
  // 型番情報（型番7以上）
  if(ver>=7){
    let r=ver; for(let i=0;i<12;i++) r=(r<<1)^((r>>>11)*0x1F25);
    const b=(ver<<12)|r;
    for(let i=0;i<18;i++){
      const dark=((b>>>i)&1)!==0, a=size-11+i%3, c=Math.floor(i/3);
      set(a,c,dark); set(c,a,dark);
    }
  }
  // データをジグザグに入れる
  let bi=0;
  for(let right=size-1; right>=1; right-=2){
    if(right===6) right=5;
    for(let vert=0; vert<size; vert++){
      for(let j=0;j<2;j++){
        const x=right-j, up=((right+1)&2)===0, y=up?size-1-vert:vert;
        if(!fn[y][x] && bi<cw.length*8){ mod[y][x]=((cw[bi>>>3]>>>(7-(bi&7)))&1)!==0; bi++; }
      }
    }
  }
  // マスク（8種類）を試して、減点のいちばん少ないものを選ぶ
  const maskFn=[
    (x,y)=>(x+y)%2===0, (x,y)=>y%2===0, (x,y)=>x%3===0, (x,y)=>(x+y)%3===0,
    (x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0, (x,y)=>x*y%2+x*y%3===0,
    (x,y)=>(x*y%2+x*y%3)%2===0, (x,y)=>((x+y)%2+x*y%3)%2===0];
  const applyMask=m=>{ for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(!fn[y][x] && maskFn[m](x,y)) mod[y][x]=!mod[y][x]; };
  let best=0, bestP=Infinity;
  for(let m=0;m<8;m++){
    if(forceMask!=null && m!==forceMask) continue;
    applyMask(m); drawFormat(m);
    const p=qrPenalty(mod, size);
    if(p<bestP){ bestP=p; best=m; }
    applyMask(m);                               // もう一度かけると元に戻る
  }
  applyMask(best); drawFormat(best);
  return { size, modules:mod, version:ver, mask:best, ecl };
}
/* 読み取りやすさの減点（同じ色の連続・2×2の塊・位置検出に似た並び・黒白の比率） */
function qrPenalty(mod, size){
  let p=0;
  const runs=(get)=>{
    for(let a=0;a<size;a++){
      let col=false, len=0; const hist=[0,0,0,0,0,0,0];
      const push=(l)=>{ if(hist[0]===0) l+=size; hist.pop(); hist.unshift(l); };
      const fp=()=>{ const n=hist[1]; const core=n>0&&hist[2]===n&&hist[3]===n*3&&hist[4]===n&&hist[5]===n;
        return (core&&hist[0]>=n*4&&hist[6]>=n?1:0)+(core&&hist[6]>=n*4&&hist[0]>=n?1:0); };
      for(let b=0;b<size;b++){
        const d=get(a,b);
        if(d===col){ len++; if(len===5) p+=3; else if(len>5) p++; }
        else { push(len); if(!col) p+=fp()*40; col=d; len=1; }
      }
      // 行の終わり
      if(col){ push(len); len=0; }
      len+=size; push(len);
      p+=fp()*40;
    }
  };
  runs((a,b)=>mod[a][b]);
  runs((a,b)=>mod[b][a]);
  for(let y=0;y<size-1;y++) for(let x=0;x<size-1;x++){
    const c=mod[y][x]; if(c===mod[y][x+1]&&c===mod[y+1][x]&&c===mod[y+1][x+1]) p+=3;
  }
  let dark=0; mod.forEach(r=>r.forEach(v=>{ if(v) dark++; }));
  const total=size*size, k=Math.ceil(Math.abs(dark*20-total*10)/total)-1;
  p+=k*10;
  return p;
}

function qrDraw(cv, text, scale){
  const q=qrEncode(text, 'M'); if(!q || !cv) return null;
  const quiet=4, n=q.size+quiet*2, sc=scale||8;
  cv.width=n*sc; cv.height=n*sc;
  const cx=cv.getContext('2d');
  cx.fillStyle='#ffffff'; cx.fillRect(0,0,cv.width,cv.height);
  cx.fillStyle='#000000';
  for(let y=0;y<q.size;y++) for(let x=0;x<q.size;x++) if(q.modules[y][x]) cx.fillRect((x+quiet)*sc,(y+quiet)*sc,sc,sc);
  return q;
}
