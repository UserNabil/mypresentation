/* ============================================================================
   FEATURE MANAGER — la page : liste, statut GitHub, selection, rafraichissements
   cibles. Point d entree du lot.

   Pieges consignes ici :
   - openFeatures porte un JETON (`openFeatures._tok`) : /api/features repond
     d abord une version LOCALE (enriched=false, ~1 s, sans SSH) puis s enrichit
     en fond. Sans jeton, une reponse lente atterrissait sur une autre page.
   - fmPollEnrich NE RECONSTRUIT PAS la shell : cela vidait le detail (flicker
     « select a feature » puis re-affichage). Il repeint UNIQUEMENT les badges
     C/S et le dot de readiness, ligne par ligne, en place.
   - Deux rafraichissements SEPARES : une action client ne relance JAMAIS le
     scan serveur SSH (lent), et reciproquement.
   - Le pull git verrouille son bouton : sans cela l admin recliquait en boucle
     et lancait autant de pulls concurrents sur le meme cache (2026-07-31).
   - Une ligne de sidebar porte ses ETATS en data-fmstate : c est ce qui permet
     de filtrer « ce qui ne va pas » plutot qu un nom.

   ⚠ Ce module N EXPORTE PAS son etat : `FM` reste dans index.html, voir
   feature_manager_state.js pour le pourquoi.
   ============================================================================ */
import { H, fm, fmSetHost } from './feature_manager_state.js';
import { fmReactAvailable, fmReactKnown, fmReactOn, fmReactSet, fmMountReact } from './feature_manager_react.js';
import { fmBadge, fmEmptyMsg, fmLoader, fmRuntimeRadio } from './feature_manager_views.js';
import { makeProgress } from '../core/progress.js';
import { fmRenderDetail, fmSwapCard, fmServerLoadingHtml } from './feature_manager_detail.js';
import { fmApplyRoleMode } from './feature_manager_actions.js';
import { fmWireInstallAll, fmDeployDll, fmShowPubKey, fmInstallClient, fmDeployServerPick } from './feature_manager_ops.js';
import { fmBatchStage, fmBatchValidate, fmBatchUnvalidate } from './feature_manager_prod.js';
import { fmOpenImport, fmOpenSubmissions } from './feature_manager_import.js';
import { fmOpenDiagnostics, fmOpenReceivedDiagnostics } from './feature_manager_diag.js';
import { fmOpenClientReset } from './feature_manager_reset.js';
import { fmOpenVideoGuides } from './feature_manager_video.js';
import { fmOpenKnowledge } from './feature_manager_knowledge.js';
import { fmSortList, fmSortLoad, fmSortSave, fmPubHtml } from './feature_manager_sort.js';
import { fmPartsKeys, fmPartsRowHtml, fmPaintRowParts } from './feature_manager_parts.js';
import { fmDllPill, fmDllBannerHtml, fmWireDll, fmShowPullResult } from './feature_manager_dll.js';
import { fmClientState, fmServerState, fmBadgesHtml, fmRowStates, fmEnvTagHtml, fmPaintEnvChips, fmWireEnvChips, fmLoadEnvStages, fmLoadEnvWaiting, fmUpdateCounts, fmApplyFilter, fmMineHtml, fmHideBtnHtml, fmWireHideBtns, fmHiddenSet, fmSetHidden } from './feature_manager_filters.js';

/* Point d entree unique : pose l hote. A appeler EXACTEMENT la ou index.html
   cablait #btn-features, pour que l ordre d enregistrement des ecouteurs reste
   identique. */
export function initFeatureManager(h) { fmSetHost(h); }

/* Repolls du statut git : locaux au module (l ancien code les posait sur
   `window`, ils n etaient lus que par cette page). */
let _fmGitT = null, _fmPulling = false;

export async function openFeatures(){
  if(!H.guardPage('features.test.toggle','Feature Manager'))return;   // GS+ can VIEW + tick tests; GM/SA manage
  H.edenSetView('features');   // remember the view so a refresh (F5) lands back here
  if(await fmReactAvailable()&&fmReactOn()&&await fmMountReact(H.$('#content'),()=>{ fmReactSet(false); openFeatures(); })) return;
  /* ⛔ CET ECRAN COMPTAIT LES SECONDES ECOULEES. « 8.0 s » ne dit ni ce qui reste, ni meme
     si ca avance encore — c'est un chronometre, pas un avancement, et c'est la seule chose
     qu'on ne voulait pas savoir. Le balayage est une boucle SUR LES FEATURES : le serveur
     publie desormais son compte exact (/api/features/scan-progress), on affiche un vrai
     pourcentage et une barre. Tant que le compte n'est pas encore arrive, on ecrit
     « starting… » — on n'invente pas un 0 % qui bougerait tout seul. */
  H.$('#content').innerHTML='<div class="fmloadhero"><canvas class="fmloadlogo" id="fm-logocv"></canvas><video id="fm-logovid" src="/studio/logo.mp4" muted loop playsinline autoplay preload="auto" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"></video>'
    +'<div class="fmloadtx">scanning features — client (local) + server patches over SSH…'
    +'<div class="fmloadbar" id="fm-loadbar"><i></i></div>'
    +'<b id="fm-loadt">starting…</b></div></div>';
  fmChromaLogo();   // MP4 du logo, fond #1a0f06 rendu transparent (chroma-key), ratio + résolution natifs
  const suivi=makeProgress();
  const tick=setInterval(async()=>{
    const e=H.$('#fm-loadt'); if(!e){ clearInterval(tick); return; }
    /* ⛔ SONDE FACULTATIVE. Un backend plus ancien que ce front n'a pas cette route : il
       repond 404, ce qui est une REPONSE, pas un incident. Sans `__quiet=1` le rapporteur
       d'erreurs empilait un bandeau toutes les 300 ms (« the tool and the backend are out of
       sync »), signale le 2026-08-18 — c'est moi qui avais introduit la dependance sans repli.
       Et on ARRETE de sonder : reessayer une route absente ne la fera pas apparaitre. L'ecran
       retombe alors sur son intitule, sans chiffre invente. */
    let r; try{ r=await fetch('/api/features/scan-progress?__quiet=1'); }catch(_){ return; }
    if(r.status===404){ clearInterval(tick); e.textContent='scanning…';
                        const b0=H.$('#fm-loadbar'); if(b0)b0.classList.add('indet'); return; }
    let p=null; try{ p=await r.json(); }catch(_){ return; }
    const g=suivi.push(p.done||0, p.total||0);
    const bar=H.$('#fm-loadbar');
    if(g.part<0){ e.textContent='starting…'; if(bar)bar.classList.add('indet'); return; }
    if(bar){ bar.classList.remove('indet'); bar.firstElementChild.style.width=(g.part*100).toFixed(1)+'%'; }
    /* Le compte des features EST la mesure : on l'ecrit a cote du pourcentage. « 42 % » seul
       ne dit pas si le balayage porte sur 12 features ou sur 120. */
    e.textContent=g.pct+'  ·  '+g.done+'/'+g.total+' features';
  },300);
  // La LISTE arrive TOUT DE SUITE : /api/features renvoie d'abord la version LOCALE (~1 s, sans SSH), avec
  // enriched=false. On l'affiche immédiatement, puis on ré-interroge en douceur pour récupérer les badges
  // SERVEUR + readiness (calculés en fond côté back-end) dès qu'ils sont prêts — SANS jamais bloquer.
  const _openTok=(openFeatures._tok=(openFeatures._tok||0)+1);
  const _prefsP=H.fmGet('/api/features/prefs?__quiet=1').catch(()=>null);
  let j;
  try{ j=await H.fmGet('/api/features'); }
  catch(e){ clearInterval(tick); H.$('#content').innerHTML='<div class="esub" style="padding:20px;color:var(--crimson)">could not load features — '+H.esc(String(e))+'</div>'; return; }
  // l'utilisateur a quitte la page (le chargeur n'est plus la) : ne PAS dessiner par-dessus l'autre page
  if(_openTok!==openFeatures._tok||!H.$('#fm-loadbar')){clearInterval(tick);return;}
  clearInterval(tick);
  const _prefs=await _prefsP;
  if(_openTok!==openFeatures._tok||!H.$('#fm-loadbar')) return;
  if(_prefs&&Array.isArray(_prefs.hidden)) fm()._hidden=new Set(_prefs.hidden);
  fm().list=j;
  if(!fm().sel||!j.features.some(f=>f.name===fm().sel)) fm().sel=(j.features[0]||{}).name||null;
  renderFeaturesShell();
  if(fm().sel) fmSelect(fm().sel);
  fmLoadEnvStages(()=>_openTok===openFeatures._tok);
  fmLoadEnvWaiting(()=>_openTok===openFeatures._tok);
  // enrichissement : tant que la donnée n'est pas « enriched » (badges serveur/tests DB pas encore prêts),
  // re-fetch discrètement (max ~2 min) et re-render sans écran de chargement. S'arrête dès que c'est enrichi.
  if(j && (j.enriched===false || j.refreshing)) fmPollEnrich(_openTok);
  fmGitWatch(_openTok);
}
/* Tant que la page est ouverte, on regarde si la branche de l'env a bouge (feature validee, workflow
   GitHub passe) : le back-end tire alors en fond et la liste se reconstruit seule. */
