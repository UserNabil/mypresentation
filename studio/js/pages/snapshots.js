/* ============================================================================
   SNAPSHOTS — capture / restauration de l'etat Data+db du SERVEUR, et boot-test.

   Extrait de index.html (lot « snapshots-about »). Code COPIE tel quel : aucun
   changement de comportement, seuls les acces aux globaux passent par l'hote
   (protocole docs/WORK_SPLIT.md — jamais un global lu depuis le module).

   POURQUOI cet ecran existe : restaurer un snapshot ecrase des fichiers du
   serveur live. Deux garde-fous sont donc cables ici et ne doivent PAS sauter :
     1. « Restore » declenche cote back un boot-test AVANT d'ecrire. Si le
        candidat ne boote pas, le back repond {blocked:true} et on redemande une
        confirmation explicite (force=true). Un snapshot pris pendant que la
        data etait cassee ressusciterait sinon « Database Error!! ».
     2. Le boot-test exige un serveur DISTANT (`source==='remote'`) : il monte un
        ZoneServer jetable la-bas. En local il n'y a rien a stager, d'ou les
        boutons desactives + le libelle inline explicatif.
   Rappel affiche partout : restaurer n'applique RIEN tant que le serveur n'a pas
   ete REDEMARRE (les .ini sont lus au boot).

   Contrat d'appel (index.html) :
     initSnapshots({ $, esc, enc, toast, guard, confirm,
                     showOverlay, hideOverlay, iconMarkup, errMessage })
       $            selecteur DOM
       esc, enc     echappement HTML / encodeURIComponent
       toast        notifications
       guard        guardPage(perm, label) -> bool
       confirm      uiConfirm(msg, title, okLabel) -> Promise<bool>
       showOverlay  / hideOverlay : voile modal bloquant
       iconMarkup   iconMarkup(nom, taille) -> <img …>
       errMessage   normalisation d'une exception en message lisible
   ============================================================================ */

let H = null;

// pastille + couleur par nature de snapshot. `manual` = pris a la main, `working`
// = etat sain declare par l'admin, les deux « pre-* » sont poses AUTOMATIQUEMENT
// par le back avant un deploy / avant un rollback : c'est le filet de securite.
const SNAPKIND = {
  manual: ['<img src="/studio/icons/icons/24/snapshots.png" srcset="/studio/icons/icons/24/snapshots.png 1x, /studio/icons/icons/48/snapshots.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">', '#8a7a4a'],
  working: ['<img src="/studio/icons/icons/24/success.png" srcset="/studio/icons/icons/24/success.png 1x, /studio/icons/icons/48/success.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">', '#4a8a3a'],
  'pre-deploy': ['<img src="/studio/icons/icons/24/launch_game.png" srcset="/studio/icons/icons/24/launch_game.png 1x, /studio/icons/icons/48/launch_game.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">', '#cf9b2a'],
  'pre-rollback': ['<img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /studio/icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">', '#9a8a6a'],
};

export function initSnapshots(host) {
  H = host;
  const $ = H.$;
  // ⚠ Ces trois cablages vivaient a des lignes NON contigues d'index.html
  // (#btn-snapshots / #snap-close avant les fonctions, #snap-save|savework au
  // milieu, #snap-boottest tout a la fin). On les repose ensemble : l'ordre
  // d'enregistrement entre eux n'a aucune importance, ils visent des noeuds
  // distincts et statiques.
  const btn = $('#btn-snapshots'); if (btn) btn.onclick = () => openSnapshots();
  const close = $('#snap-close'); if (close) close.onclick = () => $('#snapmodal').classList.remove('open');
  const save = $('#snap-save'); if (save) save.onclick = () => snapSave('manual');
  const savew = $('#snap-savework'); if (savew) savew.onclick = () => snapSave('working');
  const bt = $('#snap-boottest'); if (bt) bt.onclick = () => snapBootTest(null);
}

export async function openSnapshots() {
  if (!H || !H.guard('integrity.view', 'Snapshots')) return;
  const { $ } = H;
  $('#snapmodal').classList.add('open');
  $('#snap-msg').textContent = '';
  $('#snap-name').value = '';
  await renderSnapshots();
}

