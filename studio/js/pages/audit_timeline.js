/* ============================================================================
   CHANGELOG & AUDIT — les TROIS vues qui racontent ce qui a ete modifie :

     openAudit()    page « Changelog & Audit » : la timeline UNIFIEE (changements
                    de history.json + snapshots), triee par date, chaque ligne
                    ouvrant un APERCU D IMPACT avant tout rollback.
     openChanges()  page « Changes » (le panier) : les memes changements, mais
                    selectionnables en masse pour revert / sync vers le serveur.
     openHistory()  la vieille modale #history (menu Settings), rollback simple.

   Extrait de static/index.html (protocole docs/WORK_SPLIT.md). Code COPIE tel
   quel : aucun changement de comportement.

   Contrat d hote — AUCUN global n est lu depuis ce module. Tout arrive par
   l objet passe a initAuditTimeline() :
     $            selecteur DOM (document.querySelector)
     esc, enc     echappement HTML / encodeURIComponent
     toast        notifications
     uiConfirm    confirmation modale (async -> bool)
     guardPage    guardPage(perm,label) -> bool  (openChanges exige integrity.view)
     showOverlay / hideOverlay : voile modal bloquant
     errMessage   normalisation d une exception en message lisible
     navTo        navigation vers une entite/quete/scene depuis une ligne
     clearCur     remet a null la selection de navigation d index.html
     refreshCur   re-rend l entite ouverte, s il y en a une

   POURQUOI ces deux fonctions plutot que les variables : la selection de
   navigation (entite / quete / scene affichee) est l ETAT d index.html. Ouvrir
   une de ces trois vues remplace #content, il FAUT donc l invalider, sinon un
   re-rendu ulterieur ressuscite une entite qui n est plus a l ecran. On ne
   partage pas les variables : on partage les deux GESTES.

   Pieges consignes ici :
   - Les cablages etaient DISPERSES : #open-history / #hist-close / #hist-export
     tout en haut, #btn-changes 90 lignes plus bas, #imp-cancel / #imp-confirm
     tout en bas. initAuditTimeline() les repose TOUS ensemble ; l integrateur
     doit l appeler A LA PLACE du premier (l ordre d enregistrement compte).
   - #ch-export delegue litteralement a $("#hist-export").onclick() : les deux
     boutons doivent donc rester cables par le MEME init, sinon Export ne fait
     plus rien depuis la page Changes.
   - Le bloc `wireBusy` en fin d index.html enveloppe #hist-export, #open-history,
     #imp-cancel, #imp-confirm, #ch-revert, #ch-sync : il ne voit un handler que
     s il est DEJA pose. init doit donc rester AVANT lui dans le module.
   - openImpact() ne fait qu AFFICHER ; c est #imp-confirm qui execute. Un
     snapshot passe par restore_pipeline (boot-test + auto-rollback), un
     changement par /api/history/rollback. Ne pas fusionner les deux chemins.
   - Le menu lateral (js/nav/tree.js) ouvre la page par `btn:btn-changes`, donc
     par un CLIC DOM : si le cablage de #btn-changes saute, l entree de menu
     devient muette sans la moindre erreur console.
   ============================================================================ */

import { searchScope } from '../ui/search_scope.js';
import { lineSvg } from '../ui/line_icons.js';

let H = null;
// Dependances d hote, remplies par initAuditTimeline(). Declarees ici pour que le
// code copie d index.html reste litteralement inchange (aucun prefixe a semer).
let $, esc, enc, toast, uiConfirm, guardPage, showOverlay, hideOverlay, errMessage,
    navTo, clearCur, refreshCur;


// ---------- change history + rollback ----------
const HACT={edit:'EDIT',rename:'RENAME',loot_edit:'LOOT',loot_add:'LOOT +',loot_remove:'LOOT −'};

