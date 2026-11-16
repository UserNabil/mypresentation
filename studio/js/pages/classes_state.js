/* ============================================================================
   CLASSES — etat + contrat d'hote, partages par classes.js / _views / _slot.

   Ce fichier existe pour UNE raison : trois modules de la page ont besoin du
   meme etat et du meme hote. Les faire dependre de classes.js creerait un cycle
   d'imports supplementaire pour une simple lecture de variable.

   ⛔ AUCUN GLOBAL n'est lu ici. Tout arrive par l'objet passe a initClasses().

   DEUX NATURES D'ETAT, et il ne faut pas les confondre :

   1. `S` — etat PRIVE de la page (detail charge, filtre, mode edition, portee
      d'ecriture). Personne d'autre dans index.html ne le lit : il vit ici.

   2. `g` — accesseurs vers l'etat qui RESTE dans index.html. `snapshotCurrent()`
      lit CLSSEL / CLSRACE / CLSFAM / CLSTAB / CLSTREE pour restaurer la vue
      apres un retour arriere. Si on les deplacait ici, la restauration
      d'historique cesserait silencieusement de fonctionner (aucune erreur : la
      condition `typeof CLSSEL!=='undefined'` deviendrait juste toujours fausse).
      D'ou des getters/setters, jamais une copie locale — une copie divergerait
      des le premier clic.
   ============================================================================ */

let H = null;

/* L'hote attendu (initClasses le fournit) :
     $ esc enc toast uiConfirm errMessage iconImg   — utilitaires du tool
     canEditData()   -> bool  : droit d'ecrire les donnees (bouton « New class »)
     navBack()                : retour arriere de la barre de navigation
     navLen()        -> int   : NAV.length, pour n'afficher « Back » que s'il y a ou revenir
     openIconPicker  optionnel: absent aujourd'hui du tool -> repli saisie manuelle
     get/setTree  get/setRace  get/setSel  get/setFam  get/setTab              */
export function clsSetHost(h){ H = h; }
export function host(){ return H; }

/* etat prive de la page */
export const S = { detail:null, q:'', edit:false, group:true };

/* etat partage avec index.html — TOUJOURS par accesseur */
export const g = {
  tree:()=>H.getTree(), setTree:v=>H.setTree(v),
  race:()=>H.getRace(), setRace:v=>H.setRace(v),
  sel: ()=>H.getSel(),  setSel: v=>H.setSel(v),
  fam: ()=>H.getFam(),  setFam: v=>H.setFam(v),
  tab: ()=>H.getTab(),  setTab: v=>H.setTab(v),
};
