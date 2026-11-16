/* ============================================================================
   LE DASHBOARD — la page d'accueil refondue.

   Elle TIENT DANS LA HAUTEUR DE L'ECRAN : deux rangees, aucune barre de defilement
   sur la page. Ce qui deborde defile DANS son bloc (activite, volumetrie), jamais la
   page entiere — sinon on perd la vue d'ensemble, qui est toute la raison d'etre de
   cet ecran.

     banniere  Hi, <perso> / Welcome Back — sa COULEUR dit l'environnement
     Overview  Server Health · Players Online · Deployment · Database
               (illustration + chiffre de tete, puis le detail dans la meme carte)
               + les pastilles de bascule d'environnement, a droite du titre
     rangee 2  Recent activity · Quick actions

   ⛔ RETIRE le 2026-08-14, apres passage a l'ecran : « Favorite tools » (redoublait
   le rail, boite aux trois quarts vide), « System information » (version du tool et
   base, deja dans l'en-tete et l'ecran A propos ; l'uptime a rejoint Server Health)
   et la rangee « Shortcut environments », devenue trois pastilles. Quatre rangees
   pour huit blocs, dont trois qu'on ne lisait jamais : une page d'accueil qui montre
   tout ne met rien en avant.

   Toutes les mesures viennent de /api/home, en UN appel. `null` du serveur =>
   « — » a l'ecran : on n'invente aucun chiffre (voir dashboard_cards.js).

   Contrat d'appel (index.html) :
     renderDashboard({ ME, can, user, roleCrest, fn })
     stopDashboard()
   ============================================================================ */

import { loadCrests, crestMarkup } from '../nav/crest.js';
import { flatNav } from '../nav/tree.js';
import { recordUse, rankedUses, usageIsThin, clearUsage } from '../nav/usage.js';
import { iconMarkup } from '../core/icons.js';
import { islandPagesAvailable, mountIslandPage } from './island_pages.js';
import { esc } from '../core/dom.js';
import {
  ago, paintHealth, paintPlayers, paintDeploy, paintData, paintEnvs,
  headHealth, headPlayers, headData, headDeploy,
} from './dashboard_cards.js';

/* ---------------------------------------------------------------- banniere --
   La banniere DIT L'ENVIRONNEMENT par sa couleur. Ce n'est pas un ornement :
   c'est le seul repere qu'on voit sans lire, et se tromper d'environnement est
   l'erreur la plus couteuse de cet outil. Le badge chiffre reste dans l'en-tete
   pour ceux qui veulent la certitude — la couleur, elle, se lit de loin.
   Zone de texte utilisable : 20 % -> 76 % de la largeur, c'est la seule bande
   vide COMMUNE aux quatre images (le decor mord les deux bords). */
const BANNERS = {
  prod:    'banner_1_parchemin.png',
  preprod: 'banner_2_vert.png',
  dev:     'banner_3_bleu.png',
};
const BANNER_FALLBACK = 'banner_4_violet.png';

const POLL_MS = 15000;
const FEED_MAX = 6;               /* comme la maquette : quelques lignes, pas une liste a derouler */
let TIMER = null;
let CTX = null;

const ROLE_NAME = { GS: 'Game Sage', CM: 'Community Manager', GM: 'Game Master', SA: 'Super Admin' };

/* Les raccourcis de DEPART — ceux qu'on propose tant qu'on ne sait rien des habitudes.
   Ils restent le socle : meme quand la liste s'est personnalisee, ce sont eux qui
   comblent les places libres. Sans ce socle, un compte neuf verrait une carte vide. */
const QUICK = [
  { k: 'qa-creature', n: 'Create Creature', d: 'Add a new creature', ic: 'creatures',      t: 'monster', perm: 'gen3d', archived: true },
  { k: 'qa-item',     n: 'Create Item',     d: 'Add a new item',     ic: 'bag',            t: 'item',    perm: 'gen3d', archived: true },
  { k: 'qa-npc',      n: 'Create NPC',      d: 'Add a new NPC',      ic: 'party',          t: 'npc',     perm: 'gen3d', archived: true },
  { k: 'qa-pack',     n: 'Package & Repack', d: 'Generate a new client package', ic: 'packaging',      btn: 'btn-pack',  perm: 'deploy' },
  { k: 'qa-restart',  n: 'Restart All Servers', d: 'Restart all game servers',  ic: 'restart_server',  nav: 'restart',   perm: 'server.restart' },
  { k: 'qa-deploy',   n: 'Deploy',          d: 'Publish to the launcher CDN',   ic: 'client_deploy',   nav: 'deploy',    perm: 'deploy', archived: true },
];

