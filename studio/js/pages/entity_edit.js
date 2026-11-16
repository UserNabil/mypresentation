/* ============================================================================
   ENTITY - TOUS les cablages d'edition de la fiche. Code COPIE d'index.html.

   Pieges consignes ici :
   - Rien n'est sauvegarde ici sauf mention : les inputs alimentent le BROUILLON
     partage (H.getDraft()) puis H.syncSaveBar(). La sauvegarde reelle reste
     dans index.html (#sb-save) - c'est elle qui ecrit client + serveur en UN
     seul batch. Ne jamais transformer un `input` en fetch immediat : on
     perdrait le lot et le « revert in History ».
   - EXCEPTIONS assumees (ecriture immediate, structurelle) : Break Point,
     respawn, enchant d'item, IA. Elles passent par des routes dediees et
     DEMANDENT UN RESTART du serveur pour prendre effet - le toast le dit.
   - Apres une ecriture serveur qui vient de NOUS, il faut H.syncSRVFP() :
     sinon la surveillance multi-dev croit qu'un AUTRE dev a touche le fichier
     et affiche une fausse alerte.
   - bpSel/bpValSel valent null tant que RIEN n'a bouge. `null` != `[]` :
     un tableau vide voudrait dire « plus aucune faiblesse » et effacerait le
     champ 10 a la premiere sauvegarde.
   - wireResist() se branche sur `.leftcol`, pas sur #tabbody : les orbes de
     faiblesse et la barre BP sont rendues A COTE du modele 3D, hors des onglets.
   ============================================================================ */
import { H, cur, ed, S, dr } from './entity_state.js';
import { bpChanged, tooltipPreview, tipColor, insertTipCode, TIP_PALETTE } from './entity_views.js';
import { openEntity, renderShell, renderPanels, has3D } from './entity.js';

