/* ============================================================================
   ABOUT + AUTO-UPDATE — modale « ℹ » (versions / environnement) et toute la
   chaine de mise a jour depuis le manifeste Cloudflare.

   Extrait de index.html (lot « snapshots-about »). Code COPIE tel quel : aucun
   changement de comportement, seuls les acces aux globaux passent par l'hote
   (protocole docs/WORK_SPLIT.md — jamais un global lu depuis le module).

   Les deux sujets tiennent dans UN module parce qu'ils partagent l'etat
   ABOUT_UPDATE / UPDATE_LATEST : la modale About affiche l'etat d'update calcule
   par checkForUpdates, et son bouton « Update now » declenche la meme apply-all
   que la banniere. Les separer imposerait un troisieme module d'etat partage.

   PIEGES QUE CE FICHIER ENCODE (ne pas « simplifier ») :
   • Un manifeste INJOIGNABLE n'est pas « up to date » : on n'affiche jamais un
     etat qu'on n'a pas pu verifier (d'ou le triple cas latest / upToDate /
     inconnu).
   • Le MOTEUR ne se recharge plus a chaud dans l'exe (depuis 2.35.27 : cela
     ramenait le code du bundle et faisait REGRESSER la version). Une update
     moteur EXIGE donc un redemarrage — jamais promettre « no restart ».
   • Le back peut etre mis a jour a chaud pendant que CETTE page reste l'ancienne.
     La boucle de re-verification (15 min + retour de focus) compare la version
     du back au boot avec la version courante et recharge la page. Elle ne
     recharge JAMAIS pendant une saisie ou une modale ouverte (`busy()`), sinon
     on jette le travail en cours.
   • Aucun repli en dur vers un hote de studio pour le lien de telechargement :
     le manifeste du tenant fait foi (sinon un build Dawnbreak pointait encore
     sur l'ancien CDN Reforged).

   Contrat d'appel (index.html) :
     initAbout({ $, esc, toast, activeEnv, getPendingReload, setPendingReload })
       $                 selecteur DOM
       esc               echappement HTML
       toast             notifications (signature toast(msg, kind, opts|ms))
       activeEnv         () => env actif. index.html passe `()=>window.ACTIVE_ENV`
                         pour rester FIDELE a l'original. ⚠ ACTIVE_ENV est une
                         locale de module dans index.html, donc window.ACTIVE_ENV
                         vaut undefined et le repli `srv.env` s'applique toujours.
                         Passer le vrai ACTIVE_ENV changerait l'affichage (ce
                         serait une correction, pas une extraction).
       getPendingReload  () => PENDING_RELOAD (etat partage avec index.html)
       setPendingReload  (v) => PENDING_RELOAD = v
   ============================================================================ */

import { initUpdateWindow, runToolUpdate, mountSpeedTest } from './update_window.js';

let H = null;

// Derniere version proposee par le manifeste (lue par runWebUpdate pour le libelle)
// et dernier resultat de /api/update/check (reutilise par la modale About pour ne
// pas re-interroger le CDN a chaque ouverture).
let UPDATE_LATEST = null, ABOUT_UPDATE = null;

export function initAbout(host) {
  H = host;
  initUpdateWindow(host);
  const $ = H.$;
  // ⚠ Ces cablages vivaient a DEUX endroits eloignes d'index.html : #about-link /
  // #about-close etaient poses ~5600 lignes avant le reste. Ils visent des noeuds
  // statiques et distincts : les regrouper ici ne change aucun ordre observable.
  const link = $('#about-link'); if (link) link.onclick = () => openAbout();
  const close = $('#about-close'); if (close) close.onclick = () => $('#aboutModal').classList.remove('open');
  const dismiss = $('#update-dismiss'); if (dismiss) dismiss.onclick = () => { $('#update-bar').style.display = 'none'; };
  const btn = $('#btn-update');
  if (btn) btn.onclick = () => {
    document.querySelectorAll('.hdrop.open').forEach(d => d.classList.remove('open'));
    checkForUpdates({ notify: true });
  };
  const apply = $('#update-apply-btn'); if (apply) apply.onclick = () => runWebUpdate();
  startUpdateWatcher();
}

