/* ============================================================================
   FEATURE MANAGER — etat partage + contrat d hote.

   Extrait de static/index.html (protocole docs/WORK_SPLIT.md). Code COPIE tel
   quel : aucun changement de comportement, seuls les acces aux globaux passent
   par l hote.

   Le lot tient en six fichiers :
     feature_manager_state.js    ce fichier : hote + accesseur FM
     feature_manager_views.js    fabriques de HTML pures (badges, verdicts,
                                 carrousel, checklist de tests)
     feature_manager_detail.js   fmRenderDetail (la grosse vue) + fmSwapCard
     feature_manager_ops.js      appels back longs (deploy natif, doctor,
                                 install-all, plein ecran, DLL)
     feature_manager_actions.js  cablages du detail (boutons, votes, role mode)
     feature_manager.js          page : openFeatures, liste, git, selection

   ⛔ AUCUN GLOBAL N EST LU DEPUIS CES MODULES. Tout arrive par l objet passe a
   initFeatureManager() — voir la liste complete plus bas dans ce fichier.

   ⚠ POURQUOI L OBJET `FM` RESTE DANS index.html.
   `FM` est lu HORS de la page : `afterRepackRefresh()` y prend le nom de la
   feature affichee pour rafraichir sa carte apres un repack lance depuis la
   barre, et le routeur de notifications y ecrit `FM.sel` avant de cliquer
   #btn-features. Le rapatrier ici casserait ces deux chemins EN SILENCE (le
   test `typeof FM!=='undefined'` deviendrait simplement faux, aucune erreur
   console). L hote fournit donc `getFM()` et le module passe par `fm()`.
   Meme raison pour `fmGet` / `fmPost` / `fmConfirm` : la page Monster AI Studio
   les appelle encore depuis index.html.

   ⚠ `openFeatures` et `fmRefreshClientOnly` sont EXPORTES et re-importes par
   index.html : #btn-features, la restauration de vue (sessionStorage
   'eden_view') et afterRepackRefresh() les appellent par leur nom.
   ============================================================================ */

/* `H` est un LIEN VIVANT (live binding ESM) : les modules du lot font
   `import { H } …` et voient la valeur posee par fmSetHost() meme s ils ont ete
   evalues avant. C est ce qui permet d importer les modules en haut d index.html
   et de n appeler initFeatureManager() qu au moment ou tous les helpers du tool
   existent. */
export let H = null;

/* Contrat d hote — chaque entree est LUE par les modules du lot :
     $                selecteur DOM (document.querySelector)
     esc              echappement HTML
     toast            notifications
     errMessage       exception -> message lisible
     httpErr          ApiError -> message reseau lisible
     showThemedDialog showThemedDialog(titre, html) : modale du tool
     iconMarkup       iconMarkup(nom, taille) -> <img …>
     runBusy          UI.runBusy(bouton, fn) : spinner + bouton desarme
     guardPage        guardPage(permission, libelle) -> bool
     edenSetView      memorise la vue courante (retour apres F5)
     can              can(action) -> bool (droits de role)
     me               () -> ME : {username, role, …} — vote « le mien »
     getFM            () -> l objet FM declare dans index.html
     fmGet / fmPost   api.get / api.post (restes dans index.html)
     fmConfirm        confirmation modale du Feature Manager -> Promise<bool>
     barRepack        repack game_unpacked -> pkg (barre d actions d index.html)
     isRepacking      () -> bool : window._barRepacking, pose par barRepack
*/
export function fmSetHost(h) { H = h; }

/* Raccourci lisible : `fm().sel` la ou index.html ecrivait `FM.sel`.
   ⚠ NE JAMAIS reaffecter l objet (fm() = …) : index.html garde la reference. */
export function fm() { return H.getFM(); }
