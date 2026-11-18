/* ============================================================================
   FEATURE MANAGER — la DLL du client : pastille d etat, bandeau « New DLL
   ready », et ce que dit le dialogue apres un pull.

   Pieges consignes ici :
   - « Plus neuve » se juge sur le CONTENU : le back lit les versions DANS les
     binaires (features_manager._dll_binary_info : table g_features + EDEN), il
     ne compare pas des dates. Une DLL plus recente en date peut porter du code
     plus ancien : copier ne servirait alors a rien (ou retrograderait).
   - newer_ready ne vient que d un verdict « newer » (du neuf, AUCUNE perte) ou
     de stale_fixed. Un « mixed » n est jamais propose (vecu 2026-09-30 : clone
     dev 0.68.0 sur un client workspace 0.46.0 = +bag_multi_delete mais
     model_change 0.52.1 -> 0.52.0) : l infobulle le decrit, sans bandeau. Les
     numeros EDEN de deux lignees ne se comparent pas : a versions egales, un
     « same » + rebuild peut montrer deux EDEN differents.
   - Incident 2026-09-30 : un pull a amene collect_all 0.3.0 avec sa DLL
     recompilee, personne ne l a copiee, l admin a joue en 0.2.0 et la pastille
     disait « DLL outdated — recompile ». Faux : il suffisait de COPIER. Ordre
     des etats : absente > nouvelle DLL prete > relancer > recompiler > a jour.
     « recompile » ne reste que si AUCUNE DLL disponible ne corrige le retard.
   - version_stale = la DLL qui a TOURNE (eden_hook.log) est plus ancienne que
     la source d au moins une feature. source_behind = l inverse (le clone
     feature_ee derive derriere workspace) : pas un defaut de la DLL, une note
     dans l infobulle, jamais une alerte.
   - runtime_pending = la DLL posee dans le client n est pas celle qui a tourne
     (empreinte EDEN + date de compilation, ou a defaut les dates) : le releve
     est perime, il faut RELANCER le jeu — ni « recompile » ni « up to date ».
   - Le bouton du bandeau et celui du dialogue passent par fmDeployDll, comme
     « ⧉ Copy DLL to my client » : meme route, meme dialogue si le jeu tourne.
   - L auto-pull de fond (toutes les 15 min) n ouvre JAMAIS de dialogue. La page
     sonde son etat et repeint la pastille et le bandeau EN PLACE : recharger la
     page viderait un commentaire de test en cours de saisie.
   ============================================================================ */
import { H, fm } from './feature_manager_state.js';
import { fmDeployDll } from './feature_manager_ops.js';

const V = v => (v ? 'v' + v : '?');

/* Les lignes lisibles d une comparaison : ce que la copie APPORTE, et ce
   qu elle RETIRERAIT (feature absente ou plus ancienne dans la nouvelle DLL). */
function fmDllChanges(u){
  if(!u) return {gains:[], losses:[]};
  return {
    gains:[...(u.up||[]).map(x=>x.feature+' '+V(x.from)+' → '+V(x.to)),
           ...(u.added||[]).map(x=>x.feature+' '+V(x.to)+' (new)')],
    losses:[...(u.down||[]).map(x=>x.feature+' '+V(x.from)+' → '+V(x.to)+' (older)'),
            ...(u.removed||[]).map(x=>x.feature+' '+V(x.from)+' (not in the new DLL)')]
  };
}
function fmEdenLine(u){
  if(!u||!u.eden_to) return '';
  return 'EDEN '+(u.eden_from||'?')+' → '+u.eden_to+(u.built_to?' (built '+u.built_to+')':'');
}
const fmBuildTag=(eden,built)=>'EDEN '+(eden||'?')+(built?', built '+built:'');
/* Ce qu apporte la DLL prete. Sans comparaison de binaires (DLL du client
   illisible), on retombe sur les features en retard que la DLL disponible
   corrige. */
function fmDllItems(dll){
  const ch=fmDllChanges(dll.update);
  if(ch.gains.length) return ch;
  const fix=(dll.stale||[]).filter(x=>x.available).map(x=>x.feature+' '+V(x.running)+' → '+V(x.available));
  return {gains:fix, losses:ch.losses};
}

