/* ============================================================================
   USAGE — ce que CETTE personne ouvre le plus souvent, sur CE poste.

   Sert a « Quick actions » du Dashboard : au lieu de six raccourcis graves dans
   le code et identiques pour tout le monde, la liste remonte ce qui est
   REELLEMENT utilise. Un admin qui vit dans Features et Monster AI ne veut pas
   « Create NPC » en tete de son ecran d'accueil.

   ⛔ FRECENCE, PAS UN SIMPLE COMPTEUR. Un compteur brut fige la liste : ce qu'on
   a beaucoup utilise il y a six mois ecrase pour toujours ce qu'on ouvre tous
   les jours depuis. Le score DECROIT donc avec le temps (demi-vie 14 jours) :
       a l'usage    score = score * 2^(-jours/14) + 1
       a la lecture score * 2^(-jours/14)
   Deux champs par entree, aucune liste d'evenements a purger, et un score qui
   tend vers zero tout seul quand on arrete de s'en servir.

   ⛔ STOCKAGE LOCAL, comme les favoris — c'est une preference d'affichage, pas
   une donnee de jeu. Ce n'est PAS de la telemetrie : rien ne quitte le poste, et
   la clef porte le nom du compte pour que deux personnes qui se relaient sur la
   meme machine ne melangent pas leurs habitudes.

   ⚠️ La distinction avec les FAVORIS est volontaire : un favori est EXPLICITE
   (on epingle), l'usage est IMPLICITE (on observe). Melanger les deux ferait
   disparaitre une page epinglee le jour ou on ne l'ouvre pas assez.
   ============================================================================ */

const PREFIX = 'eden.usage.';
const HALFLIFE_DAYS = 14;
const MAX_KEYS = 60;              /* au-dela on oublie les scores les plus faibles */
const DAY = 86400000;

function key(user) { return PREFIX + (user || '_anon'); }

function read(user) {
  try {
    const raw = localStorage.getItem(key(user));
    if (!raw) return {};
    const o = JSON.parse(raw);
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) { return {}; }
}

function write(user, o) {
  try { localStorage.setItem(key(user), JSON.stringify(o)); } catch (e) { /* quota : tant pis */ }
}

/** Score amorti a l'instant present. */
function decayed(rec, now) {
  if (!rec || typeof rec.s !== 'number') return 0;
  const days = Math.max(0, (now - (rec.t || now)) / DAY);
  return rec.s * Math.pow(2, -days / HALFLIFE_DAYS);
}

/** A appeler quand l'utilisateur DECLENCHE quelque chose. Silencieux par nature :
    aucun appel ne doit pouvoir faire echouer l'action qu'il mesure. */
export function recordUse(user, k) {
  if (!k) return;
  try {
    const now = Date.now();
    const o = read(user);
    o[k] = { s: decayed(o[k], now) + 1, t: now };
    /* Garde-fou : le magasin ne grandit pas indefiniment. On ne coupe que sur les
       scores DEJA amortis, donc on jette ce qui est a la fois rare et ancien. */
    const ks = Object.keys(o);
    if (ks.length > MAX_KEYS) {
      ks.sort((a, b) => decayed(o[b], now) - decayed(o[a], now))
        .slice(MAX_KEYS).forEach(x => { delete o[x]; });
    }
    write(user, o);
  } catch (e) { /* jamais bloquant */ }
}

/** Les clefs connues, de la plus utilisee a la moins utilisee.
    `min` ecarte le bruit : une page ouverte UNE fois par curiosite il y a trois
    semaines a un score infime et n'a rien a faire dans les raccourcis. */
export function rankedUses(user, min = 0.35) {
  const now = Date.now();
  const o = read(user);
  return Object.keys(o)
    .map(k => ({ k, score: decayed(o[k], now) }))
    .filter(x => x.score >= min)
    .sort((a, b) => b.score - a.score);
}

/** Vrai tant qu'on n'a pas de quoi personnaliser honnetement. */
export function usageIsThin(user, need = 3) { return rankedUses(user).length < need; }

export function clearUsage(user) {
  try { localStorage.removeItem(key(user)); } catch (e) { /* prive */ }
}
