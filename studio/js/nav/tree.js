/* ============================================================================
   LE PLAN DE NAVIGATION — la seule source de verite pour le rail de gauche.

   Avant : 17 icones dans le header + 2 menus deroulants + 32 pastilles de filtre
   dans le panneau de recherche. Trois endroits differents, aucun groupement, et
   la moitie des pages ne se trouvaient qu'en connaissant leur icone par coeur.

   Ici : 6 familles, decrites une seule fois. Le rail les dessine, le Dashboard y
   pioche ses favoris et ses actions rapides, et le futur Global Search s'en
   servira pour dire OU vit un resultat. Ajouter une page = ajouter UNE ligne.

   Chaque feuille porte :
     k     identifiant stable (clef des favoris en stockage local — NE PAS renommer)
     label libelle affiche (ANGLAIS : c'est la langue de l'outil)
     icon  nom de fichier sous /icons/icons/<taille>/<icon>.png
     act   ce qu'il faut declencher :
             'home'          -> le Dashboard
             'type:<t>'      -> panneau de recherche cadre sur ce type d'entite
             'fn:<nom>'      -> une fonction de l'application (voir ctx.fn du rail)
             'btn:<id>'      -> on clique un bouton d'en-tete deja cable
     perm  clef de permission (can(...)) ; absente = visible par tout le monde
   ============================================================================ */

export const NAV_TREE = [

  { k: 'dashboard', top: true, label: 'Dashboard', icon: 'home', act: 'home' },

  /* ---------------------------------------------------------------- CONTENT
     Tout ce qui CREE du contenu de jeu. Ces entrees cadrent le panneau de
     recherche sur un type : c'est le meme moteur qu'avant, mais on n'a plus a
     deviner laquelle des 32 pastilles correspond a « Storybook ». */
  { k: 'content', label: 'Content', icon: 'content', kids: [
    { k: 'creatures',    label: 'Creatures',    icon: 'creatures',  act: 'type:monster' },
    { k: 'items',        label: 'Items',        icon: 'bag',        act: 'type:item' },
    { k: 'npcs',         label: 'NPCs',         icon: 'party',      act: 'type:npc' },
  ]},

  /* --------------------------------------------------------------- GAMEPLAY
     Tout ce qui modifie les MECANIQUES. Classes et Equipment ont leur propre
     page ; le reste passe par le panneau de recherche. */
  { k: 'gameplay', label: 'Gameplay', icon: 'operations', kids: [
    { k: 'gamesys',    label: 'Game systems',    icon: 'chip',              act: 'btn:btn-gamesystems', archived: true },
    { k: 'classes',    label: 'Classes',          icon: 'classes',      act: 'fn:openClasses' },
    { k: 'shopcurrency', label: 'Shop Currencies', icon: 'gold',        act: 'fn:openShopCurrency', perm: 'shopcurrency.manage' },
    { k: 'cardduel',   label: 'Card Duel',        icon: 'dice',         act: 'fn:openCardDuel',  perm: 'cardduel.view' },
    // Vue d'ensemble : l'objet au centre, ses satellites autour (sets, paliers, teintes,
    // prefixes). « Sets & Equip » reste : il sert a editer un record champ par champ ;
    // celle-ci sert a COMPRENDRE ce que ces champs veulent dire.
    { k: 'equipment',  label: 'Equipment',        icon: 'links',        act: 'fn:openEquipment', archived: true },
    { k: 'sets',       label: 'Sets & Equip',     icon: 'links',        act: 'type:equipset', archived: true },
  ]},

  /* ------------------------------------------------------------- AI & TOOLS */
  { k: 'ai', label: 'AI & Tools', icon: 'ai_definition', archived: true, kids: [
    { k: 'altar',     label: 'Altar Editor',      icon: 'altar',         act: 'btn:btn-altar' },
  ]},

  /* ------------------------------------------------------------- PRODUCTION
     Ce qui SORT du tool et touche un serveur ou un client. */
  { k: 'production', label: 'Production', icon: 'deploy_to_server', kids: [
    { k: 'deploy',       label: 'Client Deploy',   icon: 'client_deploy',  act: 'btn:btn-clientdeploy', perm: 'deploy', archived: true },
    { k: 'cdnaudit',     label: 'CDN Audit',       icon: 'network',        act: 'fn:openCdnAudit',      perm: 'deploy.client', archived: true },
    { k: 'community',    label: 'Community',       icon: 'community',      act: 'btn:btn-community',    perm: 'emoji.cdn', archived: true },
    { k: 'emojicdn',     label: 'Chat Emojis',     icon: 'image',          act: 'fn:openEmojiCdn',      perm: 'emoji.cdn' },
    { k: 'polls',        label: 'Polls',           icon: 'megaphone',      act: 'fn:openPolls',         perm: 'polls.view' },
    { k: 'rollback',     label: 'Changelog & Rollback', icon: 'changelog', act: 'btn:btn-changes',      perm: 'rollback', archived: true },
    { k: 'snapshots',    label: 'Snapshots',       icon: 'snapshots',      act: 'btn:btn-snapshots',    perm: 'rollback', archived: true },
    { k: 'requests',     label: 'Altar Requests',  icon: 'altar_requests', act: 'fn:openRequests',      perm: 'altar.review' },
  ]},

  /* --------------------------------------------------------- ADMINISTRATION */
  { k: 'admin', label: 'Administration', icon: 'game_staff', kids: [
    { k: 'people',    label: 'People',              icon: 'accounts',       act: 'btn:btn-people',   perm: 'accounts.manage', archived: true },
    { k: 'accounts',  label: 'Accounts & Roles',    icon: 'accounts',       act: 'fn:openAccounts',  perm: 'accounts.manage' },
    { k: 'pageaccess', label: 'Page Access',        icon: 'accounts',       act: 'fn:openPageAccess', perm: 'accounts.manage' },
    { k: 'sexrace',   label: 'Sex / Race Change',   icon: 'sex_race',       act: 'fn:openSexRace',   perm: 'char.sexrace', archived: true },
    { k: 'health',    label: 'Health',              icon: 'bug',            act: 'btn:btn-health',   perm: 'crashes.view', archived: true },
    { k: 'crashes',   label: 'Crashes',             icon: 'bug',            act: 'fn:openCrashes',   perm: 'crashes.view' },
    { k: 'perf',      label: 'Performance',         icon: 'stat_speed',     act: 'fn:openPerf',      perm: 'perf.view' },
    { k: 'diag',      label: 'Diagnostics',         icon: 'search',         act: 'btn:btn-diag',     perm: 'rollback', archived: true },
    { k: 'options',   label: 'Options',             icon: 'options',        act: 'btn:btn-settings', perm: 'rollback' },
  ]},
];