// ---------- Changes "cart" page ----------
const CHACT={edit:['<img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','EDIT'],rename:['<img src="/studio/icons/icons/24/propose_tag.png" srcset="/studio/icons/icons/24/propose_tag.png 1x, /studio/icons/icons/48/propose_tag.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','RENAME'],loot_edit:['<img src="/studio/icons/icons/24/drops.png" srcset="/studio/icons/icons/24/drops.png 1x, /studio/icons/icons/48/drops.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','LOOT'],loot_add:['<img src="/studio/icons/icons/24/drops.png" srcset="/studio/icons/icons/24/drops.png 1x, /studio/icons/icons/48/drops.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','LOOT +'],loot_remove:['<img src="/studio/icons/icons/24/drops.png" srcset="/studio/icons/icons/24/drops.png 1x, /studio/icons/icons/48/drops.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','LOOT −'],
  skill_add:['<img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /studio/icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','SKILL +'],skill_remove:['<img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /studio/icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','SKILL −'],buff_add:['✨','BUFF +'],buff_remove:['✨','BUFF −'],
  countdown_add:['<img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','COUNTDOWN +'],countdown_remove:['<img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','COUNTDOWN −'],bp_weakness:['<img src="/studio/icons/icons/24/break_point.png" srcset="/studio/icons/icons/24/break_point.png 1x, /studio/icons/icons/48/break_point.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','BREAK POINT'],
  mail_reward:['<img src="/studio/icons/icons/24/envelope.png" srcset="/studio/icons/icons/24/envelope.png 1x, /studio/icons/icons/48/envelope.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','MAIL'],spawn_add:['<img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /studio/icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','SPAWN +'],spawn_remove:['<img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /studio/icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','SPAWN −'],spawn_update:['<img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /studio/icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','SPAWN'],
  clone:['⧉','CLONE'],delete:['<img src="/studio/icons/icons/24/delete.png" srcset="/studio/icons/icons/24/delete.png 1x, /studio/icons/icons/48/delete.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','DELETE'],quest_rewards:['<img src="/studio/icons/icons/24/rewards.png" srcset="/studio/icons/icons/24/rewards.png 1x, /studio/icons/icons/48/rewards.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','QUEST REW'],quest_objective:['<img src="/studio/icons/icons/24/objectives.png" srcset="/studio/icons/icons/24/objectives.png 1x, /studio/icons/icons/48/objectives.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','QUEST OBJ'],
  locale:['<img src="/studio/icons/icons/24/network.png" srcset="/studio/icons/icons/24/network.png 1x, /studio/icons/icons/48/network.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','LOCALE'],mass_edit:['<img src="/studio/icons/icons/24/enchants.png" srcset="/studio/icons/icons/24/enchants.png 1x, /studio/icons/icons/48/enchants.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','MASS EDIT'],diag_fix:['<img src="/studio/icons/icons/24/settings.png" srcset="/studio/icons/icons/24/settings.png 1x, /studio/icons/icons/48/settings.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','FIX'],sync_server:['<img src="/studio/icons/icons/24/deploy_to_server.png" srcset="/studio/icons/icons/24/deploy_to_server.png 1x, /studio/icons/icons/48/deploy_to_server.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','SYNC'],
  bp_weakness2:['<img src="/studio/icons/icons/24/break_point.png" srcset="/studio/icons/icons/24/break_point.png 1x, /studio/icons/icons/48/break_point.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','BP']};
let CHSEL=new Set(), CHFILTER='all', CHLIST=[];

// ============================ CHANGELOG & AUDIT (P2) ============================
// Unified, time-sorted timeline of every change (history.json) + every snapshot.
// Each row is clickable -> IMPACT-AWARE rollback: before doing anything we show what
// comes back, whether the ZoneServer must stop, the data-version delta, size/checksum.
// Individual change -> /api/history/rollback (restores backups). Snapshot global ->
// /api/snapshots/{id}/restore_pipeline (routes through engine.deploy_pipeline).
let AUDIT=[], AUFILTER='all', AUTGT='', _impTarget=null, _auOff=null;
const AU_LINE={edit:'edit',rename:'propose_tag',loot:'drops',skill:'classes',buff:'enchants',countdown:'live',bp_weakness:'break_point',mail:'envelope',spawn:'spawn',clone:'copy',delete:'delete',quest:'objectives',locale:'map',mass_edit:'actions',diag_fix:'ini_doctor',sync:'deploy_to_server',deploy:'deploy',install:'install',login:'user',logout:'logout',test:'tests',release:'rocket',restore:'undo',rollback:'undo',snapshot:'snapshots',repack:'repack',pull:'refresh',import:'import',export:'export'};
function auIcon(r){const a=''+(r.action||'');let n=AU_LINE[a];
  if(!n){const k=Object.keys(AU_LINE).find(k=>a.includes(k));n=k?AU_LINE[k]:(r.type==='snapshot'?'snapshots':'edit');}
  return lineSvg(n,18);}
