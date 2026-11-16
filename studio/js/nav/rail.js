/* ============================================================================
   LE RAIL DE NAVIGATION (colonne de gauche).

   Il dessine NAV_TREE : 6 familles, une seule ouverte a la fois, la page
   courante surlignee. Il ne SAIT rien faire lui-meme — il redeclenche ce qui
   existe deja (pastille de filtre, fonction open*, bouton d'en-tete). C'est
   volontaire : aucune page n'a ete reecrite pour la refonte, donc aucune ne
   peut casser a cause d'elle.

   Contrat d'appel (index.html) :
     initRail({ can, user, fn, onNavigate })
       can(action)  -> booleen : masque les entrees interdites
       user         -> nom du compte (clef des favoris)
       fn           -> { openClasses, openEquipment, ... , renderHome, gotoType }
       onNavigate   -> appele avec la clef de feuille APRES le declenchement
   ============================================================================ */

import { NAV_TREE, HEADER_ACTIONS } from './tree.js';
import { getFavorites, toggleFavorite, favoritesFull } from './favorites.js';
import { recordUse } from './usage.js';
import { iconMarkup } from '../core/icons.js';
import { lineSvg, navLine } from '../ui/line_icons.js';
import { modernOn } from '../ui/modern_gate.js';
import { esc } from '../core/dom.js';
import { toast } from '../ui/toast.js';

const OPEN_KEY = 'eden.rail.open';        /* la famille depliee, retenue entre deux sessions */
const MIN_KEY  = 'eden.rail.min';         /* rail reduit (icones seules) */

let CTX = null;
let CURRENT = 'dashboard';

/* -------------------------------------------------------------- rendu ---- */

function leafVisible(leaf) {
  if (!leaf.perm) return true;
  try { return !!CTX.can(leaf.perm); } catch (e) { return false; }
}

function navIco(n) {
  return ((modernOn() && navLine(n.k, n.icon, 24)) || iconMarkup(n.icon, 24)).replace('ui-icon', 'ui-icon rl-ico');
}

let FLY = null;
let flyT = 0;

function flyOn() {
  const main = document.querySelector('main');
  return modernOn() && !!main && main.classList.contains('rail-min');
}

function flyClose() {
  clearTimeout(flyT);
  if (FLY) { FLY.remove(); FLY = null; }
}

function flyLater() {
  clearTimeout(flyT);
  flyT = setTimeout(flyClose, 200);
}

function flyOpen(famKey, anchor) {
  clearTimeout(flyT);
  const node = NAV_TREE.find(n => n.k === famKey);
  if (!node) return;
  const kids = (node.kids || []).filter(l => !l.archived && leafVisible(l));
  if (!FLY) {
    FLY = document.createElement('div');
    FLY.className = 'rl-fly';
    FLY.setAttribute('role', 'menu');
    document.body.appendChild(FLY);
    FLY.addEventListener('mouseenter', () => clearTimeout(flyT));
    FLY.addEventListener('mouseleave', flyLater);
    FLY.addEventListener('focusout', e => { if (!FLY || !FLY.contains(e.relatedTarget)) flyLater(); });
  }
  FLY.innerHTML = `<div class="rl-fly-h">${esc(node.label)}</div>` + kids.map(l =>
    `<button type="button" role="menuitem" class="rl-fly-i${CURRENT === l.k ? ' on' : ''}" data-k="${esc(l.k)}">${navIco(l)}<span>${esc(l.label)}</span></button>`).join('');
  const r = anchor.getBoundingClientRect();
  const rail = document.getElementById('rail').getBoundingClientRect();
  FLY.style.left = (rail.right + 8) + 'px';
  FLY.style.top = Math.max(8, Math.min(r.top - 8, innerHeight - FLY.offsetHeight - 8)) + 'px';
  FLY.querySelectorAll('.rl-fly-i').forEach(b => { b.onclick = () => { flyClose(); navigate(b.dataset.k); }; });
}

function leafHtml(leaf, favs) {
  const star = favs.indexOf(leaf.k) >= 0;
  return `<button class="rl-leaf${CURRENT === leaf.k ? ' on' : ''}" data-k="${esc(leaf.k)}" title="${esc(leaf.label)}">
    ${navIco(leaf)}
    <span class="rl-lbl">${esc(leaf.label)}</span>
    <span class="rl-star${star ? ' on' : ''}" data-fav="${esc(leaf.k)}"
      title="${star ? 'Remove from favorites' : 'Pin to favorites'}">${star ? '★' : '☆'}</span>
  </button>`;
}

