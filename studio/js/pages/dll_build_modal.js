/* ============================================================================
   MODALE « BUILD & DEPLOY DLL » — choisir ce que le d3d9.dll contient, le construire, le publier.

   Pourquoi elle existe : « Deploy DLL » envoyait aux joueurs un binaire DEJA construit, pris tel
   quel. Choisir son contenu voulait dire editer registry.c a la main et lancer build.bat dans un
   terminal — hors du tool, sans trace. C'est comme ca que le build « emoji seulement » (9 features
   retirees) a failli partir en production a la place du build complet : rien, a l'ecran, ne disait
   que ce n'etait pas le meme binaire.

   Trois choses a l'ecran, et elles comptent toutes les trois :
     1. CE QU'ON EMBARQUE — une case par feature, cochee = incluse. Le decompte est ecrit en clair
        avant de lancer, et les features retirees sont rappelees a la fin.
     2. OU EN EST LE BUILD — barre d'avancement, etape courante, duree. gcc compile tout en UN appel :
        il n'existe pas de progression par fichier a lire. L'estimation s'appuie sur la duree du
        dernier build reussi, et l'ecran le DIT plutot que d'inventer des etapes.
     3. POURQUOI CA A RATE — les erreurs du compilateur avec fichier et ligne, separees des
        avertissements, plus le journal complet repliable. Un build rate crache des milliers de
        lignes dont trois comptent.

   Contrat d'appel (feature_manager_actions.js) :
     openDllBuild({ $, esc, toast, fmConfirm, fmPost, errMessage })
   ============================================================================ */

let H = null;
let TIMER = null;
let OPTS = null;

const $$ = (s, r) => (r || document).querySelector(s);