async function renderSnapshots() {
  const { $, esc, iconMarkup } = H;
  const j = await (await fetch('/api/snapshots')).json();
  const sv = j.server || {};
  $('#snap-srv').innerHTML = sv.available
    ? `${iconMarkup('restart_server', 24)} Server data: <b>${esc(sv.source)}</b> <span style="color:var(--faint)">${esc(sv.path || '')}</span>`
    : `<span style="color:var(--crimson)"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> No server Data/db configured — connect a server in Settings to use snapshots.</span>`;
  $('#snap-save').disabled = $('#snap-savework').disabled = !sv.available;
  // cf. en-tete : le boot-test stage un ZoneServer jetable SUR le serveur distant.
  const remote = sv.source === 'remote';
  $('#snap-boottest').disabled = !remote;
  $('#snap-bt-inline').textContent = remote ? '' : (sv.available ? '(boot-test needs a remote server — switch to preprod env)' : '');
  const list = j.snapshots || [];
  $('#snap-list').innerHTML = list.length ? list.map(s => {
    const [ic, col] = SNAPKIND[s.kind] || ['•', '#999'];
    return `<div class="chcard" style="align-items:flex-start">
      <span class="chicon" style="color:${col}">${ic}</span>
      <div style="flex:1;min-width:0">
        <div class="chtitle"><span class="chtag" style="color:${col};border-color:${col}">${esc(s.kind)}</span>
          <b style="color:var(--ink)">${esc(s.name)}</b></div>
        <div class="chmeta">${esc(s.ts)} · ${esc(s.author || '?')} · env ${esc(s.env || '?')} · ${(s.size / 1048576).toFixed(1)} MB${s.boot_test && s.boot_test !== 'none' ? ' · boot-test ' + esc(s.boot_test) : ''}${s.note ? ' · ' + esc(s.note) : ''}</div></div>
      ${remote ? `<button class="addbtn" data-snapbt="${esc(s.id)}" title="Boot-test this snapshot in a throwaway ZoneServer"><img src="/studio/icons/icons/24/enchants.png" srcset="/studio/icons/icons/24/enchants.png 1x, /studio/icons/icons/48/enchants.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></button>` : ''}
      <button class="addbtn" data-snaprestore="${esc(s.id)}" title="Restore the server Data/db to this state (auto-backs up current first)"><img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /studio/icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Restore</button>
      <span class="chundo" data-snapdel="${esc(s.id)}" title="delete this snapshot" style="color:var(--crimson)"><img src="/studio/icons/icons/24/delete.png" srcset="/studio/icons/icons/24/delete.png 1x, /studio/icons/icons/48/delete.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>
    </div>`;
  }).join('') : '<div class="esub" style="padding:18px">No snapshot yet. Click <b>Save working state</b> once the server is in a good state.</div>';
  // recablage a CHAQUE rendu : innerHTML ci-dessus a detruit les anciens noeuds.
  $('#snap-list').querySelectorAll('[data-snapbt]').forEach(b => b.onclick = () => snapBootTest(b.dataset.snapbt));
  $('#snap-list').querySelectorAll('[data-snaprestore]').forEach(b => b.onclick = () => snapRestore(b.dataset.snaprestore));
  $('#snap-list').querySelectorAll('[data-snapdel]').forEach(b => b.onclick = async () => {
    if (!await H.confirm('Delete this snapshot? (the saved state is removed, the live server is NOT touched)', 'Delete snapshot', 'Delete')) return;
    await fetch('/api/snapshots/' + b.dataset.snapdel, { method: 'DELETE' });
    renderSnapshots();
  });
}

async function snapSave(kind) {
  const { $ } = H;
  const name = $('#snap-name').value.trim();
  $('#snap-msg').style.color = 'var(--faint)';
  $('#snap-msg').textContent = 'capturing server Data/db… (this can take a few seconds)';
  // les DEUX boutons se desarment : ils declenchent la meme capture, un double
  // clic croise creerait deux snapshots concurrents du meme instant.
  $('#snap-save').disabled = $('#snap-savework').disabled = true;
  try {
    const r = await fetch('/api/snapshots/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, kind })
    });
    const j = await r.json();
    if (r.ok) { $('#snap-msg').style.color = '#4a8a3a'; $('#snap-msg').textContent = '✔ snapshot saved (' + (j.size / 1048576).toFixed(1) + ' MB)'; $('#snap-name').value = ''; renderSnapshots(); }
    else { $('#snap-msg').style.color = 'var(--crimson)'; $('#snap-msg').textContent = '✗ ' + (j.detail || 'failed'); }
  } catch (e) { $('#snap-msg').style.color = 'var(--crimson)'; $('#snap-msg').textContent = '✗ ' + e; }
  $('#snap-save').disabled = $('#snap-savework').disabled = false;
}

async function snapRestore(sid) {
  if (!await H.confirm('Restore the server Data/db to snapshot "' + sid + '"?\n\n• The CURRENT state is auto-saved first (pre-rollback).\n• Files are overwritten on the server.\n• You must RESTART the server afterwards for the ZoneServer to reload.', 'Restore snapshot', 'Restore')) return;
  H.showOverlay('Boot-testing snapshot + restoring…');
  try {
    const r = await fetch('/api/snapshots/' + sid + '/restore', { method: 'POST' });
    const j = await r.json();
    H.hideOverlay();
    // ⛔ blocked = le back a boot-teste le candidat et il NE BOOTE PAS. On ne
    // restaure pas en douce : seconde confirmation, puis force=true.
    if (j && j.blocked) {
      const go = await H.confirm('This snapshot would CRASH the server (' + ((j.boottest || {}).result || 'FAIL') + ').\nIt was probably captured while the data was broken.\n\nForce-restore anyway?', 'Snapshot is not bootable', 'Force restore');
      if (go) {
        H.showOverlay('Force-restoring…');
        const r2 = await fetch('/api/snapshots/' + sid + '/restore?force=true', { method: 'POST' });
        const j2 = await r2.json();
        H.hideOverlay();
        if (r2.ok) H.toast('restored (forced) — RESTART to apply'); else H.toast('' + (j2.detail || 'failed'));
        renderSnapshots();
      }
      return;
    }
    if (r.ok) { H.toast('restored — RESTART the server to apply'); renderSnapshots(); }
    else H.toast('' + (j.detail || 'restore failed'));
  } catch (e) { H.hideOverlay(); H.toast(H.errMessage(e)); }
}

// Verdict du boot-test. Le texte est volontairement DIRECTIF : PASS/FAIL decide
// si l'admin a le droit de redemarrer, TIMEOUT n'est PAS un PASS.
function bootTestResultHTML(j) {
  const { esc } = H;
  const R = j.result;
  const col = R === 'PASS' ? '#4a8a3a' : (R === 'FAIL' ? 'var(--crimson)' : '#cf9b2a');
  const ic = R === 'PASS' ? '<img src="/studio/icons/icons/24/success.png" srcset="/studio/icons/icons/24/success.png 1x, /studio/icons/icons/48/success.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">' : (R === 'FAIL' ? '<img src="/studio/icons/icons/24/error.png" srcset="/studio/icons/icons/24/error.png 1x, /studio/icons/icons/48/error.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">' : '<img src="/studio/icons/icons/24/live.png" srcset="/studio/icons/icons/24/live.png 1x, /studio/icons/icons/48/live.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">');
  const head = R === 'PASS' ? 'PASS — the ZoneServer loads this data cleanly. Safe to restart/deploy.'
    : R === 'FAIL' ? 'FAIL — this data triggers "Database Error!!" → the ZoneServer would refuse to start. DO NOT restart/deploy.'
      : 'TIMEOUT — no verdict (staging ZoneServer never reached the data-load check).';
  return `<div style="border:1px solid ${col};border-radius:8px;padding:9px 11px;background:#fbf5e3">
    <div style="color:${col};font-weight:700;font-size:13px">${ic} ${esc(R)} — <span style="font-weight:400;color:var(--ink)">${esc(head)}</span></div>
    <div style="font-size:10.5px;color:var(--faint);margin-top:3px">candidate: ${esc(j.candidate || '')}</div>
    ${j.log_tail ? `<pre style="margin:6px 0 0;max-height:160px;overflow:auto;font-size:10.5px;line-height:1.45;background:#2b2418;color:#e8dcc0;padding:8px;border-radius:6px;white-space:pre-wrap">${esc(j.log_tail)}</pre>` : ''}
  </div>`;
}

// sid null => boot-test de la data LIVE ; sid renseigne => boot-test d'un snapshot.
// Les deux verdicts s'affichent dans la meme boite #snap-bt (l'original avait un
// ternaire mort `sid?$('#snap-bt'):$('#snap-bt')` — conserve tel quel, simplifie).
async function snapBootTest(sid) {
  const { $, esc, enc } = H;
  const box = $('#snap-bt');
  const inline = $('#snap-bt-inline');
  if (inline && !sid) inline.textContent = '';
  box.innerHTML = '<div class="esub" style="padding:8px"><span class="spin"></span> staging a throwaway ZoneServer and loading the data… (15–40 s, never touches the live server)</div>';
  try {
    const r = await fetch('/api/boottest' + (sid ? '?snapshot_id=' + enc(sid) : ''), { method: 'POST' });
    const j = await r.json();
    // le verdict est memorise cote back sur le snapshot -> re-rendre la liste
    if (r.ok) { box.innerHTML = bootTestResultHTML(j); if (sid) renderSnapshots(); }
    else box.innerHTML = `<div class="note" style="color:var(--crimson)">✗ ${esc(j.detail || 'boot-test failed')}</div>`;
  } catch (e) { box.innerHTML = `<div class="note" style="color:var(--crimson)">✗ ${esc('' + e)}</div>`; }
}