const QA_MAX = 6;                 /* la carte en tient six sans defiler */

const card = (id, ic, title, cls) =>
  `<section class="dq ${cls || ''}"><div class="dq-h">${iconMarkup(ic, 24)}<span>${esc(title)}</span></div>
   <div class="dq-b" id="${id}"><span class="dq-wait">⋯</span></div></section>`;

/* Carte de tete : une illustration, un chiffre lisible de loin, puis le DETAIL
   qui l'explique. Le chiffre ne remplace pas le detail, il le resume — c'est ce
   qui permet d'ajouter la rangee « Overview » sans retirer une seule mesure. */
const heroCard = (id, art, title, cls) =>
  `<section class="dq dqtop ${cls || ''}">
     <div class="dq-h hero-h">
       <img class="hero-art" src="/studio/img/ui/${art}" alt="" aria-hidden="true" width="52" height="52">
       <span class="hero-t"><span class="hero-k">${esc(title)}</span>
         <b class="hero-v" id="${id}-v">—</b><span class="hero-s" id="${id}-s">measuring…</span></span>
     </div>
     <div class="dq-b" id="${id}"><span class="dq-wait">⋯</span></div></section>`;

/* ---------------------------------------------------------------- rendu -- */

let SEQ = 0;

function _quickView() {
  const list = _quickList();
  const perso = usageIsThin(CTX.user);
  return { list, tag: perso ? 'defaults' : 'most used',
    title: perso ? 'Starter shortcuts — this list reorders itself as you use the tool'
      : 'Ordered by what YOU open most, recent activity weighing more. Measured on this machine only, nothing is sent anywhere.' };
}

function _resetQuick() {
  try { clearUsage(CTX.user); } catch (e) { }
}

function _runQuick(q) {
  if (q.nav) return _nav(q.nav);
  if (q.btn) { const b = document.getElementById(q.btn); if (b) b.click(); return; }
  try { recordUse(CTX.user, q.k); } catch (e) { }
  if (q.t && CTX.fn && CTX.fn.createType) CTX.fn.createType(q.t);
}

export function renderDashboard(ctx) {
  const seq = ++SEQ;
  CTX = ctx;
  if (!(ctx.ME || {}).authenticated) return _renderClassic(ctx);
  islandPagesAvailable().then(ok => {
    if (seq !== SEQ) return;
    const host = document.getElementById('content');
    if (!ok || !host) return _renderClassic(ctx);
    host.innerHTML = '<div id="dash-react" style="height:100%"></div>';
    const dash = {
      ME: ctx.ME, user: ctx.user, can: ctx.can, env: ctx.env, fn: ctx.fn,
      roleNames: ROLE_NAME, banners: BANNERS, bannerFallback: BANNER_FALLBACK,
      quickView: _quickView, runQuick: _runQuick, resetQuick: _resetQuick, crests: loadCrests,
    };
    const el = document.getElementById('dash-react');
    mountIslandPage('dashboard', el, { dash }).then(done => {
      if (!done && el.isConnected) _renderClassic(ctx);
    });
  }).catch(() => { if (seq === SEQ) _renderClassic(ctx); });
}

