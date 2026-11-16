/* ============================================================================
   ui/toast.js — transient notifications.

   MOVED from static/index.html:2552-2575 (module block). Behaviour is
   deliberately UNCHANGED (iso-functional refactor):
     • the type is still auto-detected from a leading ✔ / ✗ / ⚠ glyph;
     • the leading glyph is still stripped from the displayed text;
     • the same durations apply (6500 ms for error/warn, 2900 ms otherwise);
     • an unknown type (e.g. the 30 calls that pass 'err' — AUDIT B4) still
       falls back to the 'live' icon and still lands on a CSS class that does
       not exist. That bug is NOT fixed here; it is listed in the audit and
       belongs to the bug-fix wave, not to this refactor.

   The one structural change: the node is now BUILT, not assembled from an HTML
   string. The resulting DOM is the same tree
     <div class="tst TYPE">
       <span class="tst-ic"><img class="ui-icon …"></span>
       <div class="tst-msg">…</div>
       [<button class="tst-act">…</button>]
       <span class="tst-x" title="dismiss">×</span>
     </div>
   but no value passed by a caller can become markup on its way in.

   ⚠ `msg` is TEXT. Passing '<img src=…>' shows the tag literally — that is the
   bug the admin reported (AUDIT B1, index.html:10743, 12257, 12258).
   ============================================================================ */

import { $ } from '../core/dom.js';
import { iconEl } from '../core/icons.js';
import { makeProgress } from '../core/progress.js';

/** type -> icon name in static/icons/icons/24/. Unknown types fall back to 'live'. */
const SLUG = { ok: 'success', success: 'success', warn: 'warning', warning: 'warning', error: 'error', info: 'live' };

/**
 * @param {string} msg   TEXT to display (never markup)
 * @param {string} [type] 'ok' | 'error' | 'warn' | 'info' — auto-detected from
 *                        a leading ✔ / ✗ / ⚠ when omitted
 * @param {object} [opts] {sticky, duration, action:{label, fn}}
 * @returns {{close:Function, el:HTMLElement}}
 */
export function toast(msg, type, opts) {
  opts = opts || {};
  const host = $('#toasts');
  if (!host) return;
  // ⛔ Le remplacement de masse des glyphes par des <img> a frappe ICI aussi : la comparaison portait
  // sur une balise entiere, donc `f === '<img …>'` n'etait JAMAIS vrai et la detection du type « warn »
  // etait morte. On compare de nouveau un CARACTERE a un caractere.
  if (!type) { const im = /^\s*<img[^>]*\/icons\/[^/]+\/\d+\/([a-z0-9_-]+)\.png/i.exec(String(msg || '')); const f = im ? ({ warning: '⚠', error: '✗', success: '✔' })[im[1]] : (msg || '')[0]; type = f === '✔' ? 'ok' : f === '✗' ? 'error' : f === '⚠' ? 'warn' : 'info'; }
  // ⭐ The icon comes from the TYPE and is rendered exactly once, here. Before,
  // every message carried its own leading glyph (422 strings): as many variants
  // to maintain, and a rendering that changed from one machine to the next. The
  // message now carries text only; the illustration is the component's job.
  const el = document.createElement('div');
  el.className = 'tst ' + type;

  const ic = document.createElement('span');
  ic.className = 'tst-ic';
  ic.appendChild(iconEl(SLUG[type] || 'live', 24));

  const texte = String(msg).replace(/<img\b[^>]*>/gi, '').replace(/^\s*[✔✗ℹ⚠]\s*/, '').replace(/\s+/g, ' ').trim();
  // Le MEME message deux fois n'apprend rien et empile la pile jusqu'a masquer l'ecran : enregistrer une
  // config deux fois de suite affichait deux fois les memes avertissements collants. On relance plutot
  // le compte a rebours de celui qui est deja la (2026-08-10).
  /* ⛔ La deduplication ne doit PAS s'appliquer a une notification de PROGRESSION. Deux
     operations longues portant le meme intitule sont deux operations distinctes : reutiliser
     la premiere ferait avancer une seule barre pour deux travaux, et la fermeture de l'une
     emporterait l'autre. */
  if (!opts.progress) {
    const deja = [...host.querySelectorAll('.tst')].find(
      t => !t._closed && t.classList.contains(type) && t.querySelector('.tst-msg') &&
           t.querySelector('.tst-msg').textContent === texte);
    if (deja && deja._reset) return deja._reset();
  }

  const body = document.createElement('div');
  body.className = 'tst-msg';
  body.textContent = texte;

  const x = document.createElement('span');
  x.className = 'tst-x';
  x.title = 'dismiss';
  x.textContent = '×';

  el.appendChild(ic);
  el.appendChild(body);

  let act = null;
  if (opts.action) {
    act = document.createElement('button');
    act.className = 'tst-act';
    // ⛔ Le libelle etait pose en textContent BRUT. Un appelant passant « <img src=…> Reload » voyait
    // donc la balise ECRITE dans le bouton — et comme c'est un seul mot de 200 caracteres, il poussait
    // la colonne du message a ~1 caractere de large : la notification devenait une bande verticale
    // illisible (signale le 2026-08-10). On retire le balisage du texte, et l'icone eventuelle est
    // rendue comme un VRAI element.
    const brut = String(opts.action.label || '');
    const ico = opts.action.icon || (/<img[^>]*\/icons\/[^/]+\/\d+\/([a-z0-9_-]+)\.png/i.exec(brut) || [])[1];
    if (ico) act.appendChild(iconEl(ico, 24));
    const texte = brut.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    act.appendChild(document.createTextNode(ico ? ' ' + texte : texte));
    el.appendChild(act);
  }
  el.appendChild(x);

  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));

  const close = () => {
    if (el._closed) return;
    el._closed = 1;
    clearTimeout(el._t);
    el.classList.remove('in');
    setTimeout(() => el.remove(), 250);
  };
  x.onclick = close;
  if (act) act.onclick = () => { try { opts.action.fn(); } finally { close(); } };

  const dur = opts.sticky ? 0 : (opts.duration || ((type === 'error' || type === 'warn') ? 6500 : 2900));
  if (dur) el._t = setTimeout(close, dur);
  const poignee = { close, el };
  // relance du minuteur quand le meme message revient (cf. la deduplication plus haut)
  el._reset = () => { clearTimeout(el._t); if (dur) el._t = setTimeout(close, dur); return poignee; };
  return poignee;
}

