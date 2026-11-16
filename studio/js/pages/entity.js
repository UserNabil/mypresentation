/* ============================================================================
   ENTITY - openEntity() et la COQUE de la fiche (portrait, bandeau, boutons,
   onglets). Point d'entree du lot. Code COPIE d'index.html.

   Pieges consignes ici :
   - openEntity(et, id, push, keep) : `push` empile la vue COURANTE (quelle
     qu'elle soit) via H.pushCurrent() - c'est ce qui alimente le bouton Back.
     `keep` conserve le mode edition ET l'onglet : c'est le mode « refresh apres
     une modif ». Perdre `keep` renverrait l'admin en lecture seule au premier
     onglet a chaque sauvegarde.
   - openEntity remet CURQ et CURS a null : une fiche d'entite, une quete et une
     scene sont TROIS vues exclusives, et refresh() choisit laquelle relancer en
     regardant laquelle est non-nulle. Oublier une des deux remises a zero fait
     rouvrir l'ancienne vue au refresh suivant.
   - Le rendu est coupe en deux exprES : renderShell() (portrait + bandeau) et
     renderPanels() (onglets). Le bouton « Edit » ne re-rend QUE ce qui depend du
     mode edition - surtout PAS le portrait, sinon le modele 3D est demonte et
     remonte a chaque bascule.
   - loadPresence() est asynchrone : on re-verifie que la fiche affichee est
     toujours la meme (cur().etype/id) avant d'ecrire les pastilles, sinon on
     colle la presence d'une entite sur la fiche d'une autre.
   - « server » absent ne veut pas dire « pas de serveur » : sans serveur
     configure la pastille passe en `na` (gris), pas en rouge. Un clone fait
     depuis une source client-only serait NON spawnable - c'est tout l'interet
     de ces pastilles avant de cloner.
   ============================================================================ */
import { setEntityHost, H, cur, ed, tab, S } from './entity_state.js';
import { presenceSkeleton, _pz, heroBadges, enchantExtras, spawnBox,
         tooltipPreview, weaknessFan, weakBar, radarChart } from './entity_views.js';
import { panel, wireInfoDots } from './entity_panels.js';
import { bindInputs, wireResist, bindEnchantExtras, openNameEdit,
         wireNameEdit } from './entity_edit.js';
import { initMassEdit } from './mass_edit.js';
import { mountEntityEngine, stopEntityEngine } from './entity_gb.js';

const has3D=()=>cur()&&cur().model&&cur().model_nif_exists;

async function openEntity(et,id,push,keep){
  /* ⛔ GARDE-FOU DE DIAGNOSTIC. Un appelant qui passe des valeurs vides produisait
     `GET /api/entity/undefined/undefined` : le serveur repondait 422 (« path.rid doit
     etre un entier ») ET on affichait « not found » — deux bandeaux qui accusaient
     l'ENTITE alors que c'est l'APPEL qui etait malforme. Cas vecu le 2026-08-14 :
     equipment.js passait une chaine a `navTo`, qui attend {etype,id}.
     On refuse donc de partir en reseau, et on dit la VRAIE cause. */
  if(!et || id===undefined || id===null || Number.isNaN(+id)){
    console.warn('[entity] openEntity called without a target:', {et, id});
    H.toast('Internal: this link has no target (etype/id missing)','error',4500);
    return;
  }
  // push=true : mémorise la vue courante (quelle qu'elle soit) avant de naviguer — via le snapshot unifié
  if(push && !(cur()&&cur().etype===et&&cur().id===id))H.pushCurrent();
  if(!keep){H.setEditing(false);H.setTab(null);}
  document.body.classList.toggle('editing',ed());
  H.$('#rows').querySelectorAll('.row').forEach(r=>r.classList.toggle('sel',r.dataset.e===et&&+r.dataset.id===id));
  const r=await fetch('/api/entity/'+et+'/'+id);if(!r.ok){H.toast('not found');return;}
  H.setCur(await r.json());H.setCurq(null);H.setCurs(null);S.bpSel=null;S.bpValSel=null;renderShell();renderPanels();H.loadQuestRefs();H.loadVerify(et,id);
  mountPortrait();
  H.initServerWatch();loadPresence(et,id);
}
/* PORTRAIT 3D — le MOTEUR DU JEU d'abord, l'aperçu three.js en repli.
   Le moteur montre l'entité telle que le joueur la voit (matières, textures, éclairage
   du client) ; three.js ne montre qu'une reconstruction du maillage. Le repli est
   automatique si le moteur est indisponible ou ne rend rien pour ce modèle, et il
   reste choisissable (bouton ◍), sinon on imposerait un rendu qui échoue sur 4 modèles
   sur 14 mesurés. */
