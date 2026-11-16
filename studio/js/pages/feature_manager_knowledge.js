import { H } from './feature_manager_state.js';

const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||18}" height="${s||18}" alt="" aria-hidden="true">`;
const E=v=>H.esc(v==null?'':String(v));

let _guides=[];

function inline(s){
  return E(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function cells(l){
  let t=l.trim(); if(t.startsWith('|')) t=t.slice(1); if(t.endsWith('|')) t=t.slice(0,-1);
  return t.split('|').map(c=>c.trim());
}

export function fmKnowledgeMd(md){
  const L=String(md||'').replace(/\r\n?/g,'\n').split('\n'), out=[];
  const li=/^(\s*)([-*]|\d+\.)\s+/;
  const sep=/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  let i=0;
  while(i<L.length){
    const l=L[i], t=l.trim();
    if(!t){ i++; continue; }
    if(/^```/.test(t)){
      const buf=[]; i++;
      while(i<L.length&&!/^```/.test(L[i].trim())){ buf.push(L[i]); i++; }
      i++; out.push(`<pre class="fx-kn-code"><code>${E(buf.join('\n'))}</code></pre>`); continue;
    }
    const h=/^(#{1,6})\s+(.*)$/.exec(t);
    if(h){ const n=Math.min(h[1].length+1,6); out.push(`<h${n} class="fx-kn-h">${inline(h[2])}</h${n}>`); i++; continue; }
    if(/^(-{3,}|\*{3,})$/.test(t)){ out.push('<hr>'); i++; continue; }
    if(t.startsWith('|')&&i+1<L.length&&sep.test(L[i+1])){
      const head=cells(t); i+=2; const rows=[];
      while(i<L.length&&L[i].trim().startsWith('|')){ rows.push(cells(L[i])); i++; }
      out.push(`<div class="fx-kn-tw"><table class="fx-kn-table"><thead><tr>${head.map(c=>`<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${head.map((_,k)=>`<td>${inline(r[k]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if(/^>/.test(t)){
      const buf=[]; while(i<L.length&&/^\s*>/.test(L[i])){ buf.push(L[i].replace(/^\s*>\s?/,'')); i++; }
      out.push(`<blockquote class="fx-kn-q">${inline(buf.join(' '))}</blockquote>`); continue;
    }
    if(li.test(l)){
      const tag=/^\s*\d+\./.test(l)?'ol':'ul', items=[];
      while(i<L.length&&li.test(L[i])){
        const ind=li.exec(L[i])[1].length;
        items.push(`<li${ind>=2?' class="fx-kn-sub"':''}>${inline(L[i].replace(li,''))}</li>`); i++;
      }
      out.push(`<${tag} class="fx-kn-list">${items.join('')}</${tag}>`); continue;
    }
    const buf=[];
    while(i<L.length&&L[i].trim()&&!/^(```|#{1,6}\s|>|\||(-{3,}|\*{3,})$)/.test(L[i].trim())&&!li.test(L[i])){ buf.push(L[i].trim()); i++; }
    if(!buf.length){ buf.push(t); i++; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('');
}

async function copyText(txt){
  try{ await navigator.clipboard.writeText(txt); return true; }catch(_){}
  const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select();
  let ok=false; try{ ok=document.execCommand('copy'); }catch(_){} ta.remove(); return ok;
}

function download(name, txt){
  const url=URL.createObjectURL(new Blob([txt],{type:'text/markdown;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download=name+'.md'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const kb=n=>n<1024?n+' B':(n/1024).toFixed(n<10240?1:0)+' KB';

function matches(x, q){
  if(!q) return true;
  const hay=[x.name, x.title, x.summary, x.markdown].join(' ').toLowerCase();
  return q.split(/\s+/).every(w=>hay.includes(w));
}

function cardHtml(x){
  return `<details class="fx-vg-item" data-fxknname="${E(x.name)}"><summary>
      <span class="fx-kn-ico">${IC('file_details',26)}</span>
      <span class="fx-vg-sum"><b>${E(x.title)}</b>${x.summary?`<small>${E(x.summary)}</small>`:''}</span>
      <span class="fx-vg-n">${E(kb(x.size))}</span>
      <span class="fx-chev">${IC('chevron_right',14)}</span></summary>
    <div class="fx-vg-b"><div class="fx-toolbar"><button class="mini" data-fxkncopy="${E(x.name)}">${IC('copy')} Copy markdown</button><button class="mini" data-fxkndl="${E(x.name)}">${IC('file')} Download .md</button></div>
      <div class="fx-kn-body" data-fxknbody="${E(x.name)}"></div></div></details>`;
}

function fill(d){
  const b=d.querySelector('[data-fxknbody]'); if(!b||b.dataset.done) return;
  const x=_guides.find(y=>y.name===b.dataset.fxknbody); if(!x) return;
  b.innerHTML=fmKnowledgeMd(x.markdown); b.dataset.done='1';
}

function paintList(root, q){
  const box=root.querySelector('#fx-kn-list'); if(!box) return;
  const shown=_guides.filter(x=>matches(x,q));
  const cnt=root.querySelector('#fx-kn-count'); if(cnt) cnt.textContent=shown.length===_guides.length?String(_guides.length):shown.length+' / '+_guides.length;
  box.innerHTML=shown.length?shown.map(cardHtml).join('')
    :`<div class="fx-empty">${IC('file_details',32)}<div><b>${_guides.length?'No guide matches':'No guide yet'}</b><span>${_guides.length?'Try another word.':'Reference guides appear here once they ship in the tool knowledge folder.'}</span></div></div>`;
  if(shown.length===1){ const d=box.querySelector('details'); if(d){ d.open=true; fill(d); } }
}

export async function fmOpenKnowledge(){
  const main=H.$('#fm-main'); if(!main) return;
  document.querySelectorAll('.fm-row.on').forEach(r=>r.classList.remove('on'));
  main.innerHTML=`<div class="fx-detail fx-vgs"><section class="fx-card"><div class="fx-card-h">${IC('file_details',26)}<div class="fx-card-t"><h2>Knowledge</h2><p>Reference guides shipped with the tool (<span id="fx-kn-count">…</span>). Read them here, or copy the raw markdown to feed your own tools.</p></div></div>
      <div class="fm-search fx-vg-search"><div class="mapcombo"><span class="pin">${IC('search',20)}</span><input id="fx-kn-q" placeholder="Search a guide, a word, an address…" autocomplete="off" spellcheck="false"><span class="clr" id="fx-kn-x">✕</span></div></div>
      <div id="fx-kn-list" class="fx-vg-list"><div class="fx-skel sm">${[1,2,3].map(()=>'<div><i></i><i></i><i></i></div>').join('')}</div></div></section></div>`;
  let j;
  try{ j=await H.fmGet('/api/knowledge'); }
  catch(e){ const b=main.querySelector('#fx-kn-list'); if(b) b.innerHTML=`<div class="fx-note fx-bad">${IC('status_error',16)} ${E(H.errMessage?H.errMessage(e):e)}</div>`; return; }
  if(!main.querySelector('.fx-vgs')) return;
  _guides=(j&&j.guides)||[];
  const q=main.querySelector('#fx-kn-q');
  const run=()=>paintList(main,(q.value||'').trim().toLowerCase());
  run();
  q.oninput=run;
  main.querySelector('#fx-kn-x').onclick=()=>{ q.value=''; run(); q.focus(); };
  const list=main.querySelector('#fx-kn-list');
  list.addEventListener('toggle',ev=>{ if(ev.target.open) fill(ev.target); },true);
  list.addEventListener('click',async ev=>{
    const c=ev.target.closest('[data-fxkncopy]');
    if(c){ ev.preventDefault(); const x=_guides.find(y=>y.name===c.dataset.fxkncopy); if(x){ const ok=await copyText(x.markdown); H.toast(ok?'Markdown copied':'copy failed', ok?'ok':'error'); } return; }
    const d=ev.target.closest('[data-fxkndl]');
    if(d){ ev.preventDefault(); const x=_guides.find(y=>y.name===d.dataset.fxkndl); if(x) download(x.name, x.markdown); }
  });
}