function wireResist(){
  const host=H.$('.leftcol');if(!host)return;          // couvre la fan (#fanhost) ET les faiblesses (#resisthost)
  host.querySelectorAll('input[data-fi]').forEach(inp=>inp.addEventListener('input',()=>{
    const fi=+inp.dataset.fi,orig=cur().fields[fi].value,k='field:'+cur().etype+':'+cur().id+':'+fi;
    if(inp.value===orig)delete dr()[k];else dr()[k]={kind:'field',etype:cur().etype,id:cur().id,field_index:fi,value:inp.value};
    inp.closest('.rescell')?.classList.toggle('weak',(+inp.value)<0);H.syncSaveBar();}));
  host.querySelectorAll('[data-bptype]').forEach(c=>c.onclick=()=>{if(!ed())return;
    if(S.bpSel===null)S.bpSel=[...(cur().bp_weakness||[])];
    const t=c.dataset.bptype,i=S.bpSel.indexOf(t);if(i>=0)S.bpSel.splice(i,1);else S.bpSel.push(t);
    c.classList.toggle('on');
    const sb=H.$('#bp-save-mini');if(sb)sb.disabled=!bpChanged();});   // grise tant que rien n'a change
  // VALEUR de la barre de Break Point (champ 12) : on STAGE la saisie (pas d'auto-save) et on
  // (de)grise le bouton Save -> plus de refresh pendant la frappe, et le Save couvre cet input.
  const bv=H.$('#bp-value');
  if(bv&&ed()){
    const stage=()=>{S.bpValSel=bv.value;const sb=H.$('#bp-save-mini');if(sb)sb.disabled=!bpChanged();};
    bv.addEventListener('input',stage);
    const sg=H.$('#bp-sugg');if(sg)sg.onclick=()=>{bv.value=Math.round((cur().bp_hp||0)*0.4);stage();bv.focus();};
  }
  // Save Break Point = enregistre la FAIBLESSE (champ 10) ET la VALEUR de barre (champ 12) si modifiées.
  const bs=H.$('#bp-save-mini');if(bs)bs.onclick=async()=>{
    if(!bpChanged())return;
    bs.disabled=true;let ok=true,done=[];
    if(S.bpSel!==null){
      const r=await fetch('/api/monster/'+cur().id+'/bp_weakness',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({types:S.bpSel})});
      if(r.ok)done.push('weakness');else ok=false;
    }
    if(S.bpValSel!==null){
      let v=parseInt(S.bpValSel,10);if(isNaN(v)||v<0)v=0;
      const r=await fetch('/api/monster/'+cur().id+'/bp_value',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:v})});
      const j=await r.json().catch(()=>({}));if(r.ok)done.push('bar value');else{ok=false;H.toast(''+(j.detail||'bar value failed'),'error');}
    }
    if(ok){H.toast('Break Point '+done.join(' + ')+' saved — restart to apply');S.bpSel=null;S.bpValSel=null;H.refresh();}
    else{bs.disabled=false;}};
}
function bindInputs(){
  H.$('#tabbody').querySelectorAll('[data-fi]').forEach(inp=>{const h=()=>{
    const fi=+inp.dataset.fi,ff=cur().fields[fi];if(!ff)return;const orig=ff.value,k='field:'+cur().etype+':'+cur().id+':'+fi;
    if(inp.value===orig)delete dr()[k];else dr()[k]={kind:'field',etype:cur().etype,id:cur().id,field_index:fi,value:inp.value};
    inp.closest('.plate')?.classList.toggle('dirty',inp.value!==orig);
    const ph=H.$('#tip-preview-host');if(ph)ph.innerHTML=tooltipPreview(cur());   // live preview (grade frame, etc.)
    H.syncSaveBar();};
    inp.addEventListener('input',h);inp.addEventListener('change',h);});
  H.$('#tabbody').querySelectorAll('input[data-drop]').forEach(inp=>inp.addEventListener('input',()=>{
    const k='drop::'+inp.dataset.drop+':'+inp.dataset.dfi;dr()[k]={kind:'drop',table_id:+inp.dataset.drop,field_index:+inp.dataset.dfi,value:inp.value};H.syncSaveBar();}));
  H.$('#tabbody').querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>H.openPicker(+b.dataset.add));
  H.$('#tabbody').querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>H.removeLoot(+b.dataset.rm,+b.dataset.fidx));
  H.$('#tabbody').querySelectorAll('[data-pushtable]').forEach(b=>b.onclick=()=>H.pushTableToServer(+b.dataset.pushtable));
  H.$('#tabbody').querySelectorAll('[data-openspell]').forEach(b=>b.onclick=()=>openEntity('spell',+b.dataset.openspell,true));
  H.$('#tabbody').querySelectorAll('[data-openmon]').forEach(b=>b.onclick=()=>openEntity('monster',+b.dataset.openmon,true));
  H.$('#tabbody').querySelectorAll('[data-iconbrowse]').forEach(b=>b.onclick=()=>H.openIconBrowser(+b.dataset.iconbrowse));
  H.$('#tabbody').querySelectorAll('[data-openitem]').forEach(b=>b.onclick=()=>openEntity('item',+b.dataset.openitem,true));
    if(H.$('#mail-add'))H.$('#mail-add').onclick=H.editMailReward;
  H.$('#tabbody').querySelectorAll('[data-mailrm]').forEach(b=>b.onclick=()=>H.removeMailItem(+b.dataset.mailrm));
  if(H.$('#classdrop-add'))H.$('#classdrop-add').onclick=H.openClassDropPicker;
  H.$('#tabbody').querySelectorAll('[data-cdrm]').forEach(b=>b.onclick=()=>H.removeClassDrop(+b.dataset.cdrm));
  H.$('#tabbody').querySelectorAll('[data-grantskill]').forEach(b=>b.onclick=()=>H.openSpellPicker('skill'));
  H.$('#tabbody').querySelectorAll('[data-grantbuff]').forEach(b=>b.onclick=()=>H.openSpellPicker('buff'));
  H.$('#tabbody').querySelectorAll('[data-grantcd]').forEach(b=>b.onclick=async()=>{
    const ai=await(await fetch('/api/monster/'+cur().id+'/ai')).json();
    if(ai.ai_id===null){H.toast('this monster has no AI (field 38) — countdown not possible');return;}
    if(ai.shared_by>1&&!await H.uiConfirm('AI #'+ai.ai_id+' is SHARED by '+ai.shared_by+' monsters — adding will affect all of them.\n\nContinue?','Shared AI','Continue'))return;
    H.openSpellPicker('countdown');});
  H.$('#tabbody').querySelectorAll('[data-rmskill]').forEach(b=>b.onclick=()=>H.removeSkill(+b.dataset.rmskill));
  H.$('#tabbody').querySelectorAll('[data-rmbuff]').forEach(b=>b.onclick=()=>H.removeBuff(+b.dataset.rmbuff));
  H.$('#tabbody').querySelectorAll('[data-rmcd]').forEach(b=>b.onclick=()=>H.removeCountdown(+b.dataset.rmcd));
  H.$('#tabbody').querySelectorAll('[data-bptype]').forEach(c=>c.onclick=()=>{
    if(!ed())return;
    if(S.bpSel===null)S.bpSel=[...(cur().bp_weakness||[])];
    const t=c.dataset.bptype,i=S.bpSel.indexOf(t);
    if(i>=0)S.bpSel.splice(i,1);else S.bpSel.push(t);
    c.classList.toggle('on');});
  const bps=H.$('#bp-save');if(bps)bps.onclick=async()=>{
    const types=S.bpSel!==null?S.bpSel:(cur().bp_weakness||[]);
    H.showOverlay('Saving Break Point weakness…');
    const r=await fetch('/api/monster/'+cur().id+'/bp_weakness',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({types})});
    const j=await r.json();H.hideOverlay();
    if(r.ok){S.bpSel=null;H.toast('Break Point: '+((j.types||[]).join(' + ')||'none')+' (revert in History)');H.refresh();}
    else H.toast(''+(j.detail||'failed'));};
  H.$('#tabbody').querySelectorAll('[data-ensure]').forEach(b=>b.onclick=async()=>{
    H.showOverlay('Creating loot table…');
    const r=await fetch('/api/monster/'+cur().id+'/loot/ensure',{method:'POST'});const j=await r.json();H.hideOverlay();
    if(r.ok){H.toast('loot table #'+j.table_id+' created (rollback in History)');H.openPicker(j.table_id);}else H.toast(''+(j.detail||'failed'));});
}

