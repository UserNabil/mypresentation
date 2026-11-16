/* ============================================================================
   FAVORIS — les pages que CHAQUE utilisateur epingle pour lui.

   Stockage LOCAL (par navigateur, par compte) et volontairement pas cote
   serveur : c'est une preference d'affichage, pas une donnee de jeu. Une panne
   du serveur ou un changement d'environnement ne doit pas vider la rangee.

   La clef contient le nom d'utilisateur : deux personnes qui se relaient sur le
   meme poste ne se marchent pas dessus.
   ============================================================================ */

import { DEFAULT_FAVORITES } from './tree.js';

const PREFIX = 'eden.favorites.';
const MAX = 12;                 /* au-dela, la rangee ne tient plus sur une ligne */

function key(user) { return PREFIX + (user || '_anon'); }

/** Les clefs de feuilles epinglees, dans l'ordre choisi par l'utilisateur.
    Jamais epingle quoi que ce soit -> la selection par defaut. */
export function getFavorites(user) {
  try {
    const raw = localStorage.getItem(key(user));
    if (raw == null) return DEFAULT_FAVORITES.slice();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string').slice(0, MAX) : [];
  } catch (e) { return DEFAULT_FAVORITES.slice(); }
}

/** Epingle / desepingle. Renvoie le nouvel etat (true = epingle).
    Au-dela de MAX on refuse EN SILENCE cote etat mais on renvoie false : c'est
    a l'appelant de le dire a l'utilisateur (le rail affiche un toast). */
export function toggleFavorite(user, k) {
  const list = getFavorites(user);
  const i = list.indexOf(k);
  if (i >= 0) list.splice(i, 1);
  else if (list.length >= MAX) return false;
  else list.push(k);
  try { localStorage.setItem(key(user), JSON.stringify(list)); } catch (e) { /* quota : tant pis */ }
  return i < 0;
}

export function favoritesFull(user) { return getFavorites(user).length >= MAX; }