const AU_ICON={edit:'<img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',rename:'<img src="/studio/icons/icons/24/propose_tag.png" srcset="/studio/icons/icons/24/propose_tag.png 1x, /studio/icons/icons/48/propose_tag.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',loot_edit:'<img src="/studio/icons/icons/24/drops.png" srcset="/studio/icons/icons/24/drops.png 1x, /studio/icons/icons/48/drops.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',loot_add:'<img src="/studio/icons/icons/24/drops.png" srcset="/studio/icons/icons/24/drops.png 1x, /studio/icons/icons/48/drops.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',loot_remove:'<img src="/studio/icons/icons/24/drops.png" srcset="/studio/icons/icons/24/drops.png 1x, /studio/icons/icons/48/drops.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',skill_add:'<img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /studio/icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',skill_remove:'<img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /studio/icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',
  buff_add:'✨',buff_remove:'✨',countdown_add:'<img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',countdown_remove:'<img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',bp_weakness:'<img src="/studio/icons/icons/24/break_point.png" srcset="/studio/icons/icons/24/break_point.png 1x, /studio/icons/icons/48/break_point.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',mail_reward:'<img src="/studio/icons/icons/24/envelope.png" srcset="/studio/icons/icons/24/envelope.png 1x, /studio/icons/icons/48/envelope.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',
  spawn_add:'<img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /studio/icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',spawn_remove:'<img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /studio/icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',spawn_update:'<img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /studio/icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',clone:'⧉',delete:'<img src="/studio/icons/icons/24/delete.png" srcset="/studio/icons/icons/24/delete.png 1x, /studio/icons/icons/48/delete.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',quest_rewards:'<img src="/studio/icons/icons/24/rewards.png" srcset="/studio/icons/icons/24/rewards.png 1x, /studio/icons/icons/48/rewards.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',quest_objective:'<img src="/studio/icons/icons/24/objectives.png" srcset="/studio/icons/icons/24/objectives.png 1x, /studio/icons/icons/48/objectives.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',
  locale:'<img src="/studio/icons/icons/24/network.png" srcset="/studio/icons/icons/24/network.png 1x, /studio/icons/icons/48/network.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',mass_edit:'<img src="/studio/icons/icons/24/enchants.png" srcset="/studio/icons/icons/24/enchants.png 1x, /studio/icons/icons/48/enchants.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',diag_fix:'<img src="/studio/icons/icons/24/settings.png" srcset="/studio/icons/icons/24/settings.png 1x, /studio/icons/icons/48/settings.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',sync_server:'<img src="/studio/icons/icons/24/deploy_to_server.png" srcset="/studio/icons/icons/24/deploy_to_server.png 1x, /studio/icons/icons/48/deploy_to_server.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',snapshot:'<img src="/studio/icons/icons/24/save.png" srcset="/studio/icons/icons/24/save.png 1x, /studio/icons/icons/48/save.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',snapshot_restore:'<img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /studio/icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',
  snapshot_restore_pipeline:'<img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /studio/icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',rollback:'⟲'};
const SNAPK={manual:['<img src="/studio/icons/icons/24/snapshots.png" srcset="/studio/icons/icons/24/snapshots.png 1x, /studio/icons/icons/48/snapshots.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','#8a7a4a'],working:['<img src="/studio/icons/icons/24/success.png" srcset="/studio/icons/icons/24/success.png 1x, /studio/icons/icons/48/success.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','#4a8a3a'],'pre-deploy':['<img src="/studio/icons/icons/24/launch_game.png" srcset="/studio/icons/icons/24/launch_game.png 1x, /studio/icons/icons/48/launch_game.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','#cf9b2a'],'pre-rollback':['<img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /studio/icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','#9a8a6a'],candidate:['<img src="/studio/icons/icons/24/enchants.png" srcset="/studio/icons/icons/24/enchants.png 1x, /studio/icons/icons/48/enchants.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">','#6a7a9a']};

