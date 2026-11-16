import { H } from './feature_manager_state.js';

const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||18}" height="${s||18}" alt="" aria-hidden="true">`;
const E=v=>H.esc(v==null?'':String(v));
const FM_VIDEO_NOTE='Ideas, not a script: use your own words, your own style, your own order.';
const featLabel=(name,title)=>title||String(name||'').replace(/_/g,' ');

let _guides=[];

function fmVideoText(name, title, g){
  g=g||{};
  const out=[];
  out.push(g.title||featLabel(name,title));
  out.push('Feature: '+featLabel(name,title)+(title?' ('+name+')':''));
  if(g.pitch) out.push(g.pitch);
  out.push('', FM_VIDEO_NOTE);
  if(g.skip_reason) out.push('', 'Nothing to film: '+g.skip_reason);
  const list=(h,a)=>{ if(a&&a.length){ out.push('', h); a.forEach(x=>out.push('- '+x)); } };
  list('Before recording:', g.setup);
  if((g.scenes||[]).length){
    out.push('', 'Scenes:');
    g.scenes.forEach((s,i)=>{ out.push((i+1)+'. '+s.show); if(s.tip) out.push('   Idea: '+s.tip); });
  }
  list('How to open it:', g.keys);
  list('Better not to show:', g.avoid);
  return out.join('\n')+'\n';
}

function guideBody(g){
  const list=(cls,ic,h,a)=>a&&a.length?`<div class="fx-vg-sec ${cls}"><div class="fx-vg-h">${IC(ic,16)} ${h}</div><ul>${a.map(x=>`<li>${E(x)}</li>`).join('')}</ul></div>`:'';
  const scenes=(g.scenes||[]).map((s,i)=>`<li><span class="fx-tnum">${i+1}</span><div><b>${E(s.show)}</b>${s.tip?`<small>${IC('info',14)} ${E(s.tip)}</small>`:''}</div></li>`).join('');
  return `${g.title?`<div class="fx-vg-title">${E(g.title)}</div>`:''}${g.pitch?`<p class="fx-vg-pitch">${E(g.pitch)}</p>`:''}
    ${g.skip_reason?`<div class="fx-note">${IC('status_off',16)} Nothing to film for this one: ${E(g.skip_reason)}</div>`:''}
    ${list('','checklist','Before recording',g.setup)}
    ${scenes?`<div class="fx-vg-sec"><div class="fx-vg-h">${IC('video',16)} Scenes</div><ol class="fx-vg-scenes">${scenes}</ol></div>`:''}
    ${list('','help','How to open it',g.keys)}
    ${list('fx-vg-avoid','status_warning','Better not to show',g.avoid)}`;
}

export function fmVideoGuideHtml(d){
  const g=d&&d.video;
  if(!g) return '';
  return `<section class="fx-card fx-vg"><div class="fx-card-h">${IC('video',26)}<div class="fx-card-t"><h2>Video guide</h2><p>A short scenario for a video about ${E(featLabel(d.name,d.feature_title))}.</p></div>
      <div class="fx-toolbar"><button class="mini" data-fxvgcopy="${E(d.name)}" title="copy this guide as plain text">${IC('copy')} Copy</button></div></div>
    <div class="fx-note fx-vg-note">${IC('status_info',16)} ${FM_VIDEO_NOTE}</div>
    ${guideBody(g)}</section>`;
}

async function copyText(txt){
  try{ await navigator.clipboard.writeText(txt); return true; }catch(_){}
  const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select();
  let ok=false; try{ ok=document.execCommand('copy'); }catch(_){} ta.remove(); return ok;
}

async function copyGuide(name, title, g){
  const ok=await copyText(fmVideoText(name, title, g));
  H.toast(ok?'Video guide copied':'copy failed', ok?'ok':'error');
}

export function fmWireVideo(root, d){
  root.querySelectorAll('[data-fxvgcopy]').forEach(b=>b.onclick=()=>copyGuide(d.name, d.feature_title, d.video));
}

function matches(x, q){
  if(!q) return true;
  const g=x.guide||{};
  const hay=[x.name, x.title, g.title, g.pitch, ...(g.scenes||[]).map(s=>s.show+' '+(s.tip||'')), ...(g.keys||[])].join(' ').toLowerCase();
  return q.split(/\s+/).every(w=>hay.includes(w));
}