function famHtml(fam, openKey, favs) {
  const kids = (fam.kids || []).filter(l => !l.archived && leafVisible(l));
  if (!kids.length) return '';                    /* une famille vide ne s'affiche pas */
  const open = openKey === fam.k || kids.some(l => l.k === CURRENT);
  return `<div class="rl-fam${open ? ' open' : ''}" data-fam="${esc(fam.k)}">
    <button class="rl-fam-h" title="${esc(fam.label)}">
      ${navIco(fam)}
      <span class="rl-lbl">${esc(fam.label)}</span>
      <span class="rl-caret">${modernOn() ? lineSvg('chevron-right', 16) : '▶'}</span>
    </button>
    <div class="rl-kids"><div class="rl-kids-in">${kids.map(l => leafHtml(l, favs)).join('')}</div></div>
  </div>`;
}

/** (Re)dessine le rail. A rappeler apres une connexion ou un changement de role :
    les entrees visibles dependent des permissions.
    `ctx` optionnel : on le remplace, car le nom d'utilisateur (clef des favoris) et les
    permissions changent a la reconnexion — un contexte fige afficherait le rail du
    precedent connecte. */
const SHOW_CREATE = false;

export function renderRail(ctx) {
  if (ctx) CTX = ctx;
  const host = document.getElementById('rail-scroll');
  if (!host || !CTX) return;
  const openKey = _openFamily();
  const favs = getFavorites(CTX.user);
  const top = NAV_TREE.filter(n => n.top);
  const fams = NAV_TREE.filter(n => !n.top && !n.archived);
  /* L'appel a l'action, en tete de rail : CREER est ce qu'on vient faire ici le plus
     souvent, et c'etait cache dans un bouton flottant en bas a droite. Il ouvre
     EXACTEMENT le meme canevas (openCreateCanvas sans type) — un seul chemin de
     creation, donc rien de nouveau a maintenir. Masque sans le droit de creer :
     un bouton qui refuse est pire que pas de bouton. */
  const cta = SHOW_CREATE && _canCreate()
    ? `<button class="rl-cta" id="rl-create" title="Create an item or a game entity">
         <span class="rl-cta-p">＋</span>
         ${/* Le libelle est en DEUX morceaux parce que la place n'est pas la meme selon
              l'habillage : le plateau CSS prend « Create new content » en entier, le
              panneau de cuir de la plaque dessinee ne tient que « Create » sans passer
              a la ligne. Deux morceaux plutot que deux libelles : le mot qui compte est
              le meme dans les deux cas, et il n'y a rien a garder synchronise. */''}
         <span class="rl-lbl"><b>Create</b><i> new content</i></span></button>`
    : '';
  host.innerHTML = cta +
    top.map(n => `<button class="rl-top${CURRENT === n.k ? ' on' : ''}" data-k="${esc(n.k)}" title="${esc(n.label)}">
        ${navIco(n)}
        <span class="rl-lbl">${esc(n.label)}</span></button>`).join('') +
    '<div class="rl-sect"><span class="rl-lbl">Main menu</span><i class="rl-sect-r"></i></div>' +
    fams.map(f => famHtml(f, openKey, favs)).join('');
  _wire(host);
}

function _openFamily() {
  try { return localStorage.getItem(OPEN_KEY) || 'content'; } catch (e) { return 'content'; }
}

/* Le droit de creer est celui du bouton flottant : `data-minrole="GM"` cote HTML,
   `gen3d` cote permissions (c'est la clef que le Dashboard utilise deja pour ses
   actions « Create Creature / Item / NPC »). */
function _canCreate() {
  try { return !!CTX.can('gen3d'); } catch (e) { return false; }
}

