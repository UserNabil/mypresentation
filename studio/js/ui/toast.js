import { $ } from '../core/dom.js';
import { iconEl } from '../core/icons.js';
import { makeProgress } from '../core/progress.js';
import { MORE_MS, normType, normOpts, duration, clean, splitMessage, plan, moreLabel, countLabel } from './toast_policy.js';
import { addLocal } from './notif_local.js';

const SLUG = { ok: 'success', warn: 'warning', error: 'error', info: 'live' };
const STACK = [];
let moreCount = 0;
let moreTimer = 0;

function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  } catch (e) {
    return Promise.reject(e);
  }
  return Promise.reject(new Error('clipboard unavailable'));
}

function button(label, cls, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.onclick = (ev) => {
    ev.stopPropagation();
    fn(b);
  };
  return b;
}

function renderMore(host) {
  let chip = host.querySelector('#tst-more');
  if (moreCount <= 0) {
    if (chip) chip.remove();
    return;
  }
  if (!chip) {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'tst-more';
    chip.className = 'tst-more';
    chip.onclick = () => {
      moreCount = 0;
      renderMore(host);
      const b = document.getElementById('btn-notif');
      if (b) b.click();
    };
  }
  chip.textContent = moreLabel(moreCount);
  host.appendChild(chip);
  clearTimeout(moreTimer);
  moreTimer = setTimeout(() => {
    moreCount = 0;
    renderMore(host);
  }, MORE_MS);
}

let beeOkAt = 0;
function beeSignal(type, text) {
  let kind = '';
  if (type === 'error') kind = 'error';
  else if (type === 'ok' && /deploy|publish|release|push/i.test(text) && Date.now() - beeOkAt > 4000) {
    kind = 'happy';
    beeOkAt = Date.now();
  }
  if (kind) window.dispatchEvent(new CustomEvent('eden:bee', { detail: kind }));
}

export function toast(msg, type, o) {
  const opts = normOpts(o);
  const host = $('#toasts');
  if (!host) return;
  if (!type) {
    const im = /^\s*<img[^>]*\/icons\/[^/]+\/\d+\/([a-z0-9_-]+)\.png/i.exec(String(msg || ''));
    const f = im ? { warning: '⚠', error: '✗', success: '✔' }[im[1]] : (msg || '')[0];
    type = f === '✔' ? 'ok' : f === '✗' ? 'error' : f === '⚠' ? 'warn' : 'info';
  }
  type = normType(type);
  const text = clean(msg);
  beeSignal(type, text);
  const now = Date.now();
  const entry = { type, text, progress: !!opts.progress, sticky: !!opts.sticky || type === 'error', closed: false, last: now, count: 1 };
  const verdict = plan(STACK, entry, now);

  if (verdict.kind === 'merge') {
    const e = STACK[verdict.index];
    e.count += 1;
    e.last = now;
    e.el._badge(e.count);
    return e.el._reset();
  }
  if (verdict.kind === 'overflow') {
    const parts = splitMessage(msg, opts.details);
    addLocal({ title: parts.title, body: parts.details, severity: type });
    moreCount += 1;
    renderMore(host);
    return { close() {}, el: null };
  }

  const parts = splitMessage(msg, opts.details);
  const el = document.createElement('div');
  el.className = 'tst ' + type;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const ic = document.createElement('span');
  ic.className = 'tst-ic';
  ic.appendChild(iconEl(type === 'info' && !opts.progress ? 'info' : (SLUG[type] || 'live'), 24));

  const body = document.createElement('div');
  body.className = 'tst-msg';
  const head = document.createElement('div');
  head.className = 'tst-t';
  const label = document.createElement('span');
  label.className = 'tst-tx';
  label.textContent = parts.title;
  const badge = document.createElement('span');
  badge.className = 'tst-n';
  badge.hidden = true;
  head.appendChild(label);
  head.appendChild(badge);
  body.appendChild(head);

  let det = null;
  const btns = document.createElement('div');
  btns.className = 'tst-btns';
  if (parts.details) {
    det = document.createElement('pre');
    det.className = 'tst-det';
    det.hidden = true;
    det.textContent = parts.details;
    body.appendChild(det);
    btns.appendChild(button('Details', 'tst-b', (b) => {
      det.hidden = !det.hidden;
      b.textContent = det.hidden ? 'Details' : 'Hide details';
    }));
    btns.appendChild(button('Copy details', 'tst-b', (b) => {
      copyText(parts.details).then(() => { b.textContent = 'Copied'; }, () => { b.textContent = 'Copy failed'; });
      setTimeout(() => { b.textContent = 'Copy details'; }, 1600);
    }));
  }
  if (typeof opts.retry === 'function') {
    btns.appendChild(button('Retry', 'tst-b tst-retry', () => {
      try {
        opts.retry();
      } finally {
        close();
      }
    }));
  }
  if (btns.childNodes.length) body.appendChild(btns);

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
    const brut = String(opts.action.label || '');
    const ico = opts.action.icon || (/<img[^>]*\/icons\/[^/]+\/\d+\/([a-z0-9_-]+)\.png/i.exec(brut) || [])[1];
    if (ico) act.appendChild(iconEl(ico, 24));
    const lab = brut.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    act.appendChild(document.createTextNode(ico ? ' ' + lab : lab));
    el.appendChild(act);
  }
  el.appendChild(x);

  host.insertBefore(el, host.querySelector('#tst-more'));
  requestAnimationFrame(() => el.classList.add('in'));

  const close = () => {
    if (entry.closed) return;
    entry.closed = true;
    el._closed = 1;
    clearTimeout(el._t);
    el.classList.remove('in');
    setTimeout(() => {
      el.remove();
      const i = STACK.indexOf(entry);
      if (i >= 0) STACK.splice(i, 1);
    }, 250);
  };
  x.onclick = close;
  if (act) act.onclick = () => { try { opts.action.fn(); } finally { close(); } };

  const dur = duration(type, opts);
  if (dur) el._t = setTimeout(close, dur);
  const poignee = { close, el };
  el._reset = () => { clearTimeout(el._t); if (dur) el._t = setTimeout(close, dur); return poignee; };
  el._badge = (n) => {
    badge.hidden = n < 2;
    badge.textContent = countLabel(n);
  };
  entry.el = el;
  STACK.push(entry);
  return poignee;
}

export function toastStack() {
  return STACK.filter((e) => !e.closed).map((e) => ({ type: e.type, text: e.text, count: e.count }));
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
