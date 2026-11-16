/* ============================================================================
   FEATURE MANAGER — parts (sub-features) of the features merged by subject.

   Source = `parts` of /api/features (list) and /api/features/detail/<f>/client
   (features_manager.feature_parts_state): metadata in feature_parts.json, client
   parts re-read from registry.c, server parts from the feature's mempatch.json.
   - A CLIENT part has a switch: eden_user.ini [<feature>] <part> of the
     configured client (never eden_patch.ini). The DLL reads it once at start.
   - A SERVER part has no switch: it ships inside the feature's single manifest.
   - The list search also matches the old feature names (arena_1v1, guild_icon…)
     and lights up the matching part.
   ============================================================================ */
import { H, fm } from './feature_manager_state.js';

const E=v=>H.esc(v==null?'':v);
const SIDE={client:'Client',server:'Server',both:'Both'};

export function fmPartsKeys(f){
  return (f.parts||[]).map(p=>[p.id,p.old,p.title,p.client_part,p.server_part].filter(Boolean).join(' ')).join(' | ').toLowerCase();
}
function partKey(p){ return [p.id,p.old,p.title,p.client_part,p.server_part].filter(Boolean).join(' ').toLowerCase(); }
function partIcon(p, feat){ return p.icon?'/studio/icons/features/parts/'+encodeURIComponent(p.icon)+'.png':'/studio/icons/features/'+encodeURIComponent(p.old||feat)+'.png'; }
function partState(p){
  if(p.state==null) return 'srv';
  return p.state?'on':'off';
}
function stateText(p){
  if(p.state==null) return 'server part: follows the feature\'s server manifest';
  return (p.state?'on':'off')+(p.explicit?' (set in eden_user.ini)':' (default)')+(p.note?' — '+p.note:'');
}

export function fmPartsRowHtml(f){
  const ps=f.parts||[]; if(!ps.length) return '';
  return `<span class="fm-parts">${ps.map(p=>{
    const st=partState(p);
    return `<span class="fm-pt fm-pt-${st}" data-fmpk="${E(partKey(p))}" title="${E((p.title||p.id)+(p.old?' (was '+p.old+')':'')+' — '+stateText(p))}"><img src="${partIcon(p,f.name)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/studio/icons/features/${E(f.name)}.png'">${E(String(p.id).replace(/_/g,' '))}</span>`;
  }).join('')}</span>`;
}

export function fmPaintRowParts(row, f){
  if(!row) return;
  row.dataset.fmparts=fmPartsKeys(f);
  const cur=row.querySelector('.fm-parts'), html=fmPartsRowHtml(f);
  if(cur){ if(html) cur.outerHTML=html; else cur.remove(); }
  else if(html){ const nm=row.querySelector('.fm-nm'); if(nm) nm.insertAdjacentHTML('beforeend',html); }
  fmMarkPartHits(row, (fm()._search||'').trim().toLowerCase());
}

export function fmMarkPartHits(row, q){
  row.querySelectorAll('.fm-pt').forEach(c=>c.classList.toggle('hit',!!q&&(c.dataset.fmpk||'').includes(q)));
}

