/* ============================================================================
   ENTITY - bloc « AI definition » + animations, dans l'onglet Skills d'un monstre.

   Une ligne de c_ai.ini est PARTAGEE par plusieurs monstres. Changer l'id d'IA
   d'un monstre (champ 38) est sur ; editer la ligne c_ai.ini elle-meme ne l'est
   pas - d'ou l'avertissement `shared_by` et le fait que le decodage reste en
   LECTURE SEULE. Seuls le champ 38 (id d'IA) et le champ 13 (element / attribut
   d'attaque) sont ecrivables ici, et ils sont PAR MONSTRE.

   Les deux chargements sont asynchrones et l'utilisateur peut changer de fiche
   entre-temps : on re-verifie `cur().id === mid` APRES le fetch, sinon on
   ecrirait le bloc d'un monstre dans la fiche d'un autre.
   ============================================================================ */
import { H, cur, S } from './entity_state.js';

// --- AI catalog (field defs + element labels) — fetched once, reused for the dropdowns.
async function getAiCatalog(){
  if(S.aiCatalog)return S.aiCatalog;
  try{S.aiCatalog=await(await fetch('/api/ai/catalog')).json();}
  catch(e){S.aiCatalog={fields:[],element_labels:{},behavior_labels:{}};}
  return S.aiCatalog;
}
// Build the editor block: AI id (numeric input + Apply) and element / attack-attribute dropdown.
// Writing these is per-monster (c_monster fields 38 & 13) and safe — it only repoints/tunes
// THIS monster, it never edits the shared c_ai.ini row.
async function aiEditorHTML(d){
  const cat=await getAiCatalog();
  const labels=cat.element_labels||cat.behavior_labels||{};
  const curBeh=(cur().fields[13]&&cur().fields[13].value!=null)?String(cur().fields[13].value).trim():'';
  // behavior options: union of catalog keys (1..9) and the monster's current value.
  const keys=Object.keys(labels).map(k=>String(parseInt(k,10))).filter(k=>k!=='NaN');
  const seen=new Set(keys); if(curBeh!==''&&!seen.has(curBeh))keys.push(curBeh);
  keys.sort((a,b)=>(+a)-(+b));
  const hasLabels=keys.length>0;
  const opts=keys.map(k=>{const lb=labels[k]||labels[String(k)]||'';
    return `<option value="${H.esc(k)}"${k===curBeh?' selected':''}>${H.esc(k)}${lb?' — '+H.esc(lb):''}</option>`;}).join('');
  const sharedWarn=d.shared_by>1
    ? `<div class="aiwarn"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> This AI row (#${H.esc(d.ai_id)}) is shared by ${H.esc(d.shared_by)} monsters. Changing this monster's AI id is safe; do NOT edit the shared c_ai.ini row.</div>`
    : '';
  const behBlock=hasLabels
    ? `<div class="aied-row"><label class="aied-l">Element (attack attribute) (field 13)</label>
         <select id="ai-beh-sel" class="aied-sel">${opts}</select></div>`
    : `<div class="aied-row"><label class="aied-l">Element (attack attribute) (field 13)</label>
         <input id="ai-beh-in" class="aied-in" type="number" min="0" step="1" value="${H.esc(curBeh)}">
         <button class="hbtn" id="ai-beh-apply">Apply</button></div>`;
  return `<div class="aiedit">
    <div class="aied-row"><label class="aied-l">AI id (field 38 → c_ai.ini)</label>
      <input id="ai-id-in" class="aied-in" type="number" min="0" step="1" value="${H.esc(d.ai_id)}">
      <button class="hbtn gold" id="ai-id-apply">Apply</button>
      <span class="aied-hint">Selects which c_ai.ini row defines this monster's behavior.</span></div>
    ${behBlock}
    ${sharedWarn}
  </div>`;
}
function bindAiEditor(mid){
  const idIn=H.$('#ai-id-in'), idBtn=H.$('#ai-id-apply');
  if(idBtn)idBtn.onclick=async()=>{
    const v=parseInt(idIn.value,10);
    if(isNaN(v)||v<0){H.toast('AI id must be a non-negative integer','error');return;}
    H.showOverlay('Setting AI id…');
    let j;try{const r=await fetch('/api/monster/'+mid+'/ai_id?ai_id='+v,{method:'POST'});j=await r.json();if(!r.ok)throw new Error(j.detail||'failed');}
    catch(e){H.hideOverlay();H.toast(H.errMessage(e),'error');return;}
    if(cur()&&cur().fields[38])cur().fields[38].value=String(v);
    H.hideOverlay();H.toast('AI id set to '+v,'ok');
    loadAiDef();   // re-fetch -> shows the LIVE definition of the new AI row
  };
  const behSel=H.$('#ai-beh-sel'), behIn=H.$('#ai-beh-in'), behBtn=H.$('#ai-beh-apply');
  const applyBeh=async(v)=>{
    if(isNaN(v)||v<0){H.toast('Behavior must be a non-negative integer','error');return;}
    H.showOverlay('Setting behavior…');
    let j;try{const r=await fetch('/api/monster/'+mid+'/ai_behavior?value='+v,{method:'POST'});j=await r.json();if(!r.ok)throw new Error(j.detail||'failed');}
    catch(e){H.hideOverlay();H.toast(H.errMessage(e),'error');return;}
    if(cur()&&cur().fields[13])cur().fields[13].value=String(v);
    H.hideOverlay();H.toast('Behavior set to '+v,'ok');
  };
  if(behSel)behSel.onchange=()=>applyBeh(parseInt(behSel.value,10));
  if(behBtn)behBtn.onclick=()=>applyBeh(parseInt(behIn.value,10));
}