function _wire(host) {
  const cta = host.querySelector('#rl-create');
  if (cta) cta.onclick = () => {
    /* On passe par le contexte du rail, pas par un clic simule sur le bouton flottant :
       celui-ci est masque par role via un style en ligne, et cliquer un element masque
       ne fait rien SANS erreur — la panne serait invisible. */
    if (CTX.fn && typeof CTX.fn.createType === 'function') CTX.fn.createType();
    else toast('Creation is not available for your role', 'warn', 3000);
  };
  host.querySelectorAll('.rl-fam-h').forEach(h => {
    const famKey = h.closest('.rl-fam').dataset.fam;
    h.addEventListener('mouseenter', () => { if (flyOn()) flyOpen(famKey, h); });
    h.addEventListener('focus', () => { if (flyOn()) flyOpen(famKey, h); });
    h.addEventListener('mouseleave', () => { if (FLY) flyLater(); });
    h.onclick = () => {
      if (flyOn()) { flyOpen(famKey, h); return; }
      const fam = h.closest('.rl-fam');
      /* Rail reduit : ses feuilles sont masquees. Cliquer une famille doit donc REDEPLOYER le rail,
         sinon le clic n'a aucun effet visible et l'utilisateur croit que la famille est vide. */
      const main = document.querySelector('main');
      if (main && main.classList.contains('rail-min')) {
        main.classList.remove('rail-min');
        try { localStorage.setItem(MIN_KEY, '0'); } catch (e) { /* prive */ }
        host.querySelectorAll('.rl-fam').forEach(f => f.classList.remove('open'));
        fam.classList.add('open');
        try { localStorage.setItem(OPEN_KEY, fam.dataset.fam); } catch (e) { /* prive */ }
        return;
      }
      const willOpen = !fam.classList.contains('open');
      /* Accordeon : une seule famille ouverte. Tout deplier redonnerait la liste
         de 40 lignes qu'on cherche justement a supprimer. */
      host.querySelectorAll('.rl-fam').forEach(f => f.classList.remove('open'));
      if (willOpen) fam.classList.add('open');
      try { localStorage.setItem(OPEN_KEY, willOpen ? fam.dataset.fam : ''); } catch (e) { /* prive */ }
    };
  });
  host.querySelectorAll('.rl-leaf,.rl-top').forEach(b => {
    b.onclick = ev => {
      /* L'etoile vit DANS le bouton : sans ce filtre, epingler ouvrirait la page. */
      const star = ev.target.closest('.rl-star');
      if (star) { ev.stopPropagation(); _toggleFav(star.dataset.fav); return; }
      navigate(b.dataset.k);
    };
  });
}

function _toggleFav(k) {
  const wasFull = favoritesFull(CTX.user);
  const now = toggleFavorite(CTX.user, k);
  if (!now && wasFull) { toast('Favorites are full — unpin one first', 'warn', 3000); return; }
  renderRail();
  /* Le Dashboard affiche la meme liste : s'il est a l'ecran, il doit suivre. */
  if (document.body.classList.contains('home-view') && CTX.fn.renderHome) {
    try { CTX.fn.renderHome(); } catch (e) { /* la page se redessinera au prochain passage */ }
  }
}

/* --------------------------------------------------------- navigation ---- */

/** Declenche l'action d'une feuille et met a jour le surlignage. */
export function navigate(k) {
  if (!k || !CTX) return;
  const leaf = _find(k);
  if (!leaf) return;
  /* On mesure ICI, et pas dans chaque page : `navigate()` est le passage OBLIGE de
     toutes les feuilles du rail ET des actions d'en-tete (le Dashboard les appelle
     par la meme fonction). Un seul point d'enregistrement, donc aucune page qui
     compte double et aucune qui s'oublie quand on l'ajoute a l'arbre. */
  try { recordUse(CTX.user, k); } catch (e) { /* jamais bloquant */ }
  setActive(k);
  try { sessionStorage.setItem('eden_nav', leaf.act === 'home' ? '' : k); } catch (e) { }
  const act = leaf.act || '';
  /* Le panneau de recherche (320 px de pastilles d'entites) n'a de sens que sur les entrees
     qui le CADRENT. Il restait affiche sur Features, Accounts… coince
     entre le rail et la page, sans aucun rapport avec elle. */
  document.body.classList.toggle('side-open', act.startsWith('type:'));
  if (act === 'home') { _call('renderHome'); }
  else if (act.startsWith('type:')) { _gotoType(act.slice(5)); }
  else if (act.startsWith('fn:')) { _call(act.slice(3)); }
  else if (act.startsWith('btn:')) {
    const b = document.getElementById(act.slice(4));
    if (b) b.click();
    else toast('This page is not available for your role', 'warn', 3000);
  }
  try { if (CTX.onNavigate) CTX.onNavigate(k); } catch (e) { /* pur signal */ }
}

function _find(k) {
  /* Les 5 actions de la barre du haut ne sont plus dans l'arbre, mais le Dashboard
     pointe encore dessus par leur clef (`nav:'packaging'`, `nav:'restart'`). Sans ce
     repli, ces raccourcis-la ne feraient RIEN, sans erreur console. */
  const h = HEADER_ACTIONS.find(a => a.k === k);
  if (h) return h;
  for (const n of NAV_TREE) {
    if (n.k === k) return n;
    for (const l of (n.kids || [])) if (l.k === k) return l;
  }
  return null;
}

function _call(name) {
  const f = CTX.fn && CTX.fn[name];
  if (typeof f === 'function') {
    try {
      const r = f();
      /* Une page asynchrone qui echoue APRES le retour de `f()` passait entierement
         sous le radar : le try/catch ne voit qu'un rejet synchrone. On rattache donc
         le rejet de la promesse au meme rapport d'erreur. */
      if (r && typeof r.then === 'function') r.catch(e => _openFailed(name, e));
    } catch (e) { _openFailed(name, e); }
  } else {
    /* ⚠️ Deux causes TRES differentes se disaient pareil : « pas le bon role » et
       « la fonction n'existe pas » (page pas encore chargee, module en erreur,
       faute de frappe dans NAV_TREE). Les confondre envoyait chercher un probleme
       de droits la ou le module avait simplement plante a l'import. */
    const connu = CTX.fn && Object.prototype.hasOwnProperty.call(CTX.fn, name);
    toast(connu
      ? `"${name}" is registered but is not callable — the page module failed to load. Reload the window (F5); if it persists, check the console.`
      : `This page is not available for your role (or "${name}" is not wired in the navigation tree).`,
      'warn', 6000);
  }
}

