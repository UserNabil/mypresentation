/* ============================================================================
   ENTITY - le corps de la fiche : les ONGLETS. panel(t) est l'aiguilleur ;
   chaque onglet a sa fabrique. Code COPIE d'index.html.

   Pieges consignes ici :
   - Un onglet en mode lecture rend du texte, en mode edition un <input>. Les
     deux chemins doivent lire la MEME valeur : draftVal(f.i) d'abord (le
     brouillon non sauvegarde), la valeur du fichier ensuite. Inverser les deux
     fait « perdre » une saisie des qu'on change d'onglet.
   - Le glossaire (showInfo/saveGloss) RE-FETCHE l'entite apres ecriture et
     re-rend les panneaux : sans ca l'annotation ne s'affiche qu'au prochain
     chargement de la fiche.
   - Le drapeau `is-open` d'une pastille « i » porte le TROISIEME etat du bouton
     (icone enfoncee) tant que le popover est ouvert ; :active seul retombait au
     relachement. Ce cablage est un ecouteur au niveau DOCUMENT : il est pose
     par wireInfoDots(), appele une seule fois depuis initEntity().
   - Mail reward : le ZoneServer ne l'envoie QUE pour les monstres d'evenement
     (60001-61000 / 64501-65530). Hors de cette plage l'entree est ecrite mais
     ignoree - d'ou la banniere, sinon on croit a un bug de sauvegarde.
   ============================================================================ */
import { H, cur, ed, dr, FN, draftVal } from './entity_state.js';
import { resistIconPanel, gradeSelect } from './entity_views.js';
import { loadAiDef, loadMonAnims } from './entity_ai.js';
import { renderPanels } from './entity.js';

function panel(t){if(t==='loot')return lootPanel();if(t==='raw')return rawPanel();
  if(t==='skills')return skillsPanel();if(t==='usedby')return usedByPanel();
  if(t==='resist'&&cur().etype==='monster')return resistIconPanel();
  if(t==='stats')return platesPanel(t);                 // le radar est a cote du modele
  return platesPanel(t);}

