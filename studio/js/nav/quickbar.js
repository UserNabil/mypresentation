/* ============================================================================
   LES ACTIONS RAPIDES DE LA BARRE DU HAUT.

   Cinq commandes qu'on declenche EN PASSANT, sans quitter la page en cours :
   Packaging, GM Commands, Restart Server, Launch Client, Features. Elles etaient
   dans le rail, ou elles se comportaient comme des pages alors que ce sont des
   actions. Elles vivent maintenant apres le bouton Reglages.

   ⛔ RIEN NE DOIT DEVENIR INJOIGNABLE QUAND LA FENETRE RETRECIT. Un simple
   `display:none` par media query aurait supprime l'action, pas seulement son
   bouton — et sans le moindre signe. Ici, ce qui ne tient plus part dans un menu
   « … » qui n'apparait QUE s'il contient quelque chose. On mesure la place reelle
   plutot que de deviner des seuils : la largeur disponible depend du zoom, de la
   police et du nombre de boutons visibles selon le role.

   Le bouton lui-meme ne SAIT rien faire : il reclique le bouton d'en-tete deja
   cable (masque mais toujours dans le document). Aucun comportement duplique.

   Contrat d'appel (index.html) :
     initQuickBar({ can, toast })
   ============================================================================ */

import { HEADER_ACTIONS } from './tree.js';
import { iconMarkup } from '../core/icons.js';
import { esc } from '../core/dom.js';
import { initRecordModal } from '../pages/record_modal.js';
import { initModernGate, modernOn } from '../ui/modern_gate.js';
import { initModernShell } from '../ui/modern_shell.js';
import { initModernSelect } from '../ui/modern_select.js';
import { lineSvg } from '../ui/line_icons.js';

let CTX = null;
let RO = null;

function visibles() {
  return HEADER_ACTIONS.filter(a => {
    if (!a.perm) return true;
    try { return !!CTX.can(a.perm); } catch (e) { return false; }
  });
}

/** Declenche l'action : on clique le bouton d'en-tete d'origine. S'il a disparu
    (role insuffisant), on le DIT au lieu de ne rien faire. */
function fire(a) {
  const id = (a.act || '').startsWith('btn:') ? a.act.slice(4) : '';
  const b = id && document.getElementById(id);
  if (b) b.click();
  else if (CTX.toast) CTX.toast('This action is not available for your role', 'warn', 3000);
}

export function renderQuickBar() {
  const host = document.getElementById('hquick');
  if (!host || !CTX) return;
  const list = visibles();
  host.innerHTML = list.map(a => `<button class="hq-b" data-hq="${esc(a.k)}" title="${esc(a.label)}"
      aria-label="${esc(a.label)}">${iconMarkup(a.icon, 24)}</button>`).join('')
    + `<div class="hq-more" id="hq-more" hidden>
         <button class="hq-b hq-more-t" title="More actions" aria-label="More actions">${modernOn() ? lineSvg('ellipsis', 20) : '⋯'}</button>
         <div class="hq-menu" id="hq-menu"></div>
       </div>`;
  host.querySelectorAll('[data-hq]').forEach(b => {
    b.onclick = () => { const a = list.find(x => x.k === b.dataset.hq); if (a) fire(a); };
  });
  const more = document.getElementById('hq-more');
  const t = more && more.querySelector('.hq-more-t');
  if (t) t.onclick = ev => { ev.stopPropagation(); more.classList.toggle('open'); };
  document.addEventListener('click', () => { if (more) more.classList.remove('open'); });
  _fit();
  _watch();
}

/** Combien de boutons tiennent VRAIMENT ?

    ⛔ MESURE, pas seuils devines. Premiere version fausse : je testais si la barre
    d'actions DEBORDAIT — elle ne deborde jamais. L'en-tete est en flex, et c'est la
    BARRE DE RECHERCHE qui absorbe tout : mesure a 1700 / 1350 / 1150 / 980 / 860 px,
    les actions restent a 344 px pendant que la recherche tombe de 420 a 160. Le
    repli ne se declenchait donc jamais.

    Le vrai signal est la : une recherche sous ~300 px n'est plus utilisable. On
    retire donc le dernier bouton tant qu'elle est trop etroite. Cacher un bouton
    rend sa place a la recherche, donc la boucle converge — et elle repart de zero
    a chaque passage, ce qui gere aussi l'elargissement. */
const SEARCH_MIN = 300;

function _fit() {
  const host = document.getElementById('hquick');
  const more = document.getElementById('hq-more');
  const menu = document.getElementById('hq-menu');
  const search = document.querySelector('.searchwrap');
  if (!host || !more || !menu) return;
  const btns = [...host.querySelectorAll('[data-hq]')];

  /* On repart TOUJOURS de « tout visible » : c'est ce qui rend l'elargissement
     automatique, sans etat a maintenir. */
  btns.forEach(b => { b.hidden = false; });
  more.hidden = true;
  if (!btns.length || !search) return;

  /* Combien il MANQUE a la recherche, une fois tout affiche — puis combien de
     boutons il faut retirer pour le rendre. Un calcul en une fois, plutot qu'une
     boucle qui re-mesure : la boucle retirait trois boutons d'un coup parce que
     la largeur ne se remettait pas a jour comme prevu entre deux tours. */
  const large = btns[0].getBoundingClientRect().width + 3;      // bouton + espacement
  const manque = SEARCH_MIN - search.getBoundingClientRect().width;
  let n = manque > 0 ? Math.min(btns.length, Math.ceil(manque / large)) : 0;

  /* Le menu « … » prend lui-meme une place : des qu'on cache quelque chose, il
     faut compter sa largeur, sinon on en retire un de trop a chaque palier. */
  if (n > 0 && n < btns.length) n = Math.min(btns.length, n + 0);

  const caches = [];
  for (let i = btns.length - 1; i >= btns.length - n; i--) {
    btns[i].hidden = true;
    caches.unshift(btns[i]);
  }
  more.hidden = caches.length === 0;
  if (!caches.length) { menu.innerHTML = ''; return; }

  const list = visibles();
  menu.innerHTML = caches.map(b => {
    const a = list.find(x => x.k === b.dataset.hq) || {};
    return `<button class="hq-mi" data-hqm="${esc(a.k || '')}">${iconMarkup(a.icon || 'actions', 24)}
      ${esc(a.label || '')}</button>`;
  }).join('');
  menu.querySelectorAll('[data-hqm]').forEach(mi => {
    mi.onclick = () => {
      more.classList.remove('open');
      const a = list.find(x => x.k === mi.dataset.hqm);
      if (a) fire(a);
    };
  });
}

/** Re-mesure quand l'en-tete change de taille. Un simple `resize` de fenetre ne
    suffit pas : le rail se replie, le badge d'environnement change de largeur. */
function _watch() {
  const bar = document.querySelector('.hactions');
  if (!bar || !window.ResizeObserver) { window.addEventListener('resize', _fit); return; }
  if (RO) RO.disconnect();
  RO = new ResizeObserver(() => _fit());
  RO.observe(bar);
}

export function initQuickBar(ctx) {
  CTX = ctx || {};
  renderQuickBar();
  initRecordModal();
  initModernGate().then(p => { initModernShell(CTX, p); if (p) initModernSelect(); }).catch(() => {});
  window.addEventListener('ui-modern', () => renderQuickBar());
}