function _renderClassic(ctx) {
  CTX = ctx;
  const host = document.getElementById('content');
  if (!host) return;
  const ME = CTX.ME || {};
  if (!ME.authenticated) { host.innerHTML = '<div class="empty">⟡ sign in to continue ⟡</div>'; return; }
  const role = ME.role_effective || ME.role || '';

  const env = (CTX.env ? CTX.env() : '') || '';
  const banner = BANNERS[String(env).toLowerCase()] || BANNER_FALLBACK;

  host.innerHTML = `<div class="dash">
    ${/* ⛔ <section>, PAS <header> : app.css pose `header{height:62px;display:flex}` sur
          l'ELEMENT, pas sur une classe. La banniere heritait donc d'une hauteur fixe de
          62 px et se faisait recadrer, texte coupe en haut et en bas (vu a l'ecran le
          2026-08-14). Aucune classe ne pouvait gagner contre ca : il fallait changer de
          balise. */''}
    <section class="dash-hero env-${esc(String(env).toLowerCase() || 'other')}">
      <img class="dh-art" src="/studio/img/ui/${banner}" alt="" aria-hidden="true">
      <div class="dh-txt">
        ${/* Le role tenait une 3e ligne, posee sur le decor : gris pale sur cristaux bleus,
              on ne le lisait pas. Sur la ligne « Hi » il est court, contraste, et rend une
              ligne de hauteur a la bande. */''}
        <span class="dh-hi">Hi, <b id="dash-who">${esc(ME.username || 'there')}</b>
          <i>${esc(ROLE_NAME[role] || role)}</i></span>
        <span class="dh-big">Welcome Back</span>
      </div>
    </section>

    <div class="dash-sect">
      <h2>Overview</h2>
      <span class="ds-envs" id="dash-envs"></span>
      <span class="ds-sp"></span>
      <button class="dh-act" id="dash-refresh" title="Refresh every measure now">↻ Refresh</button>
    </div>

    <div class="dash-row quad">
      ${heroCard('dq-health', 'card_servers.png', 'Server Health')}
      ${heroCard('dq-players', 'card_players.png', 'Players Online', 'wide')}
      ${heroCard('dq-deploy', 'card_deploy.png', 'Deployment')}
      ${heroCard('dq-data', 'card_database.png', 'Database', 'scrolls')}
    </div>

    <div class="dash-row mid">
      <section class="dq"><div class="dq-h">${iconMarkup('action_journal', 24)}<span>Recent activity</span>
        <span class="dq-spacer"></span><span class="dq-hint" id="dash-feedenv"></span>
        <button class="dh-act" id="dash-alljournal">View all →</button></div>
        <div class="dq-b flush" id="dash-feed"><span class="dq-wait">⋯</span></div></section>
      <section class="dq"><div class="dq-h">${iconMarkup('actions', 24)}<span>Quick actions</span>
        <span class="dq-spacer"></span><span class="dq-hint" id="dash-qahint"></span></div>
        <div class="dq-b" id="dash-qa"></div></section>
    </div>
  </div>`;

  _renderQuick();
  _paintMyCrest(ME.username);
  const r = document.getElementById('dash-refresh');
  if (r) r.onclick = () => { _poll(true); _loadFeed(); };
  const j = document.getElementById('dash-alljournal');
  if (j) j.onclick = () => _nav('rollback');

  _stopTimer();
  _poll(); _loadFeed();
  TIMER = setInterval(_poll, POLL_MS);
}

export function stopDashboard() { SEQ++; _stopTimer(); }
function _stopTimer() { if (TIMER) { clearInterval(TIMER); TIMER = null; } }

function _nav(k) { if (CTX && CTX.fn && CTX.fn.navigate) CTX.fn.navigate(k); }
function _set(id, html) { const n = document.getElementById(id); if (n) n.innerHTML = html; }

/** Pose le chiffre de tete d'une carte : { v, s, cls }. */
function _hero(id, d) {
  const v = document.getElementById(id + '-v');
  const s = document.getElementById(id + '-s');
  if (v) { v.innerHTML = d.v; v.className = 'hero-v' + (d.cls ? ' ' + d.cls : ''); }
  if (s) { s.textContent = d.s || ''; s.title = d.s || ''; }
}

function _wireLinks() {
  document.querySelectorAll('.dash .dq-link[data-go]').forEach(a => { a.onclick = () => _nav(a.dataset.go); });
}

/* Mon avatar = mon personnage. Le pictogramme tient la place tant que la resolution
   (serveur de jeu, lente) n'a pas abouti — aucun trou, aucun sursaut de mise en page.
   ⛔ On ecrit dans « Hi, X », PAS dans la legende : celle-ci porte le role ET
   l'environnement, la remplacer par le nom du personnage effacerait le seul endroit
   ou l'environnement est ecrit en toutes lettres sur cette page. */
async function _paintMyCrest(username) {
  if (!username) return;
  const info = (await loadCrests([username]))[username];
  if (!info) return;
  const who = document.getElementById('dash-who');
  if (who && info.character) who.textContent = info.character;
  const box = document.getElementById('dash-mycrest');
  if (box && (info.crest || document.documentElement.dataset.ui === 'modern')) box.innerHTML = crestMarkup(username, info, 32);
}

