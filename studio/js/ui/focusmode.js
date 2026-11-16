/* ============================================================================
   ui/focusmode.js — LE BOUTON PRECEDEMMENT CLIQUE NE RESTE PLUS ALLUME.

   Symptome rapporte : « je clique un bouton, je reviens avec Echap, et le
   precedent clic reste visible ».

   ⛔ CE N'EST PAS `:focus-visible` QUI SUFFIT. On le croit — c'est la reponse
   standard — mais l'heuristique de Chromium promeut l'anneau de focus des que
   l'utilisateur touche UNE TOUCHE, **Echap compris**. Or fermer une boite avec
   Echap est precisement le geste decrit : le bouton declencheur reprend le focus
   ET l'anneau, alors que la personne est a la souris et n'a rien demande.
   Verifie a l'ecran : apres un clic souris suivi d'Echap, l'element matche encore
   `:focus-visible`.

   On pilote donc la modalite nous-memes, avec la nuance qui manque au navigateur :
     * `pointerdown`            -> souris   (pas d'anneau)
     * Tab / fleches / Home/End -> clavier  (anneau : c'est le SEUL repere de
                                             position pour qui n'a pas de souris)
     * Echap, Entree, Espace    -> ON NE CHANGE RIEN. Ce sont des touches d'ACTION,
                                   pas de deplacement : elles ne prouvent pas qu'on
                                   a lache la souris.

   L'etat vit sur `<html data-nav>`, et css/shell.css n'allume l'anneau que sous
   `html[data-nav="keyboard"]`.

   ⛔ NE JAMAIS « corriger » ca par un `blur()` au clic : le focus servirait alors
   a plus rien, la navigation au clavier deviendrait invisible, et l'element actif
   retomberait sur <body> — Echap et les raccourcis cesseraient de fonctionner.
   ============================================================================ */

const DEPLACEMENT = new Set([
  'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
]);

function set(mode) {
  const r = document.documentElement;
  if (r.dataset.nav !== mode) r.dataset.nav = mode;
}

export function initFocusMode() {
  set('mouse');
  /* `capture:true` : on veut connaitre la modalite AVANT que le gestionnaire du
     composant ne deplace le focus, sinon l'anneau est peint avec l'ancien etat
     pendant une frame — un clignotement visible sur les boutons qui ouvrent une boite. */
  document.addEventListener('pointerdown', () => set('mouse'), true);
  document.addEventListener('keydown', ev => { if (DEPLACEMENT.has(ev.key)) set('keyboard'); }, true);
}
