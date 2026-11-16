import { H } from './feature_manager_state.js';
import { fmRefreshClientOnly, fmAutoRepackIfStaged } from './feature_manager.js';

const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||18}" height="${s||18}" alt="" aria-hidden="true">`;
const PALETTE=['#c0392b','#2e86c1','#8e44ad','#16a085','#d68910','#7b5a2a'];
const E=v=>H.esc(v==null?'':v);
const short=n=>String(n||'').split('/').pop();

function closeLp(){ const o=document.getElementById('fx-lp'); if(o) o.remove(); document.removeEventListener('keydown', escLp); }
function escLp(e){ if(e.key==='Escape') closeLp(); }

export async function fmOpenLayoutPreview(rel, feature){
  closeLp();
  const ov=document.createElement('div');
  ov.id='fx-lp'; ov.className='fx-lp';
  ov.innerHTML=`<div class="fx-lp-box" role="dialog" aria-label="Layout preview"><div class="fx-lp-h">${IC('layout',22)} <b>${E(short(rel))}</b><span class="fx-dim">${E(rel)}</span>
    <button class="fx-x" data-lpclose title="close (Esc)">${IC('close',16)}</button></div>
    <div class="fx-lp-body"><div class="fx-skel"><div><i></i><i></i><i></i></div><div><i></i><i></i><i></i></div></div></div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{ if(e.target===ov||e.target.closest('[data-lpclose]')) closeLp(); });
  document.addEventListener('keydown', escLp);
  let p;
  try{ p=await H.fmGet('/api/features/layout-preview?rel='+encodeURIComponent(rel)+(feature?'&feature='+encodeURIComponent(feature):'')); }
  catch(e){ ov.querySelector('.fx-lp-body').innerHTML=`<div class="fx-note fx-bad">${IC('status_error',16)} ${E(H.errMessage(e))}</div>`; return; }
  render(ov, p, feature);
}

function render(ov, p, feature){
  const col={}; p.features.forEach((f,i)=>col[f]=PALETTE[i%PALETTE.length]);
  const vis=p.windows.filter(w=>w.w>0&&w.h>0);
  const xs=vis.map(w=>w.x), ys=vis.map(w=>w.y), x2=vis.map(w=>w.x+w.w), y2=vis.map(w=>w.y+w.h);
  const bx=Math.min(...xs,0), by=Math.min(...ys,0), bw=Math.max(...x2,1)-bx, bh=Math.max(...y2,1)-by;
  const sc=Math.min(760/bw, 560/bh, 2);
  const boxes=p.windows.map((w,i)=>{
    if(!(w.w>0&&w.h>0)) return '';
    const c=w.owner?col[w.owner]:null;
    const cls=['fx-lpw', w.visible?'':'hid', w.owner?'own':'', feature&&w.owner===feature?'mine':''].join(' ');
    const st=`left:${((w.x-bx)*sc).toFixed(1)}px;top:${((w.y-by)*sc).toFixed(1)}px;width:${(w.w*sc).toFixed(1)}px;height:${(w.h*sc).toFixed(1)}px;${c?`--c:${c};`:''}`;
    const tip=[w.name, w.type, w.text?'text: '+w.text:'', w.image?'image: '+w.image:'', w.owner?'section: '+w.owner:'', w.visible?'':'hidden (Visible=False)'].filter(Boolean).join('\n');
    return `<div class="${cls}" style="${st}" title="${E(tip)}" data-lpi="${i}">${w.text&&w.h*sc>10?`<span>${E(w.text)}</span>`:''}</div>`;
  }).join('');
  const ok=!p.errors.length&&!p.conflicts.length;
  const legend=p.features.map(f=>{ const s=p.sections[f]||{};
    return `<label class="fx-lpleg" style="--c:${col[f]}"><input type="checkbox" checked data-lpf="${E(f)}"><i></i><b>${E(f)}</b><small>+${(s.added||[]).length} window(s) · ${s.props||0} prop(s)${(s.removed||[]).length?' · −'+s.removed.length:''}</small></label>`; }).join('');
  const list=(title,arr,ic,cls)=>arr.length?`<div class="fx-lpsec"><div class="fx-lpsec-h">${IC(ic,16)} ${title} <span class="fx-dim">(${arr.length})</span></div>${arr.slice(0,40).map(x=>`<div class="fx-lpli ${cls||''}">${x}</div>`).join('')}${arr.length>40?`<div class="fx-dim">… ${arr.length-40} more</div>`:''}</div>`:'';
  const dv=p.diff_vs_game||{};
  const src={baseline:'the reference layout shipped with the tool', snapshot:'a snapshot of your client pkg (no reference yet for this layout)'}[p.base_source]||E(p.base_source||'?');
  ov.querySelector('.fx-lp-body').innerHTML=`
    <div class="fx-lp-canvas-wrap">
      <div class="fx-lp-tools"><label class="fx-toggle"><input type="checkbox" data-lphid><i></i> Show hidden windows</label>
        <label class="fx-toggle"><input type="checkbox" data-lpdim${feature?' checked':''}><i></i> Highlight ${E(feature||'sections')} only</label></div>
      <div class="fx-lp-canvas${feature?' dim':''}" style="width:${(bw*sc).toFixed(0)}px;height:${(bh*sc).toFixed(0)}px">${boxes}</div>
      <div class="fx-lp-hover fx-dim">Hover a window to read its name, type and owner.</div>
    </div>
    <div class="fx-lp-side">
      <div class="fx-lp-verdict fx-${ok?'ok':'bad'}">${IC(ok?'status_success':'status_error',20)} <b>${ok?'Valid — ready to install':'Not installable as is'}</b>
        <small>Built from ${src}, plus the section of each feature below.</small></div>
      <div class="fx-lpsec"><div class="fx-lpsec-h">${IC('feature',16)} Sections</div>${legend}</div>
      ${list('Syntax errors',p.errors.map(E),'status_error','fx-bad')}
      ${list('Conflicts',p.conflicts.map(c=>E(c.text)),'status_error','fx-bad')}
      ${list('Resolved automatically',p.notes.map(n=>E(short(n.window)+(n.prop?'.'+n.prop:'')+' → '+(n.chosen||'kept')+' — '+n.why)),'status_info')}
      <div class="fx-lpsec"><div class="fx-lpsec-h">${IC('history',16)} Compared with what the game reads (${E(p.game_source||'nothing')})</div>
        ${(dv.added||[]).length+(dv.removed||[]).length+(dv.changed||[]).length===0?`<div class="fx-lpli fx-ok">${IC('status_success',14)} Same windows and properties — installing changes nothing visible.</div>`:''}
        ${(dv.added||[]).slice(0,20).map(n=>`<div class="fx-lpli fx-ok">+ ${E(short(n))}</div>`).join('')}
        ${(dv.removed||[]).slice(0,20).map(n=>`<div class="fx-lpli fx-bad">− ${E(short(n))}</div>`).join('')}
        ${(dv.changed||[]).slice(0,20).map(c=>`<div class="fx-lpli fx-warn">~ ${E(short(c.window))} <small>${E(c.props.join(', '))}</small></div>`).join('')}
      </div>
      <details class="fx-lpsec"><summary class="fx-lpsec-h">${IC('file_details',16)} XML (${(p.xml||'').length} chars)</summary><pre class="fx-lp-xml">${E(p.xml)}</pre></details>
      <div class="fx-lp-act">
        <button class="fx-btn gold" data-lpinstall${ok?'':' disabled'} title="${ok?'write this layout into game_unpacked, then repack':'fix the errors / conflicts first'}">${IC('install',18)} Install this version</button>
        <button class="fx-btn" data-lpcopy>${IC('copy',18)} Copy XML</button>
      </div>
    </div>`;
  const cv=ov.querySelector('.fx-lp-canvas'), hov=ov.querySelector('.fx-lp-hover');
  ov.querySelector('[data-lphid]').onchange=e=>cv.classList.toggle('showhid', e.target.checked);
  ov.querySelector('[data-lpdim]').onchange=e=>cv.classList.toggle('dim', e.target.checked);
  ov.querySelectorAll('[data-lpf]').forEach(cb=>cb.onchange=()=>{
    const off=[...ov.querySelectorAll('[data-lpf]')].filter(x=>!x.checked).map(x=>x.dataset.lpf);
    cv.querySelectorAll('.fx-lpw').forEach(el=>{ const w=p.windows[+el.dataset.lpi]; el.classList.toggle('off', !!(w&&w.owner&&off.includes(w.owner))); });
  });
  cv.addEventListener('mouseover',e=>{ const el=e.target.closest('.fx-lpw'); if(!el) return; const w=p.windows[+el.dataset.lpi];
    hov.innerHTML=`<b>${E(short(w.name))}</b> · ${E(w.type)}${w.owner?` · <span style="color:${col[w.owner]}">${E(w.owner)}</span>`:''}${w.visible?'':' · hidden'}${w.text?' · “'+E(w.text)+'”':''}<br><small>${E(w.name)} — ${Math.round(w.w)}×${Math.round(w.h)} at ${Math.round(w.x)},${Math.round(w.y)}</small>`; });
  ov.querySelector('[data-lpcopy]').onclick=async()=>{ try{ await navigator.clipboard.writeText(p.xml); H.toast('XML copied','ok'); }catch(e){ H.toast('copy failed','error'); } };
  const ib=ov.querySelector('[data-lpinstall]');
  ib.onclick=()=>H.runBusy(ib, async()=>{
    try{
      const r=await H.fmPost('/api/features/layout-install',{rel:p.rel});
      H.toast(short(r.rel)+' installed in game_unpacked ('+r.features.join(' + ')+')','ok');
      closeLp();
      if(feature) await fmRefreshClientOnly(feature);
      await fmAutoRepackIfStaged(true);
    }catch(e){ H.toast(H.errMessage(e),'error'); }
  });
}