function skillsPanel(){const common=cur().skills||[], cd=cur().countdown_skills||[], buffs=cur().buffs||[];
  const card=s=>`<div class="skillcard">
    <div class="skillicon" data-openspell="${s.spell_id}" style="cursor:pointer">${s.icon?H.iconImg('spell',s.icon,''):'<img src="/studio/icons/icons/24/generation_3d.png" srcset="/studio/icons/icons/24/generation_3d.png 1x, /studio/icons/icons/48/generation_3d.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">'}</div>
    <div style="flex:1;min-width:0;cursor:pointer" data-openspell="${s.spell_id}"><div class="skillname">${H.esc(s.name)}</div>
      <div class="skillmeta">${s.mp&&s.mp!=='0'?`<span class="sb"><img src="/studio/icons/icons/24/enchants.png" srcset="/studio/icons/icons/24/enchants.png 1x, /studio/icons/icons/48/enchants.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> ${H.esc(s.mp)} MP</span>`:''}${s.cast&&s.cast!=='0'?`<span class="sb"><img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> cast ${H.esc(s.cast)}</span>`:''}<span class="sb">#${s.spell_id}</span></div></div>
    ${ed()?`<span class="delx" data-rmskill="${s.spell_id}" title="remove skill">✕</span>`:`<span data-openspell="${s.spell_id}" style="color:var(--gold);font-size:18px;cursor:pointer">›</span>`}</div>`;
  const cdcard=s=>`<div class="skillcard">
    <div class="skillicon" data-openspell="${s.spell_id}" style="cursor:pointer">${s.icon?H.iconImg('spell',s.icon,''):'<img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">'}</div>
    <div style="flex:1;min-width:0;cursor:pointer" data-openspell="${s.spell_id}"><div class="skillname">${H.esc(s.name)}</div>
      <div class="skillmeta"><span class="sb"><img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> countdown</span><span class="sb">#${s.spell_id}</span></div></div>
    ${ed()?`<span class="delx" data-rmcd="${s.spell_id}" title="remove countdown skill">✕</span>`:`<span data-openspell="${s.spell_id}" style="color:var(--gold);font-size:18px;cursor:pointer">›</span>`}</div>`;
  const buffcard=b=>`<div class="skillcard">
    <div class="skillicon" style="background:linear-gradient(135deg,#7a4fb0,#4a2d70);color:#fff">✨</div>
    <div style="flex:1;min-width:0"><div class="skillname">${H.esc(b.name)}</div>
      <div class="skillmeta">${b.desc?`<span class="sb" title="${H.esc(b.desc)}">${H.esc(b.desc.slice(0,60))}${b.desc.length>60?'…':''}</span>`:''}<span class="sb">enchant #${b.enchant_id}</span><span class="sb">field ${b.field_index}</span></div></div>
    ${ed()?`<span class="delx" data-rmbuff="${b.enchant_id}" title="remove buff">✕</span>`:''}</div>`;
  let h=`<div class="dtblhead"><img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /studio/icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Common Skill (${common.length})
      ${ed()?`<span class="addbtn" data-grantskill="1" style="margin:0 0 0 auto">+ Grant skill</span>`:''}</div>`;
  h+=common.length?`<div class="skillgrid">${common.map(card).join('')}</div>`:'<div class="esub">No common skill.</div>';
  h+=`<div class="dtblhead" style="margin-top:18px"><img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Countdown Skill (${cd.length})
      ${ed()?`<span class="addbtn" data-grantcd="1" style="margin:0 0 0 auto">+ Add countdown</span>`:''}</div>`;
  h+=cd.length?`<div class="skillgrid">${cd.map(cdcard).join('')}</div>`:'<div class="esub">No countdown skill.</div>';
  h+=`<div class="dtblhead" style="margin-top:18px">✨ Buffs / Auras (${buffs.length})
      ${ed()?`<span class="addbtn" data-grantbuff="1" style="margin:0 0 0 auto">+ Add buff</span>`:''}</div>`;
  h+=buffs.length?`<div class="skillgrid">${buffs.map(buffcard).join('')}</div>`:'<div class="esub">No buff.</div>';
  h+=`<div class="note" style="color:var(--faint);font-size:11.5px;margin-top:14px;font-style:italic">Common skills = fields 44-47. Countdown = c_ai.ini (field 38 → AI). Buffs/auras = enchants (fields 42-43).</div>`;
  // AI definition (readable c_ai.ini decode) + animations — async, loaded after the panel mounts.
  h+=`<div id="ai-def" style="margin-top:22px"><div class="dtblhead">${H.iconMarkup('ai_definition',24)} AI definition</div><div class="esub">⟳ loading AI…</div></div>`;
  h+=`<div id="mon-anims" style="margin-top:22px"><div class="dtblhead">${H.iconMarkup('animations',24)} Animations</div><div class="esub">⟳ loading animations…</div></div>`;
  setTimeout(loadAiDef,0);setTimeout(loadMonAnims,0);
  return h;}

function usedByPanel(){const u=cur().used_by||[];if(!u.length)return '<div class="esub">Not used by any monster.</div>';
  return `<div class="esub" style="margin-bottom:10px">Cast by ${cur().used_by_count} monster(s)${cur().used_by_count>u.length?' (showing '+u.length+')':''}:</div>
    <div class="plates">`+u.map(m=>`<div class="plate" data-openmon="${m.id}" style="cursor:pointer">
    <div class="lootslot"><img src="/studio/icons/icons/24/creatures.png" srcset="/studio/icons/icons/24/creatures.png 1x, /studio/icons/icons/48/creatures.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></div><div style="flex:1;min-width:0"><div class="pk">monster #${m.id}</div><div class="pv" style="font-size:15px">${H.esc(m.name)}</div></div>
    <span style="color:var(--gold)">›</span></div>`).join('')+'</div>';}
const infoDot=f=>(f.doc||(f.observed&&f.observed.length)||(f.allowed&&f.allowed.length))?`<span class="infodot" data-info="${f.i}" title="field help">i</span>`:'';
function isIconField(f){return /icon code|icon \(alt\)|^icon$/i.test(f.label)||((cur().etype==='item'||cur().etype==='spell')&&f.i===1);}
function fieldInput(f,v){
  if(cur().etype==='item'&&f.i===3)return gradeSelect(f,v);
  // valeurs AUTORISÉES (catalogue RE, avec leur sens) en priorité ; sinon valeurs observées.
  const opts=(f.allowed&&f.allowed.length)?f.allowed
            :((f.observed&&f.observed.length)?f.observed.map(o=>({v:o.v,label:o.label})):null);
  const dl=opts?`<datalist id="dl${f.i}">${opts.map(o=>`<option value="${H.esc(o.v)}">${H.esc(o.label||'')}</option>`).join('')}</datalist>`:'';
  const browse=isIconField(f)?`<button class="iconbrowse" data-iconbrowse="${f.i}" title="Browse icons"><img src="/studio/icons/icons/24/image.png" srcset="/studio/icons/icons/24/image.png 1x, /studio/icons/icons/48/image.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></button>`:'';
  return `<div style="display:flex;gap:5px;align-items:center"><input data-fi="${f.i}" value="${H.esc(v)}" ${opts?`list="dl${f.i}"`:''} style="flex:1">${browse}</div>${dl}`;}
