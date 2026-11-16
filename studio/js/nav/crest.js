/* ============================================================================
   L'ICONE DE COMPTE = LE PERSONNAGE.

   Un membre du staff est un joueur : son avatar dans l'outil montre la RACE et le
   SEXE de son personnage tague ([GM]/[CM]/[GS]), comme il se voit en jeu. Le
   Super-Admin n'existe pas en jeu (aucun tag [SA]) — il a une icone dediee.

   Fichiers : /icons/race_icons/<taille>/<nom>.png
     human_male · human_female · halfkin_male · halfkin_female
     zumi · anuran · ursun · turtle · super_admin

   ⚠ La resolution passe par le pont SSH+psql du serveur de jeu : c'est LENT, et le
   flux d'activite en demande une douzaine a chaque rafraichissement. On ne demande
   donc JAMAIS un compte a la fois : `loadCrests()` les groupe en un seul appel, et
   garde le resultat en memoire pour la duree de la page. Un compte sans personnage
   (compte local) n'a pas d'icone : on retombe sur ses initiales, on n'invente pas
   une race.
   ============================================================================ */

import { esc } from '../core/dom.js';
import { avatarHtml } from '../ui/line_assets.js';
import { modernOn } from '../ui/modern_gate.js';

const SIZES = [64, 256];
const CACHE = new Map();          /* compte -> {crest, character, race_id, gender_id} | null */
const ENCOURS = new Map();        /* compte -> Promise, pour ne pas demander deux fois */

/** Charge (et memorise) les icones des comptes donnes. Renvoie la table complete.
    Les comptes deja connus ne repartent pas au serveur. */
export async function loadCrests(accounts) {
  const veut = [...new Set((accounts || []).map(a => String(a || '').trim()).filter(Boolean))];
  const aDemander = veut.filter(a => !CACHE.has(a) && !ENCOURS.has(a));
  if (aDemander.length) {
    const p = fetch('/api/auth/crests?accounts=' + encodeURIComponent(aDemander.join(',')))
      .then(r => r.json())
      .then(j => {
        const got = (j && j.crests) || {};
        /* On memorise AUSSI l'absence (null) : sinon un compte local relancerait la
           requete lente a chaque rendu du flux, indefiniment. */
        for (const a of aDemander) CACHE.set(a, got[a] || null);
      })
      .catch(() => { for (const a of aDemander) CACHE.set(a, null); })
      .finally(() => { for (const a of aDemander) ENCOURS.delete(a); });
    for (const a of aDemander) ENCOURS.set(a, p);
  }
  await Promise.all(veut.map(a => ENCOURS.get(a)).filter(Boolean));
  const out = {};
  for (const a of veut) out[a] = CACHE.get(a) || null;
  return out;
}

/** Ce qu'on sait deja d'un compte, sans rien demander (null si inconnu). */
export function crestOf(account) { return CACHE.get(String(account || '').trim()) || null; }

/** Le balisage de l'avatar. `info` = une entree de loadCrests(), ou null.
    Sans icone connue : pastille aux initiales — jamais une race choisie au hasard. */
export function crestMarkup(account, info, size, role) {
  const px = size || 28;
  if (modernOn()) {
    const t = info && info.character ? `${account} — ${info.character}` : String(account || '');
    return avatarHtml({ size: px, crest: info && info.crest, account, role, title: t });
  }
  const src = SIZES.reduce((a, b) => (Math.abs(b - px * 2) < Math.abs(a - px * 2) ? b : a));
  const nom = info && info.crest;
  if (!nom) {
    return `<span class="fd-av" title="${esc(account || '')}">${esc(String(account || '?').slice(0, 2).toUpperCase())}</span>`;
  }
  const t = info.character ? `${account} — ${info.character}` : String(account || '');
  return `<img class="fd-av crest-img" src="/studio/icons/race_icons/${src}/${esc(nom)}.png"
    width="${px}" height="${px}" alt="" title="${esc(t)}" loading="lazy">`;
}
