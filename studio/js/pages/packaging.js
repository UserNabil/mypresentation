/* ============================================================================
   PACKAGING — OUVERTURE de la modale #pkgmodal (et sa fermeture).

   Extrait de index.html : openPackaging() (lignes 5464-5476) et le cablage
   #pkg-close (ligne 6466). Le RESTE de la page — Depack / Repack / Pack,
   pkgSetProg / pkgBusy / pkgPoll, le comparateur Diff & Mods Vault — RESTE
   dans index.html : ces fonctions ont des appelants partout (les trois
   pollers, la carte « guard » d Asset Guard, Client Deploy). Le protocole
   (docs/WORK_SPLIT.md) est explicite : un symbole utilise ailleurs ne part
   pas, il devient une dependance de l hote.

   ⛔ AUCUN GLOBAL LU D INDEX.HTML : pkgSetProg() arrive par `host`, et en
   FONCTION (jamais en valeur). initPackaging() est appele plus haut dans le
   bloc module que la section Packaging n est evaluee — passer la valeur
   directement partirait en TDZ.

   host = { pkgSetProg(key, pct, label) }

   Exports :
     initPackaging(host)   pose le host + le bouton de fermeture
     openPackaging()       point d entree, appele par #btn-pack, #native-unpack
                           et #native-repack, tous restes dans index.html
   ============================================================================ */

import { $, esc } from '../core/dom.js';
import { kidsOnOpen } from './packaging_kids.js';

let H = null;

export function initPackaging(host){
  H = host;
  $('#pkg-close').onclick=()=>$('#pkgmodal').classList.remove('open');
}

/* Three actions (Depack / Repack / Pack) each backed by a background task + /status
   poller that drives a live progress bar. Every action goes through require_permission
   server-side (P3-ready). */
export function openPackaging(){
  $('#pkgmodal').classList.add('open');
  // reset cards
  ['depack','repack','pack','diff','verify'].forEach(k=>{H.pkgSetProg(k,null);const r=$('#pkg-'+k+'-res');if(r)r.innerHTML='';});
  $('#pkg-repack-btn').disabled=true;
  $('#pkg-vault-save-btn').disabled=true;
  /* Le selecteur d'archives est peuple a CHAQUE ouverture, pas une fois au demarrage :
     changer d'environnement change le client configure, et un dossier utilise entre-temps
     doit apparaitre dans les recents. Une liste figee proposerait des chemins perimes. */
  try{ if(H.pkgLoadSources) H.pkgLoadSources(); }catch(e){ /* la carte reste sur ses defauts */ }
  kidsOnOpen().catch(()=>{});
  $('#pkg-info').textContent='Reading archive…';
  fetch('/api/pkg/info').then(r=>r.json()).then(j=>{
    if(j.detail){$('#pkg-info').innerHTML='<span style="color:var(--crimson)"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> '+esc(j.detail)+'</span> — set the Packed game dir in Settings.';return;}
    $('#pkg-info').innerHTML=`Archive: <b>${j.count.toLocaleString()}</b> files across <b>${j.pkgs}</b> pkg part(s). Unpacked client root: <code>${esc(j.out_dir||'(not set)')}</code>`;
  }).catch(()=>{$('#pkg-info').textContent='Could not read the archive (is the Packed game dir configured?).';});
}