function platesPanel(cat){const fs=FN(cat);if(!fs.length)return '<div class="esub">No fields.</div>';
  return '<div class="plates">'+fs.map(f=>{const dv=draftVal(f.i),v=dv!==null?dv:f.value;
    return `<div class="plate${dv!==null?' dirty':''}"><div class="ic">${H.statIcon(f.label)}</div>
      <div style="flex:1;min-width:0"><div class="pk">${H.esc(f.label)}${infoDot(f)}</div>
      ${ed()?fieldInput(f,v):`<div class="pv">${H.esc(v||'0')}${f.cur_label?`<span class="vlbl">${H.esc(f.cur_label)}</span>`:''}</div>`}</div></div>`;}).join('')+'</div>';}
function rawPanel(){return cur().fields.map(f=>{const dv=draftVal(f.i),v=dv!==null?dv:f.value;
  return `<div class="rawrow"><span class="rid">${f.i}</span><span class="rlbl"><span class="catpill">${f.cat}</span> ${H.esc(f.label)}${infoDot(f)}</span>
    ${ed()?fieldInput(f,v):`<span class="rval" ${dv!==null?'style="color:var(--gold2)"':''}>${H.esc(v)||'—'}${f.cur_label?`<span class="vlbl">${H.esc(f.cur_label)}</span>`:''}</span>`}</div>`;}).join('');}