/* ------------------------------------------------------------------- QA -- */

/* ⛔ RETIRE le 2026-08-14 : la carte « Favorite tools ». Elle redoublait le rail —
   les memes pages, epinglees depuis le rail, affichees a 30 cm de lui — dans une
   boite aux trois quarts vide (5 pastilles pour la place de 8). Les etoiles du rail
   continuent de fonctionner : elles remontent la page dans SA famille, la ou on la
   cherche. Retirees aussi : « System information » (version du tool + base, deja
   dans l'en-tete et l'ecran A propos ; l'uptime a rejoint Server Health) et la
   rangee « Shortcut environments », devenue les pastilles a cote d'Overview. */

/* ============ LES RACCOURCIS SUIVENT CE QU'ON UTILISE VRAIMENT =============
   Six raccourcis graves dans le code, les memes pour tout le monde, ne servent que
   les premiers jours : celui qui vit dans Features et Monster AI n'a pas besoin de
   « Create NPC » en tete de son ecran d'accueil.

   La liste se construit donc en deux temps :
     1. les pages REELLEMENT ouvertes, classees par frecence (nav/usage.js) — un
        score qui decroit avec le temps, pour qu'une habitude abandonnee cede la
        place au lieu de rester en tete a vie ;
     2. les raccourcis de depart comblent les places restantes, dans leur ordre.

   ⛔ Aucune page interdite ne peut remonter : le filtre de permission s'applique
   APRES le classement. Sans ca, un role restreint verrait grimper des entrees qui
   echoueraient au clic — l'usage se mesure par compte, mais le role peut changer.
   ⚠️ Une carte qui se reordonne sans le dire donne l'impression d'un bug. Elle le
   DIT, dans son en-tete, et l'infobulle explique la regle. */

function _quickList() {
  const parPage = flatNav();
  const vu = new Set();
  const out = [];

  const pousser = e => {
    if (!e || e.archived || vu.has(e.k)) return;
    if (e.perm && !CTX.can(e.perm)) return;
    vu.add(e.k); out.push(e);
  };

  /* 1. l'usage. Une clef de l'arbre de navigation devient un raccourci qui OUVRE la
     page ; une clef de raccourci (qa-*) redevient le raccourci d'origine. */
  for (const { k } of rankedUses(CTX.user)) {
    if (out.length >= QA_MAX) break;
    const q = QUICK.find(x => x.k === k);
    if (q) { pousser(q); continue; }
    const l = parPage[k];
    if (l && l.k !== 'dashboard') {
      pousser({ k: l.k, n: l.label, d: l.familyLabel || 'Open this page',
        ic: l.icon, nav: l.k, perm: l.perm, hot: true });
    }
  }
  /* 2. le socle comble le reste. */
  for (const q of QUICK) { if (out.length >= QA_MAX) break; pousser(q); }
  return out;
}

function _renderQuick() {
  const host = document.getElementById('dash-qa');
  if (!host) return;
  const list = _quickList();
  if (!list.length) { host.innerHTML = '<div class="fd-empty">No quick action for your role.</div>'; return; }
  host.innerHTML = `<div class="qa-list">${list.map(q => `<button class="qa" data-k="${esc(q.k)}">
    ${iconMarkup(q.ic, 24)}<span class="qa-t"><span class="qa-n">${esc(q.n)}</span>
    <span class="qa-d">${esc(q.d)}</span></span><span class="qa-go">›</span></button>`).join('')}</div>
    <button class="qa all" id="qa-all">Open All Tools <span class="qa-go">›</span></button>`;
  host.querySelectorAll('.qa[data-k]').forEach(b => {
    const q = list.find(x => x.k === b.dataset.k);
    b.onclick = () => {
      /* Un raccourci qui n'est PAS une page du rail (créer une créature, un item…) ne
         passe pas par navigate() : il faut donc l'enregistrer ici, sinon il ne
         remonterait jamais dans son propre classement. */
      if (q.nav) return _nav(q.nav);
      if (q.btn) { const b = document.getElementById(q.btn); if (b) b.click(); return; }
      try { recordUse(CTX.user, q.k); } catch (e) { /* jamais bloquant */ }
      if (q.t && CTX.fn && CTX.fn.createType) CTX.fn.createType(q.t);
    };
  });
  const all = document.getElementById('qa-all');
  /* « Tous les outils » = deplier le rail, la ou vivent desormais toutes les pages. */
  if (all) all.onclick = () => { if (CTX.fn && CTX.fn.openAllTools) CTX.fn.openAllTools(); };

  const tag = document.getElementById('dash-qahint');
  if (tag) {
    const perso = usageIsThin(CTX.user);
    tag.textContent = perso ? 'defaults' : 'most used';
    tag.title = perso
      ? 'Starter shortcuts — this list reorders itself as you use the tool'
      : 'Ordered by what YOU open most, recent activity weighing more. Measured on this machine only, nothing is sent anywhere.';
  }
}

