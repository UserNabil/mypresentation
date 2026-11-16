/* ============================================================================
   ENTITY - etat partage + contrat d'hote (lot « entity », docs/WORK_SPLIT.md).

   Le lot tient en 7 fichiers :
     entity_state.js   ce fichier : l'hote, les accesseurs, l'etat PRIVE du lot
     entity_views.js   fabriques de HTML (aucun effet de bord)
     entity_panels.js  onglets de la fiche (stats, loot, skills, raw, glossaire)
     entity_ai.js      bloc « AI definition » + animations d'un monstre
     entity_edit.js    tous les cablages d'edition (inputs, Break Point, rename)
     entity.js         openEntity + coque de la fiche + initEntity()
     mass_edit.js      modale « mass edit » sur les resultats de recherche

   AUCUN GLOBAL n'est lu depuis ces modules. Tout passe par l'objet remis a
   initEntity(). C'est la regle qui protege l'etat le plus partage du tool.

   POURQUOI CUR / editing / curTab / DRAFT / NAV RESTENT DANS index.html.
   Ces cinq-la sont lus ET ecrits par du code qui N'EST PAS dans ce lot :
   snapshotCurrent() (pile de navigation), navTo(), navBack(), refresh(),
   la recherche, deleteEntity(), la barre de sauvegarde (syncSaveBar, #sb-save),
   openQuest / openScene, la page Classes... Les rapatrier ici casserait la
   restauration de vue et la sauvegarde EN SILENCE - aucune erreur console,
   juste des ecrans qui ne reviennent plus. On y accede donc par accesseurs :
     getCur/setCur, getCurq/setCurq, getCurs/setCurs,
     getEditing/setEditing, getTab/setTab, getDraft, navLen, getResults.
   DRAFT est un `const {}` jamais reaffecte cote index.html : on le relit a
   chaque fois (H.getDraft()) plutot que d'en garder une reference, pour rester
   correct meme s'il etait un jour remplace.

   CE QUI PART AVEC LE LOT (verifie symbole par symbole au grep) :
   bpSel, bpValSel, neMode, AI_CATALOG n'ont AUCUNE lecture hors de la zone
   extraite - ils vivent donc ici, dans l'objet S. Ils sont ranges dans un objet
   et non en `let` exporte parce qu'un binding importe n'est pas assignable :
   entity_edit.js doit pouvoir ecrire S.bpSel.
   ============================================================================ */

export let H = null;

/* Contrat d'hote attendu (index.html) - tout est obligatoire :
   DOM/format : $ esc enc ICONV iconImg iconMarkup statIcon
   UI         : toast uiConfirm errMessage showOverlay hideOverlay
   droits     : canEditData()
   etat       : getCur setCur getCurq setCurq getCurs setCurs
                getEditing setEditing getTab setTab getDraft navLen getResults
   navigation : pushCurrent navBack refresh
   fiche      : loadVerify loadQuestRefs initServerWatch syncSRVFP syncSaveBar
                renderModelInfo mountModel checkPendingRestart
   modales    : openLocale openCompare openIconBrowser openSpellPicker
                openSpawnPicker openPicker openClassDropPicker editMailReward
   actions    : cloneEntity openRelations deleteEntity gmBtn gmCopy
                removeLoot pushTableToServer removeSkill removeBuff
                removeCountdown removeMailItem removeClassDrop            */
export function setEntityHost(h){ H = h; }

export const cur = () => H.getCur();
export const ed  = () => H.getEditing();
export const tab = () => H.getTab();
export const dr  = () => H.getDraft();

// Etat PRIVE du lot. bpSel/bpValSel = edition en cours du Break Point (null =
// rien de modifie, ce qui n'est PAS la meme chose qu'une liste vide) ;
// neMode = quel champ la modale de renommage edite ; aiCatalog = cache du
// catalogue d'IA (un seul fetch pour toute la session).
export const S = { bpSel:null, bpValSel:null, neMode:'name', aiCatalog:null };

const FN=c=>cur().fields.filter(f=>f.cat===c);
const draftVal=fi=>{const k='field:'+cur().etype+':'+cur().id+':'+fi;return dr()[k]?dr()[k].value:null;};
export { FN, draftVal };