export function initAuditTimeline(host) {
  H = host;
  ({ $, esc, enc, toast, uiConfirm, guardPage, showOverlay, hideOverlay,
     errMessage, navTo, clearCur, refreshCur } = H);
  // --- cablages d origine, dans leur ordre d ecriture ---
  $('#open-history').onclick=()=>{$('#settings').classList.remove('open');openHistory();};
  $('#hist-close').onclick=()=>$('#history').classList.remove('open');
  $('#hist-export').onclick=async()=>{
    const cs=await(await fetch('/api/changeset')).json();
    const blob=new Blob([JSON.stringify(cs,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='changeset_'+(cs.env||'env')+'_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();URL.revokeObjectURL(a.href);toast('changeset exported ('+cs.count+' changes)');};
  $('#btn-changes')&&($('#btn-changes').onclick=()=>openAudit());
  $('#imp-cancel').onclick=()=>{$('#impactmodal').classList.remove('open');_impTarget=null;};
  $('#imp-confirm').onclick=async()=>{
    if(!_impTarget)return;
    const {type,id}=_impTarget;$('#impactmodal').classList.remove('open');
    if(type==='snapshot'){
      showOverlay('Restoring snapshot via deploy pipeline…');
      let j;try{const r=await fetch('/api/snapshots/'+enc(id)+'/restore_pipeline',{method:'POST'});j=await r.json();}
      catch(e){hideOverlay();toast(errMessage(e),'error',{sticky:true});return;}
      hideOverlay();
      if(j.blocked){
        const go=await uiConfirm(''+(j.message||'This snapshot would crash the server.')+'\n\nForce-restore anyway (still pipeline-guarded)?','Snapshot not bootable','Force restore');
        if(go){showOverlay('Force-restoring…');const r2=await fetch('/api/snapshots/'+enc(id)+'/restore_pipeline?force=true',{method:'POST'});const j2=await r2.json();hideOverlay();
          toast(j2.ok?'✔ restored (pipeline)':(j2.rolled_back?'boot failed — auto-rolled back':'✗ '+(j2.message||'failed')),j2.ok?'ok':'warn',{sticky:!j2.ok});}
      }else{
        toast(j.ok?'✔ snapshot restored — boot confirmed':(j.rolled_back?'boot failed — auto-rolled back to pre-rollback snapshot':(j.local?'✔ local restore done — restart to reload':'✗ '+(j.message||'failed'))),
          j.ok||j.local?'ok':(j.rolled_back?'warn':'error'),{sticky:!(j.ok||j.local)});
      }
    }else{
      showOverlay('Rolling back…');
      let j;try{const r=await fetch('/api/history/rollback?entry_id='+enc(id),{method:'POST'});j=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(j.detail||('HTTP '+r.status));}
      catch(e){hideOverlay();toast(errMessage(e),'error',{sticky:true});return;}
      hideOverlay();toast('rolled back','ok');refreshCur();
    }
    _impTarget=null;openAudit();
  };
}

async function openChanges(){
  if(!guardPage('integrity.view','Changes'))return;
  try{const r=await fetch('/api/history?limit=400');if(!r.ok)throw new Error('history '+r.status);
    CHLIST=await r.json();}catch(e){toast('could not load changes: '+e,'error');return;}
  CHSEL=new Set();clearCur();renderChanges();   // etait : CUR/CURQ/CURS = null
}
function chState(h){return h.rolled_back?'reverted':(h.server?'synced':(h.client?'client-only':'?'));}
function renderChanges(){
  const all=CHLIST;
  const stats={total:all.length,reverted:all.filter(h=>h.rolled_back).length,
    clientonly:all.filter(h=>!h.rolled_back&&h.client&&!h.server).length,
    synced:all.filter(h=>!h.rolled_back&&h.server).length};
  const list=all.filter(h=>CHFILTER==='all'||(CHFILTER==='clientonly'&&!h.rolled_back&&h.client&&!h.server)
    ||(CHFILTER==='active'&&!h.rolled_back)||(CHFILTER==='reverted'&&h.rolled_back));
  const chip=(k,lbl,n)=>`<span class="chchip${CHFILTER===k?' on':''}" data-chf="${k}">${lbl} <b>${n}</b></span>`;
  const stbadge=h=>{const s=chState(h);const c={reverted:'off','client-only':'warn',synced:'ok'}[s]||'off';
    return `<span class="chstate au-pill ${c}">${s}</span>`;};
  $('#content').innerHTML=`<div class="hero"><div class="nameband">
    <h1 class="ename"><img src="/studio/icons/icons/24/cart.png" srcset="/studio/icons/icons/24/cart.png 1x, /studio/icons/icons/48/cart.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Changes</h1>
    <div class="esub">${stats.total} modification(s) · <b style="color:#4a8a3a">${stats.synced} on server</b> · <b style="color:#cf9b2a">${stats.clientonly} client-only</b> · ${stats.reverted} reverted</div>
    <div class="chchips" style="margin-top:10px">${chip('all','All',stats.total)}${chip('active','Active',stats.total-stats.reverted)}${chip('clientonly','Client-only',stats.clientonly)}${chip('reverted','Reverted',stats.reverted)}</div></div></div>
    <div id="tabbody"><div style="padding:4px 4px">
      ${(()=>{const pick=list.filter(h=>!h.rolled_back);const allSel=pick.length&&pick.every(h=>CHSEL.has(h.id));
        return `<div class="chbar"><span class="chselall" id="ch-all"><span class="chk${allSel?' on':''}"></span> Select shown (${pick.length})</span>
        <span style="flex:1"></span>
        <button class="addbtn" id="ch-sync" title="Push selected/all client-only edits to the server"><img src="/studio/icons/icons/24/deploy_to_server.png" srcset="/studio/icons/icons/24/deploy_to_server.png 1x, /studio/icons/icons/48/deploy_to_server.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Sync to server</button>
        <button class="addbtn" id="ch-revert" style="color:var(--crimson)"><img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /studio/icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Revert selected</button>
        <button class="addbtn" id="ch-export"><img src="/studio/icons/icons/24/get_latest_client.png" srcset="/studio/icons/icons/24/get_latest_client.png 1x, /studio/icons/icons/48/get_latest_client.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Export</button></div>`;})()}
      ${list.length?list.map(h=>{const[ic,lbl]=CHACT[h.action]||['•',h.action.toUpperCase()];const sel=CHSEL.has(h.id);
        const nav=h.ref&&(h.ref.id||h.ref.code)?`data-chopen="${h.id}"`:'';
        return `<div class="chcard${h.rolled_back?' rev':''}${sel?' sel':''}" data-card="${h.id}">
          <span class="chk${sel?' on':''}${h.rolled_back?' dis':''}" ${h.rolled_back?'':`data-pick="${h.id}"`} title="${h.rolled_back?'reverted':'select'}"></span>
          <span class="chicon">${ic}</span>
          <div class="chbody" style="flex:1;min-width:0;${nav?'cursor:pointer':''}" ${nav}>
            <div class="chtitle"><span class="chtag">${esc(lbl)}</span> <span style="font-weight:600;color:var(--ink)">${esc(h.target)}</span>${nav?' <span style="color:var(--faint);font-size:11px">→ open</span>':''}</div>
            <div class="chmeta">${esc(h.details)} · ${esc(h.ts)}</div></div>
          ${stbadge(h)}
          ${h.rolled_back?'':`<span class="chundo" data-undo="${h.id}" title="revert"><img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /studio/icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>`}
        </div>`;}).join(''):'<div class="esub" style="padding:24px">No changes yet — your edits will appear here.</div>'}
    </div></div>`;
  $('#content').querySelectorAll('[data-chf]').forEach(b=>b.onclick=()=>{CHFILTER=b.dataset.chf;renderChanges();});
  $('#content').querySelectorAll('.chk[data-pick]').forEach(b=>b.onclick=(ev)=>{ev.stopPropagation();const id=+b.dataset.pick;
    if(CHSEL.has(id)){CHSEL.delete(id);}else{CHSEL.add(id);}
    const card=b.closest('.chcard');const on=CHSEL.has(id);b.classList.toggle('on',on);card.classList.toggle('sel',on);
    const sa=$('#ch-all .chk');if(sa){const pick=list.filter(h=>!h.rolled_back);sa.classList.toggle('on',pick.length&&pick.every(h=>CHSEL.has(h.id)));}});
  const sa=$('#ch-all');if(sa)sa.onclick=()=>{const pick=list.filter(h=>!h.rolled_back);const allSel=pick.length&&pick.every(h=>CHSEL.has(h.id));
    pick.forEach(h=>{if(allSel)CHSEL.delete(h.id);else CHSEL.add(h.id);});renderChanges();};
  $('#content').querySelectorAll('.chbody[data-chopen]').forEach(el=>el.onclick=()=>{const h=CHLIST.find(x=>x.id==el.dataset.chopen);if(h&&h.ref)navTo(h.ref.code?{etype:'scene',id:h.ref.code}:{etype:h.ref.kind==='droptable'?'monster':h.ref.kind,id:h.ref.id});});
  $('#content').querySelectorAll('[data-undo]').forEach(b=>b.onclick=()=>chRevert([+b.dataset.undo]));
  if($('#ch-revert'))$('#ch-revert').onclick=()=>{if(!CHSEL.size){toast('select changes first');return;}chRevert([...CHSEL]);};
  if($('#ch-export'))$('#ch-export').onclick=()=>$('#hist-export').onclick();
  if($('#ch-sync'))$('#ch-sync').onclick=async()=>{
    if(!await uiConfirm('Push your client-only edits to the configured server now?','Sync to server','Sync'))return;
    showOverlay('Syncing…');const r=await fetch('/api/sync_to_server',{method:'POST'});const j=await r.json();hideOverlay();
    if(r.ok){toast('synced '+(j.synced||0)+' + appended '+(j.appended||0));openChanges();}else toast(''+(j.detail||'failed'));};
}
async function chRevert(ids){
  if(!ids.length)return;
  if(!await uiConfirm('Revert '+ids.length+' change(s)? Affected files are restored from backup.','Revert changes','Revert'))return;
  showOverlay('Reverting '+ids.length+'…');
  await fetch('/api/history/rollback_many?ids='+enc(ids.join(',')),{method:'POST'});
  hideOverlay();CHSEL=new Set();toast('reverted '+ids.length);openChanges();
}

async function openAudit(){
  clearCur();   // etait : CUR/CURQ/CURS = null
  $('#content').innerHTML='<div class="empty"><span class="spin"></span> loading audit timeline…</div>';
  try{const r=await fetch('/api/audit/timeline?limit=500');if(!r.ok)throw new Error('timeline '+r.status);
    AUDIT=(await r.json()).rows||[];}catch(e){toast('could not load audit: '+e,'error');AUDIT=[];}
  AUTGT='';AUFILTER='all';
  try{window.dispatchEvent(new Event('rail-none'));}catch(e){}
  renderAudit();
  if(_auOff)_auOff();
  _auOff=searchScope.register({key:'audit',label:'Changelog',placeholder:'Search log',onQuery:v=>{AUTGT=v||'';renderAudit();},alive:()=>!!document.getElementById('au-root')});
}
function renderAudit(){
  const all=AUDIT;
  const counts={all:all.length,changes:all.filter(r=>r.type==='change').length,
    snapshots:all.filter(r=>r.type==='snapshot').length,server:all.filter(r=>r.server).length};
  const tgt=AUTGT.trim().toLowerCase();
  const list=all.filter(r=>{
    if(AUFILTER==='changes'&&r.type!=='change')return false;
    if(AUFILTER==='snapshots'&&r.type!=='snapshot')return false;
    if(AUFILTER==='server'&&!r.server)return false;
    if(tgt&&!((''+(r.target||'')).toLowerCase().includes(tgt)||(''+(r.action||'')).toLowerCase().includes(tgt)))return false;
    return true;});
  const chip=(k,lbl,n)=>`<span class="chchip${AUFILTER===k?' on':''}" data-auf="${k}">${lbl} <b>${n}</b></span>`;
  $('#content').innerHTML=`<div class="hero" id="au-root"><div class="nameband">
    <h1 class="ename"><img src="/studio/icons/icons/24/action_journal.png" srcset="/studio/icons/icons/24/action_journal.png 1x, /studio/icons/icons/48/action_journal.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Changelog &amp; Audit</h1>
    <div class="esub">${counts.all} event(s) · <b>${counts.changes}</b> change(s) · <b>${counts.snapshots}</b> snapshot(s) · <b class="au-srv">${counts.server} touch the server</b></div>
    <div class="chchips" style="margin-top:10px">${chip('all','All',counts.all)}${chip('changes','Changes',counts.changes)}${chip('snapshots','Snapshots',counts.snapshots)}${chip('server','Server-side',counts.server)}
    </div></div></div>
    <div id="tabbody"><div style="padding:4px 4px">
      ${list.length?list.map(r=>{
        const ic=auIcon(r);
        const isSnap=r.type==='snapshot';
        const can=isSnap?true:(r.has_backups&&!r.rolled_back);
        const lyr=r.server?'<span class="chstate au-pill ok">server</span>':(r.client?'<span class="chstate au-pill warn">client</span>':'');
        const kk=isSnap&&r.kind?(SNAPK[r.kind]||['',''])[0]+' '+r.kind:'';
        return `<div class="chcard${r.rolled_back?' rev':''}" data-aurow="${esc(r.type)}:${esc(r.id)}">
          <span class="chicon">${ic}</span>
          <div class="chbody" style="flex:1;min-width:0">
            <div class="chtitle"><span class="chtag">${isSnap?'SNAPSHOT':esc((r.action||'').toUpperCase())}</span>
              <span style="font-weight:600;color:var(--ink)">${esc(r.target)}</span>
              ${kk?`<span style="font-size:10.5px;color:var(--faint)"> · ${esc(kk)}</span>`:''}
              ${r.rolled_back?' <span class="au-rev">· reverted</span>':''}</div>
            <div class="chmeta">${esc(r.details||'')}${r.author?' · '+esc(r.author):''} · ${esc(r.ts||'')}</div></div>
          ${lyr}
          ${can?`<span class="chundo" data-aurb="${esc(r.type)}:${esc(r.id)}" title="rollback (with impact preview)"><img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /studio/icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>`:''}
        </div>`;}).join(''):'<div class="esub" style="padding:24px">No events match this filter.</div>'}
    </div></div>`;
  $('#content').querySelectorAll('[data-auf]').forEach(b=>b.onclick=()=>{AUFILTER=b.dataset.auf;renderAudit();});
  $('#content').querySelectorAll('[data-aurb]').forEach(b=>b.onclick=(ev)=>{ev.stopPropagation();openImpact(b.dataset.aurb);});
  $('#content').querySelectorAll('.chbody').forEach(el=>el.onclick=()=>{const row=el.closest('[data-aurow]');if(row)openImpact(row.dataset.aurow);});
}
function _fmtBytes(n){if(n==null)return'?';if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB';}
async function openImpact(key){
  // key = "change:<id>" | "snapshot:<id>"
  const ix=key.indexOf(':');const type=key.slice(0,ix), id=key.slice(ix+1);
  _impTarget={type,id};
  $('#imp-title').textContent=type==='snapshot'?'Snapshot restore — impact preview':'⟲ Rollback impact preview';
  $('#imp-body').innerHTML='<div class="esub" style="padding:18px"><span class="spin"></span> computing impact…</div>';
  $('#impactmodal').classList.add('open');
  let imp;
  try{
    const url=type==='snapshot'?('/api/snapshots/'+enc(id)+'/impact'):('/api/history/impact?entry_id='+enc(id));
    const r=await fetch(url);if(!r.ok)throw new Error((await r.json().catch(()=>({}))).detail||('HTTP '+r.status));
    imp=await r.json();
  }catch(e){$('#imp-body').innerHTML=`<div style="padding:18px;color:var(--crimson)">✗ ${esc(''+e)}</div>`;return;}
  $('#imp-body').innerHTML=type==='snapshot'?renderSnapImpact(imp):renderChangeImpact(imp);
  // a change with no backups, or already reverted, cannot be rolled back
  const blocked=type!=='snapshot'&&(imp.rolled_back||!imp.file_count);
  const cb=$('#imp-confirm');if(cb){cb.disabled=!!blocked;cb.style.opacity=blocked?'.45':'';cb.style.cursor=blocked?'not-allowed':'';}
}
function renderChangeImpact(imp){
  const stop=imp.needs_server_stop;
  const filesHtml=imp.files.map(f=>{
    const vd=f.version_delta?`<span style="color:#cf9b2a;font-weight:600"> · ${esc(f.version_delta)}</span>`:'';
    const same=f.identical?'<span style="color:#4a8a3a;font-size:10.5px"> · already identical</span>':'';
    const where=f.remote?'<img src="/studio/icons/icons/24/network.png" srcset="/studio/icons/icons/24/network.png 1x, /studio/icons/icons/48/network.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> server':(f.server?'server':'client');
    return `<div style="display:flex;gap:8px;align-items:baseline;padding:4px 0;border-bottom:1px solid #e7dcc0">
      <span style="font-weight:600;color:var(--ink);min-width:0;flex:1">${f.server?'🛑 ':'<img src="/studio/icons/icons/24/document.png" srcset="/studio/icons/icons/24/document.png 1x, /studio/icons/icons/48/document.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> '}${esc(f.file)}</span>
      <span style="font-size:11px;color:var(--faint)">${esc(where)}${vd}${same}</span>
      <span style="font-size:10.5px;color:var(--faint)">${f.restore_version!=null?'V.'+f.restore_version:''} · ${_fmtBytes(f.backup_size)}</span>
    </div>`;}).join('');
  return `
    ${imp.rolled_back?'<div class="note" style="background:#f3ead2;color:#8a6a2a;margin-bottom:10px">This change is already reverted.</div>':''}
    <div style="font-size:13px;margin:4px 0 10px">Rolling back <b>${esc(imp.action)}</b> on <b style="color:var(--ink)">${esc(imp.target)}</b> <span style="color:var(--faint)">(${esc(imp.ts||'')})</span></div>
    <div class="dtblhead">Files restored from backup (${imp.file_count})</div>
    <div style="margin:4px 0 12px">${filesHtml||'<div class="esub">no backups attached to this change.</div>'}</div>
    ${imp.version_deltas&&imp.version_deltas.length?`<div class="note" style="background:#fbf3df;color:#8a6a2a;margin-bottom:10px"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Data version change: ${imp.version_deltas.map(esc).join(', ')}</div>`:''}
    <div class="note" style="background:${stop?'#fbe9e4':'#eef3e8'};color:${stop?'#9a3a2a':'#3a6a2a'};margin-bottom:4px">
      ${stop?'🛑 A server <b>S_*.ini</b> is restored — the ZoneServer must be <b>restarted</b> to reload it. The restart goes through the safe deploy pipeline (snapshot → stop → restart → verify → auto-rollback).':'<img src="/studio/icons/icons/24/client.png" srcset="/studio/icons/icons/24/client.png 1x, /studio/icons/icons/64/client.png 2x" class="ui-icon" width="24" height="24" alt="" aria-hidden="true"> Client-only — no server restart needed.'}
    </div>`;
}
function renderSnapImpact(imp){
  const dl=imp.version_deltas||[];
  return `
    <div style="font-size:13px;margin:4px 0 10px">Restore snapshot <b style="color:var(--ink)">${esc(imp.name)}</b>
      ${imp.kind?`<span class="chstate" style="background:${(SNAPK[imp.kind]||['','#999'])[1]}">${esc(imp.kind)}</span>`:''}
      <span style="color:var(--faint)">(${esc(imp.ts||'')})</span></div>
    <div class="dtblhead">Scope</div>
    <div style="font-size:12px;margin:4px 0 12px;line-height:1.6">
      • <b>${imp.file_count}</b> file(s) — the WHOLE server Data/db is overwritten<br>
      • size ${_fmtBytes(imp.size)} · sha256 <code style="font-size:10.5px">${esc((imp.sha256||'').slice(0,16))}</code><br>
      ${imp.boot_test?`• last boot-test: <b style="color:${imp.boot_test==='pass'?'#4a8a3a':'#9a3a2a'}">${esc(imp.boot_test)}</b><br>`:''}
      • files: <span style="font-size:11px;color:var(--faint)">${(imp.files_preview||[]).slice(0,18).map(esc).join(', ')}${imp.file_count>18?' …':''}</span>
    </div>
    ${dl.length?`<div class="note" style="background:#fbf3df;color:#8a6a2a;margin-bottom:10px"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Data version change: ${dl.map(d=>esc(d.file+' '+d.delta)).join(', ')}</div>`:''}
    <div class="note" style="background:#fbe9e4;color:#9a3a2a;margin-bottom:4px">
      ${imp.via_pipeline
        ?'<img src="/studio/icons/icons/24/integrity.png" srcset="/studio/icons/icons/24/integrity.png 1x, /studio/icons/icons/48/integrity.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Routed through the <b>deploy pipeline</b>: pre-rollback snapshot → preflight boot-test → STOP servers → atomic swap → restart → real boot verdict → <b>auto-rollback if the boot fails</b>. Safe &amp; reversible.'
        :'<img src="/studio/icons/icons/24/save.png" srcset="/studio/icons/icons/24/save.png 1x, /studio/icons/icons/48/save.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Local restore — files are backed up then overwritten in place. Restart the server to reload.'}
    </div>`;
}

async function openHistory(){
  const list=await(await fetch('/api/history?limit=200')).json();
  $('#hist-list').innerHTML=list.length?list.map(h=>`
    <div class="hrow${h.rolled_back?' done':''}">
      <span class="htag">${HACT[h.action]||esc(h.action)}</span>
      <div class="hmain"><div class="ht">${esc(h.target)} — ${esc(h.details)}</div>
        <div class="hd">${esc(h.ts)}${h.rolled_back?' · rolled back':''} · ${h.backups.length} file(s)</div></div>
      <span class="hundo" data-id="${h.id}"><img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /studio/icons/icons/48/refresh.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Rollback</span>
    </div>`).join(''):'<div class="esub" style="padding:18px">No changes recorded yet.</div>';
  $('#hist-list').querySelectorAll('.hundo').forEach(b=>b.onclick=async()=>{
    if(!await uiConfirm('Roll back this change?\nThe affected file(s) will be restored from backup.','Rollback','Rollback'))return;
    showOverlay('Rolling back…');
    const r=await fetch('/api/history/rollback?entry_id='+b.dataset.id,{method:'POST'});const j=await r.json();
    hideOverlay();
    if(r.ok){toast('rolled back');openHistory();refreshCur();}else toast(''+(j.detail||'failed'));
  });
  $('#history').classList.add('open');
}