/* ------------------------------------------------------------- mesures --- */

async function _poll(manual) {
  if (!document.getElementById('dq-health')) return _stopTimer();
  const b = document.getElementById('dash-refresh');
  if (manual && b) b.textContent = '↻ …';
  let h = null;
  try { h = await (await fetch('/api/home')).json(); } catch (e) { h = null; }
  if (!document.getElementById('dq-health')) return _stopTimer();
  if (!h) {
    _set('dq-health', '<span class="dq-bad">status unavailable</span>');
    /* Le chiffre de tete doit tomber AVEC sa carte. Le laisser sur sa derniere
       valeur afficherait « 5/5 services up » pendant que /api/home ne repond plus. */
    ['dq-health', 'dq-players', 'dq-deploy', 'dq-data'].forEach(id => _hero(id, { v: '—', s: 'unavailable' }));
  } else {
    _hero('dq-health', headHealth(h));
    _hero('dq-players', headPlayers(h.players || {}));
    _hero('dq-deploy', headDeploy(h.deploy || {}, h.env));
    _hero('dq-data', headData(h.data || {}));
    _set('dq-health', paintHealth(h, CTX.can('server.restart'), (h.system || {}).uptime));
    _set('dq-players', paintPlayers(h.players || {}));
    _set('dq-deploy', paintDeploy(h.deploy || {}, h.env, CTX.can('deploy'), CTX.can('rollback')));
    _set('dq-data', paintData(h.data || {}, iconMarkup));
    _set('dash-envs', paintEnvs(h.envs || [], h.env));
    _wireLinks();
    document.querySelectorAll('#dash-envs .envchip[data-env]').forEach(c => {
      c.onclick = () => { if (CTX.fn && CTX.fn.switchEnv) CTX.fn.switchEnv(c.dataset.env); };
    });
  }
  if (manual && b) b.textContent = '↻ Refresh';
}

/* ----------------------------------------------------------- activite ---- */

/* Le journal enregistre la REQUETE HTTP quand aucun libelle n'a ete pose : le flux affichait
   « POST /api/environments/active · /api/environments/active », deux fois la meme chose et rien
   de lisible. On traduit les chemins connus en phrases, et on retire la repetition. Un chemin
   inconnu est rendu tel quel — mieux vaut un chemin qu'une invention. */