// field info popover — editable glossary (devs annotate meaning + value labels)
function showInfo(idx,anchor){
  const f=cur().fields.find(x=>x.i===idx);if(!f)return;const pop=H.$('#infopop');
  let h=`<div class="it">${H.esc(f.label)} <span style="color:var(--faint);font-weight:400">(field ${f.i})</span>${f.doc_custom?' <span class="vlbl"><img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> custom</span>':''}</div>`;
  h+=`<div style="color:var(--dim);font-size:11px;margin-bottom:2px">What this field means (editable):</div>
      <textarea id="gl-fdesc" placeholder="describe this field…">${H.esc(f.doc||'')}</textarea>
      <button class="gl-save" id="gl-fsave">Save field meaning</button>`;
  if(f.observed&&f.observed.length){
    h+=`<div class="obs">Values seen in game data — label what each means:</div><div class="gl-vals">`+
      f.observed.slice(0,25).map(o=>`<div class="gl-vrow"><span class="ov">${H.esc(o.v)} <small>×${o.count}</small></span>
        <input class="gl-vlabel" data-v="${H.esc(o.v)}" value="${H.esc(o.label||'')}" placeholder="meaning…"></div>`).join('')+`</div>`;
  }
  pop.innerHTML=h;pop.classList.add('open');
  const r=anchor.getBoundingClientRect();let top=r.bottom+6,left=Math.min(r.left,innerWidth-340);
  if(top+pop.offsetHeight>innerHeight)top=Math.max(8,r.top-pop.offsetHeight-6);
  pop.style.top=Math.max(8,top)+'px';pop.style.left=Math.max(8,left)+'px';
  H.$('#gl-fsave').onclick=()=>saveGloss(f.i,{field_desc:H.$('#gl-fdesc').value});
  pop.querySelectorAll('.gl-vlabel').forEach(inp=>inp.addEventListener('change',()=>saveGloss(f.i,{value:inp.dataset.v,value_label:inp.value},true)));
}
async function saveGloss(fi,body,quiet){
  await fetch('/api/glossary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({etype:cur().etype,field_index:fi,...body})});
  H.toast('glossary updated');
  const r=await fetch('/api/entity/'+cur().etype+'/'+cur().id);if(r.ok){H.setCur(await r.json());renderPanels();}
}

// Ecouteur au niveau DOCUMENT (il vivait en ligne dans index.html juste apres
// saveGloss). Il est pose UNE FOIS par initEntity() - le reposer a chaque rendu
// empilerait les handlers et fermerait le popover des l ouverture.
function wireInfoDots(){
document.addEventListener('click',e=>{const d=e.target.closest('.infodot');
  // `is-open` porte le TROISIEME etat du bouton (l'icone enfoncee) tant que le panneau est
  // ouvert : sans elle, seul :active existait et l'etat retombait des le relachement.
  document.querySelectorAll('.infodot.is-open').forEach(x=>{if(x!==d)x.classList.remove('is-open');});
  if(d){d.classList.add('is-open');showInfo(+d.dataset.info,d);e.stopPropagation();}
  else if(!e.target.closest('#infopop')){H.$('#infopop').classList.remove('open');
    document.querySelectorAll('.infodot.is-open').forEach(x=>x.classList.remove('is-open'));}});
}

function lootRow(t,e){const fi=e.field_index+3,k='drop::'+t.table_id+':'+fi,dv=dr()[k]?dr()[k].value:null,ch=dv!==null?dv:e.chance;
    const cfi=e.field_index+2,ck='drop::'+t.table_id+':'+cfi,cdv=dr()[ck]?dr()[ck].value:null,cnt=cdv!==null?cdv:e.count;
    return `<tr><td><div class="lootname" data-openitem="${e.item_id}" style="cursor:pointer" title="open item #${e.item_id}"><div class="lootslot">${e.icon?H.iconImg('item',e.icon,''):'<img src="/studio/icons/icons/24/rewards.png" srcset="/studio/icons/icons/24/rewards.png 1x, /studio/icons/icons/48/rewards.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">'}</div>
      <div style="min-width:0"><div style="color:var(--ink);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${H.esc(e.name)}</div><div style="font-size:11px;color:var(--faint)">#${e.item_id}</div></div></div></td>
      <td>${ed()?`<input data-drop="${t.table_id}" data-dfi="${cfi}" value="${H.esc(cnt)}" style="width:60px" title="quantity dropped">`:`<span style="font-family:Cinzel">${H.esc(e.count)}</span>`}</td>
      <td><span class="chancebar"><i style="width:${Math.min(100,+ch||0)}%"></i></span> <span style="font-family:Cinzel;color:var(--gold2)">${H.esc(ch)}%</span></td>
      <td>${ed()?`<input data-drop="${t.table_id}" data-dfi="${fi}" value="${H.esc(ch)}" style="width:70px" title="drop chance / weight">`:''}</td>
      <td>${ed()?`<span class="delx" data-rm="${t.table_id}" data-fidx="${e.field_index}">✕</span>`:''}</td></tr>`;}
function lootGroupRows(t,arr,label,icon,tip){
  if(!arr.length)return '';
  return `<tr class="lootgrp"><td colspan="5">${icon} ${label} <span class="lootgrpn">(${arr.length})</span>${tip?`<span class="lootgrptip" title="${H.esc(tip)}"> ⓘ</span>`:''}</td></tr>`+arr.map(e=>lootRow(t,e)).join('');
}
function renderLootTable(t){
  const common=t.entries.filter(e=>e.group!=='bp'), bp=t.entries.filter(e=>e.group==='bp');
  // Common Drops (slots 11-90) puis BP System Drops (slots 96+). On n'affiche les en-tetes de
  // groupe que s'il y a des BP, sinon table simple (pas de bruit visuel).
  let body;
  if(bp.length){
    body=lootGroupRows(t,common,'Common Drops','<img src="/studio/icons/icons/24/drops.png" srcset="/studio/icons/icons/24/drops.png 1x, /studio/icons/icons/48/drops.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','Standard drops — everyone can get these (c_dropitem, slots 11-90).')
        +lootGroupRows(t,bp,'BP System Drops','<img src="/studio/icons/icons/24/break_point.png" srcset="/studio/icons/icons/24/break_point.png 1x, /studio/icons/icons/48/break_point.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','Break-Point drops — unlocked by breaking the BP bar (c_dropitem, slots 96+).');
  } else {
    body=common.map(e=>lootRow(t,e)).join('');
  }
  const warn=t.server_ok===false?`<div style="background:#f0d28a;border:1px solid #cf9b2a;color:#5b4420;padding:8px 11px;border-radius:8px;font-size:11.5px;margin:0 0 8px;display:flex;align-items:center;gap:10px">
    <div style="flex:1"><b><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> This loot table is missing server-side.</b> The live server doesn't load table #${t.table_id}, so nothing here drops in-game (ed() only changes the client). This table exists on the client but was never created on the server — restarting won't add it. Create it on the server, then <img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /studio/icons/icons/48/refresh.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> restart.</div>
    <button class="addbtn" data-pushtable="${t.table_id}" style="flex:none;margin:0"><img src="/studio/icons/icons/24/deploy_to_server.png" srcset="/studio/icons/icons/24/deploy_to_server.png 1x, /studio/icons/icons/48/deploy_to_server.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Create on server</button></div>`:'';
  return `<div class="dtblhead"><img src="/studio/icons/icons/24/fleur.png" srcset="/studio/icons/icons/24/fleur.png 1x, /studio/icons/icons/48/fleur.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Loot table <span class="tg">#${t.table_id}</span> <span class="tg">field ${t.field_index}</span>
      ${ed()?`<span class="addbtn" data-add="${t.table_id}" style="margin:0 0 0 auto">+ Add loot</span>`:''}</div>${warn}
    <table class="loottbl"><thead><tr><th>Item</th><th>Qty${ed()?' <img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">':''}</th><th>Chance</th><th>${ed()?'Edit %':''}</th><th></th></tr></thead><tbody>${body||'<tr><td colspan="5" class="esub" style="padding:10px">empty table</td></tr>'}</tbody></table>
    <div style="height:14px"></div>`;
}
function classDropsView(){
  if(!cur()||cur().etype!=='monster')return '';
  const cd=(cur().class_drops)||[];
  if(!cd.length&&!ed())return '';
  const rows=cd.map(e=>`<tr><td><span class="cdclass" title="${H.esc(e.class_name||('Class '+e.class_id))} (class #${e.class_id})">${e.class_icon?H.iconImg('uiicon',e.class_icon,'cdclassicon'):H.esc(e.class_name||('#'+e.class_id))}</span></td>
    <td><div class="lootname" data-openitem="${e.item_id}" style="cursor:pointer" title="open item #${e.item_id}"><div class="lootslot">${e.icon?H.iconImg('item',e.icon,''):'<img src="/studio/icons/icons/24/rewards.png" srcset="/studio/icons/icons/24/rewards.png 1x, /studio/icons/icons/48/rewards.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">'}</div>
      <div style="min-width:0"><div style="color:var(--ink);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${H.esc(e.name)}</div><div style="font-size:11px;color:var(--faint)">#${e.item_id}</div></div></div></td>
      <td><span style="font-family:Cinzel">${H.esc(e.count)}</span></td>
      <td><span class="chancebar"><i style="width:${Math.min(100,+e.chance||0)}%"></i></span> <span style="font-family:Cinzel;color:var(--gold2)">${H.esc(e.chance)}%</span></td>
      <td>${ed()?`<span class="delx" data-cdrm="${e.class_id}" title="remove ${H.esc(e.class_name||'')}'s drop">✕</span>`:''}</td></tr>`).join('');
  return `<div class="dtblhead"><img src="/studio/icons/icons/24/generation_3d.png" srcset="/studio/icons/icons/24/generation_3d.png 1x, /studio/icons/icons/48/generation_3d.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Class bonus drops <span style="color:var(--faint);font-size:11px;font-weight:400">(one bonus drop per player class, on this monster's death)</span>${ed()?` <span class="addbtn" id="classdrop-add" style="margin:0 0 0 auto">+ Add class drop</span>`:''}</div>
    ${cd.length?`<table class="loottbl"><thead><tr><th>Class</th><th>Item</th><th>Qty</th><th>Chance</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      :`<div class="esub" style="padding:8px">No class bonus drops. Click <b>+ Add class drop</b> to give a specific class its own bonus drop on this monster.</div>`}
    <div style="height:14px"></div>`;
}
const mailEventOk=id=>(id>=60001&&id<=61000)||(id>=64501&&id<=65530);
function mailRewardView(){
  const mr=cur().mail_reward;   // un seul item (le serveur ne maile fiablement que l'item principal)
  if(!mr&&!ed())return '';
  const evOk=mailEventOk(cur().id);
  let h=`<div class="dtblhead"><img src="/studio/icons/icons/24/envelope.png" srcset="/studio/icons/icons/24/envelope.png 1x, /studio/icons/icons/48/envelope.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Mail reward <span style="color:var(--faint);font-size:11px;font-weight:400">(one item mailed to each attacker on this monster's death)</span>${ed()?` <span class="addbtn" id="mail-add" style="margin:0 0 0 auto">${mr?'<img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Change':'+ Set mail reward'}</span>`:''}</div>`;
  if(!evOk&&(mr||ed()))h+=`<div style="background:#f0d28a;border:1px solid #cf9b2a;color:#5b4420;padding:7px 11px;border-radius:8px;font-size:11.5px;margin:0 0 8px"><b><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> The server will NOT send this mail.</b> Mail-on-death is hardcoded to <b>event monsters only</b> (ID 60001–61000 or 64501–65530). This monster (#${cur().id}) is outside that range — the festival entry is saved but the ZoneServer skips it. Use the <b>loot table</b> below for drops on a regular boss.</div>`;
  if(mr){h+=`<div class="skillgrid"><div class="skillcard">
    <div class="skillicon" data-openitem="${mr.item_id}" style="cursor:pointer">${mr.icon?H.iconImg('item',mr.icon,''):'<img src="/studio/icons/icons/24/rewards.png" srcset="/studio/icons/icons/24/rewards.png 1x, /studio/icons/icons/48/rewards.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">'}</div>
    <div style="flex:1;min-width:0;cursor:pointer" data-openitem="${mr.item_id}"><div class="skillname">${H.esc(mr.name||('#'+mr.item_id))} ×${mr.count}</div>
      <div class="skillmeta"><span class="sb">item #${mr.item_id}</span>${mr.event?`<span class="sb">${H.esc(mr.event)}</span>`:''}</div></div>
    ${ed()?`<span class="delx" data-mailrm="0" title="remove mail reward">✕</span>`:`<span data-openitem="${mr.item_id}" style="color:var(--gold);font-size:18px;cursor:pointer">›</span>`}</div></div>`;}
  else if(ed())h+=`<div class="esub" style="padding:8px">No mail reward. Click <b>+ Set mail reward</b> to mail one item to everyone who hits this monster when it dies (event monsters only — see above).</div>`;
  h+=`<div style="height:14px;border-bottom:1px dotted #cdb98c;margin:8px 0 14px"></div>`;
  return h;}