function mountFlat(){
  H.mountModel(cur()&&cur().model&&cur().model_nif_exists?cur().model:null,cur()&&cur().model_url);
}
async function mountPortrait(){
  stopEntityEngine();
  const m=cur();
  if(!m||!m.model||!m.model_nif_exists){ mountFlat(); return; }
  const ok=await mountEntityEngine(m.etype,m.model,mountFlat,mountPortrait);
  if(!ok) mountFlat();
}

async function loadPresence(et,id,fresh){
  const host=H.$('#presence-badges'); if(!host||!cur()||cur().etype!==et||cur().id!==id)return;
  try{
    const j=await(await fetch('/api/entity/'+et+'/'+id+'/presence'+(fresh?'?fresh=1':''))).json();
    if(!cur()||cur().etype!==et||cur().id!==id)return;   // la fiche a changé entre-temps
    const pills=[];
    pills.push(_pz('client', j.mall?'client (mall)':'client', j.client?'yes':'no',
      j.client?('Present in the '+(j.mall?'CASH-SHOP client file (c_itemmall.ini)':'client file (c_*.ini)')+' — the client can display it.')
             :'ABSENT from the client — the client cannot display it.'));
    if(!j.server_configured){
      pills.push(_pz('server','server','na','No server configured (Settings → Servers).'));
    }else{
      pills.push(_pz('server','server', j.server?'yes':'warn',
        j.server?('Present on the DEPLOYED SERVER ('+(j.mall?'S_ItemMall.ini':'S_*.ini')+' read by the game) — spawnable.')
               :'NOT on the server — a clone from this source would be CLIENT-ONLY (not spawnable). <img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> The server periodically re-saves S_*.ini and can drop client-only items: re-check after a restart.'));
    }
    if(et==='item'){
      if(!j.db_configured){
        pills.push(_pz('db','db','na','Game DB unreachable (postgres).'));
      }else{
        const bits=[]; if(j.db_owned)bits.push('owned (inventory/equipment/mail)'); if(j.db_mall)bits.push('sold in the item-mall');
        pills.push(_pz('db','db', j.db?'yes':'no',
          j.db?('IN CIRCULATION: '+bits.join(' + ')+'.')
             :'Not in circulation: no player owns it and it is not in the item-mall.'));
      }
    }
    host.innerHTML=pills.join('');
    host.querySelectorAll('.pz').forEach(p=>p.style.cursor='pointer');
    host.onclick=()=>{host.innerHTML=presenceSkeleton();loadPresence(cur().etype,cur().id,true);};   // click = re-check (fresh server read)
  }catch(e){ host.innerHTML=_pz('','presence unavailable','no','fetch failed'); }
}
function renderShell(){
  const m=cur();
  const showIcon=!has3D()&&m.icon;
  H.$('#content').innerHTML=`
   <div class="hero ${has3D()||showIcon?'with3d':''}">
     <div class="leftcol">
     ${has3D()?`<div class="portrait"><span class="pcorner pc1"></span><span class="pcorner pc2"></span><span class="pcorner pc3"></span><span class="pcorner pc4"></span><div id="viewer3d"><div id="v3-msg">summoning…</div></div><div id="weakfan" class="weakfan">${m.etype==='monster'?weaknessFan(m):''}</div></div>`
       :showIcon?`<div class="iconportrait">${H.iconImg(m.etype,m.icon,'')}<div id="weakfan" class="weakfan">${m.etype==='monster'?weaknessFan(m):''}</div></div>`:''}
     <div id="resisthost">${m.etype==='monster'?weakBar(m):''}</div>
     <div id="modelinfo"></div>
     </div>
     <div class="nameband">
       ${H.navLen()?`<span class="backbtn" id="navback">← Back</span>`:''}
       <h1 class="ename">${m.icon?H.iconImg(m.etype,m.icon,'gameicon'):''}${H.esc(m.name_en||m.name_big5||('#'+m.id))}<span class="editpen" id="rename" title="rename"><img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span><span class="editpen" id="loc-btn" title="localization (languages)"><img src="/studio/icons/icons/24/network.png" srcset="/studio/icons/icons/24/network.png 1x, /icons/icons/48/network.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span></h1>
       <div class="esub">${H.esc(m.label)} #${m.id}${m.name_big5?' · '+H.esc(m.name_big5):''}</div>
       ${colorSwatch(m)}
       <div class="presence" id="presence-badges" title="Where this record exists. Client = c_*.ini (the client can display it) · Server = S_*.ini deployed (the server can spawn it / clone_item) · DB = in circulation (owned in-game or sold in the item-mall). Click = re-check (fresh server read).">${presenceSkeleton()}</div>
       <div class="ebadges">${heroBadges(m)}</div>
       ${m.desc_idx!==null?`<div class="edesc">${H.esc(m.desc_big5||'(no description)')} <span class="editpen" id="redesc" title="edit internal description (c_*)"><img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span></div>`:''}
       ${(m.disp_desc||m.etype==='item'||m.etype==='spell')?`<div class="edesc" style="margin-top:6px"><b style="color:var(--gold2)">In-game tooltip</b> <span class="editpen" id="redispdesc" title="edit the text shown in-game (${H.esc(m.disp_desc_file||'T_*.ini')})"><img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span></div><div id="tip-preview-host">${tooltipPreview(m)}</div>`:''}
       <div id="enchant-extras">${enchantExtras(m)}</div>
       <div id="spawnhost">${spawnBox(m)}</div>
       <div id="quest-refs"></div>
       <div class="modbtn"><button class="hbtn gold ${ed()?'play':''}" id="toggle-edit">${ed()?'✓ Editing':'<img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /icons/icons/64/edit.png 2x" class="ui-icon" width="24" height="24" alt=""> Edit'}</button>
         <button class="hbtn" id="clone-entity" title="Duplicate this ${H.esc(m.label||'entity')} as a new one">⧉ Clone</button>
         <button class="hbtn" id="rel-entity" title="See everything linked to this">${H.iconMarkup('relations',32)} Relations</button>
         <button class="hbtn" id="cmp-items" title="Compare this ${H.esc(m.label||'entity')} field-by-field against one or more other IDs — see exactly what differs (to duplicate it or make it behave like a working one)"><img src="/studio/icons/icons/24/compare.png" srcset="/studio/icons/icons/24/compare.png 1x, /icons/icons/48/compare.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Compare</button>
         ${H.gmBtn(cur().gm_command)}
         <button class="hbtn" id="del-entity" title="Delete this entity" style="color:var(--crimson)"><img src="/studio/icons/icons/24/delete.png" srcset="/studio/icons/icons/24/delete.png 1x, /icons/icons/64/delete.png 2x" class="ui-icon" width="24" height="24" alt=""></button>
         ${m.server_configured?`<button class="hbtn gold" id="push-entity" title="Push this record's current client state to the server"><img src="/studio/icons/icons/24/deploy_to_server.png" srcset="/studio/icons/icons/24/deploy_to_server.png 1x, /icons/icons/48/deploy_to_server.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Push to server</button>`:''}
         ${m.server_configured?`<button class="hbtn" id="cmp-server" title="Compare this record to what's DEPLOYED on the server (what the game actually uses) — shows exactly which fields, and loot, differ"><img src="/studio/icons/icons/24/search.png" srcset="/studio/icons/icons/24/search.png 1x, /icons/icons/64/search.png 2x" class="ui-icon" width="24" height="24" alt=""> Compare to game</button>`:''}
         <span class="verifybadge" id="verify-badge"><span class="vbdot"></span><span class="vbtxt">⟳ Verify</span><div class="verifytip" id="verify-tip"></div></span>
         ${m.has_server?`<span class="ebadge" title="server edits are written to: ${H.esc((m.server_target&&m.server_target.path)||'')}${m.server_target&&m.server_target.kind==='local'?' — this is a LOCAL copy, NOT the live game server. Set a Remote Data/db to write to the running server.':''}"><img src="/studio/icons/icons/24/database.png" srcset="/studio/icons/icons/24/database.png 1x, /icons/icons/48/database.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> ${m.server_target&&m.server_target.kind==='local'?'→ local copy':'→ '+H.esc((m.server_target&&m.server_target.label)||'server')}</span>`
           :(m.server_host_set&&!m.server_path_set?'<span class="ebadge srvfix" id="srvfix-badge" style="color:#cf9b2a;cursor:pointer" title="SSH server is connected but the remote Data/db path is not set — click to open Settings"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> set server Data/db path</span>'
           :(m.server_configured?'<span class="ebadge" style="color:#cf9b2a" title="record not on server yet — click Push to server"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> not on server</span>'
           :'<span class="ebadge" style="color:var(--crimson)" title="no server configured — open Settings to connect one">no server</span>'))}</div>
     </div>
     <div id="radarhost" class="radarhost">${m.etype==='monster'?radarChart(m):''}</div>
   </div>
   <div id="server-diff-panel" style="display:none"></div>
   <div class="tabs" id="tabs"></div>
   <div id="tabbody"></div>`;
  if(H.$('#navback'))H.$('#navback').onclick=H.navBack;
  H.$('#rename').onclick=()=>openNameEdit('name');
  if(H.$('#loc-btn'))H.$('#loc-btn').onclick=()=>H.openLocale(cur().etype,cur().id);
  if(H.$('#redesc'))H.$('#redesc').onclick=()=>openNameEdit('desc');
  if(H.$('#redispdesc'))H.$('#redispdesc').onclick=()=>openNameEdit('disp_desc');
  H.$('#clone-entity').onclick=H.cloneEntity;
  H.$('#rel-entity').onclick=()=>H.openRelations(cur().etype,cur().id);
  if(H.$('#cmp-items'))H.$('#cmp-items').onclick=()=>H.openCompare(cur().etype,cur().id);
  if(H.$('#gm-entity'))H.$('#gm-entity').onclick=()=>H.gmCopy(cur().gm_command);
  if(H.$('#gm-entity-alt'))H.$('#gm-entity-alt').onclick=()=>H.gmCopy(cur().gm_command,true);
  H.$('#del-entity').onclick=()=>H.deleteEntity(cur().etype,cur().id,cur().name_en||cur().name_big5||('#'+cur().id));
  if(H.$('#push-entity'))H.$('#push-entity').onclick=async()=>{
    H.showOverlay('Pushing to server…');
    const r=await fetch('/api/entity/'+cur().etype+'/'+cur().id+'/push',{method:'POST'});const j=await r.json();H.hideOverlay();
    if(r.ok){H.toast(j.applied_live
        ? ('pushed — LIVE in-game, no restart needed ('+(j.hot_reload||'')+')')
        : ('pushed to server — RESTART required to apply in-game ('+(j.hot_reload||'banner above')+')'));
      H.syncSRVFP();                       // c'était NOTRE écriture -> recaler l'empreinte (pas de faux 'un dev a édité')
      if(typeof H.checkPendingRestart==='function')H.checkPendingRestart();
      if(H.$('#server-diff-panel')&&H.$('#server-diff-panel').style.display!=='none')loadServerDiff();
      H.refresh();}
    else H.toast(''+(j.detail||'push failed'));};
  if(H.$('#cmp-server'))H.$('#cmp-server').onclick=loadServerDiff;
  if(H.$('#srvfix-badge'))H.$('#srvfix-badge').onclick=()=>H.$('#btn-settings').click();
  bindSpawnHandlers();wireResist();bindEnchantExtras();
  if(H.$('#toggle-edit')&&!H.canEditData())H.$('#toggle-edit').style.display='none';   // read-only role: no edit toggle
  H.$('#toggle-edit').onclick=()=>{if(!H.canEditData()){H.toast('Editing game data needs Game Master','warn');return;}
    H.setEditing(!ed());document.body.classList.toggle('editing',ed());
    // re-render UNIQUEMENT ce qui dépend du mode édition — surtout PAS le portrait 3D
    H.$('#toggle-edit').textContent=ed()?'✓ Editing':'Edit';H.$('#toggle-edit').classList.toggle('play',ed());
    if(H.$('#spawnhost'))H.$('#spawnhost').innerHTML=spawnBox(cur());
    if(H.$('#weakfan'))H.$('#weakfan').innerHTML=weaknessFan(cur());
    if(H.$('#resisthost'))H.$('#resisthost').innerHTML=weakBar(cur());
    bindSpawnHandlers();wireResist();H.loadQuestRefs();renderPanels();H.loadVerify(cur().etype,cur().id);};
  H.loadVerify(cur().etype,cur().id);
  H.renderModelInfo();                 // cartouche MODEL — s'affiche que le .nif existe ou non
}
function bindSpawnHandlers(){
  if(H.$('#add-spawn'))H.$('#add-spawn').onclick=H.openSpawnPicker;
  document.querySelectorAll('[data-rmspawn]').forEach(b=>b.onclick=async(ev)=>{ev.stopPropagation();const code=b.dataset.rmspawn;
    if(!await H.uiConfirm('Remove '+(cur().name_en||'#'+cur().id)+' from scene '+code+'?\nClient + server.','Remove spawn','Remove'))return;
    H.showOverlay('Removing spawn…');const r=await fetch('/api/scene/'+code+'/spawn/remove?monster_id='+cur().id,{method:'POST'});
    const j=await r.json();H.hideOverlay();
    if(r.ok){H.toast('removed from '+code+' (revert in History)');H.refresh();}else H.toast(''+(j.detail||'failed'));});
  if(cur()&&cur().etype==='monster'&&(cur().spawns||[]).length)loadRespawnEditor();
}
async function loadRespawnEditor(){
  const box=H.$('#respawn-editor');if(!box||!ed()||!cur()||cur().etype!=='monster')return;
  try{const j=await(await fetch('/api/monster/'+cur().id+'/spawns')).json();const sp=j.spawns||[];
    if(!sp.length){box.innerHTML='';return;}
    const fmt=v=>{v=parseInt(v,10);if(isNaN(v))return '?';if(v>=3600)return (v/3600).toFixed(v%3600?1:0)+'h';if(v>=60)return (v/60).toFixed(v%60?1:0)+'min';return v+'s';};
    box.innerHTML=`<div class="lbl" style="font-size:12px"><img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Respawn cooldown <span style="color:var(--faint);font-weight:400;font-size:11px">(${ed()?'seconds — lower = spawns faster':'click <img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Edit to change'})</span></div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-top:4px">${sp.map((s,si)=>`
        <div class="rsp-scene">
        <div style="display:flex;align-items:center;gap:7px;font-size:12px;flex-wrap:wrap">
          <span class="ebadge map" style="min-width:120px" title="${H.esc(s.scene)}">${H.esc(s.map)}</span>
          ${s.reborn===false
            ?`<span style="color:var(--faint);font-size:11.5px"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> spawned by the campaign/event system (not in <code>[reborn_monsters]</code>) — respawn timer not used here</span>`
            :ed()
            ?`<input type="number" min="0" class="rsp-in" data-code="${H.esc(s.scene)}" value="${H.esc(s.respawn||'')}" style="width:90px" title="respawn seconds${s.mixed?' (mixed — saving sets them all)':''}"><span style="color:var(--faint);font-size:11px">s = ${fmt(s.respawn)} · ${s.count} pt${s.count>1?'s':''}${s.mixed?' <img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> mixed':''}</span><button class="addbtn rsp-save" data-code="${H.esc(s.scene)}"><img src="/studio/icons/icons/24/save.png" srcset="/studio/icons/icons/24/save.png 1x, /icons/icons/48/save.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Save</button>
              <span class="rsp-auto" style="display:flex;align-items:center;gap:6px;font-size:11.5px;cursor:pointer;color:${s.enabled?'#4a8a3a':'var(--seal)'}" title="Auto-respawn (reborn field 12). When ON, the server automatically respawns this monster after the cooldown above. Bosses ship with it OFF because they are spawned by the instance's event/wave system instead of the timer — turn it ON to make a boss respawn on the timer for testing.">
                <span class="chk rsp-en${s.enabled?' on':''}" data-code="${H.esc(s.scene)}"></span> auto-respawn${s.enabled_mixed?' <img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">':''}</span>`
            :`<b style="color:var(--ink)">${H.esc(s.respawn||'?')}s</b><span style="color:var(--faint);font-size:11px">(${fmt(s.respawn)}) · ${s.count} pt${s.count>1?'s':''} · auto-respawn <b style="color:${s.enabled?'#4a8a3a':'var(--seal)'}">${s.enabled?'ON':'OFF'}</b></span>`}
          ${s.reborn!==false&&(s.points||[]).length?`<span class="addbtn rsp-pos" data-si="${si}" data-code="${H.esc(s.scene)}" style="font-size:10.5px" title="Edit this monster's spawn X/Y position here, for this instance/map only"><img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> position (${s.points.length})</span>`:''}
        </div>
        <div class="rsp-pos-panel" data-si="${si}" style="display:none"></div>
        </div>`).join('')}</div>
      ${ed()?`<div class="note" style="font-size:10.5px;color:var(--faint);margin-top:5px">Auto-respawn OFF = boss spawned by the instance event system (not the timer). Turn ON + set a cooldown to make a boss respawn for testing. <img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /icons/icons/48/refresh.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Restart the server to apply.</div>`:''}`;
    box.querySelectorAll('.rsp-save').forEach(b=>b.onclick=async()=>{
      const code=b.dataset.code;const inp=box.querySelector('.rsp-in[data-code="'+code+'"]');
      const v=parseInt(inp.value,10);if(isNaN(v)||v<0){H.toast('enter a valid number of seconds');return;}
      b.disabled=true;b.textContent='…';
      const r=await fetch('/api/monster/'+cur().id+'/respawn?code='+H.enc(code)+'&respawn='+v,{method:'POST'});
      const jj=await r.json();b.disabled=false;b.textContent='Save';
      if(r.ok)H.toast('respawn = '+v+'s in '+code+' — RESTART the server to apply (revert in History)');else H.toast(''+(jj.detail||'failed'));});
    box.querySelectorAll('.rsp-pos').forEach(b=>b.onclick=()=>{
      const si=+b.dataset.si,code=b.dataset.code,s=sp[si];
      const panel=box.querySelector('.rsp-pos-panel[data-si="'+si+'"]');if(!panel)return;
      if(panel.style.display!=='none'){panel.style.display='none';return;}   // toggle off
      const pts=s.points||[];
      panel.innerHTML=`<div style="margin:4px 0 6px 127px;padding:8px 10px;background:#f5edd8;border:1px solid #cdb98c;border-radius:6px">
        <div style="font-size:11px;color:var(--faint);margin-bottom:6px"><img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Spawn position of <b style="color:var(--ink)">${H.esc(cur().name||('#'+cur().id))}</b> in <b>${H.esc(s.map)}</b> — ${pts.length} point${pts.length>1?'s':''}. X/Y are this monster's coordinates on this map only.</div>
        ${pts.map((p,pi)=>`<div style="display:flex;align-items:center;gap:7px;font-size:12px;margin-bottom:5px">
          <span style="color:var(--faint);min-width:62px">point ${pi+1}</span>
          <label style="color:var(--gold2);font-size:11px">X <input class="pos-x" data-code="${H.esc(code)}" data-idx="${H.esc(p.index)}" value="${H.esc(p.x)}" style="width:80px;font-family:Cinzel"></label>
          <label style="color:var(--gold2);font-size:11px">Y <input class="pos-y" data-code="${H.esc(code)}" data-idx="${H.esc(p.index)}" value="${H.esc(p.y)}" style="width:80px;font-family:Cinzel"></label>
          <button class="addbtn pos-save" data-code="${H.esc(code)}" data-idx="${H.esc(p.index)}" style="font-size:10.5px"><img src="/studio/icons/icons/24/save.png" srcset="/studio/icons/icons/24/save.png 1x, /icons/icons/48/save.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Save</button>
        </div>`).join('')}</div>`;
      panel.style.display='';
      panel.querySelectorAll('.pos-save').forEach(sb=>sb.onclick=async()=>{
        const idx=sb.dataset.idx,c=sb.dataset.code;
        const xi=panel.querySelector('.pos-x[data-idx="'+idx+'"]'),yi=panel.querySelector('.pos-y[data-idx="'+idx+'"]');
        const xv=parseFloat(xi.value),yv=parseFloat(yi.value);
        if(isNaN(xv)||isNaN(yv)){H.toast('enter valid X and Y');return;}
        sb.disabled=true;sb.textContent='…';
        const r=await fetch('/api/scene/'+H.enc(c)+'/spawn/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:+idx,x:xv,y:yv})});
        const jj=await r.json();sb.disabled=false;sb.textContent='Save';
        if(r.ok)H.toast('position set to ('+xv+', '+yv+') in '+c+' — RESTART the server to apply (revert in History)');else H.toast(''+(jj.detail||'failed'));});
    });
    box.querySelectorAll('.rsp-en').forEach(cb=>cb.onclick=async()=>{
      const code=cb.dataset.code,on=!cb.classList.contains('on');
      cb.classList.toggle('on',on);
      const r=await fetch('/api/monster/'+cur().id+'/respawn_enabled?code='+H.enc(code)+'&enabled='+(on?'true':'false'),{method:'POST'});
      const jj=await r.json();
      if(r.ok)H.toast('auto-respawn '+(on?'ON':'OFF')+' in '+code+' — RESTART to apply (revert in History)');else{H.toast(''+(jj.detail||'failed'));cb.classList.toggle('on',!on);}});
  }catch(e){box.innerHTML='';}
}
/* Une couleur doit se VOIR. La page affichait « R 208 / G 203 / B 168 » : trois nombres
   qui ne disent rien tant qu'on ne les a pas mentalement recomposes. On rend donc la
   couleur reelle, avec son hexadecimal (le format qu'on colle dans un autre outil) et la
   BANDE D'USAGE, qui est la seule facon de savoir de quoi on parle : l'identifiant porte
   le sens (0xx teinture, 1xx cheveux, 2xx peau, 3xx yeux — cf. la carte de champs). */