function sideBadge(p){
  return `<span class="fx-ptside fx-ptside-${E(p.side)}">${E(SIDE[p.side]||p.side)}</span>`;
}
function partRow(d, p, q){
  const hit=q&&partKey(p).includes(q)&&!String(d.name).toLowerCase().includes(q);
  let ctl;
  if(p.client_part&&p.in_registry){
    const on=!!p.state;
    ctl=`<label class="fx-ptsw" title="${E('eden_user.ini ['+d.name+'] '+p.client_part+' — read at the next game start')}">
        <input type="checkbox" data-fmpart="${E(p.client_part)}"${on?' checked':''}><i></i><b>${on?'On':'Off'}</b></label>`;
  }else if(p.client_part){
    ctl=`<span class="fx-ptnote fx-warn" title="the DLL of this repo has no such part yet">not in this registry.c</span>`;
  }else{
    ctl=`<span class="fx-ptnote">Follows the server manifest</span>`;
  }
  const dflt=p.default==null?'—':(p.default?'On':'Off');
  const real=p.state==null?'':`<span class="fx-ptst fx-${p.state?'ok':'bad'}">${p.state?'On':'Off'} in your client${p.explicit?'':' (default)'}</span>`;
  const srv=p.server_part?`<span class="fx-dim">server part <code>${E(p.server_part)}</code>${p.server_version?' v'+E(p.server_version):''}${p.in_manifest===false?' — <span class="fx-warn">not in the manifest</span>':''}</span>`:'';
  return `<div class="fx-ptrow${hit?' hit':''}" data-fmpartrow="${E(p.id)}">
      <img class="fx-ptico" src="${partIcon(p,d.name)}" alt="" onerror="this.onerror=null;this.src='/studio/icons/features/${E(d.name)}.png'">
      <div class="fx-ptmain">
        <div class="fx-pttop"><b>${E(p.title||p.id)}</b>${sideBadge(p)}${p.old?`<span class="fx-dim">was <code>${E(p.old)}</code></span>`:''}${p.unlisted?'<span class="fx-warn" title="found in registry.c / the manifest but not described in feature_parts.json yet">new</span>':''}</div>
        ${p.desc?`<div class="fx-ptdesc">${E(p.desc)}</div>`:''}
        <div class="fx-ptmeta"><span>Default: <b>${dflt}</b></span>${real}${srv}${p.note?`<span class="fx-warn">${E(p.note)}</span>`:''}</div>
      </div>
      <div class="fx-ptctl">${ctl}</div>
    </div>`;
}

export function fmPartsCardHtml(d){
  const ps=d.parts||[]; if(!ps.length) return '';
  const q=(fm()._search||'').trim().toLowerCase();
  const nCli=ps.filter(p=>p.client_part&&p.in_registry).length;
  const ini=d.user_ini?`<code>${E(d.user_ini)}</code>`:'eden_user.ini of your client';
  return `<section class="fx-card" id="fm-card-parts"><div class="fx-card-h"><img class="fx-i" src="/studio/icons/icons/48/feature.png" width="26" height="26" alt="" aria-hidden="true"><div class="fx-card-t"><h2>Parts (${ps.length})</h2>
      <p>${nCli?`Client switches are saved in ${ini}, section [${E(d.name)}], and apply at the next game start (players switch them in Settings &gt; Features).`:'Server parts ship inside the feature\'s single server manifest.'}</p></div></div>
    <div class="fx-ptlist">${ps.map(p=>partRow(d,p,q)).join('')}</div></section>`;
}

export function fmWireParts(root, d){
  root.querySelectorAll('[data-fmpart]').forEach(cb=>cb.onchange=async()=>{
    const part=cb.dataset.fmpart, enable=cb.checked;
    cb.disabled=true;
    try{
      const r=await H.fmPost('/api/features/client/part',{name:d.name, part, enable});
      d.parts=r.parts||d.parts;
      const f=(fm().list&&fm().list.features||[]).find(x=>x.name===d.name);
      if(f){ f.parts=d.parts; fmPaintRowParts(document.querySelector('[data-fmsel="'+CSS.escape(d.name)+'"]'), f); }
      const card=document.getElementById('fm-card-parts');
      if(card){ card.outerHTML=fmPartsCardHtml(d); const nc=document.getElementById('fm-card-parts'); if(nc) fmWireParts(nc, d); }
      H.toast(d.name+' / '+part+' '+(enable?'on':'off')+' — applies at the next game start','ok');
    }catch(e){
      cb.checked=!enable; cb.disabled=false;
      H.toast('could not switch '+part+': '+H.errMessage(e),'error');
    }
  });
  const hit=root.querySelector('.fx-ptrow.hit'), k=fmPartsHitKey(d);
  if(hit&&k&&fm()._ptScrolled!==k){ fm()._ptScrolled=k; setTimeout(()=>hit.scrollIntoView({block:'center',behavior:'smooth'}),60); }
}

export function fmPartsHitKey(d){
  const q=(fm()._search||'').trim().toLowerCase();
  if(!q||!d||String(d.name).toLowerCase().includes(q)) return '';
  return (d.parts||[]).some(p=>partKey(p).includes(q))?d.name+'|'+q:'';
}