// ── Modal ABOUT : détails du tool (versions, update, back/front, environnement, conception) ──
export async function openAbout() {
  const { $, esc } = H;
  const modal = $('#aboutModal'), body = $('#about-body'); if (!modal || !body) return;
  modal.classList.add('open');
  body.innerHTML = '<div class="esub">loading…</div>';
  // collecte parallèle : version, statut, état d'update
  const [ver, st, upd] = await Promise.all([
    fetch('/api/version').then(r => r.json()).catch(() => ({})),
    fetch('/api/status').then(r => r.json()).catch(() => ({})),
    (ABOUT_UPDATE ? Promise.resolve(ABOUT_UPDATE) : fetch('/api/update/check').then(r => r.json()).catch(() => ({}))),
  ]);
  const cur = ver.version || upd.current || '?';
  // front (pages) et back (moteur) peuvent DIVERGER : c'est precisement ce que la
  // modale doit montrer, sinon un « v2.x » unique masque la moitie de la verite.
  const feVer = upd.local_web_version || cur, beVer = upd.local_code_version || cur;
  const latest = upd.any_update ? (upd.web_version || upd.code_version || upd.latest) : null;
  const upToDate = upd.ok && !upd.any_update;
  // lien de TÉLÉCHARGEMENT direct de la dernière version (installeur .exe complet, nom fixe)
  const man = upd.manifest || {};
  // ⛔ PAS de repli code en dur vers un hote de studio (cf. en-tete).
  const DL_URL = man.bundle_url || '';
  const dlVer = man.version || latest || cur;
  const srv = st.servers || {}, db = st.database || {};
  const env = (H.activeEnv() || srv.env || 'dev');
  const row = (k, v) => `<div class="abrow"><span class="abk">${esc(k)}</span><span class="abv">${v}</span></div>`;
  const verPill = (v, ok) => `<span class="abpill${ok ? ' ok' : ''}">v${esc(v)}</span>`;
  let updHtml;
  if (latest) updHtml = `<span class="abpill upd">v${esc(latest)} available</span> <button class="mini gold" id="about-update"><img src="/studio/icons/icons/24/export.png" srcset="/studio/icons/icons/24/export.png 1x, /icons/icons/64/export.png 2x" class="ui-icon" width="24" height="24" alt=""> Update now (live)</button>`;
  else if (upToDate) updHtml = '<span class="abpill ok">up to date ✓</span>';
  else updHtml = '<span class="esub">update state unknown (manifest unreachable)</span>';
  body.innerHTML = `
    <div class="abhead">
      <img src="/studio/logo.png" alt="Eden" class="abhero">
      <div><div class="abtitle">Eden Ultimate Tool</div>
        <div class="esub">Reforged Studio — game back-office (client data + server patches)</div></div>
    </div>
    <div class="absec">Versions</div>
    ${row('Current', verPill(cur, true))}
    ${row('Front-end (pages)', verPill(feVer))}
    ${row('Back-end (engine)', verPill(beVer))}
    ${row('Update', updHtml)}
    ${row('Download', DL_URL
      ? `<a class="ab-dl" href="${esc(DL_URL)}" download title="Download the latest full installer (.exe)"><img src="/studio/icons/icons/24/get_latest_client.png" srcset="/studio/icons/icons/24/get_latest_client.png 1x, /icons/icons/48/get_latest_client.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> latest ${esc(dlVer || cur)}</a> <button class="mini" id="about-copydl" title="Copy the download link">⧉ copy link</button>`
      : `<span class="esub">— (no download link published for this studio yet)</span>`)}
    ${row('Download speed', '<div id="about-speed" class="ab-speed"></div>')}
    <div class="absec">Environment</div>
    ${row('Active env', `<span class="abpill">${esc(String(env).toUpperCase())}</span>`)}
    ${srv.host ? row('Game server', esc(srv.host) + (srv.ssh_ok ? ' <span class="abpill ok">SSH ✓ ' + esc(srv.ssh_latency_ms || '') + 'ms</span>' : ' <span class="esub">SSH down</span>')) : ''}
    ${db.host ? row('Database', esc(db.host) + ':' + esc(db.port || '') + (db.ok ? ' <span class="abpill ok">online ' + esc(db.latency_ms || '') + 'ms</span>' : ' <span class="esub">offline</span>')) : ''}
    <div class="absec">About</div>
    <div class="esub" style="line-height:1.55">A single desktop console to browse and edit the game's
      content (creatures, items, spells, classes, crafting, enchants, archive…) with byte-exact writes to
      both the CLIENT (c_/T_ files) and the SERVER (S_ files over SSH), plus a Feature Manager to install
      and deploy client/server patches. Every change is journaled per-environment and rollback-able. Runs
      in a chromeless window; hot-updates its own code live, no reinstall.</div>
    <div class="esub" style="margin-top:10px;opacity:.7">© Reforged Studio${ver.build ? ' · built ' + esc(ver.build) : ''}</div>`;
  // boutons RE-CREES a chaque ouverture (innerHTML) -> recabler ici, pas dans init.
  // « Update now » delegue au bouton de la banniere : UN seul chemin d'application.
  const ub = $('#about-update'); if (ub) ub.onclick = () => { modal.classList.remove('open'); const ap = $('#update-apply-btn'); if (ap) ap.click(); else checkForUpdates({ notify: true }); };
  mountSpeedTest($('#about-speed'), false);
  const cp = $('#about-copydl'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(DL_URL); H.toast('link copied', 'ok', 2500); } catch (_) { H.toast(DL_URL, 'info', 6000); } };
}

export async function checkForUpdates(opts) {
  const { $, esc } = H;
  opts = opts || {}; const bar = $('#update-bar'); if (!bar) return;
  let j; try { j = await (await fetch('/api/update/check')).json(); } catch (e) { if (opts.notify) H.toast('update check failed: ' + esc(String(e)), 'info', 5000); return; }
  // manifest UNREACHABLE (or any check error) is NOT 'up to date' — don't claim a state we couldn't verify.
  ABOUT_UPDATE = j;   // mémorise l'état d'update pour la modal About (badge remplacé par le lien ℹ About)
  if (!j.ok) { bar.style.display = 'none'; if (opts.notify) H.toast('couldn’t check for updates — manifest unreachable' + (j.error ? ' (' + esc(String(j.error).slice(0, 80)) + ')' : ''), 'info', 6000); return; }
  // LIVE update — front-end (pages) and/or back-end (Python), both installed in place, no restart.
  if (j.any_update) {
    const nv = j.web_version || j.code_version; UPDATE_LATEST = nv; bar.style.display = 'flex';
    /* ⛔ NE PLUS PROMETTRE « no restart ». Ce message s'affiche AVANT d'appliquer, et il
       annonçait un comportement que le systeme ne tient pas : depuis 2.35.27 le rechargement
       a chaud du MOTEUR est interdit dans l'exe (il ramenait le code du bundle et faisait
       REGRESSER la version), donc une mise a jour du moteur exige un redemarrage — c'est
       exactement ce que dit le toast « restart to activate it » quelques instants plus tard.
       Les deux textes se contredisaient : l'un promettait, l'autre corrigeait.
       Le systeme SAIT distinguer (`j.code_restart_required` a l'application) ; l'annonce, elle,
       ne le sait pas encore. On enonce donc la regle, sans promettre le cas favorable. */
    $('#update-msg').innerHTML = 'Version <b>' + esc(nv) + '</b> is available' + (j.changelog ? ' — ' + esc(String(j.changelog).slice(0, 150)) : '')
      + '. Pages apply immediately; an engine update needs a restart (offered in one click).';
    $('#update-apply-btn').style.display = ''; $('#update-apply-btn').textContent = 'Update now';
  }
  else {
    bar.style.display = 'none';
    // Le serveur est a jour, mais CETTE page peut encore executer l'ancienne : le dire « up to date »
    // pendant que la barre affiche l'ancien numero, c'est la dissonance signalee le 2026-08-02.
    if (opts.notify) {
      if (H.getPendingReload())
        H.toast('⟳ v' + esc(H.getPendingReload()) + ' is installed — this page still runs the previous one, reloading…', 'warn', 4000);
      else H.toast('up to date (v' + esc(j.local_web_version || j.current) + ')', 'info', 4000);
    }
  }
}

// ⭐ La vérification n'avait lieu QU'UNE FOIS, au lancement (`window.__upchecked`). Une fenêtre
// laissée ouverte plusieurs jours ne revoyait donc JAMAIS le manifeste : elle restait sur la version
// du jour de son ouverture, sans le moindre signe. Vécu 2026-08-01 — tool ouvert depuis 2 jours,
// back-end en 2.30.98 alors que 2.31.0 était publié : l'utilisateur lisait des diagnostics calculés
// par du vieux code et croyait que les correctifs ne marchaient pas. Le pire silence est celui qui
// ressemble à un fonctionnement normal.
// On re-vérifie donc toutes les 15 min, ET au retour du focus (le moment où l'on revient au tool
// après avoir travaillé ailleurs), avec un garde-fou de 5 min pour ne pas marteler le CDN.
function startUpdateWatcher() {
  const { esc } = H;
  let last = Date.now(), bootVer = null, warned = false;
  // Version du back au moment où CETTE page a été chargée. Le back peut être mis à jour À CHAUD
  // (apply-all recharge les modules Python sans redémarrer) pendant que la page, elle, reste
  // l'ancienne : on lit alors une interface d'une version et des résultats d'une autre. C'est
  // précisément ce qui fait croire qu'un correctif ne marche pas alors qu'il est bien là.
  const readVer = async () => {
    try { const v = await (await fetch('/api/version')).json(); return v.code_ram || v.version; } catch (_) { return null; }
  };
  readVer().then(v => { bootVer = v; });
  // ⭐ Le back se met a jour A CHAUD pendant que la page, elle, reste l'ancienne. On affichait
  // alors TROIS verites contradictoires : le badge de la barre gardait la version du chargement,
  // « check for update » interrogeait le SERVEUR et repondait « up to date (nouvelle version) », et
  // un troisieme message reclamait un F5. Trois messages, trois versions, aucune action faite.
  // Demander un F5 n'a aucun sens quand on peut simplement le faire.
  const editing = () => {
    const a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.readOnly && !a.disabled);
  };
  const busy = () => {
    try {
      if (document.querySelector('.modal.open,#confirmModal.open,#overlay.open')) return true;
      const o = document.getElementById('aw-ovl'); if (o && o.style.display && o.style.display !== 'none') return true;
      return editing();
    } catch (_) { return true; }
  };                       // en cas de doute : ne PAS recharger
  const bump = (cur) => {
    const el = document.getElementById('appver');
    if (el) el.textContent = 'v' + cur;
  };                   // le badge cesse de mentir immediatement
  let reloading = false;
  const reloadNow = () => { if (reloading) return; reloading = true; location.reload(); };
  const tryReload = (cur) => {
    bump(cur);
    if (busy()) {                                        // travail en cours : on propose, on n'impose pas
      if (!warned) {
        warned = true;
        H.toast('⟳ Updated to v' + esc(cur) + ' — reload to use it', 'warn',
          { sticky: true, action: { label: 'Reload', fn: reloadNow } });
      }
      return;
    }
    H.toast('⟳ Updated to v' + esc(cur) + ' — reloading…', 'info', { duration: 2500 });
    setTimeout(() => { if (!busy()) reloadNow(); }, 1200);
  };
  const recheck = async (minGapMs) => {
    if (Date.now() - last < minGapMs) return; last = Date.now();
    try { checkForUpdates(); } catch (_) { }
    const cur = await readVer();
    if (cur && bootVer && cur !== bootVer) { H.setPendingReload(cur); tryReload(cur); }
  };
  setInterval(() => recheck(0), 15 * 60 * 1000);
  window.addEventListener('focus', () => recheck(5 * 60 * 1000));
}

// Live update — front-end AND back-end, with real byte progress (update_window.js).
export async function runWebUpdate(opts) {
  opts = opts || {};
  return runToolUpdate({
    version: UPDATE_LATEST || '',
    onRestart: opts.onRestart || restartToast,
    onDone: opts.onDone || (() => location.replace('/?_u=' + Date.now())),
  });
}

function restartToast(res, tgt) {
  const { esc } = H;
  // ⛔ Depuis 2.35.27, le rechargement a chaud est INTERDIT dans l'exe (il ramenait le code du
  // bundle et faisait REGRESSER la version) : le moteur neuf est sur le disque mais pas ACTIF.
  // « engine », pas « v… » tout court : c'est le MOTEUR qui attend un redemarrage.
  const rb = document.getElementById('btn-restart');
  if (!rb || rb.style.display === 'none') {
    H.toast('engine v' + esc(tgt) + ' installed — close and reopen the tool to activate it', 'warn', { sticky: true });
    return;
  }
  H.toast('engine v' + esc(tgt) + ' installed — restart to activate it', 'warn',
    {
      sticky: true, action: {
        label: 'Restart now', fn: async () => {
          try {
            await fetch('/api/app/restart', { method: 'POST' });
            H.toast('restarting… the window reconnects on its own', 'info', { duration: 4000 });
            setTimeout(() => location.replace('/?_u=' + Date.now()), 9000);
          } catch (e) { H.toast('restart failed — close and reopen the tool', 'error', { sticky: true }); }
        }
      }
    });
}
