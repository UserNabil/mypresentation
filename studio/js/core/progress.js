/* ============================================================================
   core/progress.js — L'AVANCEMENT D'UNE OPERATION LONGUE, EN POURCENTAGE.

   ⛔ IL Y AVAIT UN TEMPS RESTANT ICI. IL A ETE RETIRE, ET C'EST DELIBERE.
   Meme lisse et meme refuse tant qu'il ne valait rien, il sautait encore de 5 a
   10 secondes d'un instant a l'autre en fin de course (signale a l'ecran le
   2026-08-18). Un chiffre qui danse ne se lit pas : on finit par l'ignorer, et
   il occupe la place de la seule mesure EXACTE dont on dispose — le pourcentage.
   Ne pas le remettre sans avoir d'abord une vraie mesure de debit cote serveur
   (octets traites / octets totaux) ; le nombre de FICHIERS ne suffit pas, ils
   vont de 200 octets a 40 Mo et le rythme change du tout au tout en cours de
   route. C'est exactement pour ca que l'estimation dansait.

   Ce qui reste, et qui est vrai :
     * le pourcentage, calcule sur ce que le serveur annonce ;
     * ⚠️ le total peut GRANDIR en cours de route (le serveur decouvre du
       travail) : on garde le MAXIMUM vu, sinon la barre RECULE — et une barre
       qui recule se lit comme une panne ;
     * total inconnu (0) -> `part = -1`, a l'appelant d'afficher une barre
       indeterminee. Afficher « 0 % » sur un travail qui avance serait faux.
   ============================================================================ */

/** Suivi a etat. `push(fait, total)` -> { part, pct, done, total }.
    `part` vaut -1 quand le total est inconnu ; `pct` est alors ''. */
export function makeProgress() {
  let maxTotal = 0;
  return {
    push(fait, total) {
      fait = Math.max(0, Number(fait) || 0);
      maxTotal = Math.max(maxTotal, Math.max(0, Number(total) || 0));
      if (!maxTotal) return { part: -1, pct: '', done: fait, total: 0 };
      const part = Math.min(1, fait / maxTotal);
      return { part, pct: Math.round(part * 100) + '%', done: fait, total: maxTotal };
    },
  };
}