export function fmDllPill(dll){
  dll=dll||{};
  const u=dll.update||null, detail=[];
  if((dll.stale||[]).length)
    detail.push('Older than the source: '+dll.stale.map(x=>x.feature+' v'+x.running+' → v'+x.source).join(', '));
  if((dll.source_behind||[]).length)
    detail.push('The game runs a build NEWER than the source the tool reads (the feature_ee clone lags '
              +'behind workspace). Nothing to rebuild — re-sync the clone: '
              +dll.source_behind.map(x=>x.feature+' v'+x.source+' → game v'+x.running).join(', '));
  let txt, cls, tip;
  if(!dll.deployed){ txt='DLL not deployed'; cls='bad'; tip=(dll.legacy_d3d9||[]).length?'The Eden DLL in this client is still the old d3d9.dll: it now ships as version.dll only. « Copy DLL » writes version.dll and removes the old d3d9.dll.':'No version.dll in the client yet — use « Copy DLL ».'; }
  else if(dll.newer_ready){
    txt='New DLL ready — Copy DLL'; cls='warn';
    tip='A client DLL NEWER than the one in your client is ready on this machine (versions read inside both '
       +'files, not from their dates). Click « Copy DLL to my client », then relaunch the game.';
    const it=fmDllItems(dll), l=[];
    if(it.gains.length) l.push('Brings: '+it.gains.join(', '));
    if(it.losses.length) l.push('Also changes: '+it.losses.join(', '));
    const e=fmEdenLine(u); if(e) l.push(e);
    if(dll.available&&dll.available.path) l.push('From: '+dll.available.path);
    if(l.length) detail.unshift(l.join('\n'));
  }
  else if(dll.runtime_pending){ txt='DLL updated — relaunch'; cls='warn';
    tip='The version.dll in the client is not the one the game last ran (copied after the last launch, or the game stayed open): relaunch the game to load it.'; }
  else if(dll.version_stale){ txt='DLL outdated — recompile'; cls='bad';
    tip='The binary that ran is OLDER than the feature source, and no client DLL available on this machine carries the fix. Pull the latest features (a newer DLL may have been published), or rebuild with client_dll/build.bat.'; }
  else if(dll.outdated){ txt='newer build available'; cls='warn';
    tip='A more recent client DLL exists than the one deployed (compared by date: its content could not be read).'; }
  else { txt='DLL up to date'; cls='ok'; tip='The binary that ran matches the feature source.';
    if(u&&u.verdict==='older') detail.push('The client DLL available on this machine is OLDER than the one in your client'
      +(fmEdenLine(u)?' ('+fmEdenLine(u)+')':'')+': « Copy DLL » would downgrade it.');
    else if(u&&u.verdict==='mixed'){ const ch=fmDllChanges(u);
      detail.push('The client DLL available on this machine is not simply newer: it would bring '+ch.gains.join(', ')
        +' but also '+ch.losses.join(', ')+'. It is not offered as an update — copy it only if you want that trade-off.'); }
    else if(u&&u.rebuild) detail.push('Another build of the same feature versions is available ('+fmBuildTag(u.eden_to,u.built_to)
      +'; yours: '+fmBuildTag(u.eden_from,u.built_from)+'): copying it is optional.'); }
  if(dll.deployed&&(dll.legacy_d3d9||[]).length) detail.push('An old Eden d3d9.dll is still in your client: « Copy DLL » removes it (the DLL ships as version.dll only).');
  if((dll.third_party_d3d9||[]).length) detail.push('A third-party d3d9.dll (DXVK or another wrapper) is in your client: the tool never removes it.');
  if(detail.length) tip+='\n\n'+detail.join('\n\n');
  return {txt, cls, tip};
}

function fmBannerInner(dll){
  const it=fmDllItems(dll), e=fmEdenLine(dll.update);
  const shown=it.gains.slice(0,3).join(' · ')+(it.gains.length>3?' · +'+(it.gains.length-3)+' more':'');
  const full=[...it.gains, ...it.losses, e].filter(Boolean).join('\n');
  return `<div class="fm2-dllready-h"><b>New DLL ready</b> — not in your game yet</div>`
    +(shown?`<div class="fm2-dllready-d" title="${H.esc(full)}">${H.esc(shown)}</div>`:'')
    +(it.losses.length?`<div class="fm2-dllready-w" title="${H.esc(it.losses.join('\n'))}">also: ${H.esc(it.losses.join(', '))}</div>`:'')
    +(H.can('pkg.repack')?`<button class="mini gold" id="fm-dllready-copy" title="same as « ⧉ Copy DLL to my client » below — then relaunch the game">⧉ Copy DLL to my client now</button>`:'');
}
/* Le bandeau existe TOUJOURS dans la barre (cache s il n y a rien) : la sonde
   de l auto-pull peut ainsi le remplir sans reconstruire la page. */