// --- AI definition: readable decode of the monster's c_ai.ini row (labels from ai_fields).
async function loadAiDef(){
  const host=H.$('#ai-def'); if(!host||!cur())return; const mid=cur().id;
  let d; try{d=await(await fetch('/api/monster/'+mid+'/ai')).json();}
  catch(e){host.innerHTML='<div class="dtblhead"><img src="/studio/icons/icons/24/ai_definition.png" srcset="/studio/icons/icons/24/ai_definition.png 1x, /icons/icons/64/ai_definition.png 2x" class="ui-icon" width="24" height="24" alt="" aria-hidden="true"> AI definition</div><div class="esub">failed to load AI</div>';return;}
  if(!cur()||cur().id!==mid)return;            // user switched entity meanwhile
  if(d.ai_id===null){
    // No AI yet: still let the user assign one (writes field 38) + tune behavior (field 13).
    host.innerHTML='<div class="dtblhead"><img src="/studio/icons/icons/24/ai_definition.png" srcset="/studio/icons/icons/24/ai_definition.png 1x, /icons/icons/64/ai_definition.png 2x" class="ui-icon" width="24" height="24" alt="" aria-hidden="true"> AI definition</div>'+
      '<div class="esub">This monster has no AI (field 38 empty). Assign an AI id below.</div>'+
      await aiEditorHTML({ai_id:'',shared_by:0});
    bindAiEditor(mid);return;
  }
  const editor=await aiEditorHTML(d);
  if(!d.fields||!d.fields.length){
    host.innerHTML=`<div class="dtblhead">${H.iconMarkup('ai_definition',24)} AI definition (AI #${H.esc(d.ai_id)})</div>`+
      `<div class="esub">AI #${H.esc(d.ai_id)} has no row in c_ai.ini.</div>`+editor;
    bindAiEditor(mid);return;
  }
  const SKILL_IDX={15:1,17:2,19:3}, CD_FOR={15:14,17:16,19:18};
  const byIdx={}; d.fields.forEach(f=>byIdx[f.idx]=f);
  const conf=c=>c==='sure'?'':` <span class="aiconf ${c==='probable'?'prob':'unk'}" title="confidence: ${c}">${c==='probable'?'~':'?'}</span>`;
  // Skill slots (15/17/19) shown with their resolved name + paired cooldown (14/16/18).
  let skillRows='';
  [15,17,19].forEach(si=>{
    const sf=byIdx[si]; if(!sf)return;
    const has=sf.value&&sf.value!=='0'&&sf.value.trim()!=='';
    const cd=byIdx[CD_FOR[si]], cdv=cd&&cd.value&&cd.value!=='0'?cd.value:'';
    skillRows+=`<tr><td class="aik">Skill ${SKILL_IDX[si]}</td><td class="aiv">`+
      (has?`<span class="aiskill">${H.esc(sf.skill_name||('#'+sf.value))}</span> <span class="sb">#${H.esc(sf.value)}</span>`+
            (cdv?` <span class="sb"><img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> cooldown ${H.esc(cdv)}s</span>`:''):'<span class="aimute">— empty —</span>')+
      `</td></tr>`;
  });
  // Behavior flags decoded chips.
  const flags=(d.behavior_flags_decoded||[]);
  const flagChips=flags.length?flags.map(fl=>`<span class="aiflag" title="bit ${fl.bit}">${H.esc(fl.label)}</span>`).join(' '):'<span class="aimute">none</span>';
  // Remaining (non-skill, non-cooldown) fields as a readable table.
  const SKIP=new Set([0,14,15,16,17,18,19]);   // id + the 3 skill/cooldown pairs (shown above)
  let genRows='';
  d.fields.forEach(f=>{ if(SKIP.has(f.idx))return;
    const v=(f.value==null||f.value.trim()==='')?'—':f.value;
    genRows+=`<tr title="${H.esc(f.desc)}"><td class="aik">${H.esc(f.label)}${conf(f.confidence)}</td><td class="aiv">${H.esc(v)}</td></tr>`;
  });
  host.innerHTML=`<div class="dtblhead">${H.iconMarkup('ai_definition',24)} AI definition (AI #${H.esc(d.ai_id)})`+
    (d.shared_by>1?` <span class="sb" title="this AI row is shared by several monsters">shared by ${H.esc(d.shared_by)}</span>`:'')+`</div>`+
    editor+
    `<div class="aicards">`+
      `<div class="acard"><div class="acard-h"><img src="/studio/icons/icons/24/objectives.png" srcset="/studio/icons/icons/24/objectives.png 1x, /icons/icons/48/objectives.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> AI skill slots</div><table class="aitbl">${skillRows}</table></div>`+
      `<div class="acard"><div class="acard-h">🚩 Behavior flags</div><div style="padding:2px 0">${flagChips}</div></div>`+
    `</div>`+
    `<table class="aitbl aigen">${genRows}</table>`+
    `<div class="note" style="color:var(--faint);font-size:11.5px;margin-top:10px;font-style:italic">Read-only decode of c_ai.ini (labels reverse-engineered from the ZoneServer). <span class="aiconf prob">~</span> = probable, <span class="aiconf unk">?</span> = unknown.</div>`;
  bindAiEditor(mid);
}