function sheet() {
  let el = document.getElementById('dllbuild');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'modal';
  el.id = 'dllbuild';
  el.innerHTML = `<div class="sheet" style="width:min(720px,94vw)">
    <h2>Build &amp; deploy the client DLL</h2>
    <div class="body">
      <div class="esub" id="db-intro" style="margin-bottom:8px"></div>
      <div id="db-pick"></div>
      <details id="db-sign" style="margin-top:10px"></details>
      <details id="db-prod" style="margin-top:10px">
        <summary style="cursor:pointer;font-size:12px">Production DLL: build the promoted features and compare with the DLL players have</summary>
        <div id="db-prod-body" style="margin-top:6px"></div>
      </details>
      <div id="db-run" hidden>
        <div class="fm-rprog"><i id="db-bar" style="width:0"></i></div>
        <div class="esub" id="db-step" style="margin:0 0 6px"></div>
        <div id="db-errs"></div>
        <details id="db-logbox" style="margin-top:8px">
          <summary style="cursor:pointer;font-size:11px;opacity:.65">build log</summary>
          <pre id="db-log" style="max-height:220px;overflow:auto;font-size:10.5px;white-space:pre-wrap;margin:6px 0 0"></pre>
        </details>
      </div>
    </div>
    <div class="foot">
      <span class="esub" id="db-count" style="margin-right:auto"></span>
      <button class="sbtn ghost" id="db-close">Close</button>
      <button class="sbtn ghost" id="db-build">Build only</button>
      <button class="sbtn" id="db-buildpub">Build &amp; deploy</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  // Garde de re-entrance AVANT tout : un double-clic rapide ne doit pas partir deux fois, meme
  // pendant le court instant ou la confirmation est a l'ecran.
  $$('#db-close', el).onclick = fermer;
  $$('#db-build', el).onclick = () => { if (!ACTIF) lancer(false, '#db-build'); };
  $$('#db-buildpub', el).onclick = () => { if (!ACTIF) lancer(true, '#db-buildpub'); };
  return el;
}

function rendreSign(st) {
  const el = $$('#db-sign');
  if (!el || !st) return;
  const etat = st.configured
    ? (st.method === 'azure' ? 'Azure Trusted Signing' : (st.pfx_exists ? 'certificate set' : 'certificate file NOT FOUND'))
      + (st.signtool ? '' : ' · signtool (Windows SDK) not found')
    : 'not configured, DLLs are built unsigned';
  el.innerHTML = '<summary style="cursor:pointer;font-size:12px">DLL signing: ' + H.esc(etat) + '</summary>'
    + '<div class="lm-grid" style="margin-top:6px">'
    + '<div class="fld"><label for="db-sign-pfx">Certificate (.pfx)</label><input id="db-sign-pfx" value="' + H.esc(st.pfx || '') + '" placeholder="C:\\certs\\eden_reforged.pfx"></div>'
    + '<div class="fld"><label for="db-sign-pass">Certificate password</label><input id="db-sign-pass" type="password" autocomplete="new-password" placeholder="' + (st.password_set ? 'saved, leave empty to keep' : '') + '"></div>'
    + '<div class="fld"><label for="db-sign-ts">Timestamp server</label><input id="db-sign-ts" value="' + H.esc(st.timestamp || '') + '" placeholder="http://timestamp.digicert.com"></div>'
    + '<div class="fld"><label for="db-sign-dlib">Azure Trusted Signing dlib (optional)</label><input id="db-sign-dlib" value="' + H.esc(st.dlib || '') + '"></div>'
    + '<div class="fld"><label for="db-sign-meta">Azure metadata .json (optional)</label><input id="db-sign-meta" value="' + H.esc(st.metadata || '') + '"></div>'
    + '</div>'
    + '<div class="esub" style="margin:4px 0">When a certificate is set, every build is signed and verified; a signing failure fails the build. The password is stored encrypted on this machine.</div>'
    + '<div style="text-align:right"><button class="sbtn ghost" id="db-sign-save">Save signing settings</button></div>';
  $$('#db-sign-save').onclick = async () => {
    const body = { pfx: $$('#db-sign-pfx').value, timestamp: $$('#db-sign-ts').value,
      dlib: $$('#db-sign-dlib').value, metadata: $$('#db-sign-meta').value };
    const pw = $$('#db-sign-pass').value;
    if (pw) body.password = pw;
    try {
      const r = await fetch('/api/features/client/build/signing', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || 'save failed');
      rendreSign(j);
      $$('#db-sign').open = true;
      H.toast('Signing settings saved', 'ok');
    } catch (e) { H.toast(H.errMessage(e), 'error'); }
  };
}

let PROD_TIMER = null;
let PROD_CMP = null;

function prodRender(st) {
  const box = $$('#db-prod-body');
  if (!box) return;
  const run = st && st.running;
  const step = st && st.step ? st.step + (st.pct ? ' (' + st.pct + '%)' : '')
    : 'promoted features only, from the prod branch, built on this machine';
  let html = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
    + '<button class="sbtn" id="db-prod-build"' + (run ? ' disabled' : '') + '>Build prod DLL</button>'
    + '<span class="esub" id="db-prod-step">' + H.esc(step) + '</span></div>';
  if (st && st.ok === false) {
    html += '<div style="color:var(--crimson);font-size:12px;margin-top:6px">' + H.esc(st.error || 'failed') + '</div>';
  }
  const done = st && st.ok && st.artifact;
  if (done) {
    const a = st.artifact;
    html += '<div class="esub" style="margin-top:6px">built: DLL ' + H.esc(a.eden) + ' · '
      + (a.size / 1048576).toFixed(2) + ' MB · prod ' + H.esc(st.prod_commit || '?') + ' · ' + st.duration + 's'
      + (a.signature ? ' · ' + H.esc(a.signature) : '') + '</div>'
      + '<div id="db-prod-cmp" style="margin-top:8px"><span class="spin"></span> comparing with the installed DLL…</div>';
  }
  box.innerHTML = html;
  $$('#db-prod-build').onclick = prodBuild;
  if (done) prodCompare();
}

async function prodStatus() {
  try { return await (await fetch('/api/prod-dll/status')).json(); } catch (e) { return null; }
}

function prodFollow() {
  clearInterval(PROD_TIMER);
  PROD_TIMER = setInterval(async () => {
    const st = await prodStatus();
    if (!st) return;
    if (st.running) {
      const el = $$('#db-prod-step');
      if (el) el.textContent = st.step + (st.pct ? ' (' + st.pct + '%)' : '');
      return;
    }
    clearInterval(PROD_TIMER);
    prodRender(st);
    H.toast(st.ok ? 'prod DLL built' : 'prod DLL build failed', st.ok ? 'ok' : 'error', st.ok ? {} : { sticky: true });
  }, 1500);
}

async function prodBuild() {
  try {
    const r = await fetch('/api/prod-dll/build', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || 'build not started');
    prodRender({ running: true, step: 'starting', pct: 0 });
    prodFollow();
  } catch (e) { H.toast(H.errMessage(e), 'error'); }
}

function prodDetails(c) {
  const d = c.diff || {};
  const lines = [];
  const add = (t, arr, f) => { if (arr && arr.length) lines.push(t + ': ' + arr.map(f).join(', ')); };
  add('updated', d.updated, x => x.name + ' ' + x.from + ' -> ' + x.to);
  add('enabled', d.enabled, x => x.name + ' ' + x.to);
  add('disabled', d.disabled, x => x.name);
  add('new', d.added, x => x.name + ' ' + x.to + (x.on ? '' : ' (off)'));
  add('removed', d.removed, x => x.name);
  const ie = c.installed.eden || {}, ne = c.new.eden || {};
  return ['installed: DLL ' + (ie.version || '?') + ' (' + (ie.built || '?') + ')',
    'new: DLL ' + (ne.version || '?'),
    lines.length ? lines.join(String.fromCharCode(10)) : 'no feature change'].join(String.fromCharCode(10));
}

async function prodCompare() {
  const box = $$('#db-prod-cmp');
  let c = null, err = null;
  try {
    const r = await fetch('/api/prod-dll/compare');
    c = await r.json().catch(() => ({}));
    if (!r.ok) { err = c.detail || 'comparison failed'; c = null; }
  } catch (e) { err = H.errMessage(e); }
  PROD_CMP = c;
  let html = '';
  if (err) html += '<div style="color:#cf9b2a;font-size:12px">' + H.esc(err) + '</div>';
  if (c) {
    const d = c.diff;
    const row = (lab, arr, f, col) => arr.length
      ? '<tr><td style="padding:2px 8px 2px 0;color:' + col + ';white-space:nowrap">' + lab + '</td><td>'
        + arr.map(f).map(H.esc).join(', ') + '</td></tr>' : '';
    const body = row('updated', d.updated, x => x.name + ' ' + x.from + ' → ' + x.to, '#2f81f7')
      + row('enabled', d.enabled, x => x.name + ' ' + x.to, '#2ea043')
      + row('disabled', d.disabled, x => x.name, 'var(--crimson)')
      + row('new', d.added, x => x.name + ' ' + x.to + (x.on ? '' : ' (off)'), '#2ea043')
      + row('removed', d.removed, x => x.name, 'var(--crimson)');
    const ie = c.installed.eden || {}, ne = c.new.eden || {};
    html += '<div class="esub">installed: DLL ' + H.esc(ie.version || '?') + ' · ' + H.esc(ie.built || '')
      + ' → new: DLL ' + H.esc(ne.version || '?') + (c.identical ? ' · <b>identical file</b>' : '') + '</div>'
      + (body ? '<table style="font-size:12px;margin:6px 0">' + body + '</table>'
        : '<div class="esub" style="margin:6px 0">no feature change (' + d.unchanged_on + ' features on, same versions)</div>');
  }
  html += '<div class="fld" style="margin-top:6px"><label for="db-prod-sum">Release summary</label>'
    + '<textarea id="db-prod-sum" rows="2" style="width:100%">' + H.esc(c ? c.summary : '') + '</textarea></div>'
    + '<div style="text-align:right;margin-top:6px"><button class="sbtn" id="db-prod-export">Export to Downloads / dll</button></div>';
  box.innerHTML = html;
  $$('#db-prod-export').onclick = prodExport;
}

async function prodExport() {
  const body = { summary: $$('#db-prod-sum').value, details: PROD_CMP ? prodDetails(PROD_CMP) : '' };
  try {
    const r = await fetch('/api/prod-dll/export', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || 'export failed');
    H.toast('prod DLL exported to ' + j.dir + ' (version.dll + RELEASE.txt)', 'ok', { duration: 8000 });
  } catch (e) { H.toast(H.errMessage(e), 'error'); }
}

function fermer() {
  if (TIMER) { clearInterval(TIMER); TIMER = null; }
  const el = document.getElementById('dllbuild');
  if (el) el.classList.remove('open');
}

/** Les cases : cochee = la feature reste dans le build. On affiche l'etat COMPILE de chaque
    feature (defaut ON/OFF, configurable ou non) — sans ca, decocher revient a jouer aux devinettes. */
function rendrePick() {
  const fs = (OPTS.features || []).filter(f => f.in_build);
  const horsBuild = (OPTS.features || []).length - fs.length;
  const cur = OPTS.current;
  // La DESTINATION en premier : c'est ce qui change tout entre un essai et une livraison joueurs.
  const cible = OPTS.can_publish
    ? '<b style="color:var(--crimson)">' + H.esc(OPTS.env) + '</b> → the build is published to the '
      + '<b>CDN</b>, players get it on their next launch'
    : '<b>' + H.esc(OPTS.env) + '</b> → the build goes to <b>your local client only</b>. '
      + 'The CDN is reachable from prod exclusively.';
  $$('#db-intro').innerHTML = 'Target: ' + cible
    + '<br>Unchecked features are removed <b>at compile time</b>. '
    + 'The lock is applied after <code>eden_patch.ini</code>, so no player config can turn them back on.'
    + (cur ? '<br>Current binary: ' + Math.round(cur.size / 1048576) + ' MB · ' + H.esc(cur.mtime) : '')
    + (horsBuild ? '<br>' + horsBuild + ' feature(s) are commented out of the registry and cannot be built.' : '')
    // Le compilateur peut manquer SANS empecher de construire : le tool le telecharge. On le dit
    // AVANT, sinon le premier build parait anormalement long sans qu'on sache pourquoi.
    + (OPTS.sources_note ? '<br><span style="color:#cf9b2a">' + H.esc(OPTS.sources_note) + '</span>' : '');
  const bp = $$('#db-buildpub');
  if (bp) bp.textContent = OPTS.can_publish ? 'Build & publish to CDN' : 'Build & deploy to my client';
  $$('#db-pick').innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:2px 10px;max-height:44vh;overflow:auto">'
    + fs.map(f => `<label style="display:flex;gap:7px;align-items:center;padding:2px 0;cursor:pointer;font-size:12px">
        <input type="checkbox" class="db-f" data-f="${H.esc(f.name)}" checked style="flex:none">
        <span style="word-break:break-all">${H.esc(f.name)}</span>
        <span class="esub" style="margin:0;font-size:10px;opacity:.6">${f.default_enabled ? 'on' : 'off'}${f.configurable ? '' : ' · fixed'}</span>
      </label>`).join('') + '</div>';
  $$('#db-pick').querySelectorAll('.db-f').forEach(c => { c.onchange = majCompte; });
  majCompte();
}

function retirees() {
  return [...document.querySelectorAll('#db-pick .db-f')].filter(c => !c.checked)
    .map(c => c.dataset.f);
}

function majCompte() {
  const tot = document.querySelectorAll('#db-pick .db-f').length;
  const off = retirees().length;
  const el = $$('#db-count');
  if (el) el.textContent = off ? (tot - off) + ' / ' + tot + ' features · ' + off + ' removed'
    : 'all ' + tot + ' features included';
}

/* ── Etat OCCUPE des boutons ──────────────────────────────────────────────────────────────────
   `wireBusy` (index.html) n'enveloppe que les boutons presents au DEMARRAGE ; ceux d'une modale,
   crees a l'ouverture, n'en beneficient pas — c'est ecrit noir sur blanc dans son commentaire. Un
   build dure ~45 s : sans retour visuel, on reclique, et le deuxieme clic tombait sur « a build is
   already running ». On pose donc ici le MEME visuel (spinner .fmspin + disabled), et le bouton
   actif porte le POURCENTAGE : ca ne dit pas seulement « occupe », ca dit « vivant ». */
let ACTIF = null;                 // selecteur du bouton qui porte l'action en cours

function occupe(sel, on, texte) {
  const b = $$(sel);
  if (!b) return;
  if (on) {
    if (b._html == null) b._html = b.innerHTML;
    b.disabled = true;
    b.innerHTML = '<span class="fmspin"></span> ' + (texte || (b.textContent || '').trim());
  } else {
    b.disabled = false;
    if (b._html != null) { b.innerHTML = b._html; b._html = null; }
  }
}

function boutons(actif) {
  ['#db-build', '#db-buildpub'].forEach(s => {
    const b = $$(s);
    if (!b) return;
    if (actif) occupe(s, false); else b.disabled = true;
  });
  if (actif) ACTIF = null;
}

async function lancer(deployer, sel) {
  const off = retirees();
  const prod = !!(OPTS && OPTS.can_publish);
  ACTIF = sel || '#db-build';                    // verrouille des le clic, avant la confirmation
  const quoi = off.length
    ? 'This build will <b>remove ' + off.length + ' feature(s)</b>:<br><code>' + H.esc(off.join(', ')) + '</code>'
    : 'This build includes <b>every</b> feature.';
  // La destination depend de l'ENVIRONNEMENT, et on l'ecrit noir sur blanc dans la confirmation :
  // c'est le seul moment ou l'on peut encore se rendre compte qu'on est sur le mauvais env.
  const ou = !deployer ? '<br><br>It will only be built, and left in the build folder.'
    : prod ? '<br><br>It will then be <b>published to the production CDN</b> — players get it on their next launch.'
      : '<br><br>It will then be copied into <b>your local game client</b> (' + H.esc(OPTS.env) + '). '
        + 'The CDN is never touched outside prod.';
  if (!await H.fmConfirm(deployer ? (prod ? 'Build & publish to players' : 'Build & deploy locally')
                                  : 'Build the DLL', quoi + ou,
                         deployer ? (prod ? 'Build & publish' : 'Build & deploy') : 'Build')) {
    ACTIF = null;                                // annule : on rend la main
    return;
  }
  boutons(false);
  occupe(ACTIF, true, 'Building…');
  $$('#db-run').hidden = false;
  $$('#db-errs').innerHTML = '';
  $$('#db-step').textContent = 'starting…';
  try {
    await H.fmPost('/api/features/client/build', { disabled: off, deploy: false });
  } catch (e) {
    // ⛔ NE PAS FINIR EN IMPASSE. Un build peut tourner alors que la requete a echoue : c'est ce qui
    // s'est passe le 11 aout — le build partait, la reponse tombait en erreur, et le clic suivant
    // repondait « a build is already running » sans aucun moyen de le suivre. On se raccroche donc
    // au build en cours au lieu d'afficher un mur.
    const s = await statut();
    if (s && s.running) {
      $$('#db-step').textContent = 'a build was already running — following it…';
      suivre(deployer);
      return;
    }
    boutons(true);
    $$('#db-step').innerHTML = '<span style="color:var(--crimson)">' + H.esc(H.errMessage(e)) + '</span>';
    return;
  }
  suivre(deployer);
}

async function statut() {
  try { return await (await fetch('/api/features/client/build/status')).json(); } catch (e) { return null; }
}

function suivre(deployer) {
  if (TIMER) clearInterval(TIMER);
  $$('#db-run').hidden = false;
  boutons(false);
  if (!ACTIF) ACTIF = '#db-build';               // build repris (autre onglet) : un bouton porte l'etat
  occupe(ACTIF, true, 'Building…');
  TIMER = setInterval(async () => {
    const s = await statut();
    if (!s) return;
    // le pourcentage DANS le bouton : « occupe » ne suffit pas, il faut voir que ca avance
    if (s.running) occupe(ACTIF, true, 'Building ' + (s.pct || 0) + '%');
    const bar = $$('#db-bar'); if (bar) bar.style.width = (s.pct || 0) + '%';
    // On n'affiche que ce qui APPREND quelque chose : une duree attendue quand on en connait une.
    // Le « first build, duration unknown » d'avant ne servait a rien — les secondes ecoulees, juste
    // a cote, disaient deja que ca avance ; le reste n'etait qu'une excuse pour l'absence d'estimation.
    const ref = s.reference ? ' · ~' + Math.round(s.reference) + 's expected' : '';
    $$('#db-step').textContent = (s.step || '') + (s.duration ? ' · ' + s.duration + 's' : '') + ref;
    const log = $$('#db-log');
    if (log && s.log) { log.textContent = s.log.join('\n'); log.scrollTop = log.scrollHeight; }
    if (s.running) return;
    clearInterval(TIMER); TIMER = null;
    // ⛔ On ne rend PAS la main avant la fin du deploiement : la copie ou la publication qui suit
    // dure encore, et un bouton redevenu cliquable pendant ce temps relancerait un build par-dessus.
    occupe(ACTIF, true, s.ok && deployer ? 'Deploying…' : 'Finishing…');
    fini(s, deployer).finally(() => boutons(true));
  }, 900);
}

/** Le verdict. En cas d'echec on montre la CAUSE en premier, les erreurs avec fichier:ligne
    ensuite : c'est ce qui permet de corriger sans rouvrir un terminal. */
async function fini(s, deployer) {
  if (s.ok) {
    const mo = s.artifact ? (s.artifact.size / 1048576).toFixed(2) + ' MB' : '';
    const off = (s.disabled || []).length;
    $$('#db-step').innerHTML = '<span style="color:#2ea043">✔ built — ' + H.esc(mo) + ' in '
      + s.duration + 's</span>' + (off ? ' · ' + off + ' feature(s) removed: <code>'
      + H.esc((s.disabled || []).join(', ')) + '</code>' : ' · all features included')
      + (s.warnings ? ' · ' + s.warnings + ' compiler warning(s)' : '')
      + (s.signature ? ' · ' + H.esc(s.signature) : '');
    H.toast('DLL built — ' + mo + (off ? ' (' + off + ' feature(s) removed)' : ''), 'ok');
    if (deployer) await (OPTS && OPTS.can_publish ? publier_cdn : copier_client)(s);
    return;
  }
  $$('#db-step').innerHTML = '<span style="color:var(--crimson)">✖ build failed</span>';
  const errs = s.errors || [];
  $$('#db-errs').innerHTML =
    '<div style="color:var(--crimson);font-size:12px;margin:6px 0">' + H.esc(s.error || 'build failed') + '</div>'
    + (errs.length ? '<div style="max-height:180px;overflow:auto;border:1px solid var(--line,#ddd);border-radius:6px;padding:5px 7px">'
      + errs.map(e => '<div style="font-size:11.5px;padding:1px 0">'
        + (e.file ? '<b>' + H.esc(e.file) + ':' + e.line + '</b> — ' : '') + H.esc(e.message) + '</div>').join('')
      + '</div>' : '');
  const box = $$('#db-logbox'); if (box) box.open = true;
  H.toast('DLL build failed — see the modal for the cause', 'error', { sticky: true });
}

/** Hors prod : le binaire va dans le client LOCAL, pas chez les joueurs. Meme geste que « Copy DLL »,
    avec la selection de features qu'on vient de compiler. Si le jeu tourne, le serveur applique son
    tour de passe-passe habituel sur le fichier verrouille et le dit. */
async function copier_client(s) {
  $$('#db-step').innerHTML += ' · copying into the local client…';
  try {
    const r = await H.fmPost('/api/features/client/deploy-dll', { close: false });
    if (r && r.needs_confirm) {
      $$('#db-step').innerHTML += ' <span style="color:#cf9b2a">⚠ your client has a newer DLL — not replaced;'
        + ' use « Copy DLL » to downgrade on purpose</span>';
      H.toast('built, but your client already runs a newer DLL: nothing copied', 'warn', { sticky: true });
      return;
    }
    if (r && r.needs_close) {
      $$('#db-step').innerHTML += ' <span style="color:#cf9b2a">⚠ the game is running — close it and'
        + ' use « Copy DLL »</span>';
      H.toast('built, but the client is running: close the game then click Copy DLL', 'warn',
              { sticky: true });
      return;
    }
    $$('#db-step').innerHTML += ' <span style="color:#2ea043">✔ deployed to your client ('
      + H.esc((r && r.how) || 'copied') + ')</span>';
    H.toast('DLL deployed to your local client — relaunch the game to load it', 'ok');
  } catch (e) {
    $$('#db-step').innerHTML += ' <span style="color:var(--crimson)">✖ copy failed</span>';
    H.toast('the DLL was built but NOT deployed: ' + H.errMessage(e), 'error', { sticky: true });
  }
}

async function publier_cdn(s) {
  $$('#db-step').innerHTML += ' · publishing…';
  try {
    const r = await H.fmPost('/api/features/client/publish-dll');
    $$('#db-step').innerHTML += ' <span style="color:#2ea043">✔ published to ' + H.esc(r.env)
      + ' (' + Math.round(r.size / 1048576) + ' MB)</span>';
    H.toast('published to ' + r.env + ' · ' + r.key, 'ok', { duration: 8000 });
  } catch (e) {
    $$('#db-step').innerHTML += ' <span style="color:var(--crimson)">✖ publish failed</span>';
    H.toast('the DLL was built but NOT published: ' + H.errMessage(e), 'error', { sticky: true });
  }
}

export async function openDllBuild(host) {
  H = host;
  const el = sheet();
  el.classList.add('open');
  $$('#db-run').hidden = true;
  $$('#db-pick').innerHTML = '<div class="esub"><span class="spin"></span> reading the feature registry…</div>';
  boutons(false);
  try {
    OPTS = await (await fetch('/api/features/client/build/options')).json();
    if (OPTS.detail) throw new Error(OPTS.detail);
  } catch (e) {
    $$('#db-pick').innerHTML = '<div style="color:var(--crimson)">' + H.esc(H.errMessage(e)) + '</div>';
    return;
  }
  // Sans les sources (dev qui n'a que l'exe), on ne peut RIEN construire : on dit quoi faire, et on
  // n'offre pas des boutons qui echoueront. C'est ce que l'ancienne version faisait — une erreur
  // systeme brute et deux boutons actifs.
  if (!OPTS.sources_ok) {
    $$('#db-intro').innerHTML = 'Environment <b>' + H.esc(OPTS.env || '?') + '</b>';
    $$('#db-pick').innerHTML = '<div style="color:#cf9b2a;font-size:12.5px;line-height:1.5">'
      + H.esc(OPTS.sources_note || 'the DLL sources are not available on this machine') + '</div>';
    $$('#db-count').textContent = 'building is unavailable here';
    boutons(false);
    return;
  }
  rendrePick();
  rendreSign(OPTS.signing);
  const ps = await prodStatus();
  prodRender(ps);
  if (ps && ps.running) prodFollow();
  boutons(true);
  // Un build lance depuis un autre onglet — ou reste d'une requete qui a echoue apres avoir
  // demarre — doit se VOIR en ouvrant le panneau, pas se manifester par un refus au clic suivant.
  const s = await statut();
  if (s && s.running) {
    $$('#db-step').textContent = 'a build is already running — following it…';
    suivre(false);
  }
}