/* ============================ ACTIONS DE LA BARRE DU HAUT ====================
   Ces cinq-la ne sont PLUS dans le rail : ce sont des ACTIONS, pas des pages —
   on les declenche en passant, sans quitter ce qu'on fait. Elles vivent apres le
   bouton Reglages, et se replient dans un menu « … » quand la fenetre retrecit.

   ⛔ Elles restent decrites ici, et pas dans la barre : le Dashboard pointe
   dessus par leur clef (`nav:'packaging'`, `nav:'restart'`). Si la barre les
   possedait, ces raccourcis-la tomberaient en silence. Une seule source.

   `act:'btn:<id>'` -> on clique le bouton d'en-tete deja cable. Ces boutons sont
   masques visuellement (css/shell.css) mais TOUJOURS dans le document : les
   retirer casserait Restart, Launch, Packaging, GM commands et Features. */
export const HEADER_ACTIONS = [
  { k: 'altar',     label: 'Altar Editor',   icon: 'altar',          act: 'btn:btn-altar' },
  { k: 'gmcmds',    label: 'GM Commands',    icon: 'gm_commands',    act: 'btn:btn-gmcmds' },
  { k: 'restart',   label: 'Restart Server', icon: 'restart_server', act: 'btn:btn-restart',  perm: 'server.restart' },
  { k: 'launch',    label: 'Launch Client',  icon: 'launch_game',    act: 'btn:btn-launch',   perm: 'launch' },
  { k: 'features',  label: 'Features',       icon: 'feature',        act: 'btn:btn-features' },
];

/* Les favoris proposes a quelqu'un qui n'a encore rien epingle. Choisis parmi ce
   que TOUT LE MONDE peut ouvrir : un favori par defaut masque par les
   permissions donnerait une rangee vide au premier demarrage. */
export const DEFAULT_FAVORITES = ['creatures', 'items', 'npcs', 'classes', 'altar'];

/* Table plate {k -> feuille}, avec le nom de sa famille : utile au rail (page
   courante), au Dashboard (favoris) et plus tard au Global Search. */
export function flatNav() {
  const out = {};
  /* Les actions de la barre du haut restent joignables par clef : le Dashboard les
     epingle et les cite dans ses actions rapides. */
  for (const a of HEADER_ACTIONS) out[a.k] = { ...a, family: null, familyLabel: 'Actions' };
  for (const fam of NAV_TREE) {
    if (fam.archived) continue;
    if (fam.top) { out[fam.k] = { ...fam, family: null, familyLabel: '' }; continue; }
    for (const leaf of (fam.kids || [])) {
      if (leaf.archived) continue;
      out[leaf.k] = { ...leaf, family: fam.k, familyLabel: fam.label };
    }
  }
  return out;
}

import('../pages/people_island.js').then(m => m.peopleNavInit(NAV_TREE)).catch(() => {});
import('../pages/health_island.js').then(m => m.healthNavInit(NAV_TREE)).catch(() => {});
import('../pages/options_island.js').then(m => m.optionsNavInit(NAV_TREE)).catch(() => {});
import('../pages/community_island.js').then(m => m.communityNavInit(NAV_TREE)).catch(() => {});
import('../pages/gamesystems_island.js').then(m => m.gamesystemsNavInit(NAV_TREE)).catch(() => {});