function lootPanel(){
  const ts=cur().linked_drop_tables||[], miss=cur().loot_missing||[];
  let h=(cur().etype==='monster'?mailRewardView():'')+ts.map(renderLootTable).join('')+classDropsView();
  if(ed()){
    h+=miss.map(m=>`<div class="dtblhead"><img src="/studio/icons/icons/24/fleur.png" srcset="/studio/icons/icons/24/fleur.png 1x, /studio/icons/icons/48/fleur.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Loot table <span class="tg">#${m.table_id}</span> <span class="tg">field ${m.field_index}</span>
        <span style="color:var(--faint);font-size:11px">referenced but not created yet</span>
        <span class="addbtn" data-add="${m.table_id}" style="margin:0 0 0 auto">+ Create &amp; add loot</span></div>`).join('');
    if(!ts.length)h+=`<div style="margin-top:6px"><span class="addbtn" data-ensure="1"><img src="/studio/icons/icons/24/generation_3d.png" srcset="/studio/icons/icons/24/generation_3d.png 1x, /studio/icons/icons/48/generation_3d.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Create a loot table &amp; add an item</span></div>`;
  } else if(!ts.length){
    h+='<div class="esub" style="padding:14px">No loot on this monster. Click <b><img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Edit</b> to add some.</div>';
  }
  return h;
}

export { panel, wireInfoDots,
         };