// --- Animations: list the monster's .kf clips, grouped by family (Idle/Move/Attack/…).
async function loadMonAnims(){
  const host=H.$('#mon-anims'); if(!host||!cur())return; const mid=cur().id;
  let d; try{d=await(await fetch('/api/monster/'+mid+'/animations')).json();}
  catch(e){host.innerHTML='<div class="dtblhead"><img src="/studio/icons/icons/24/animations.png" srcset="/studio/icons/icons/24/animations.png 1x, /icons/icons/64/animations.png 2x" class="ui-icon" width="24" height="24" alt="" aria-hidden="true"> Animations</div><div class="esub">failed to load animations</div>';return;}
  if(!cur()||cur().id!==mid)return;
  const head=`<div class="dtblhead">${H.iconMarkup('animations',24)} Animations${d.model?' <span class="sb">'+H.esc(d.model)+'.kf</span>':''}</div>`;
  if(!d.animations||!d.animations.length){host.innerHTML=head+`<div class="esub">${H.esc(d.message||'No animations.')}</div>`;return;}
  // group by family title (preserve first-seen order)
  const groups=[],byG={};
  d.animations.forEach(a=>{const g=a.group||'Other';if(!byG[g]){byG[g]=[];groups.push(g);}byG[g].push(a);});
  // Filter bar: "All" + a button per preferred family that is present, then any extra families.
  const PREF=['Idle','Move','Run','Walk','Attack','Combat','Magic','Shoot','Skill','Hurt','Death'];
  const ordered=PREF.filter(g=>byG[g]).concat(groups.filter(g=>!PREF.includes(g)));
  const filters=['All'].concat(ordered);
  const renderBlocks=sel=>ordered.filter(g=>sel==='All'||g===sel).map(g=>
    `<div class="animgrp"><div class="animgrp-h">${H.esc(g)} <span class="animcnt">${byG[g].length}</span></div>`+
    `<div class="animchips">`+byG[g].map(a=>`<span class="animchip" title="${H.esc(a.label)}">${H.esc(a.name)}</span>`).join('')+`</div></div>`).join('');
  const bar=`<div class="animfilters">`+filters.map((g,i)=>
    `<button class="animfilter${i===0?' on':''}" data-anf="${H.esc(g)}">${H.esc(g)}${g==='All'?'':' <span class="animcnt">'+byG[g].length+'</span>'}</button>`).join('')+`</div>`;
  host.innerHTML=head+`<div class="esub" style="margin-bottom:6px">${d.animations.length} animation clip(s).</div>`+
    bar+`<div class="animwrap" id="animwrap">${renderBlocks('All')}</div>`;
  host.querySelectorAll('.animfilter').forEach(b=>b.onclick=()=>{
    host.querySelectorAll('.animfilter').forEach(x=>x.classList.toggle('on',x===b));
    const w=H.$('#animwrap');if(w)w.innerHTML=renderBlocks(b.dataset.anf);
  });
}

export { loadAiDef, loadMonAnims };
