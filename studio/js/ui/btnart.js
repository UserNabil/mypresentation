/* ============================================================================
   ui/btnart.js — HABILLER LES DEUX BOUTONS « CREER » AVEC UNE IMAGE, SANS RISQUE.

   Deux boutons portent la meme action (ouvrir le canevas de creation) et sont les
   plus regardes de l'outil :
     * `.rl-cta`    — l'appel a l'action en tete du rail (largeur VARIABLE : 222 px
                      rail deploye, 52 px rail reduit) ;
     * `#fab-create`— la pastille ronde flottante en bas a droite (58 px, FIXE).

   ⛔ POURQUOI CE MODULE EXISTE plutot qu'un simple `background-image` en CSS :
   une image absente ne « rate » pas proprement. Le fond peint ne s'affiche pas,
   mais le reste du style a DEJA ete applique — on se retrouve avec un bouton dont
   le texte a ete rendu transparent pour laisser voir une illustration qui n'arrive
   jamais, donc un bouton VIDE. On teste donc le chargement AVANT de basculer le
   style : tant que l'image n'a pas repondu, la version CSS (degrade or) reste, et
   elle est deja presentable.

   Consequence pratique : deposer les fichiers dans static/img/ui/ SUFFIT. Rien a
   recompiler, rien a rebrancher. Les retirer redonne la version CSS.

   Fichiers attendus (voir docs/studies/home_redesign_2026-08-14.md) :
     btn_create_fab.png    carre, transparent  -> #fab-create
     btn_plate.png         plaque 9-tranches   -> .rl-cta  (remplace le plateau)
     btn_cta_icon.png      objet carre         -> .rl-cta  (ornement, GARDE le plateau)

   ⛔ `btn_plate.png` et `btn_cta_icon.png` ne s'excluent PAS : la plaque remplace le
   fond, l'ornement remplace le « ＋ ». Les deux ensemble = plaque dessinee portant
   l'objet. Si la plaque ne passe pas la validation a l'ecran (bords qui se deforment
   a l'etirement), il suffit de RETIRER le fichier : l'ornement reste, pose sur le
   plateau CSS, et rien d'autre ne bouge.
   ============================================================================ */

const ART = [
  { src: '/studio/img/ui/btn_create_fab.png', cls: 'art-fab' },
  { src: '/studio/img/ui/btn_plate.png', cls: 'art-plate' },
  { src: '/studio/img/ui/btn_cta_icon.png', cls: 'art-icon' },
];

/** Teste chaque image et pose sa classe sur <html> UNIQUEMENT si elle se charge. */
export function initButtonArt() {
  for (const a of ART) {
    const im = new Image();
    /* `decode()` n'est pas utilise : un PNG corrompu se chargerait (`onload`) mais ne
       se decoderait pas. `onload` suffit ici — un fichier illisible ne declenche pas
       `onload` dans les navigateurs Chromium, qui est la seule cible du tool. */
    im.onload = () => { if (im.naturalWidth > 0) document.documentElement.classList.add(a.cls); };
    im.onerror = () => { /* pas d'image : on garde le bouton CSS, et on ne dit rien */ };
    im.src = a.src;
  }
}
