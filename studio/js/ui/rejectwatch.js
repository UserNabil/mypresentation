/* ============================================================================
   ui/rejectwatch.js — PLUS AUCUN ECHEC MUET.

   Une fonction `async` qui leve ne jette PAS dans son appelant : elle rend une
   promesse REJETEE. Si personne n'y attache de `.catch()`, l'erreur n'apparait
   NI a l'ecran, NI dans `window.onerror`. Le bouton ne fait simplement rien.

   C'est arrive deux fois le 2026-08-14, et les deux fois le diagnostic a coute
   plus cher que la correction :
     * « Accounts & Roles » ne s'ouvrait pas, sans un mot — openAccounts() levait
       sur « Response body is already used » ;
     * la page Equipment partait chercher /api/entity/undefined/undefined.

   Le rail attrape desormais les rejets des pages qu'il ouvre (nav/rail.js), mais
   il n'est PAS le seul chemin : le menu utilisateur, les boutons d'en-tete et
   chaque gestionnaire de clic d'une page ont le meme angle mort. Ce filet est
   donc pose au niveau de la fenetre, une fois pour toutes.

   ⛔ CE N'EST PAS UN RATTRAPAGE D'ERREUR : rien n'est repare ni avale ici. On
   REND VISIBLE, c'est tout. Un defaut qu'on voit se corrige ; un defaut muet se
   paie en heures de recherche.

   Trois filtres, chacun pour une raison precise :
     * `AbortError` — une requete annulee est une DECISION (une recherche plus
       recente a pris la main). L'annoncer comme un incident serait un mensonge.
     * meme message dans les 8 s — une boucle de rendu qui echoue produirait des
       dizaines de bandeaux identiques et masquerait tout le reste.
     * avant le demarrage — le filet de secours du <head> traite deja ce cas, et
       il sait, lui, proposer un rechargement.
   ============================================================================ */

const FENETRE_MS = 8000;
const vus = new Map();

export function initRejectWatch(toast) {
  window.addEventListener('unhandledrejection', ev => {
    const r = ev && ev.reason;
    if (r && (r.name === 'AbortError' || r.code === 20)) return;

    const msg = String((r && r.message) || r || '').trim().slice(0, 220);
    if (!msg || msg === 'undefined' || msg === 'null') return;

    const now = Date.now();
    if (now - (vus.get(msg) || 0) < FENETRE_MS) return;
    vus.set(msg, now);

    /* La console garde la PILE — la seule chose qui donne la ligne fautive. Le
       bandeau, lui, ne porte que le message : une pile dans un toast est illisible. */
    console.error('[unhandled rejection]', r);
    let ou = '';
    try {
      const m = String((r && r.stack) || '').match(/([A-Za-z0-9_.-]+\.js[^\s)]*)/);
      if (m) ou = ' [' + m[1].replace(/^.*\//, '') + ']';
    } catch (e) { /* sans pile */ }
    try { toast('Something failed silently — ' + msg + ou, 'err', 7000); } catch (e) { /* dernier recours */ }
  });
}