function _openFailed(name, e) {
  const msg = (e && (e.message || e.detail)) ? (e.message || e.detail) : String(e || 'unknown error');
  toast(`Could not open "${name}" — ${msg}`, 'err', 8000);
  try { console.error('[rail] open failed:', name, e); } catch (_) { /* console absente */ }
}

function _gotoType(t) {
  if (CTX.fn && typeof CTX.fn.gotoType === 'function') { CTX.fn.gotoType(t); return; }
  const chip = document.querySelector('#filters .fchip[data-t="' + t + '"]');
  if (chip) chip.click();
}

/** Surligne une feuille SANS rien declencher — pour les pages ouvertes autrement
    (bouton d'en-tete, lien interne, retour arriere). */
export function setActive(k) {
  CURRENT = k || '';
  const host = document.getElementById('rail-scroll');
  if (!host) return;
  host.querySelectorAll('.rl-leaf,.rl-top').forEach(b => b.classList.toggle('on', b.dataset.k === CURRENT));
  const leaf = host.querySelector('.rl-leaf.on');
  /* Une famille dont une feuille est active se signale MEME REPLIEE. Sans ca, rail
     reduit ou famille fermee, plus rien a l'ecran ne dit ou l'on se trouve. */
  host.querySelectorAll('.rl-fam').forEach(f => f.classList.remove('has-active'));
  if (leaf) {
    const box = leaf.closest('.rl-fam');
    if (box) {
      box.classList.add('has-active');
      if (!box.classList.contains('open')) {
        host.querySelectorAll('.rl-fam').forEach(f => f.classList.remove('open'));
        box.classList.add('open');
        try { localStorage.setItem(OPEN_KEY, box.dataset.fam); } catch (e) { /* prive */ }
      }
    }
    /* La feuille active peut etre hors du champ visible apres un deplié : on la ramene,
       sans a-coup. */
    try { leaf.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* vieux moteur */ }
  }
  document.body.classList.toggle('home-view', CURRENT === 'dashboard');
}

/* Table vue -> clef de rail. Les pages s'ouvrent AUSSI par un bouton d'en-tete, un lien
   interne ou une restauration F5 : dans ces cas `navigate()` n'est jamais appele et le
   surlignage restait sur la page PRECEDENTE — le rail affichait un mensonge. `syncActive`
   est branche sur `edenSetView`, par lequel TOUTES les pages passent deja. */
const VIEW_TO_KEY = {
  home: 'dashboard', dashboard: 'dashboard',
  features: 'features', accounts: 'accounts',
  classes: 'classes', altar: 'altar',
  diagnostics: 'diagnostics', gm: 'gmcommands', history: 'history', crashes: 'crashes', perf: 'perf',
  cdnaudit: 'cdnaudit', emojicdn: 'emojicdn', pageaccess: 'pageaccess',
  shopcurrency: 'shopcurrency', polls: 'polls', cardduel: 'cardduel',
};

/** Aligne le rail sur la vue REELLEMENT affichee, sans rien declencher. */
export function syncActive(view) {
  if (!view) return;
  const k = VIEW_TO_KEY[String(view).toLowerCase()];
  if (k && k !== CURRENT) setActive(k);
}

/* -------------------------------------------------------------- init ----- */

export function initRail(ctx) {
  CTX = ctx || {};
  const main = document.querySelector('main');
  if (main) main.classList.add('has-rail');
  try { if (localStorage.getItem(MIN_KEY) === '1') main.classList.add('rail-min'); } catch (e) { /* prive */ }
  const t = document.getElementById('rail-toggle');
  if (t) t.onclick = () => {
    flyClose();
    const on = main.classList.toggle('rail-min');
    try { localStorage.setItem(MIN_KEY, on ? '1' : '0'); } catch (e) { /* prive */ }
    t.title = on ? 'Expand the navigation' : 'Collapse the navigation';
  };
  renderRail();
  const again = () => { flyClose(); renderRail(); setActive(CURRENT); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && FLY) flyClose(); });
  document.addEventListener('click', e => { if (FLY && !FLY.contains(e.target) && !e.target.closest('.rl-fam-h')) flyClose(); });
  window.addEventListener('ui-modern', again);
}
