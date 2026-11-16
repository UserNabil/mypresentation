/* ============================================================================
   MASS EDIT - applique une operation arithmetique a UN champ numerique sur TOUS
   les resultats de la recherche courante. Code COPIE d'index.html.

   Pieges consignes ici :
   - La cible est H.getResults() : les resultats AFFICHES, pas une selection.
     Changer la recherche change la cible - d'ou le rappel du nombre exact dans
     #me-count et la confirmation obligatoire avant d'ecrire.
   - Seuls les champs NUMERIQUES du premier resultat sont proposes : ils servent
     de representant pour tout le lot. Un lot heterogene (etypes differents)
     n'est pas gere - la recherche ne renvoie qu'un etype a la fois.
   - Les ids voyagent par dataset sur #massedit (et non dans une variable) :
     la modale reste juste apres un re-rendu de la liste.
   - Ecriture client + serveur, en batch, annulable dans History.
   ============================================================================ */
import { H, cur } from './entity_state.js';

async function openMassEdit(){
  if(!H.getResults().length)return;
  const et=H.getResults()[0].etype, ids=H.getResults().map(r=>r.id);
  const d=await(await fetch('/api/entity/'+et+'/'+ids[0])).json();   // representative fields
  const num=d.fields.filter(f=>/^-?\d*\.?\d+$/.test((f.value||'').trim()));   // numeric fields only
  H.$('#me-count').innerHTML='Target: <b>'+ids.length+'</b> '+et+'(s) from current search.';
  H.$('#me-field').innerHTML=num.map(f=>`<option value="${f.i}">${H.esc(f.label)} (field ${f.i})</option>`).join('');
  H.$('#massedit').dataset.et=et;H.$('#massedit').dataset.ids=JSON.stringify(ids);
  H.$('#massedit').classList.add('open');
}

// Cablages des deux boutons de la modale (ils vivaient en ligne dans index.html
// juste apres openMassEdit).
function initMassEdit(){
H.$('#me-cancel').onclick=()=>H.$('#massedit').classList.remove('open');
H.$('#me-ok').onclick=async()=>{
  const et=H.$('#massedit').dataset.et, ids=JSON.parse(H.$('#massedit').dataset.ids||'[]');
  const fi=+H.$('#me-field').value, op=H.$('#me-op').value, val=parseFloat(H.$('#me-value').value||'0');
  const lbl=H.$('#me-field').selectedOptions[0]?.textContent||('field '+fi);
  if(!await H.uiConfirm(op+' '+val+' on "'+lbl+'" for '+ids.length+' '+et+'(s)?\nClient + server, batched. Revertable in History.','Mass edit','Apply'))return;
  H.$('#massedit').classList.remove('open');H.showOverlay('Mass editing '+ids.length+' records…');
  const r=await fetch('/api/mass_edit',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({etype:et,ids,field_index:fi,op,value:val})});
  const j=await r.json();H.hideOverlay();
  if(r.ok){
    /* server_warning (client-only write) is shown by core/net.js as a sticky toast. */
    const where=j.server==='ok'?'client + server':j.server==='skipped'?'CLIENT ONLY':'client';
    /* 2.133 : restart seulement si le back le dit (restart_required), Repack si un fichier client a change. */
    const live=j.restart_required?(' — RESTART required: '+(j.restart_reason||j.hot_reload||'not applied live'))
      :(j.applied_live&&j.hot_reload?(' — '+j.hot_reload):(j.hot_reload_problem?(' — not applied live: '+j.hot_reload_problem):''));
    H.toast('mass edit: '+j.count+' '+et+'(s) updated — '+where+live+(j.repack_required?' — Repack the client to ship it':'')+' (revert in History)',
      j.server==='skipped'||j.restart_required||j.hot_reload_problem?'warn':'ok');
    if(cur())H.refresh();}
  else H.toast(''+(j.detail||'failed'));};
}

export { initMassEdit };