const FEED_VERBS = [
  [/\/api\/environments\/active/, 'Switched environment'],
  [/\/api\/auth\/login/, 'Signed in'],
  [/\/api\/auth\/logout/, 'Signed out'],
  [/\/api\/launch/, 'Launched the game client'],
  [/\/api\/server\/restart/, 'Restarted the game servers'],
  [/\/api\/server\/[^/]+\/(start|stop|restart)/, 'Controlled a game server'],
  [/\/api\/pkg|\/api\/pack/, 'Repacked the client'],
  [/\/api\/client-?deploy|\/api\/client\/deploy/, 'Published a client package'],
  [/\/api\/features\/[^/]+\/(install|deploy|patch)/, 'Deployed a feature'],
  [/\/api\/snapshots/, 'Touched a snapshot'],
  [/\/api\/monster|\/api\/ai\//, 'Edited a creature'],
  [/\/api\/altar/, 'Edited an altar'],
  [/\/api\/sexrace/, 'Changed a character sex/race'],
  [/\/api\/entity|\/api\/save/, 'Saved game data'],
];

function _humanize(what, row) {
  const s = String(what || '');
  const m = s.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
  if (!m) return s;
  const path = m[2];
  for (const [re, label] of FEED_VERBS) if (re.test(path)) return label;
  return m[1].toUpperCase() + ' ' + path;          // inconnu : on montre le chemin, pas une devinette
}

/* La cible repete souvent le chemin deja affiche : « POST /api/launch · /api/launch ». */
function _target(v) {
  if (!v.tgt) return '';
  const t = String(v.tgt);
  if (t.startsWith('/api/') || v.what.indexOf(t) >= 0) return '';
  return t;
}


async function _loadFeed() {
  const host = document.getElementById('dash-feed');
  if (!host) return;
  let rows = [];
  try {
    /* Le journal partage est reserve GM+ ; les autres voient la chronologie des
       modifications, qui dit deja qui a change quoi. */
    const url = CTX.can('integrity.view') ? '/api/audit/journal?limit=14' : '/api/audit/timeline?limit=14';
    const j = await (await fetch(url)).json();
    rows = j.entries || j.rows || [];
    /* D'OU vient ce flux : l'environnement, et si c'est le journal partage ou le repli local.
       Le repli montrait TOUS les environnements melanges — l'activite de prod s'affichait sur
       l'ecran de dev sans que rien ne le signale (corrige aussi cote serveur, audit.tail). */
    const tag = document.getElementById('dash-feedenv');
    if (tag && j.env) tag.textContent = String(j.env).toUpperCase() + (j.source === 'env-db' ? ' · shared' : ' · local');
  } catch (e) { rows = []; }
  if (!document.getElementById('dash-feed')) return;
  if (!rows.length) { host.innerHTML = '<div class="fd-empty">Nothing recorded yet on this environment.</div>'; return; }
  /* ⛔ REPETITIONS. Cinq lancements du client d'affilee remplissaient les cinq lignes
     du flux : la carte etait pleine et ne disait qu'UNE chose. On replie les lignes
     CONSECUTIVES identiques (meme auteur, meme action) en une seule portant « ×N ».
     Replier, pas jeter : le compte est ecrit, et l'heure retenue est celle de la plus
     RECENTE — sinon « il y a 25 min » sur une action faite il y a 16 min ferait croire
     que plus rien ne bouge. « View all » garde le detail ligne a ligne. */
  const vues = [];
  for (const r of rows) {
    const v = {
      who: r.actor || r.user || r.by || 'system',
      what: _humanize(r.action || r.what || r.kind || r.summary || '—', r) + (r.ok === false ? ' (failed)' : ''),
      tgt: r.target || r.entity || '',
      cat: r.category || r.kind || '',
      when: ago(r.ts || r.when || r.date),
      n: 1,
    };
    const prev = vues[vues.length - 1];
    if (prev && prev.who === v.who && prev.what === v.what && prev.tgt === v.tgt) { prev.n++; continue; }
    if (vues.length >= FEED_MAX) break;
    vues.push(v);
  }
  host.innerHTML = `<div class="feed">${vues.map(v => `<div class="fd-row" data-who="${esc(v.who)}">
      ${document.documentElement.dataset.ui === 'modern' ? crestMarkup(v.who, null, 26) : `<span class="fd-av">${esc(String(v.who).slice(0, 2).toUpperCase())}</span>`}
      <span class="fd-b"><span class="fd-who">${esc(v.who)}${v.cat ? `<span class="fd-tag">${esc(v.cat)}</span>` : ''}</span>
        <span class="fd-what" title="${esc(v.what + (v.tgt ? ' — ' + v.tgt : ''))}">${esc(v.what)}${_target(v) ? ' · ' + esc(_target(v)) : ''}${v.n > 1 ? `<b class="fd-n" title="${v.n} times in a row">×${v.n}</b>` : ''}</span></span>
      <span class="fd-when">${esc(v.when)}</span></div>`).join('')}</div>`;
  /* Les visages arrivent APRES : la resolution passe par le serveur de jeu. La liste est
     lisible tout de suite avec les initiales. UN SEUL appel pour toutes les lignes. */
  const infos = await loadCrests([...new Set(vues.map(v => v.who))]);
  const hote = document.getElementById('dash-feed');
  if (!hote) return;
  hote.querySelectorAll('.fd-row[data-who]').forEach(row => {
    const info = infos[row.dataset.who];
    if (!info || (!info.crest && document.documentElement.dataset.ui !== 'modern')) return;
    const av = row.querySelector('.fd-av, .li-av');
    if (av) av.outerHTML = crestMarkup(row.dataset.who, info, 26);
  });
}