function colorSwatch(m){
  if(m.etype!=='charcolor'||!Array.isArray(m.fields))return '';
  const val=i=>{const f=m.fields.find(x=>x.i===i);return f?parseInt(String(f.value).trim(),10):NaN;};
  const r=val(2),g=val(3),b=val(4);
  if([r,g,b].some(n=>!Number.isFinite(n)||n<0||n>255))return '';
  const hex='#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  const id=parseInt(m.id,10);
  const bande=id<100?'Dye':id<200?'Hair':id<300?'Skin':id<400?'Eyes':'Other';
  /* Luminance perceptuelle : au-dela de ~0,6 l'encre sombre passe mieux que la claire.
     Sans ca, l'hexadecimal ecrit en blanc devenait illisible sur les tons pales — la
     moitie du catalogue. */
  const lum=(0.2126*r+0.7152*g+0.0722*b)/255;
  return `<div class="colorswatch" style="--sw:${hex}">
    <div class="cs-chip" title="${hex} · rgb(${r}, ${g}, ${b})">
      <span class="cs-hex" style="color:${lum>0.6?'#3a2a12':'#fff'}">${hex}</span></div>
    <div class="cs-meta"><span class="cs-band">${bande}</span>
      <span class="cs-rgb">rgb(${r}, ${g}, ${b})</span></div></div>`;
}