export function fmDllBannerHtml(dll){
  dll=dll||{};
  const on=!!(dll.deployed&&dll.newer_ready);
  return `<div class="fm2-dllready" id="fm-dllready" role="status"${on?'':' hidden'}>${on?fmBannerInner(dll):''}</div>`;
}
function fmWireBanner(){
  const b=H.$('#fm-dllready-copy');
  if(b) b.onclick=()=>H.runBusy(b,()=>fmDeployDll(false));
}
function fmPaintDll(dll){
  const pill=H.$('#fm-status');
  if(pill){
    const p=fmDllPill(dll);
    pill.classList.remove('fm2-ok','fm2-warn','fm2-bad'); pill.classList.add('fm2-'+p.cls);
    const t=pill.querySelector('.fm2-dll'); if(t) t.textContent=p.txt;
    pill.dataset.tip=p.tip; pill.title=(pill.dataset.gitpfx||'')+p.tip;
  }
  const box=H.$('#fm-dllready');
  if(box){
    const on=!!(dll&&dll.deployed&&dll.newer_ready);
    box.hidden=!on; box.innerHTML=on?fmBannerInner(dll):'';
    fmWireBanner();
  }
}

let _fmPullT=null, _fmPullSince=0;
function fmWatchAutoPull(){
  _fmPullSince=Date.now()/1000;
  if(_fmPullT) return;
  _fmPullT=setInterval(async()=>{
    if(!document.querySelector('.fm-side2')){ clearInterval(_fmPullT); _fmPullT=null; return; }
    if(document.hidden) return;
    let st=null;
    try{ const r=await fetch('/api/features/git/autopull',{credentials:'same-origin'}); if(!r.ok) return; st=await r.json(); }
    catch(_){ return; }
    if(!st||st.running||!(st.last>_fmPullSince)) return;
    _fmPullSince=st.last;
    const dll=st.result&&st.result.dll;
    if(!dll||typeof dll!=='object') return;
    if(fm().list) fm().list.dll=dll;
    fmPaintDll(dll);
  },45000);
}
export function fmWireDll(){
  fmWireBanner();
  fmWatchAutoPull();
}

/* Dialogue d un pull MANUEL (bouton « Pull latest features » de la barre ou
   de la carte d une feature) : si une DLL plus neuve que celle du client est
   la, on le dit EN PREMIER, avec les versions, et on propose la copie. */
export function fmShowPullResult(r){
  r=r||{};
  const dll=r.dll||null;
  let top='';
  if(r.ok&&dll&&dll.deployed&&dll.newer_ready){
    const it=fmDllItems(dll), e=fmEdenLine(dll.update);
    top=`<div class="fm-pullnew">`
      +`<b>${dll.pulled_new_dll?'This pull brought a client DLL newer than the one in your client.':'A client DLL newer than the one in your client is ready.'}</b>`
      +`<div class="esub">It is NOT in your game yet: copy it into your client, then relaunch the game.</div>`
      +(it.gains.length?`<ul>${it.gains.map(x=>'<li>'+H.esc(x)+'</li>').join('')}</ul>`:'')
      +(it.losses.length?`<div class="fm-pullnew-w">Also changes: ${H.esc(it.losses.join(', '))}</div>`:'')
      +(e?`<div class="esub">${H.esc(e)}</div>`:'')
      +(H.can('pkg.repack')?`<div class="fm-pullnew-act"><button class="mini gold" id="fm-pull-copy">⧉ Copy DLL to my client now</button></div>`:'')
      +`</div>`;
  }
  H.showThemedDialog(r.ok?'✔ Pulled feature_ee':'✖ Pull failed',
    top+'<div class="esub">'+H.esc(r.commit||'')+'</div><pre style="max-height:300px;overflow:auto;font-size:11px;white-space:pre-wrap">'+H.esc(r.log||'')+'</pre>');
  const b=H.$('#fm-pull-copy');
  if(b) b.onclick=()=>{ const dlg=H.$('#intg-dlg'); if(dlg) dlg.remove(); fmDeployDll(false); };
}