/* ============================================================================
   PROGRESSION — une barre et le temps restant, pour les operations longues.

   Un repack ou une installation affichaient « Repacking the client into the pkg… »
   et rien d'autre, parfois pendant des minutes. Rien ne distinguait « ca avance »
   de « c'est bloque », et il n'y avait aucune raison de le taire : les routes de
   statut renvoient deja `done` / `total`.

   ⛔ PAS DE TEMPS RESTANT. Il y en a eu un ; il sautait encore de 5 a 10 secondes d'un
   instant a l'autre en fin de course, et un chiffre qui danse ne se lit pas — il occupe
   la place de la seule mesure exacte, le pourcentage. Le pourquoi et la condition pour
   le remettre un jour sont dans core/progress.js.
   Total inconnu -> barre INDETERMINEE et aucun pourcentage invente.
   ============================================================================ */

/**
 * Notification COLLANTE portant une barre de progression et le temps restant.
 * @param {string} msg  intitule de l'operation (TEXTE)
 * @returns {{set:Function, done:Function, close:Function, el:HTMLElement}}
 *          set(fait, total, detail) — `total` 0/absent = indetermine
 *          done(msg, type)          — remplace la notification par son resultat
 */
export function progressToast(msg, opts) {
  const h = toast(msg, 'info', Object.assign({ sticky: true, progress: true }, opts || {}));
  if (!h) return { set() {}, done() {}, close() {}, el: null };

  const wrap = document.createElement('div');
  wrap.className = 'tst-prog';
  const bar = document.createElement('div');
  bar.className = 'tst-bar indet';
  const fill = document.createElement('i');
  bar.appendChild(fill);
  const meta = document.createElement('span');
  meta.className = 'tst-eta';
  meta.textContent = 'starting…';
  wrap.appendChild(bar);
  wrap.appendChild(meta);
  const corps = h.el.querySelector('.tst-msg');
  if (corps) corps.appendChild(wrap);

  const suivi = makeProgress();

  const set = (fait, total, detail) => {
    if (h.el._closed) return;
    const e = suivi.push(fait, total);
    if (e.part < 0) {                               /* total inconnu : rien d'invente */
      bar.classList.add('indet');
      meta.textContent = detail ? String(detail) : 'working…';
      return;
    }
    bar.classList.remove('indet');
    fill.style.width = (e.part * 100).toFixed(1) + '%';
    meta.textContent = e.pct + (detail ? ' · ' + detail : '');
  };

  /* On REMPLACE la notification au lieu d'en ouvrir une seconde : laisser une barre
     figee a 100 % a cote du resultat laisse croire qu'une operation tourne encore. */
  const done = (m, type) => { try { h.close(); } catch (e) { /* deja fermee */ } return toast(m, type); };

  return { set, done, close: h.close, el: h.el };
}
