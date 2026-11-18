/* ============================================================================
   SERVER STATUS - modale #restartmodal : etat live des serveurs de jeu,
   restart << safe >> avec auto-heal, restauration de la data propre, baseline,
   purge des rollbacks, et rejeu du journal d editions.

   Extrait de static/index.html (protocole docs/WORK_SPLIT.md). Code COPIE tel
   quel : aucun changement de comportement, seuls les acces aux globaux passent
   par l hote.

   /!\ Contrat d hote - AUCUN global n est lu depuis ce module. Tout arrive par
   l objet passe a initServerStatus() :
     $                   selecteur (document.querySelector)
     esc                 echappement HTML
     toast               notification
     uiConfirm           confirmation modale (async -> bool)
     errMessage          normalisation d une exception en message lisible
     guardRestart        async -> bool ; garde PARTAGEE avec le bandeau de
                         sauvegarde. UN seul chemin, UN seul message quand le
                         serveur n est pas configure : ne pas la dupliquer ici.
     checkPendingRestart () -> void ; rafraichit le bandeau << restart en
                         attente >> apres un restart (la liste vient d etre
                         videe cote back). L appel etait deja protege par un
                         try/catch a l origine : on garde ce filet.

   Pieges consignes ici pour ne pas les reperdre :
   - Les cablages (#btn-restart, #restart-close, #srv-refresh, la delegation sur
     #srv-grid, les 4 boutons d action et #srv-journal-btn) etaient poses EN
     LIGNE. initServerStatus() doit etre appele EXACTEMENT la ou ils etaient :
     index.html enveloppe plus bas certains de ces boutons dans UI.runBusy
     (`wireBusy`, vers la ligne 11200) et cette passe ne voit que les onclick
     DEJA poses. Init apres wireBusy = plus aucun spinner sur ces boutons.
   - #srv-journal-btn etait cable AILLEURS que les autres (au milieu des
     fonctions de rendu, pas dans le paquet de fin). Il est repose ici avec eux :
     ils visent des noeuds distincts et statiques, l ordre entre eux est neutre.
   - La delegation de clic est posee sur #srv-grid (noeud stable), pas sur les
     cartes : renderServers() remplace tout le contenu de la grille a chaque
     poll, un handler pose sur une carte serait detruit au poll suivant.
   - `openServerStatus` n est PAS exposee sur `window` : elle ne l a jamais ete
     (le bloc d index.html est un <script type=module>, ses declarations ne
     montent pas sur window). Le routeur de notifications teste
     `window.openServerStatus` et retombe deja sur un clic de #btn-restart. Ne
     rien << reparer >> ici : ce serait un changement de comportement.
   - La constante morte `_STEPIC` (icones par verdict d etape) n a pas ete
     reprise : elle n avait aucun lecteur dans tout index.html.
   ============================================================================ */


let H = null;

let SRV_POLL = null;