function renderPanels(){
  const m=cur(),isMon=m.etype==='monster';
  // resistances = onglet (comme avant) ; faiblesses Break Point = eventail par-dessus le modele 3D.
  const order=['stats','combat','resist','behavior','cost','scaling','usage','economy','req','link','base','identity','visual','other'];
  /* ⛔ Cette liste etait un FILTRE FERME : toute categorie de champ absente d'ici
     disparaissait de l'ecran. Les catalogues dont la carte de champs emploie ses propres
     categories perdaient donc TOUS leurs champs utiles, et il ne restait que « Misc »
     (les champs non mappes) + « All fields ».
     Vecu le 2026-08-14 : la page Colors n'affichait QUE « Field 5 » — un champ fantome
     issu du « | » terminal — pendant que id / name / R / G / B, pourtant cartographies
     dans catalog_ext.py, etaient jetes parce que leurs categories (`id`, `name`, `color`)
     ne figuraient pas ci-dessus. Meme cause pour Prefixes.
     `order` n'est plus qu'un ORDRE DE PREFERENCE : ce qu'il ne connait pas passe apres,
     mais n'est plus perdu. */
  const connues=order.filter(c=>m.categories.includes(c));
  const inconnues=(m.categories||[]).filter(c=>!order.includes(c) && c!=='raw');
  let tabs=connues.concat(inconnues);
  if(isMon){tabs.unshift('loot');tabs.splice(1,0,'skills');}   // skills tab always shown
  if(m.etype==='spell'&&m.used_by&&m.used_by.length)tabs.unshift('usedby');
  tabs.push('raw');
  if(!tab()||!tabs.includes(tab()))H.setTab(tabs[0]);
  // ⛔ Quatre onglets seulement portaient une icone ; les quatorze autres etaient en texte nu.
  //    On les rend TOUS par H.iconMarkup() — pas de balise ecrite a la main, donc pas de guillemet
  //    qui traine dans un attribut (cf. l'incident `))>` du 2026-08-06).
  const TI={stats:'readiness',combat:'pvp',resist:'stat_def',behavior:'ai_definition',cost:'gold',
    scaling:'chevron_triple',usage:'live',economy:'cart',req:'lock',link:'links',base:'content',
    identity:'profile',visual:'image',other:'options',
    /* categories propres aux catalogues « secondaires » — sans elles, ces onglets
       s'affichaient sans icone et, surtout, n'existaient pas du tout (voir ci-dessus). */
    id:'action_journal', name:'edit', color:'color', text:'comment', code:'badge',
    num:'level', 'fk-list':'links', fk:'links', flag:'options'};
  const TL=(k,t)=>`${H.iconMarkup(TI[k],24)} ${t}`;
  const L={stats:TL('stats','Attributes'),combat:TL('combat','Combat'),resist:TL('resist','Weakness / Resist'),
    behavior:TL('behavior','Behavior'),cost:TL('cost','Costs'),scaling:TL('scaling','Scaling'),
    usage:TL('usage','Usage'),economy:TL('economy','Economy'),req:TL('req','Requirements'),
    link:TL('link','Links'),base:TL('base','General'),identity:TL('identity','Identity'),
    visual:TL('visual','Visual'),other:TL('other','Misc'),
    loot:'<img src="/studio/icons/icons/24/rewards.png" srcset="/studio/icons/icons/24/rewards.png 1x, /icons/icons/48/rewards.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Loot',skills:'<img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Skills',usedby:'<img src="/studio/icons/icons/24/creatures.png" srcset="/studio/icons/icons/24/creatures.png 1x, /icons/icons/48/creatures.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Used by',raw:'<img src="/studio/icons/icons/24/action_journal.png" srcset="/studio/icons/icons/24/action_journal.png 1x, /icons/icons/48/action_journal.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> All fields'};
  /* Libelle de repli pour une categorie que `L` ne connait pas : « fk-list » -> « Fk list ».
     Mieux vaut un intitule imparfait qu'un onglet absent. */
  const joli=k=>String(k).replace(/[-_]/g,' ').replace(/^./,c=>c.toUpperCase());
  const lbl=t=>L[t]||`${H.iconMarkup(TI[t]||'options',24)} ${joli(t)}`;
  H.$('#tabs').innerHTML=tabs.map(t=>`<div class="tab${t===tab()?' on':''}" data-t="${t}">${lbl(t)}</div>`).join('');
  H.$('#tabbody').innerHTML=panel(tab());
  H.$('#tabs').querySelectorAll('.tab').forEach(t=>t.onclick=()=>{H.setTab(t.dataset.t);
    H.$('#tabs').querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));H.$('#tabbody').innerHTML=panel(tab());bindInputs();});
  bindInputs();
}
// Compare le BROUILLON client (ce que le tool affiche) au record DÉPLOYÉ serveur (ce que le JEU utilise).
// Montre exactement quels champs (+ loot) diffèrent → explique pourquoi tool ≠ jeu, et invite à push+restart.
async function loadServerDiff(){
  const host=H.$('#server-diff-panel');if(!host||!cur())return;
  host.style.display='';host.innerHTML='<div class="srvdiff-box"><img src="/studio/icons/icons/24/search.png" srcset="/studio/icons/icons/24/search.png 1x, /icons/icons/48/search.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Comparing to the server (game)…</div>';
  let j;try{const r=await fetch('/api/entity/'+cur().etype+'/'+cur().id+'/server-diff');j=await r.json();}
  catch(e){host.innerHTML='<div class="srvdiff-box err">compare failed: '+H.esc(String(e))+'</div>';return;}
  if(!j.configured){host.innerHTML='<div class="srvdiff-box">No server configured — open Settings to connect one.</div>';return;}
  const secs=(j.sections||[]);
  let body='';
  for(const s of secs){
    const nDiff=(s.diffs||[]).length;
    const head='<div class="srvdiff-h">'+H.esc(s.label)+' <span class="srvdiff-f">('+H.esc(s.name)+')</span>'+
      (!s.present_on_server?' <span class="srvdiff-warn"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> record not on server</span>'
        :nDiff?' <span class="srvdiff-warn">'+nDiff+' field'+(nDiff>1?'s':'')+' differ</span>'
        :' <span class="srvdiff-ok">✓ identical</span>')+'</div>';
    let rows='';
    for(const d of (s.diffs||[]).slice(0,40)){
      rows+='<tr><td class="srvdiff-lbl">['+d.i+'] '+H.esc(d.label)+'</td>'+
        '<td class="srvdiff-cli">'+(d.client===''?'<i>empty</i>':H.esc(d.client))+'</td>'+
        '<td class="srvdiff-srv">'+(d.server===''?'<i>empty</i>':H.esc(d.server))+'</td></tr>';
    }
    body+=head+(rows?'<table class="srvdiff-t"><tr><th></th><th>Tool (client draft)</th><th>Game (server)</th></tr>'+rows+'</table>':'');
  }
  const synced=j.in_sync;
  host.innerHTML='<div class="srvdiff-box '+(synced?'ok':'warn')+'">'+
    '<div class="srvdiff-top">'+(synced?'✓ The tool matches the game (server) for this record.'
      :'<img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> The tool shows your <b>client draft</b>; the game runs the <b>server</b> copy — these differ. '+
       'Click <b><img src="/studio/icons/icons/24/deploy_to_server.png" srcset="/studio/icons/icons/24/deploy_to_server.png 1x, /icons/icons/48/deploy_to_server.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Push to server</b> to deploy your edits, then <b>Restart</b> for them to take effect in-game.')+
    '<button class="hbtn" id="srvdiff-close" style="float:right">✕</button></div>'+body+'</div>';
  if(H.$('#srvdiff-close'))H.$('#srvdiff-close').onclick=()=>{host.style.display='none';host.innerHTML='';};
}

/* ---------------------------------------------------------------- init ----
   A poser EXACTEMENT la ou les cablages en ligne se trouvaient dans index.html.
   initEntity ne fait QUE reposer les ecouteurs qui vivaient au niveau du module
   (pastilles « i » du glossaire, modale de renommage, modale de mass edit) ;
   tout le reste est cable au rendu de la fiche.

   ATTENTION a l ordre : wireInfoDots() pose un ecouteur `click` sur document.
   Il etait enregistre AVANT les autres ecouteurs document de la fin du fichier ;
   il doit le rester, donc initEntity() ne doit PAS descendre plus bas que
   l endroit d ou la tranche a ete retiree.                                    */
function initEntity(host){
  setEntityHost(host);
  wireInfoDots();
  wireNameEdit();
  initMassEdit();
}

export { openEntity, renderShell, renderPanels, has3D, initEntity };