function cardHtml(x){
  const g=x.guide||{};
  return `<details class="fx-vg-item" data-fxvgname="${E(x.name)}"><summary>
      <img class="fx-vg-ico" src="/studio/icons/features/${E(x.name)}.png" alt="" loading="lazy" onerror="this.onerror=null;this.src='/studio/icons/icons/48/feature.png'">
      <span class="fx-vg-sum"><b>${E(featLabel(x.name,x.title))}</b><span>${E(g.title||'')}</span>${g.pitch?`<small>${E(g.pitch)}</small>`:''}</span>
      <span class="fx-vg-n">${g.skip_reason&&!(g.scenes||[]).length?'nothing to film':(g.scenes||[]).length+' scene'+((g.scenes||[]).length>1?'s':'')}</span>
      <span class="fx-chev">${IC('chevron_right',14)}</span></summary>
    <div class="fx-vg-b"><div class="fx-toolbar"><button class="mini" data-fxvgcopy="${E(x.name)}">${IC('copy')} Copy</button><button class="mini" data-fxvgopen="${E(x.name)}" title="open this feature on the Video guide tab">${IC('open_external')} Open feature</button></div>
      ${guideBody(g)}</div></details>`;
}

function paintList(root, q){
  const box=root.querySelector('#fx-vg-list'); if(!box) return;
  const shown=_guides.filter(x=>matches(x,q));
  const cnt=root.querySelector('#fx-vg-count'); if(cnt) cnt.textContent=shown.length===_guides.length?String(_guides.length):shown.length+' / '+_guides.length;
  box.innerHTML=shown.length?shown.map(cardHtml).join('')
    :`<div class="fx-empty">${IC('video',32)}<div><b>${_guides.length?'No guide matches':'No video guide yet'}</b><span>${_guides.length?'Try another word.':'Guides appear here once a feature ships its video.json (Pull latest features).'}</span></div></div>`;
}

export async function fmOpenVideoGuides(openFeature){
  const main=H.$('#fm-main'); if(!main) return;
  document.querySelectorAll('.fm-row.on').forEach(r=>r.classList.remove('on'));
  main.innerHTML=`<div class="fx-detail fx-vgs"><section class="fx-card"><div class="fx-card-h">${IC('video',26)}<div class="fx-card-t"><h2>Video guides</h2><p>For YouTubers: one short scenario per feature (<span id="fx-vg-count">…</span>). Open one, copy it, film it your way.</p></div></div>
      <div class="fx-note fx-vg-note">${IC('status_info',16)} ${FM_VIDEO_NOTE}</div>
      <div class="fm-search fx-vg-search"><div class="mapcombo"><span class="pin">${IC('search',20)}</span><input id="fx-vg-q" placeholder="Search a feature, a scene, a key…" autocomplete="off" spellcheck="false"><span class="clr" id="fx-vg-x">✕</span></div></div>
      <div id="fx-vg-list" class="fx-vg-list"><div class="fx-skel sm">${[1,2,3].map(()=>'<div><i></i><i></i><i></i></div>').join('')}</div></div></section></div>`;
  let j;
  try{ j=await H.fmGet('/api/features/videos'); }
  catch(e){ const b=main.querySelector('#fx-vg-list'); if(b) b.innerHTML=`<div class="fx-note fx-bad">${IC('status_error',16)} ${E(H.errMessage?H.errMessage(e):e)}</div>`; return; }
  if(!main.querySelector('.fx-vgs')) return;
  _guides=(j&&j.guides)||[];
  const q=main.querySelector('#fx-vg-q');
  const run=()=>paintList(main, (q.value||'').trim().toLowerCase());
  run();
  q.oninput=run;
  main.querySelector('#fx-vg-x').onclick=()=>{ q.value=''; run(); q.focus(); };
  main.querySelector('#fx-vg-list').addEventListener('click',ev=>{
    const c=ev.target.closest('[data-fxvgcopy]');
    if(c){ ev.preventDefault(); const x=_guides.find(y=>y.name===c.dataset.fxvgcopy); if(x) copyGuide(x.name, x.title, x.guide); return; }
    const o=ev.target.closest('[data-fxvgopen]');
    if(o){ ev.preventDefault(); if(openFeature) openFeature(o.dataset.fxvgopen); }
  });
}