const fmShellAlive=()=>!!document.getElementById('fm-status');
async function fmGitWatch(tok){
  for(;;){
    await new Promise(r=>setTimeout(r,45000));
    if(tok!==openFeatures._tok||!fmShellAlive()) return;
    if(document.hidden) continue;
    try{ await fmRenderGit(); }catch(_){}
  }
}
/* ⭐ On interroge tant que le back-end dit que la liste peut encore changer (`refreshing` : reconstruction
   ou re-verification du serveur en cours), et plus seulement jusqu'a la premiere liste « enrichie ». Celle-ci
   etait souvent l'instantane d'AVANT une action ou d'avant le scan de fond : les badges C/S restaient faux
   jusqu'a ce qu'on ouvre chaque feature. Une seule boucle a la fois ; relancee apres chaque action. */
let _fmPolling=0;
export async function fmPollEnrich(tok){
  if(tok==null) tok=openFeatures._tok;
  if(_fmPolling===tok) return;
  _fmPolling=tok;
  try{
    for(let i=0;i<120;i++){                               // ~5 min max (120 × 2,5 s) : un scan serveur prod est long
      await new Promise(r=>setTimeout(r,2500));
      if(tok!==openFeatures._tok||!fmShellAlive()) return;   // page quittée / rechargée
      let j; try{ j=await H.fmGet('/api/features'); }catch(_){ continue; }
      if(tok!==openFeatures._tok||!fmShellAlive()) return;
      if(!j || !j.features) continue;
      // Une ligne verifiee dans la fiche APRES la date de cet instantane garde son etat : sinon la liste
      // d'avant l'action la repeignait aussitot avec l'ancien badge.
      const prev=new Map(((fm().list||{}).features||[]).map(x=>[x.name,x]));
      const snapMs=(j.snap_ts||0)*1000;
      j.features.forEach(f=>{
        const p=prev.get(f.name);
        if(!p) return;
        if(p._cSync>snapMs){ f.client=p.client; f._cSync=p._cSync; }
        if(p._sSync>snapMs){ f.server=p.server; f._sSync=p._sSync; }
      });
      const avant=((fm().list||{}).features||[]).map(x=>x.name).join('|');
      fm().list=j;
      if(avant!==j.features.map(x=>x.name).join('|')){
        // ⛔ La liste de NOMS change apres un pull (changement d'env, feature tout juste validee) : repeindre
        // les seules lignes existantes laissait les nouvelles features invisibles jusqu'a un rechargement.
        if(!fm().sel||!j.features.some(f=>f.name===fm().sel)) fm().sel=(j.features[0]||{}).name||null;
        renderFeaturesShell();
        if(fm().sel) fmSelect(fm().sel);
        fmLoadEnvStages(()=>tok===openFeatures._tok);
        fmLoadEnvWaiting(()=>tok===openFeatures._tok);
      } else {
        // ⭐ NE PAS reconstruire la shell (ça vidait le détail → flicker « select feature » puis re-affichage).
        // On met à jour SEULEMENT les badges C/S + le dot readiness de CHAQUE ligne, EN PLACE, sans toucher au
        // détail affiché ni à la sélection.
        j.features.forEach(fmPaintRowFromList);
        fmApplyFilter();
        fmSortList();                                     // « Problems first » suit les badges qui viennent de changer
      }
      if(j.enriched && !j.refreshing) return;             // liste definitive → stop
    }
  } finally { if(_fmPolling===tok) _fmPolling=0; }
}
function renderFeaturesShell(){
  const j=fm().list, dll=j.dll||{};
  /* ⛔ CETTE PASTILLE PORTAIT SON PROPRE ROMAN. Le libelle contenait la liste des features
     en retard, la note « source behind » et son explication — dans 300 px de large, ca poussait
     tout le reste hors du bloc. On separe : un LIBELLE COURT qui tient sur la ligne, une COULEUR
     qui dit la gravite, et le detail complet en infobulle. Rien n'est perdu, rien ne deborde.
     Le calcul (et l'ordre des etats, dont « New DLL ready — Copy DLL ») vit dans
     feature_manager_dll.js : le bandeau et la sonde de l'auto-pull le repeignent en place. */
  const {txt:dllTxt, cls:dllCls, tip:dllTip}=fmDllPill(dll);
  const rows=(j.features||[]).map(f=>{
    const cl=fmClientState(f), sv=fmServerState(f);
    const on=f.name===fm().sel?' on':'';
    const st=fmRowStates(f,cl,sv);
    const lock=f.private?'<span class="fm-lock" title="private feature (folder _'+H.esc(f.name)+') — never pushed to the shared repo">🔒</span>':'';
    const ver=f.version?'v'+H.esc(f.version):'';
    const hid=fmHiddenSet().has(f.name)?' fm-hid':'';
    return `<div class="fm-row${on}${hid}" data-fmsel="${H.esc(f.name)}" data-fmpub="${+f.published||0}" data-fmleft="${(f.readiness||{}).defined?Math.max(0,((f.readiness||{}).total||0)-((f.readiness||{}).done||0)):-1}" data-fmstate="${st.join(' ')}" data-fmparts="${H.esc(fmPartsKeys(f))}">`
      +`<span class="fm-icow" data-fmpick title="select for a batch action: install, deploy, validate (click the icon)"><img class="fm-ico" src="/studio/icons/features/${H.esc(f.name)}.png" alt="" loading="lazy" onerror="this.onerror=null;this.src='/studio/icons/icons/48/feature.png'"><i class="fm-pick" aria-hidden="true">✓</i></span>`
      +`<span class="fm-nm"><span class="fm-nmt">${lock}${H.esc(f.name)}</span><span class="fm-ver">${ver}${fmPubHtml(f)}${fmReadyBadge(f.readiness)}${fmEnvTagHtml(f.name)}${fmMineHtml(f)}${fmHideBtnHtml(f.name)}</span>${fmPartsRowHtml(f)}</span>`
      +`<span class="fm-bs">${fmBadgesHtml(f,cl,sv)}</span>`
      +`<span class="fm-chev" aria-hidden="true">›</span></div>`;
  }).join('');
  const envOk=H.can('features.promote');
  const sa=H.can('features.release');
  const nRepack=(j.features||[]).filter(f=>(f.client||{}).needs_repack).length;
  const vstage=fmBatchStage();
  H.$('#content').innerHTML=`
  <div class="fm-wrap">
    <div class="fm-side fm-side2">
      <div class="fm2-head">
        <span class="fm2-title"><img src="/studio/icons/icons/48/feature.png" width="30" height="30" alt=""> Features</span>
        <span class="fm2-headbtns">
          ${H.can('features.promote')?'<button class="mini fm2-iconbtn" id="fm-subs" title="features sent by AI agents through the API, waiting for approval">📥</button>':''}
          ${H.can('features.promote')?'<button class="mini fm2-iconbtn" id="fm-import" title="import a feature (client files and/or server scripts) - super-admin only">⇪</button>':''}
          <button class="mini fm2-iconbtn" id="fm-videos" title="Video guides: a short scenario per feature to film an explanation video"><img class="fx-i" src="/studio/icons/fx/video.png" width="20" height="20" alt="" aria-hidden="true"></button>
          <button class="mini fm2-iconbtn" id="fm-knowledge" title="Knowledge: reference guides shipped with the tool, searchable, copy or download as markdown"><img class="fx-i" src="/studio/icons/fx/file_details.png" width="20" height="20" alt="" aria-hidden="true"></button>
          <button class="mini fm2-iconbtn" id="fm-more" title="tools: sync, client folders, log source, legend" aria-haspopup="true">⋯</button>
          ${fmReactKnown()?'<button class="mini fm2-iconbtn" id="fm-react" title="Preview: the new Features page">New page</button>':''}
          <button class="mini fm2-iconbtn" id="fm-refresh" title="rescan"><img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /studio/icons/icons/64/refresh.png 2x" width="22" height="22" alt=""></button>
        </span>
      </div>
      <div class="fm2-rule" aria-hidden="true"><span>✧</span></div>
      <button class="fm2-status fm2-${dllCls}" id="fm-status" title="${H.esc(dllTip)}">
        <span class="fm2-dot"></span><span id="fm-status-git">feature_ee</span><span class="fm2-sep">·</span><span class="fm2-dll">${dllTxt}</span>
      </button>
      ${fmDllBannerHtml(dll)}
      ${H.can('client.install')?`<div class="fm2-toprow">
        <button class="mini${nRepack?' gold':''}" id="fm-repack-all" title="one repack puts every file waiting in game_unpacked, for every feature, into the game (the per-feature Repack buttons do exactly the same)">${H.iconMarkup('packaging',24)} Repack all pending${nRepack?' ('+nRepack+')':''}</button>
        <button class="mini" id="fm-reset-client" title="put your game back on the official Eden Reforged client (download from the Reforged CDN), rebuild game_unpacked, install every feature that is on, repack once, copy the DLL, then run Diagnostics. Backups first, your settings are kept.">↺ Reset client</button>
      </div>`:''}
      <div class="fm2-pop" id="fm-pop" hidden>
        <div class="fm2-poph">Sync</div>
        <div class="fm-git" id="fm-git"><div class="esub">GitHub…</div></div>
        <div class="fm2-poph">Client folders</div>
        <div class="fm-btnrow">
          <button class="mini" id="fm-open-packed" title="open the PACKED client folder (the one holding game_.exe and the pkg)">${H.iconMarkup('client',24)} Packed</button>
          <button class="mini" id="fm-open-unpacked" title="open the UNPACKED client folder (game_unpacked — the loose files you edit)">${H.iconMarkup('depack',24)} Unpacked</button>
          <button class="mini" id="fm-open-logs" title="open the logs folder (%LOCALAPPDATA%\\EdenReforgedData\\logs — eden_hook.log and the other DLL logs, no longer in the game folder)">${H.iconMarkup('document',24)} Open logs folder</button>
        </div>
        <div class="fm2-poph">Environment</div>
        <div class="esub" title="${H.esc(j.env||'')}">${H.esc(j.env||'?')}${j.ssh_error?' — <span style="color:var(--crimson)">SSH: '+H.esc(j.ssh_error)+'</span>':''}</div>
        ${fmRuntimeRadio(j.dll||{})}
        <div class="fm2-poph">Legend</div>
        <div class="fm-legend">${fmBadge('C','ok')} client ${fmBadge('S','ok')} server · <span style="color:#2ea043">green</span> ok · <span style="color:#b8860b">orange</span> missing · <span style="color:#c2410c">rust</span> repack · <span style="color:#d1242f">red</span> off · <span style="color:#caa24a">gold</span> update · <span style="color:#9a8f78">dashed grey</span> not checked yet</div>
        <div class="fm-legend"><span class="fm-rbadge done">✓</span> tests confirmed · <span class="fm-rbadge left">N</span> tests left · <span class="fm-rbadge none">–</span> no tests</div>
      </div>
      <div class="fm-search"><div class="mapcombo" id="fm-searchcombo"><span class="pin"><img src="/studio/icons/icons/24/search.png" srcset="/studio/icons/icons/24/search.png 1x, /studio/icons/icons/48/search.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span><input id="fm-search" placeholder="Filter features…" autocomplete="off" spellcheck="false"><span class="clr" id="fm-search-x">✕</span></div><button class="mini fm2-iconbtn fm2-fbtn" id="fm-fbtn" title="show / hide the filters window">⛃</button></div>
      <div class="fm2-fbox" id="fm-fbox" hidden>
      <div class="fm2-fboxh" id="fm-fboxh"><span>Filters</span><button class="fm2-fx" id="fm-fbox-x" title="close">✕</button></div>
      <div class="fm-fchips fm2-chips" id="fm-fchips">
        <span class="fm2-fgh">Status</span>
        <button class="fm-chip on" data-fmfilter="">All <b class="fm2-n" data-fmcount=""></b></button>
        <button class="fm-chip" data-fmfilter="ok" title="installed and up to date"><span class="fm2-cdot ok"></span> Up to date</button>
        <button class="fm-chip" data-fmfilter="missing" title="something is missing (files, records or server patch)">⚠ <b class="fm2-n" data-fmcount="missing"></b></button>
        <button class="fm-chip" data-fmfilter="update" title="a newer version exists than the one deployed" hidden>⬆ Update <b class="fm2-n" data-fmcount="update"></b></button>
        <button class="fm-chip" data-fmfilter="off" title="disabled or not installed"><span class="fm2-cdot off"></span> Off</button>
        <button class="fm-chip" data-fmfilter="cmissing" title="the client part is not fully installed in your configured client: files or data records missing, repack pending, or not in the version.dll deployed there (hover the C badge for the reason)">⊘ Client missing <b class="fm2-n" data-fmcount="cmissing"></b></button>
        <button class="fm-chip" data-fmfilter="hidden" title="features you hid from your list (only for you) — open this to unhide them" hidden>Hidden <b class="fm2-n" data-fmcount="hidden"></b></button>
        <span class="fm2-fgh">Tests</span>
        <button class="fm-chip" data-fmfilter="totest" title="tests defined but not all confirmed">⚗ To test <b class="fm2-n" data-fmcount="totest"></b></button>
        <button class="fm-chip" data-fmfilter="mytest" title="features with tests you have not voted on or commented yet — the number on each row is what is left for you">⚗ To test (me) <b class="fm2-n" data-fmcount="mytest"></b></button>
      </div>
      <div class="fm2-minebar" id="fm-minebar" hidden><span id="fm-mine-txt"></span><button class="fm2-link" id="fm-mine-hide" title="hide every feature whose tests you have all voted on or commented (only for you)">Hide them</button></div>
      ${envOk?`<div class="fm-fchips fm2-chips fm2-envchips" id="fm-envchips">
        <span class="fm2-fgh">Environment</span>
        <button class="fm-chip" data-fmenv="dev" title="only on dev: never validated for preprod, not in prod" disabled>Dev only <b class="fm2-n" data-fmcount="env-dev"></b></button>
        <button class="fm-chip" data-fmenv="preprod" title="validated for preprod, not promoted to prod yet" disabled>Preprod <b class="fm2-n" data-fmcount="env-preprod"></b></button>
        <button class="fm-chip" data-fmenv="prod" title="promoted to prod (baseline features, live before the branch system, included)" disabled>Prod <b class="fm2-n" data-fmcount="env-prod"></b></button>
        <button class="fm-chip" data-fmenv="prodold" title="in prod, but preprod has newer code (fixes, new version): validate for prod again to ship it" disabled>Prod outdated <b class="fm2-n" data-fmcount="env-prodold"></b></button>
        <button class="fm-chip" data-fmenv="produnstable" title="in prod with a version that went in without passing all its preprod tests (SA decision): roll back to a stable version, or get its tests voted" disabled>Prod untested <b class="fm2-n" data-fmcount="env-produnstable"></b></button>
        <span class="fm2-envst" id="fm-envst">loading…</span>
      </div>`:''}
      </div>
      <div class="fm2-listh"><span>✧ Features (<span id="fm-nshown">${(j.features||[]).length}</span>)</span>
        <select id="fm-sort" class="fm2-sort" title="sort the list">
          <option value="az">A → Z</option><option value="za">Z → A</option><option value="new">Newest first</option><option value="old">Oldest first</option><option value="status">Problems first</option><option value="most">Most tests left</option><option value="fewest">Fewest tests left</option>
        </select>
      </div>
      <div class="fm-list">${rows||(j.pulling?'<div class="esub" style="padding:14px 10px;line-height:1.5;color:var(--faint)"><span class="fmspin"></span> Syncing feature_ee for this environment… the list refreshes by itself.</div>':fmEmptyMsg(j.repo_status))}</div>
      <div class="fm2-selbar" id="fm-selbar" hidden>
        <div class="fm2-selh"><b id="fm-sel-n">0</b> selected <button class="fm2-link" id="fm-sel-all" title="select every feature shown by the current filter">select shown</button><button class="fm2-link" id="fm-sel-x">clear</button></div>
        <div class="fm2-selbtns">
          <button class="mini gold" id="fm-sel-client" title="install the client files + data records of the selected features, then repack">${H.iconMarkup('packaging',24)} Install client</button>
          <button class="mini" id="fm-sel-hide" title="hide the selected features from your list, or show them again if they are all hidden (only for you)">Hide</button>
          ${sa?`<button class="mini" id="fm-sel-server" title="deploy the server side of the selected features (one script, one restart)">${H.iconMarkup('deploy_to_server',24)} Deploy server</button>`:''}
          ${vstage?`<button class="mini gold" id="fm-sel-promote" style="grid-column:1/-1" title="${vstage==='prod'?'promote the selected features from preprod to prod in ONE promote-prod run (one commit, one DLL build) — super-admin only':'validate the selected features for preprod in ONE commit — super-admin only'}. The next dialog lists what passes and what is refused before anything happens."><img class="fx-i" src="/studio/icons/fx/validated.png" width="18" height="18" alt="" aria-hidden="true"> Validate for ${vstage} (<span data-fmseln>0</span>)</button>`:''}
          ${H.can('features.promote')?`<button class="mini" id="fm-sel-unvalidate" style="grid-column:1/-1;color:#d1242f;border-color:#d1242f" title="remove the selected features from ${({dev:'preprod',preprod:'prod',prod:'prod'})[String(((H.me&&H.me())||{}).active_env||'dev').toLowerCase()]||'prod'} in one go (super-admin only)"><img class="fx-i" src="/studio/icons/fx/unvalidated.png" width="18" height="18" alt="" aria-hidden="true"> Unvalidate (<span data-fmseln>0</span>)</button>`:''}
        </div>
      </div>
      <div class="fm2-foot">
        <button class="fm2-copy" id="fm-deploy-dll" title="copy the built client DLL as version.dll (the only name it ships under; an old Eden d3d9.dll is removed, a third-party one such as DXVK is kept) into EVERY client folder you configured that can actually run the game (i.e. that holds game_.exe) — rename-trick if the game is open. An assets-only folder is skipped: nothing there would load a DLL.">⧉ Copy DLL to my client</button>
        <div class="fm2-diagrow"><button class="mini fm2-diag" id="fm-diag" title="Diagnostics: one report of everything installed on this PC (client path, DLL, pkg, every feature, logs, crashes) with the exact fix; copy it, export it as a .zip or send it to the admin">🩺 Diagnostics</button>${H.can('crashes.view')?'<button class="mini" id="fm-diag-recv" title="diagnostics sent by testers to the back-office">Received</button>':''}</div>
        ${sa?`<details class="fm2-pub"><summary>🛡 <b>Publishing</b> (super-admin)</summary>
          <div class="fm2-pubbody">
            <button class="mini" id="fm-publish-dll" title="publish this client DLL (version.dll) to the CDN — players get it on their next launch">Deploy DLL to CDN</button>
            <button class="mini" id="fm-snap-assets" title="archive what is currently published on the CDN, so an overwritten asset can be traced back">Snapshot CDN</button>
            <button class="mini" id="fm-install-all-client" title="Install EVERY feature's client files + data records into game_unpacked, then repack once">${H.iconMarkup('packaging',24)} Install all client</button>
            <button class="mini fm2-danger" id="fm-install-all-server" title="Run every feature's server deploy in one script, then restart the stack once">${H.iconMarkup('deploy_to_server',24)} Install all server</button>
            ${(fm().list||{}).mempatch_env?`<button class="mini fm2-danger" id="fm-mp-migrate" title="Put pristine ZoneServer/MissionServer binaries back (environment settings kept) and deliver every feature through its in-memory manifest (eden_launcher). Read-only plan first.">${H.iconMarkup('deploy_to_server',24)} Migrate to mempatch</button>`:''}
          </div></details>`:''}
      </div>
    </div>
    <div class="fm-main" id="fm-main"><div class="empty">select a feature</div></div>
  </div>`;
  fmWirePopover();
  if(!fm()._sort) fm()._sort=fmSortLoad();
  const so=H.$('#fm-sort'); if(so){ so.value=fm()._sort||'az'; so.onchange=()=>{ fm()._sort=so.value; fmSortSave(so.value); fmSortList(); }; }
  fmSortList();
  fmUpdateCounts();
  fmPaintEnvChips();
  H.$('#fm-refresh').onclick=()=>openFeatures();
  if(H.$('#fm-react')) H.$('#fm-react').onclick=()=>{ fmReactSet(true); openFeatures(); };
  // Le choix est ENREGISTRE (par environnement) puis la liste est relue : le releve d'execution
  // change de source immediatement, sans quoi la radio donnerait l'illusion d'agir.
  // ⛔ On envoie la VALEUR, jamais le nom de l'env : `list.env` porte l'HOTE du serveur, pas l'env
  // (cf. /api/features/runtime-client). Et on affiche ce que le serveur a REELLEMENT retenu.
  document.querySelectorAll('input[name="fmrt"]').forEach(r=>{ r.onchange=async()=>{
    try{
      const j=await H.fmPost('/api/features/runtime-client',{value:r.value});
      H.toast('runtime log: '+(j.runtime_client||r.value)+' — reading the '+(j.runtime_source||'?')+' client','ok');
      openFeatures();
    }catch(e){ H.toast('could not save: '+H.errMessage(e),'error'); }
  };});
  const dd=H.$('#fm-deploy-dll'); if(dd)dd.onclick=()=>fmDeployDll(false);
  const dg=H.$('#fm-diag'); if(dg)dg.onclick=()=>fmOpenDiagnostics();
  const kn=H.$('#fm-knowledge'); if(kn)kn.onclick=()=>{ tokC(); tokS(); fmOpenKnowledge(); };
  const vg=H.$('#fm-videos'); if(vg)vg.onclick=()=>{ tokC(); tokS(); fmOpenVideoGuides(n=>{ fm()._tab='video'; fm().sel=n; document.querySelectorAll('.fm-row').forEach(r=>r.classList.toggle('on',r.dataset.fmsel===n)); fmSelect(n); }); };
  const rs=H.$('#fm-reset-client'); if(rs)rs.onclick=()=>fmOpenClientReset();
  const ra=H.$('#fm-repack-all'); if(ra)ra.onclick=async()=>{
    if(H.isRepacking()){H.toast('repack already running…','info');return;}
    try{ ra.disabled=true; await H.barRepack(); }finally{ try{ ra.disabled=false; }catch(_){} }
    openFeatures();
  };
  const dr=H.$('#fm-diag-recv'); if(dr)dr.onclick=()=>fmOpenReceivedDiagnostics();
  fmWireDll();   // bandeau « New DLL ready » (meme copie que ci-dessus) + sonde de l'auto-pull de fond
  /* Ouvrir un dossier DEMARRE un programme : la route n'accepte donc qu'un mot-cle, jamais un
     chemin. Ici on ne transmet que « packed » ou « unpacked » — voir /api/client/open-folder.
     Le message d'erreur du serveur est affiche TEL QUEL : il dit lequel des deux n'est pas
     configure, ce qu'un « failed » generique ne dirait pas. */
  [['#fm-open-packed','packed'],['#fm-open-unpacked','unpacked'],['#fm-open-logs','logs']].forEach(([sel,which])=>{
    const b=H.$(sel); if(!b)return;
    b.onclick=()=>H.runBusy(b,async()=>{
      try{ const r=await H.fmPost('/api/client/open-folder',{which}); H.toast('opened '+r.dir,'ok'); }
      catch(e){ H.toast(H.httpErr?H.httpErr(e):H.errMessage(e),'error'); }
    });
  });
  fmWireInstallAll();
  fmWireMulti();
  if(j.pulling&&typeof window.edenWatchPull==='function') window.edenWatchPull();
  document.querySelectorAll('[data-fmsel]').forEach(el=>el.onclick=(ev)=>{ if(ev.target.closest('[data-fmpick]')||ev.target.closest('[data-fmhide]')) return; fm().sel=el.dataset.fmsel; document.querySelectorAll('.fm-row').forEach(r=>r.classList.toggle('on',r.dataset.fmsel===fm().sel)); fmSelect(fm().sel); });
  fmWireHideBtns();
  fmWireSearch();
  fmRenderGit();
  fmApplyRoleMode(document);   // strip header-level controls (Deploy DLL) for a tester
}
function fmMultiSet(){ return fm()._multi||(fm()._multi=new Set()); }
function fmPaintMulti(){
  const s=fmMultiSet();
  document.querySelectorAll('.fm-side2 .fm-row').forEach(r=>r.classList.toggle('picked', s.has(r.dataset.fmsel)));
  const bar=H.$('#fm-selbar'); if(!bar) return;
  bar.hidden=!s.size;
  const n=H.$('#fm-sel-n'); if(n) n.textContent=String(s.size);
  document.querySelectorAll('#fm-selbar [data-fmseln]').forEach(e=>{ e.textContent=String(s.size); });
  const hb=H.$('#fm-sel-hide'); if(hb){ const hid=fmHiddenSet(); hb.textContent=(s.size&&[...s].every(x=>hid.has(x)))?'Unhide':'Hide'; }
}
function fmWireMulti(){
  const s=fmMultiSet();
  const names=new Set([...document.querySelectorAll('.fm-side2 .fm-row')].map(r=>r.dataset.fmsel));
  [...s].forEach(x=>{ if(!names.has(x)) s.delete(x); });
  document.querySelectorAll('.fm-side2 [data-fmpick]').forEach(ic=>ic.onclick=(ev)=>{
    ev.stopPropagation();
    const nm=ic.closest('.fm-row').dataset.fmsel;
    if(s.has(nm)) s.delete(nm); else s.add(nm);
    fmPaintMulti();
  });
  const all=H.$('#fm-sel-all'); if(all) all.onclick=()=>{ document.querySelectorAll('.fm-side2 .fm-row').forEach(r=>{ if(r.style.display!=='none') s.add(r.dataset.fmsel); }); fmPaintMulti(); };
  const x=H.$('#fm-sel-x'); if(x) x.onclick=()=>{ s.clear(); fmPaintMulti(); };
  const cl=H.$('#fm-sel-client'); if(cl) cl.onclick=()=>fmInstallClient([...s].sort(), cl);
  const sv=H.$('#fm-sel-server'); if(sv) sv.onclick=()=>fmDeployServerPick([...s].sort(), sv);
  const hb=H.$('#fm-sel-hide'); if(hb) hb.onclick=()=>{
    const names=[...s].sort(), hid=fmHiddenSet(), unhide=names.length&&names.every(x=>hid.has(x));
    hb.disabled=true;
    fmSetHidden(names, !unhide).then(ok=>{ if(ok){ s.clear(); fmPaintMulti(); } }).finally(()=>{ hb.disabled=false; });
  };
  const un=H.$('#fm-sel-unvalidate'); if(un) un.onclick=()=>fmBatchUnvalidate([...s].sort(), ()=>{ s.clear(); fmPaintMulti(); });
  const pr=H.$('#fm-sel-promote'); if(pr) pr.onclick=()=>fmBatchValidate([...s].sort(), pr, ()=>{ s.clear(); fmPaintMulti(); });
  fmPaintMulti();
}
function fmReadyBadge(rd){
  rd=rd||{};
  const tot=rd.total||0, done=rd.done||0, left=Math.max(0,tot-done);
  if(rd.ready)return '<span class="fm-rbadge done" title="ready to install — all tests confirmed">✓</span>';
  if(rd.defined)return `<span class="fm-rbadge left" title="${left} test${left>1?'s':''} not confirmed yet (${done}/${tot})">${left}</span>`;
  return '<span class="fm-rbadge none" title="no readiness tests defined yet">–</span>';
}
function fmWirePopover(){
  const btn=H.$('#fm-more'), pop=H.$('#fm-pop'), st=H.$('#fm-status'); if(!btn||!pop)return;
  const toggle=(ev)=>{ ev.stopPropagation(); pop.hidden=!pop.hidden; };
  btn.onclick=toggle; if(st)st.onclick=toggle;
  pop.onclick=(ev)=>ev.stopPropagation();
  if(!fmWirePopover._doc){
    fmWirePopover._doc=true;
    document.addEventListener('click',()=>{ const p=H.$('#fm-pop'); if(p)p.hidden=true; });
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ const p=H.$('#fm-pop'); if(p)p.hidden=true; } });
  }
}
function fmRefreshRowState(f,cl,sv){
  const row=document.querySelector('[data-fmsel="'+CSS.escape(f.name)+'"]'); if(!row)return;
  row.dataset.fmstate=fmRowStates(f,cl,sv).join(' ');
  fmUpdateCounts();
}
function fmWireSearch(){
  const inp=H.$('#fm-search'), x=H.$('#fm-search-x'); if(!inp)return;
  const apply=fmApplyFilter;
  fmFilterBox();
  const imp=H.$('#fm-import'); if(imp) imp.onclick=fmOpenImport;
  const subs=H.$('#fm-subs'); if(subs) subs.onclick=fmOpenSubmissions;
  document.querySelectorAll('#fm-fchips .fm-chip').forEach(b=>{
    if((fm()._filter||'')===b.dataset.fmfilter)b.classList.add('on'); else b.classList.remove('on');
    b.onclick=()=>{ fm()._filter=b.dataset.fmfilter||'';
      document.querySelectorAll('#fm-fchips .fm-chip').forEach(o=>o.classList.toggle('on',o===b));
      apply(); };
  });
  fmWireEnvChips();
  inp.oninput=apply;
  inp.onkeydown=(e)=>{ if(e.key==='Escape'){ inp.value=''; apply(); inp.blur(); }
    if(e.key==='Enter'){ const first=[...document.querySelectorAll('.fm-row')].find(r=>r.style.display!=='none'); if(first){ fm().sel=first.dataset.fmsel; document.querySelectorAll('.fm-row').forEach(r=>r.classList.toggle('on',r.dataset.fmsel===fm().sel)); fmSelect(fm().sel);} } };
  if(x)x.onclick=()=>{ inp.value=''; apply(); inp.focus(); };
  if(fm()._search) inp.value=fm()._search;
  apply();                                                    // re-rendu : les pastilles « on » gardees doivent aussi FILTRER
}
async function fmRenderGit(){
  const box=H.$('#fm-git'); if(!box)return;
  let g; try{ g=await H.fmGet('/api/features/git/status'); }catch(e){ box.innerHTML='<div class="esub" style="color:var(--crimson)">git: '+H.esc(e.message)+'</div>'; return; }
  /* ⛔ La ligne de commit s'affichait BRUTE, coupee a 40 caracteres — donc en plein milieu du
     message (« …+0200 chore »), ce qui ne renseigne sur rien et prend une ligne entiere dans
     300 px. On ne garde que l'empreinte courte, qui suffit a comparer deux etats ; la ligne
     entiere est dans l'infobulle. */
  const commit=g.commit?('<span class="fm-commit" title="'+H.esc(g.commit)+'">'+H.esc(g.commit.split(/\s+/)[0].slice(0,10))+'</span>'):'';
  // The deploy key ships WITH the tool (embedded) — every user already has GitHub access, no key to enter.
  // ⭐ Dire s'il Y A du neuf : sans ça on cliquait « au cas où », sans savoir. `behind` = nb de commits
  // que le distant a en plus (calculé en fond par git_sync.remote_state, jamais dans cette requête).
  const nb=g.behind;
  let upd;
  if(g.checking&&nb==null)  upd='<span style="font-size:10.5px;color:var(--faint)">checking for updates…</span>';
  else if(g.error)          upd=`<span style="font-size:10.5px;color:var(--faint)" title="${H.esc(g.error)}">update check unavailable</span>`;
  else if(nb==null)         upd='';
  else if(nb>0)             upd=`<span style="font-size:11px;font-weight:800;color:#b8860b" title="${H.esc(g.remote_commit||'')}"><img src="/studio/icons/icons/24/get_latest_client.png" srcset="/studio/icons/icons/24/get_latest_client.png 1x, /studio/icons/icons/48/get_latest_client.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> new commits to pull</span>`;
  else                      upd='<span style="font-size:10.5px;color:#3f8b3f;font-weight:700">✓ up to date</span>';
  // le controle distant tourne en fond : on repolle brievement au lieu de laisser « checking… »
  // affiche jusqu'au prochain rechargement de page (c'est ce qui donnait l'impression d'un git lent).
  if(g.checking&&nb==null){ clearTimeout(_fmGitT); _fmGitT=setTimeout(fmRenderGit,1500); }
  if(g.auto_pulling||g.pulling) fmPollEnrich();          // pull de fond lance : la liste suivra seule
  box.innerHTML=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    <b style="color:var(--gold2);font-size:13px"><img src="/studio/icons/icons/24/get_latest_client.png" srcset="/studio/icons/icons/24/get_latest_client.png 1x, /studio/icons/icons/48/get_latest_client.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> feature_ee</b>
    <button class="mini${nb>0?' gold':''}" id="fm-git-pull"${nb===0?' title="already up to date — click to re-check"':''}>Pull latest features</button>
    ${upd}
    ${g.has_key?'':'<span style="color:var(--crimson);font-size:11px"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> key missing</span>'}
    <button class="mini" id="fm-git-adv" title="advanced: replace the embedded deploy key" style="opacity:.6;padding:3px 7px">${H.iconMarkup('settings',24)}</button>${commit}</div>`;
  const sg=H.$('#fm-status-git');
  if(sg){ const short=g.commit?g.commit.split(/\s+/)[0].slice(0,7):'';
    sg.textContent=['feature_ee',g.branch,short].filter(Boolean).join(' · ');
    const pill=H.$('#fm-status'); if(pill){ if(!pill.dataset.tip)pill.dataset.tip=pill.title;
      pill.classList.toggle('fm2-pull',nb>0);
      // prefixe garde a part : la pastille DLL peut etre repeinte ensuite (auto-pull) sans le perdre
      pill.dataset.gitpfx=nb>0?nb+' new commit(s) to pull — open ⋯ to pull. ':'';
      pill.title=pill.dataset.gitpfx+pill.dataset.tip; } }
  if(H.$('#fm-git-adv'))H.$('#fm-git-adv').onclick=()=>fmSetKeyDialog(g.keygen_cmd);
  // PULL : un git clone/pull dure plusieurs secondes sans aucun retour visuel -> l'admin recliquait en
  // boucle (autant de pulls concurrents sur le meme cache). Le bouton se verrouille, affiche un spinner,
  // et la liste est re-chargee a la fin (les features tirees apparaissent sans F5). Signale 2026-07-31.
  if(H.$('#fm-git-pull'))H.$('#fm-git-pull').onclick=async(ev)=>{
    const b=ev.currentTarget;
    if(_fmPulling)return;                     // garde-fou : un seul pull a la fois
    _fmPulling=true;
    const old=b.innerHTML; b.disabled=true; b.style.opacity='.6'; b.style.cursor='wait';
    b.innerHTML='<span class="fmspin" style="width:11px;height:11px;vertical-align:-1px"></span> pulling…';
    try{
      const r=await H.fmPost('/api/features/git/pull');
      fmShowPullResult(r);                           // dit aussi si une DLL plus neuve attend d'etre copiee
      if(r.ok)await openFeatures();                  // la liste reflete le nouvel arbre tout de suite
    }catch(e){ H.toast(H.errMessage(e),'error'); }
    finally{ _fmPulling=false; b.disabled=false; b.style.opacity=''; b.style.cursor=''; b.innerHTML=old; }
  };
}
function fmSetKeyDialog(keygenCmd){
  H.showThemedDialog('Set the deploy key (one time, works on every machine)',
    '<div class="esub">1) Generate a keypair once:<br><code style="user-select:all">'+H.esc(keygenCmd||'ssh-keygen -t ed25519 -f feature_ee_deploy -N ""')+'</code><br>2) Register the <b>.pub</b> on <b>github.com/UserNabil/feature_ee → Settings → Deploy keys</b> (read-only).<br>3) Paste the PRIVATE key (feature_ee_deploy) below — the tool encrypts it into a file you <b>commit</b>, so the key travels with the tool to every machine.</div>'+
    '<textarea id="fm-key-in" placeholder="(paste the private key here)" style="width:100%;height:120px;font-size:11px;margin-top:8px;font-family:monospace"></textarea>'+
    '<div style="text-align:right;margin-top:8px"><button class="mini" id="fm-key-save">Save key</button></div>');
  setTimeout(()=>{ const b=H.$('#fm-key-save'); if(b)b.onclick=async()=>{ const v=(H.$('#fm-key-in')||{}).value||''; if(!v.trim()){H.toast('paste the private key','error');return;} try{ const r=await H.fmPost('/api/features/git/set-key',{private_key:v}); H.toast('deploy key stored — commit feature_ee.key.enc','ok'); fmShowPubKey(r.public_key); fmRenderGit(); }catch(e){ H.toast(H.errMessage(e),'error'); } }; },100);
}
/* ⛔ DEUX JETONS, PAS UN. Ils servaient a ignorer un scan lent qui atterrit apres un
   autre clic — mais CLIENT et SERVEUR partageaient le meme compteur. Consequence
   vecue : une action client (installer des donnees, repacker) incrementait le jeton
   et ANNULAIT le scan serveur encore en vol ; la carte serveur, posee en « loading »
   par la 1re passe, ne recevait jamais son remplacant et restait bloquee sur
   « scanning server binaries over SSH… » indefiniment.
   Un jeton par PORTEE : une action client ne peut plus annuler le serveur. */
function tokC(){ return (fm()._selC = (fm()._selC || 0) + 1); }
function tokS(){ return (fm()._selS = (fm()._selS || 0) + 1); }

async function fmSelect(name){
  const main=H.$('#fm-main'); if(!main)return;
  const token=tokC(); const tokenS=tokS();   // changer de feature annule les DEUX scans
  main.innerHTML=fmLoader('client',name);
  /* Le scan serveur part EN MEME TEMPS que le detail client (il attendait la fin de celui-ci) : la carte
     serveur arrive des que le serveur repond, souvent tout de suite (scan prechauffe en fond). */
  const svP=H.fmGet('/api/features/detail/'+encodeURIComponent(name)+'/server').then(v=>({v}),e=>({e}));
  // PART 1 — fast local client scan, rendered immediately
  let d; try{ d=await H.fmGet('/api/features/detail/'+encodeURIComponent(name)+'/client'); }
  catch(e){ if(fm()._selC!==token)return; main.innerHTML='<div class="esub" style="color:var(--crimson);padding:16px">'+H.esc(e.message)+'</div>'; return; }
  if(fm()._selC!==token)return;
  d.server=undefined; fm().detail=d; fmRenderDetail(d, d.has_server?'loading':null);
  fmSyncRow(name, d);                       // REAL-TIME: refresh the sidebar C badge from the fresh client detail
  // PART 2 — slow server scan (SSH), fills the server card when it lands
  if(d.has_server){
    try{ const r=await svP; if(r.e)throw r.e; const sv=r.v; if(fm()._selS!==tokenS)return;
         /* On repart de fm().detail : une action client a pu le remplacer pendant le scan. */
         const cur=(fm().detail&&fm().detail.name===name)?fm().detail:d;
         cur.server=sv.server; fm().detail=cur;
         if(document.getElementById('fm-card-server')) fmSwapCard('fm-card-server', cur); else fmRenderDetail(cur,null);
         fmSyncRow(name, cur); }
    catch(e){ if(fm()._selS!==tokenS)return;
         const cur=(fm().detail&&fm().detail.name===name)?fm().detail:d;
         cur.server={ssh_error:e.message,components:[]}; fm().detail=cur;
         if(document.getElementById('fm-card-server')) fmSwapCard('fm-card-server', cur); else fmRenderDetail(cur,null); }
  }
}
// Rafraîchir UNIQUEMENT la carte CLIENT après une action client (install-data / reinstall / clean-loose).
// Une action client NE change PAS le serveur → on NE relance PAS le scan serveur SSH (lent). On re-fetch
// juste le détail client, on garde la carte serveur déjà connue (fm().detail.server), et on swappe la CARTE
// client seule (le reste du détail — tests, preview, scroll — est PRÉSERVÉ).
export async function fmRefreshClientOnly(name){
  const token=tokC();                       // n'annule PAS le scan serveur en vol
  let d; try{ d=await H.fmGet('/api/features/detail/'+encodeURIComponent(name)+'/client'); }
  catch(e){ H.toast(H.errMessage(e),'error'); return; }
  // ⛔ Une autre feature a ete selectionnee pendant l'action : on ne touche qu'a SA ligne de la liste.
  // Rendre ici remplacait la fiche affichee par celle de `name` (et fm().detail avec).
  if(fm().sel!==name){ fmSyncRow(name, d); return; }
  if(fm()._selC!==token)return;
  const prevServer=(fm().detail&&fm().detail.name===name)?fm().detail.server:undefined;  // conserver l'état serveur connu
  d.server=prevServer; fm().detail=d;
  if(document.getElementById('fm-card-client')) fmSwapCard('fm-card-client', d);   // swap ciblé
  else fmRenderDetail(d, d.has_server&&prevServer===undefined?'loading':null);      // 1re fois → rendu complet
  fmSyncRow(name, d);
}
// Symétrique : rafraîchir UNIQUEMENT la carte SERVEUR (après deploy/restart/install S_). Le client est
// inchangé → on garde fm().detail.client et on ne swappe que la carte serveur.
export async function fmRefreshServerOnly(name, force){
  /* `force` : le bouton « Re-verify » et les actions serveur doivent RELIRE, pas rendre
     le cache — sinon le bouton semble marcher et n'apprend rien de neuf. */
  if(fm().sel!==name){                      // action terminee alors qu'une autre feature est affichee
    try{ const sv=await H.fmGet('/api/features/detail/'+encodeURIComponent(name)+'/server'+(force?'?refresh=1':''));
         fmSyncRow(name, {name, server:sv.server}); }catch(_){}
    return;
  }
  const token=tokS();                       // n'annule PAS un rafraichissement client
  const prevClient=(fm().detail&&fm().detail.name===name)?fm().detail.client:undefined;
  // afficher un loader dans la carte serveur pendant le scan SSH (lent)
  const sc=document.getElementById('fm-card-server');
  if(sc) sc.innerHTML=fmServerLoadingHtml((fm().list||{}).env_name||(fm().list||{}).env);
  let d;
  try{ const sv=await H.fmGet('/api/features/detail/'+encodeURIComponent(name)+'/server'+(force?'?refresh=1':'')); if(fm()._selS!==token)return;
       if(fm().sel!==name){ fmSyncRow(name, {name, server:sv.server}); return; }
       d={name, has_server:true, client:prevClient, server:sv.server, changelog:(fm().detail&&fm().detail.changelog), version:(fm().detail&&fm().detail.version), preview:(fm().detail&&fm().detail.preview), readiness:(fm().detail&&fm().detail.readiness), has_client:(fm().detail&&fm().detail.has_client)}; }
  catch(e){ if(fm()._selS!==token)return; d=Object.assign({}, fm().detail||{name}, {server:{ssh_error:e.message,components:[]}}); }
  fm().detail=d;
  if(document.getElementById('fm-card-server')) fmSwapCard('fm-card-server', d);
  else fmRenderDetail(d,null);
  fmSyncRow(name, d);
}
// REPACK AUTOMATIQUE après un changement d'assets client, SI un dossier PACKED est configuré (les
// testeurs oubliaient de cliquer « Repack » → leurs modifs restaient dans game_unpacked, invisibles en
// jeu). client_dir renseigné = client_packed configuré → on repacke tout de suite. Sinon (pas de packed,
// ex. dev qui bosse en unpacked pur) on ne fait rien et on garde le rappel « repack to apply ».
export function fmPackedReady(){ return !!((fm().list&&fm().list.client_dir||'').trim()); }
export async function fmAutoRepackIfStaged(staged){
  // ⭐ On repacke APRES TOUTE action d'install client, meme si « rien ne manquait ». Le repack
  // `repack_from_dir` est CHIRURGICAL (il ne reinjecte que ce qui a change) : le lancer pour rien coute
  // quelques secondes, ne pas le lancer coute une feature invisible en jeu. Cas vecu 2026-08-01 :
  // « Install all client » repondait « nothing was missing » et NE repackait pas — or le staging etait
  // deja bon mais le PKG, lui, etait perime : le jeu ne voyait rien. `staged` (des fichiers ont ete
  // copies) n'est PAS le bon critere ; ce qui compte c'est l'ecart staging<->pkg.
  if(!fmPackedReady() || H.isRepacking()) return false;
  if(typeof H.barRepack!=='function') return false;
  H.toast('packed client detected — repacking automatically…','info');
  await H.barRepack();     // toast de fin géré par H.barRepack
  return true;
}
// Recompute a sidebar row's C/S badges + readiness dot from a FRESH detail object, and update fm().list
// so the list agrees with the detail WITHOUT a full refresh (fixes "OK in detail but orange in list").
function fmSyncRow(name, d){
  const f=(fm().list&&fm().list.features||[]).find(x=>x.name===name); if(!f)return;
  const avant=fmClientState(f)+'|'+fmServerState(f);
  if(d.client){
    const c=d.client, prev=f.client||{}, pl=c.payload||null;
    f.client={in_build:c.in_build, state:c.state, installed:!!c.fully_installed,
              partial:f.has_client?(c.in_build&&c.state>=1&&!c.fully_installed)
                                  :!!(pl&&!pl.applied&&pl.present_bytes),
              artifacts:c.artifacts, needs_repack:!!c.needs_repack,
              files_missing:f.has_client?(c.files_missing||0):((pl&&((pl.missing||0)+(pl.stale||0)))||0),
              data_missing:c.data_missing||0, compiled:!!prev.compiled, payload:!!prev.payload};
    f._cSync=Date.now();
  }
  if(d.server){
    const s=d.server, comps=s.components||[], marks=comps.map(x=>({installed:!!x.fully_installed})), ps=f.server||{};
    const nat=(s.native&&s.native.status)||{};
    const natPatched = nat.scannable ? !!nat.patched_all : null;
    const sd=s.data;
    const compAll=marks.length?marks.every(m=>m.installed):true, compSome=marks.some(m=>m.installed);
    const dataOk=!(sd&&sd.applicable&&sd.all_present===false);
    const scannable=!!(marks.length||nat.scannable||(sd&&sd.applicable));
    // ⛔ On ne gardait que installed/some : la version (« update available »), le wip et la date de
    // verification disparaissaient — ouvrir une feature en retard la repeignait en VERT dans la liste.
    f.server={components:marks, native:!!s.native, scannable,
              installed: scannable ? (compAll&&(natPatched!==null?natPatched:true)&&dataOk) : null,
              some: compSome||!!natPatched||(sd&&sd.applicable&&!sd.all_present),
              wip: !!ps.wip,
              outdated: s.outdated!=null ? !!s.outdated : !!ps.outdated,
              deployed_version: s.deployed_version!==undefined ? s.deployed_version : ps.deployed_version,
              source_version: s.source_version!==undefined ? s.source_version : ps.source_version,
              applied_at: ps.applied_at, applied_by: ps.applied_by,
              verified_at: scannable ? new Date().toISOString().replace(/\.\d+Z$/,'Z') : ps.verified_at,
              from_scan: scannable, from_db: false,
              mp_state: nat.mp_state!==undefined ? nat.mp_state : ps.mp_state,
              mp_label: nat.mp_state!==undefined ? (nat.mp_label||'') : ps.mp_label,
              mp_note: nat.mp_state!==undefined ? (nat.note||'') : ps.mp_note,
              mp_current: nat.mp_state!==undefined ? nat.mp_current : ps.mp_current,
              mp_port: nat.mp_port!==undefined ? nat.mp_port : ps.mp_port,
              mp_disk: nat.mp_disk!==undefined ? nat.mp_disk : ps.mp_disk,
              disk_prod: ps.disk_prod};
    f._sSync=Date.now();
  }
  // La fiche contredit la liste (action qui vient d'aboutir, ou liste perimee) : on reinterroge le back-end,
  // qui re-verifie alors l'ensemble du serveur — les AUTRES lignes se corrigent sans les ouvrir.
  if(fmClientState(f)+'|'+fmServerState(f)!==avant) fmPollEnrich();
  // re-render just this row's badges + dot in place
  const rowNm=document.querySelector('[data-fmsel="'+CSS.escape(name)+'"] .fm-bs');
  if(rowNm){
    const cl=fmClientState(f), sv=fmServerState(f);
    rowNm.innerHTML=fmBadgesHtml(f,cl,sv);
    fmRefreshRowState(f,cl,sv);
  }
}
// Met à jour EN PLACE les badges C/S + le dot readiness d'une ligne de sidebar depuis un objet de la LISTE
// (forme /api/features : f.client.installed, f.server.installed/some/wip, f.readiness) — PAS depuis un détail.
// Utilisé par fmPollEnrich pour peindre les badges enrichis sans reconstruire la shell ni vider le détail.
export function fmPaintRowFromList(f){
  if(!f||!f.name) return;
  const row=document.querySelector('[data-fmsel="'+CSS.escape(f.name)+'"]');
  if(!row) return;
  // aligner fm().list (pour que fmSelect/rendu ultérieur voient l'état à jour)
  const cur=(fm().list&&fm().list.features||[]).find(x=>x.name===f.name);
  if(cur){ cur.client=f.client; cur.server=f.server; cur.readiness=f.readiness; if(f.parts) cur.parts=f.parts; }
  if(f.parts) fmPaintRowParts(row, f);
  // badges C/S
  const bs=row.querySelector('.fm-bs');
  if(bs){
    const cl=fmClientState(f), sv=fmServerState(f);
    bs.innerHTML=fmBadgesHtml(f,cl,sv);
    fmRefreshRowState(f,cl,sv);
  }
  // dot readiness (même logique que renderFeaturesShell)
  const nm=row.querySelector('.fm-nm .fm-rbadge');
  if(nm){
    const rd=f.readiness||{}, _tot=rd.total||0,_done=rd.done||0,_left=Math.max(0,_tot-_done);
    if(rd.ready){ nm.className='fm-rbadge done'; nm.textContent='✓'; nm.title='ready to install — all tests confirmed'; }
    else if(rd.defined){ nm.className='fm-rbadge left'; nm.textContent=String(_left); nm.title=_left+' test(s) not confirmed yet ('+_done+'/'+_tot+')'; }
    else { nm.className='fm-rbadge none'; nm.textContent='–'; nm.title='no readiness tests defined yet'; }
  }
  const mn=row.querySelector('.fm-mine'); if(mn) mn.outerHTML=fmMineHtml(f);
}
function fmChromaLogo(){ H.chromaVideo(H.$('#fm-logocv'), H.$('#fm-logovid'), ()=>!!H.$('#fm-logocv')); }

function fmFilterBox(){
  const box=H.$('#fm-fbox'), btn=H.$('#fm-fbtn'); if(!box||!btn) return;
  const get=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const put=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  document.body.appendChild(box);
  document.querySelectorAll('.fm2-fbox').forEach(o=>{ if(o!==box) o.remove(); });
  let pos=null; try{ pos=JSON.parse(get('fm.fbox.pos')||'null'); }catch(e){}
  const place=(x,y)=>{ x=Math.max(0,Math.min(x,innerWidth-box.offsetWidth)); y=Math.max(0,Math.min(y,innerHeight-40));
    box.style.left=x+'px'; box.style.top=y+'px'; return {x,y}; };
  const show=on=>{ box.hidden=!on; btn.classList.toggle('on',on); put('fm.fbox.open',on?'1':'0');
    if(on){ const r=btn.getBoundingClientRect(); place(pos?pos.x:r.right+12, pos?pos.y:r.top); } };
  btn.onclick=()=>show(box.hidden);
  H.$('#fm-fbox-x').onclick=()=>show(false);
  H.$('#fm-fboxh').onmousedown=e=>{
    if(e.target.closest('button')) return;
    const r=box.getBoundingClientRect(), dx=e.clientX-r.left, dy=e.clientY-r.top;
    const mv=ev=>{ pos=place(ev.clientX-dx, ev.clientY-dy); };
    const up=()=>{ removeEventListener('mousemove',mv); removeEventListener('mouseup',up); if(pos) put('fm.fbox.pos',JSON.stringify(pos)); };
    addEventListener('mousemove',mv); addEventListener('mouseup',up); e.preventDefault();
  };
  show(get('fm.fbox.open')==='1');
  const t=setInterval(()=>{ if(!document.body.contains(btn)){ clearInterval(t); if(!H.$('#fm-fbtn')) box.remove(); } },1000);
}