function bindEnchantExtras(){
  if(H.$('#ench-open'))H.$('#ench-open').onclick=()=>openEntity('enchant',cur().enchant_link.id,true);
  if(H.$('#ench-change'))H.$('#ench-change').onclick=()=>H.openSpellPicker('itemench');
  if(H.$('#ench-apply'))H.$('#ench-apply').onclick=()=>H.openSpellPicker('itemench');
  if(H.$('#ench-clear'))H.$('#ench-clear').onclick=async()=>{
    if(!await H.uiConfirm('Remove the enchant from this item?\nSets field 23 to empty (client + server).','Remove enchant','Remove'))return;
    await saveItemEnchant('');};
}
async function saveItemEnchant(eid){
  H.showOverlay(eid!==''?'Applying enchant…':'Removing enchant…');
  const r=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({edits:[{kind:'field',etype:'item',id:cur().id,field_index:23,value:String(eid)}]})});
  const j=await r.json().catch(()=>({}));H.hideOverlay();
  if(r.ok){H.syncSRVFP();
    const how=j.restart_required?('RESTART the server to apply in-game ('+(j.restart_reason||'not applied live')+')'):(j.applied_live?(j.hot_reload||'applied live'):'saved');
    H.toast((eid!==''?'✔ enchant #'+eid+' applied (field 23)':'✔ enchant removed')+' — '+how+(j.repack_required?' · Repack the client':''),j.restart_required?'warn':'ok',{sticky:true});H.refresh();}
  else H.toast(''+(j.detail||'failed'));
}

// ---------- name/desc draft
function openNameEdit(mode){S.neMode=mode;
  const isTip=mode==='disp_desc';
  H.$('#ne-title').textContent=mode==='name'?'Rename':(isTip?'Edit in-game tooltip':'Edit description');
  H.$('#ne-label').textContent=mode==='name'?'Display name':(isTip?'In-game tooltip ('+(cur().disp_desc_file||'T_*.ini')+')':'Internal description (c_*)');
  const inp=H.$('#ne-input'),ta=H.$('#ne-textarea'),hint=H.$('#ne-hint');
  if(isTip){inp.style.display='none';ta.style.display='';hint.style.display='';
    hint.innerHTML='This is the text shown in the game tooltip. A <b>blank line</b> = paragraph break. <b>$NN$</b> sets a colour for the rest of the line (e.g. <b>$35$</b> = green). Live preview updates when you Stage the change.';
    ta.value=cur().disp_desc||'';
    const cols=H.$('#ne-colors');cols.style.display='flex';
    cols.innerHTML=TIP_PALETTE.map(n=>`<button type="button" data-n="${n}" class="sbtn ghost" style="padding:2px 8px;color:${tipColor(n)};border-color:${tipColor(n)}">$${n}$</button>`).join('')+'<span style="font-size:.78em;color:var(--faint);align-self:center">click to insert a colour</span>';
    cols.querySelectorAll('button[data-n]').forEach(b=>b.onclick=()=>insertTipCode(+b.dataset.n));}
  else{inp.style.display='';ta.style.display='none';hint.style.display='none';H.$('#ne-colors').style.display='none';
    inp.value=mode==='name'?(cur().name_en||cur().name_big5||''):cur().desc_big5||'';}
  H.$('#nameedit').classList.add('open');(isTip?ta:inp).focus();}

// Les deux boutons de la modale de renommage etaient cables EN LIGNE dans
// index.html : on les repose ensemble depuis initEntity().
function wireNameEdit(){
H.$('#ne-cancel').onclick=()=>H.$('#nameedit').classList.remove('open');
H.$('#ne-ok').onclick=()=>{const v=S.neMode==='disp_desc'?H.$('#ne-textarea').value:H.$('#ne-input').value;
  if(S.neMode==='name'){dr()['name:'+cur().etype+':'+cur().id+':']={kind:'name',etype:cur().etype,id:cur().id,value:v};cur().name_en=v;}
  else if(S.neMode==='disp_desc'){dr()['disp_desc:'+cur().etype+':'+cur().id+':']={kind:'disp_desc',etype:cur().etype,id:cur().id,value:v};cur().disp_desc=v;}
  else{dr()['desc:'+cur().etype+':'+cur().id+':']={kind:'desc',etype:cur().etype,id:cur().id,value:v};cur().desc_big5=v;}
  H.$('#nameedit').classList.remove('open');renderShell();renderPanels();if(has3D())H.mountModel(cur().model,cur().model_url);H.syncSaveBar();H.toast('staged');};
}

export { wireResist, bindInputs, bindEnchantExtras, openNameEdit, wireNameEdit };