function renderServers(j){
  const {$,esc}=H;
  const grid=$('#srv-grid');if(!grid)return;
  const srv=(j&&j.servers)||[];
  // ⚠️ La banniere « Last server error » se met a jour EN PREMIER, avant les sorties anticipees
  // ci-dessous. Sinon un ancien message y restait affiche indefiniment alors que le backend ne renvoie
  // plus rien (`reason: ''`) : l'admin lisait « item_id (50988) invalid — World/Zone can't boot » a cote
  // d'un « 12/12 up » parfaitement sain. Signale 2026-08-01.
  if(j&&('reason' in j)&&!j.reason){ const rs0=$('#srv-reason'); if(rs0)rs0.innerHTML=''; }
  // 1er poll : l'état se calcule en arrière-plan (endpoint NON bloquant) → 'refreshing' sans serveurs encore.
  // NE PAS afficher un faux « 0/0 down » : garder l'affichage précédent s'il existe, sinon un état de chargement.
  if(j&&j.refreshing&&!srv.length){
    const u=$('#srv-updated');if(u){u.textContent='· polling server…';u.style.color='var(--faint)';}
    if(!grid.querySelector('[data-srv]'))
      grid.innerHTML=`<div class="note" style="grid-column:1/-1;color:var(--faint)"><img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> polling live server state…</div>`;
    return;}
  if(j&&j.error&&!srv.length){
    // échec SSH transitoire (hosting provider lent) : NE PAS effacer le dernier bon état — juste le flagger figé
    if(grid.querySelector('[data-srv]')){const u=$('#srv-updated');if(u){u.textContent='· SSH slow/down — state frozen';u.style.color='var(--crimson)';}return;}
    grid.innerHTML=`<div class="note" style="color:var(--crimson);grid-column:1/-1">✗ ${esc(j.error)}</div>`;return;}
  grid.innerHTML=srv.map(s=>{
    // ⛔ Le vert valait « un process porte ce nom ». Un serveur qui demarre, qui agonise, ou qui
    // n'a jamais ouvert son port etait donc VERT et « UP » — des pastilles vertes sur des serveurs
    // injoignables (signale 2026-08-03). Trois etats francs, mesures : `up` = vit ET ecoute,
    // `starting` = vit sans port (ambre), `down` = absent. `state` vient du back ; on retombe sur
    // l'ancien calcul si le back est plus ancien que le front.
    const st = s.state || (s.up ? ((s.ports||[]).length ? 'up' : 'starting') : 'down');
    const isDup = st === 'duplicate';
    const isUp = st === 'up', isStart = st === 'starting';
    const col = isDup ? '#b23a2e' : isUp ? '#3f8b3f' : isStart ? '#b8860b' : '#b23a2e';
    const edge = isUp ? '#bcd6a8' : isStart ? '#e0cd94' : '#e3b3aa';
    const wash = isUp ? 'rgba(63,139,63,.06)' : isStart ? 'rgba(184,134,11,.07)' : 'rgba(178,58,46,.05)';
    const halo = isUp ? 'rgba(63,139,63,.15)' : isStart ? 'rgba(184,134,11,.15)' : 'rgba(178,58,46,.12)';
    const badge = isDup ? ('×'+(s.instances||2)+' RUNNING') : isUp ? 'UP' : isStart ? 'NO PORT' : 'OFF';
    const ports=(s.ports||[]).map(p=>':'+p).join(' ');
    // CE QUI tourne, et D'OU : plusieurs arborescences coexistent sur ces machines, un canal peut
    // tourner sur un binaire restaure ou un dossier autre que celui qu'on croit relancer.
    const where = (s.exe||s.cwd)
      ? `<div style="font-size:9.5px;color:var(--faint);font-family:Cascadia Code,Consolas,monospace;margin-top:2px;word-break:break-all" title="${esc(s.exe||'')}">${esc(s.cwd||s.exe||'')}</div>`
      : '';
    return `<div style="border:1px solid ${edge};background:${wash};border-radius:9px;padding:9px 11px">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="width:9px;height:9px;border-radius:50%;background:${col};flex:none;box-shadow:0 0 0 3px ${halo}"></span>
        <b style="color:var(--ink);font-size:12.5px">${esc(s.label)}</b>
        <span style="margin-left:auto;font-size:9.5px;font-weight:800;letter-spacing:.4px;color:${col}" title="${isDup?('this server has '+(s.instances||2)+' processes running at once — a restart started new ones without stopping the old'):isStart?'the process is running but is not listening on any port yet':''}">${badge}</span></div>
      <div style="font-size:10.5px;color:var(--faint);font-family:Cascadia Code,Consolas,monospace;margin-top:4px">${s.up?('pid '+esc(s.pid)+(ports?'  '+esc(ports):'  no port')):'not running'}</div>
      ${where}
      <div style="display:flex;gap:4px;margin-top:7px">
        <button class="srv-act" data-srv="${esc(s.name)}" data-act="start" title="Start ${esc(s.label)}" ${s.up?'disabled':''} style="flex:1;padding:3px 0;font-size:12px;border:1px solid #bcd6a8;border-radius:6px;background:rgba(63,139,63,.08);color:#3f6e2a;cursor:${s.up?'default':'pointer'};opacity:${s.up?'.32':'1'}">&#9658;</button>
        <button class="srv-act" data-srv="${esc(s.name)}" data-act="stop" title="Stop ${esc(s.label)}" ${s.up?'':'disabled'} style="flex:1;padding:3px 0;font-size:12px;border:1px solid #e3b3aa;border-radius:6px;background:rgba(178,58,46,.07);color:#b23a2e;cursor:${s.up?'pointer':'default'};opacity:${s.up?'1':'.32'}">&#9632;</button>
        <button class="srv-act" data-srv="${esc(s.name)}" data-act="restart" title="Restart ${esc(s.label)}" style="flex:1;padding:3px 0;font-size:12px;border:1px solid #d8c38a;border-radius:6px;background:rgba(207,155,42,.1);color:#9a7414;cursor:pointer">&#8635;</button>
      </div></div>`;
  }).join('');
  const ov=$('#srv-overall');
  if(ov){const up=(j&&j.up!=null)?j.up:srv.filter(s=>s.up).length,tot=(j&&j.total)||srv.length;
    // ⚠️ On affiche l'AGE REEL de la donnee, pas l'heure du navigateur. Avant : `new Date()` -> toujours
    // « a l'instant », meme sur un instantane fige depuis des minutes. Pendant un restart le SSH devient
    // injoignable, le backend garde volontairement le dernier etat connu (pour ne pas afficher un faux
    // « 0/N up » sur un pic de latence) -> le panneau restait VERT PARTOUT avec une heure fraiche et
    // l'admin croyait voir du temps reel. Signale 2026-07-31.
    const age=(j&&j.age!=null)?j.age:null;
    const stale=age!=null&&age>10;
    const rs=(j&&j.restarting_since!=null)?j.restarting_since:null;
    let tag;
    if(rs!=null&&rs<180) tag=`· <b style="color:#c2962f">restarting… ${Math.round(rs)}s</b> — state below is not live yet`;
    else if(age==null)   tag='· live';
    else if(stale)       tag=`· <b style="color:#b23a2e">frozen — ${Math.round(age)}s old</b> (server not answering)`;
    else                 tag=`· updated ${age<2?'just now':Math.round(age)+'s ago'}`;
    ov.innerHTML=`<b style="color:${stale?'#8a8175':(up>=8?'#3f8b3f':(up>=4?'#c2962f':'#b23a2e'))}">${up}/${tot}</b> servers up`
      +` <span id="srv-updated" style="font-size:10.5px;color:var(--faint);font-weight:600">${tag}</span>`;
    // donnee perimee -> on GRISE les cartes : elles ne decrivent plus l'etat courant
    if(stale||rs!=null&&rs<180){grid.style.opacity='.45';grid.style.filter='grayscale(.7)';}
    else{grid.style.opacity='';grid.style.filter='';}}
  const rs=$('#srv-reason');
  if(rs){
    const reason=(j&&j.reason)||'';
    // Erreur de DONNÉES (item/enchant invalide, Database Error) = World/Zone refusent de booter tant que la
    // data est incohérente. Ce n'est PAS le restart : on explique + on oriente vers « Restore clean data ».
    // « erreur de DONNEES » ne veut dire « le serveur ne peut pas booter » que si le serveur est
    // EFFECTIVEMENT en panne. Avec 12/12 up, un `item_id (N) invalid` est un AVERTISSEMENT de
    // chargement, pas un blocage : afficher « World/Zone can't boot » a cote de 12/12 up est un
    // mensonge qui pousse a cliquer « Restore clean data » sans raison. (Signale 2026-08-01.)
    const _up=(j&&j.up!=null)?j.up:srv.filter(s=>s.up).length, _tot=(j&&j.total)||srv.length;
    const serversDown=!(_tot&&_up>=_tot);
    const dataErr=serversDown&&/item_id\s*\(\d+\)\s*invalid|data size \d+ invalid|Database Error/i.test(reason);
    const warnOnly=!serversDown&&/item_id\s*\(\d+\)\s*invalid|data size \d+ invalid/i.test(reason);
    rs.innerHTML=reason?`<div style="padding:8px 11px;border:1px solid ${dataErr?'#d9242f':'#cf9b2a'};border-radius:8px;background:${dataErr?'rgba(217,36,47,.07)':'rgba(207,155,42,.08)'};font-size:11.5px"><b>${warnOnly?'Last data warning':'Last server error'}:</b> <code style="font-size:11px">${esc(reason)}</code>${dataErr?'<div style="margin-top:5px;color:#b23a2e"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> This is a server DATA problem — the game references an item/record that\'s missing or malformed, so World/Zone can\'t boot. Restarting won\'t fix it. Click <b><img src="/studio/icons/icons/24/lifering.png" srcset="/studio/icons/icons/24/lifering.png 1x, /studio/icons/icons/48/lifering.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Restore clean data</b> above to reset the data to your baseline, then restart.</div>':(warnOnly?'<div style="margin-top:5px;opacity:.8">All servers are up — this is a load-time <b>warning</b> (a record references a missing id), not a boot failure. Nothing to restore.</div>':'')}</div>`:'';
  }
  if(j&&j.progress){const w=$('#srv-progress-wrap');if(w)w.style.display='';const p=$('#srv-progress');if(p)p.textContent=j.progress;}
}
let _srvInflight=false;
async function pollServers(){
  const {$}=H;
  if(_srvInflight)return;                 // pas de polls empilés sur SSH hosting provider lente (évitait le gel + la rafale)
  _srvInflight=true;
  try{const r=await fetch('/api/server/processes');const j=await r.json();renderServers(j);}
  catch(_){const u=$('#srv-updated');if(u){u.textContent='· network down — state frozen';u.style.color='var(--crimson)';}}
  finally{_srvInflight=false;}
}
const _PENDIC={clone:'<img src="/studio/icons/icons/24/dna.png" srcset="/studio/icons/icons/24/dna.png 1x, /studio/icons/icons/48/dna.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',push:'<img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',create:'<img src="/studio/icons/icons/24/add.png" srcset="/studio/icons/icons/24/add.png 1x, /studio/icons/icons/48/add.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">'};
function renderPending(items){
  const {$,esc}=H;
  const el=$('#srv-pending');if(!el)return;
  items=items||[];
  if(!items.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="border:1px solid #bcd6a8;background:rgba(63,139,63,.06);border-radius:8px;padding:10px 12px">
    <div style="font-size:11.5px;font-weight:700;color:#3f6e2a;margin-bottom:6px"><img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /studio/icons/icons/48/refresh.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> ${items.length} saved change(s) this restart will apply in-game:</div>
    ${items.map(i=>`<div style="font-size:11px;color:var(--ink);padding:4px 0;border-top:1px solid rgba(0,0,0,.06)">
      <b>${_PENDIC[i.action]||'•'} ${esc(i.action||'')} ${esc(i.target||'')}</b>
      <div style="font-size:10.5px;color:var(--faint);margin-top:1px">${esc(i.detail||'server data file reloaded at boot')}</div></div>`).join('')}
  </div>`;
}
async function pollPending(){try{const j=await(await fetch('/api/server/pending-restart')).json();renderPending(j.pending||[]);}catch(_){}}
async function pollJournal(){try{const j=await(await fetch('/api/journal/status')).json();renderJournal(j);}catch(_){}}
function renderJournal(j){
  const {$,esc}=H;
  const el=$('#srv-journal');if(!el)return;
  const n=(j&&j.entries)||0;
  if(!n){el.innerHTML='<div style="font-size:11px;color:var(--faint)"><img src="/studio/icons/icons/24/integrity.png" srcset="/studio/icons/icons/24/integrity.png 1x, /studio/icons/icons/48/integrity.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Vaccine active — 0 pending edit. Your server changes are journaled and replayed byte-exact after any re-extraction.</div>';return;}
  el.innerHTML=`<div style="border:1px solid #b9c9e0;background:rgba(58,110,165,.06);border-radius:8px;padding:9px 11px;font-size:11.5px;color:var(--ink)">
    <img src="/studio/icons/icons/24/integrity.png" srcset="/studio/icons/icons/24/integrity.png 1x, /studio/icons/icons/48/integrity.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> <b>${n}</b> journaled edit(s)${j.added_records?` (incl. <b>${j.added_records}</b> record addition(s))`:''} — replayed automatically byte-exact on every server re-extraction (your changes can no longer be swallowed).${j.last_replay?`<div style="font-size:10.5px;color:var(--faint);margin-top:3px">last replay: ${esc(j.last_replay)}</div>`:''}</div>`;
}
function stopSrvPoll(){if(SRV_POLL){clearInterval(SRV_POLL);SRV_POLL=null;}}
function startSrvPoll(ms){stopSrvPoll();SRV_POLL=setInterval(pollServers,ms||4000);}
async function openServerStatus(){
  const {$}=H;
  if(H.can&&!H.can('server.restart'))return;
  const m=$('#restartmodal');if(m)m.classList.add('open');
  const g=$('#srv-grid');if(g)g.innerHTML='<div style="grid-column:1/-1"><span class="spin"></span> reading server state…</div>';
  await Promise.all([pollServers(),pollPending(),pollJournal()]);startSrvPoll(4000);
}
async function fireRestart(clean){
  const {$,toast,errMessage}=H;
  // meme garde que le bandeau : UN seul chemin, UN seul message quand ce n'est pas configure.
  if(!await H.guardRestart())return;
  const b=$('#srv-restart-btn'),rb=$('#srv-restore-btn');
  if(b)b.disabled=true;if(rb)rb.disabled=true;
  const tgt=clean?rb:b;if(tgt)tgt.innerHTML='<span class="spin"></span> '+(clean?'Restoring clean…':'Restarting…');
  toast(clean?'Clean restore started — watch the live status below':'Restart started — watch the live status below','ok');
  startSrvPoll(2500);  // poll faster during the (re)boot
  try{
    const r=await fetch('/api/server/restart'+(clean?'?clean=true':''),{method:'POST'});
    const j=await r.json().catch(()=>({ok:false,message:'no response'}));
    toast(j.ok?('✔ '+(j.message||'restart launched')):(''+(j.message||'see status')),j.ok?'ok':'warn',{sticky:!j.ok});
  }catch(e){toast(errMessage(e),'error');}
  if(b){b.disabled=false;b.innerHTML='<img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /studio/icons/icons/48/refresh.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Restart (safe, auto-heal)';}
  if(rb){rb.disabled=false;rb.innerHTML='<img src="/studio/icons/icons/24/lifering.png" srcset="/studio/icons/icons/24/lifering.png 1x, /studio/icons/icons/48/lifering.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Restore clean data';}
  pollServers();pollPending();try{H.checkPendingRestart();}catch(_){}  // the restart cleared the pending list
  setTimeout(()=>{if(SRV_POLL)startSrvPoll(4000);},90000);  // keep 2.5s polling ~90s through the boot, then ease off
}
function doRestart(){return openServerStatus();}  // legacy callers (home tile, save-status bar, pending-restart banner)

export function initServerStatus(host){
  H=host;
  const {$,toast,uiConfirm,errMessage}=H;
  $('#btn-restart')&&($('#btn-restart').onclick=()=>openServerStatus());
  $('#restart-close')&&($('#restart-close').onclick=()=>{$('#restartmodal').classList.remove('open');stopSrvPoll();});
  $('#srv-refresh')&&($('#srv-refresh').onclick=()=>pollServers());
  // per-server start/stop/restart — delegated on the stable #srv-grid (renderServers replaces the cards every poll)
  $('#srv-grid')&&$('#srv-grid').addEventListener('click',async(ev)=>{
    const btn=ev.target.closest('.srv-act');if(!btn||btn.disabled)return;
    const name=btn.dataset.srv,act=btn.dataset.act,L={start:'Start',stop:'Stop',restart:'Restart'}[act];
    const warn=(act!=='stop'&&/^ZoneServer/.test(name))?' Its WorldServer must be UP first.':
               (act==='stop'&&/^WorldServer/.test(name))?' This also drops its ZoneServer.':'';
    if(!await uiConfirm(`${L} ${name}?${warn}\n\nSingle-server control does NOT re-extract/validate data — for a data-safe restart use "Restart (safe, auto-heal)".`,`${L} ${name}?`,L))return;
    btn.disabled=true;
    try{
      const r=await fetch(`/api/server/${encodeURIComponent(name)}/${act}`,{method:'POST'});
      const j=await r.json().catch(()=>({}));
      if(r.ok&&j.ok!==false)toast(''+(j.message||(L+' sent')),'ok');
      else toast(''+(j.detail||j.message||'failed'),'warn',{sticky:true});
    }catch(e){toast(errMessage(e),'error');}
    startSrvPoll(2500);setTimeout(()=>{if(SRV_POLL)startSrvPoll(4000);},30000);
    setTimeout(pollServers,1200);
  });
  $('#srv-restart-btn')&&($('#srv-restart-btn').onclick=async()=>{
    if(!await uiConfirm('Stop & restart ALL game servers. restart_safe boots, and if World/Zone fail it auto-restores the clean data and retries once. ~1–3 min.','Restart (safe, auto-heal)?','Restart'))return;
    fireRestart(false);
  });
  $('#srv-restore-btn')&&($('#srv-restore-btn').onclick=async()=>{
    if(!await uiConfirm('Force a full re-extract of the CLEAN data tarball, then restart. Use this when the live data is bad. The current data is overwritten. ~2–3 min.','Restore CLEAN data + restart?','Restore clean'))return;
    fireRestart(true);
  });
  $('#srv-baseline-btn')&&($('#srv-baseline-btn').onclick=async()=>{
    if(!await uiConfirm('Make the CURRENT live server data the recovery baseline (regenerate the tarball). Added items will then survive a clean re-extract / preprod rebase. The data is validated first — it refuses if it looks corrupt. ~10–20 s.','Save current data as recovery baseline?','Save baseline'))return;
    const b=$('#srv-baseline-btn');if(b){b.disabled=true;b.innerHTML='<span class="spin"></span> Saving…';}
    try{
      const j=await(await fetch('/api/server/regenerate-baseline',{method:'POST'})).json();
      toast(j.ok?('✔ '+(j.message||'baseline saved')):(''+(j.message||'refused')),j.ok?'ok':'warn',{sticky:true});
    }catch(e){toast(errMessage(e),'error');}
    if(b){b.disabled=false;b.innerHTML='<img src="/studio/icons/icons/24/packaging.png" srcset="/studio/icons/icons/24/packaging.png 1x, /studio/icons/icons/48/packaging.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Save as baseline';}
  });
  $('#srv-reclaim-btn')&&($('#srv-reclaim-btn').onclick=async()=>{
    if(!await uiConfirm('Delete every per-version ROLLBACK backup piled up on the server (feature/S_ install backups, timestamped binary backups, old data-folder copies, stray /tmp uploads). Your single BASELINE (Save as baseline) is KEPT as the one point of return, and the live data is untouched. This frees disk space.','Reclaim disk — purge old rollbacks?','Reclaim disk'))return;
    const b=$('#srv-reclaim-btn');if(b){b.disabled=true;b.innerHTML='<span class="spin"></span> Reclaiming…';}
    try{
      const j=await(await fetch('/api/server/reclaim-disk',{method:'POST'})).json();
      toast(j.ok?(''+(j.message||'disk reclaimed')):(''+(j.message||j.detail||'failed')),j.ok?'ok':'warn',{sticky:true});
    }catch(e){toast(errMessage(e),'error');}
    if(b){b.disabled=false;b.innerHTML='<img src="/studio/icons/icons/24/clear_cache_restart.png" srcset="/studio/icons/icons/24/clear_cache_restart.png 1x, /studio/icons/icons/48/clear_cache_restart.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Reclaim disk';}
  });

  $('#srv-journal-btn')&&($('#srv-journal-btn').onclick=async()=>{
    const b=$('#srv-journal-btn');if(b){b.disabled=true;b.innerHTML='<span class="spin"></span> Replaying…';}
    try{
      const r=await fetch('/api/journal/replay',{method:'POST'});
      const j=await r.json().catch(()=>({}));
      if(r.ok)toast(`Replay: ${(j.applied||0)} edit(s) + ${(j.added||0)} record(s) re-applied${j.failed?(', '+j.failed+' failure(s)'):''}`,j.failed?'warn':'ok',{sticky:!!j.failed});
      else toast(''+(j.detail||'replay failed'),'warn',{sticky:true});
    }catch(e){toast(errMessage(e),'error');}
    if(b){b.disabled=false;b.innerHTML='<img src="/studio/icons/icons/24/integrity.png" srcset="/studio/icons/icons/24/integrity.png 1x, /studio/icons/icons/48/integrity.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Replay my edits';}
    pollJournal();
  });
}

/* Seuls ces deux-la sont appeles depuis index.html (#ss-restart, #pending-restart-btn,
   routeur de notifications). Le reste est interne au module : l exporter donnerait
   l illusion d une surface publique que personne ne consomme. */
export { openServerStatus, doRestart };
