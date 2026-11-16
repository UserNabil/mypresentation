/* ============================================================================
   components.js — the shared render library.

   Every function here returns a DOM Node (or a Promise of a value). None of them
   ever builds markup as a string that a caller could drop into a text field:
   that is precisely the defect the admin reported (AUDIT B1/B2/B5 — an
   `<img src=…>` shown literally because it was assigned to textContent).

   Documented in docs/COMPONENTS.md.

   Styling reuses the classes ALREADY defined in index.html's <style> blocks:
     .sbtn / .sbtn.ghost / .sbtn.xs / .sbtn:disabled      index.html:602-605, 621, 676
     .mini / .mini.gold / .mini:disabled                  index.html:1166-1175
     .hmi                                                 index.html:238
     .spin (12 px spinner, @keyframes sp)                 index.html:679
     .modal / .modal.open / .sheet / .sheet .foot         index.html:606-671
     .fld  (label + input/select)                         index.html:643-662
     .fchip / .fchip.on                                   index.html:257-259
     .empty                                               index.html:362
     .esub                                                index.html:404
   No new CSS rule is introduced by this wave; anything not covered by an
   existing class is set inline on the node.
   ============================================================================ */

import { el, append, clear, frag } from './core/dom.js';
import { iconEl, hasIcon, missingIcons } from './core/icons.js';
import { errMessage } from './core/api.js';
import { toast } from './ui/toast.js';
import { uiConfirm, uiPrompt } from './ui/dialogs.js';

/* ⛔ Les re-exports (toast, missingIcons, hasIcon, uiConfirm, uiPrompt, frag) ont ete RETIRES le
   2026-08-06 : c'etaient de pures indirections, et index.html importe deja ces symboles depuis
   leurs propres modules. Deux chemins d'acces au meme symbole, c'est une occasion de divergence
   pour zero service rendu. Chaque page importe la source. */

/* ═══════════════════════════ icon ═══════════════════════════════════════════ */

/**
 * icon(name, size?, opts?) -> Node. THE only way to render an icon.
 * An unknown name yields a VISIBLE neutral marker and is recorded in
 * missingIcons() / window.__edenMissingIcons. See core/icons.js.
 */
export function icon(name, size = 24, opts) { return iconEl(name, size, opts); }

/* ═══════════════════════════ btn ════════════════════════════════════════════ */

const BTN_CLASS = {
  primary: 'sbtn',
  ghost: 'sbtn ghost',
  xs: 'sbtn xs',
  danger: 'sbtn',            // same shell; tinted below
  mini: 'mini',
  gold: 'mini gold',
  menu: 'hmi',
};

/**
 * Puts a button in its busy state and runs `fn`, restoring the button on
 * SUCCESS AS WELL AS ON ERROR (the `finally` that AUDIT B6 found missing on 10
 * handlers — one of them, index.html:9416, leaves "Pull latest features"
 * disabled for good when the server answers 200 {ok:false}).
 *
 * Works on ANY existing button, so a legacy handler can be fixed without being
 * rewritten:  b.onclick = () => runBusy(b, doTheThing, 'Pulling…')
 *
 * @param {HTMLElement} b
 * @param {Function} fn          may be sync or async; its result is returned
 * @param {string} [busyLabel]   text shown while running (default: keep the label)
 */
export async function runBusy(b, fn, busyLabel) {
  if (!b) return fn();
  if (b._busy) return;                         // re-entrancy guard: no double submit
  b._busy = true;
  const kids = Array.from(b.childNodes);       // keep the real nodes, never innerHTML
  const wasDisabled = b.disabled;
  b.disabled = true;
  b.setAttribute('aria-busy', 'true');
  clear(b);
  append(b, [el('span', { class: 'spin' }), busyLabel || null]);
  if (!busyLabel) kids.forEach(k => b.appendChild(k));
  try {
    return await fn();
  } finally {
    clear(b);
    kids.forEach(k => b.appendChild(k));
    b.disabled = wasDisabled;
    b.removeAttribute('aria-busy');
    b._busy = false;
  }
}

/**
 * btn(opts) -> HTMLButtonElement.
 *
 * @param {object} o
 *   o.label     {string}  text of the button
 *   o.variant   {'primary'|'ghost'|'xs'|'danger'|'mini'|'gold'|'menu'} default 'primary'
 *   o.icon      {string}  icon name (rendered through icon(), never as markup)
 *   o.iconSize  {number}  default 24 for menu/primary, 24 otherwise
 *   o.title     {string}  tooltip
 *   o.disabled  {boolean}
 *   o.busyLabel {string}  text shown while the click handler runs (default: the label)
 *   o.onClick   {Function} sync or async. While it runs the button is disabled
 *                          and shows a spinner; it is restored in a `finally`,
 *                          so an error can never leave it stuck.
 *   o.id / o.class / o.dataset / o.type — passed through
 */
export function btn(o = {}) {
  const b = el('button', {
    class: (BTN_CLASS[o.variant] || BTN_CLASS.primary) + (o.class ? ' ' + o.class : ''),
    type: o.type || 'button',
    id: o.id,
    title: o.title,
    dataset: o.dataset,
    disabled: o.disabled ? true : null,
  });
  if (o.variant === 'danger') b.style.cssText = 'background:linear-gradient(180deg,#d98a8a,#bf3a3a);border-color:#8f2a2a;color:#fff3f0';
  if (o.icon) b.appendChild(icon(o.icon, o.iconSize || 24));
  if (o.label != null && o.label !== '') b.appendChild(document.createTextNode(String(o.label)));
  if (o.onClick) b.onclick = ev => runBusy(b, () => o.onClick(ev), o.busyLabel);
  return b;
}

/* ═══════════════════════════ badge ══════════════════════════════════════════ */

const BADGE_TONE = {
  neutral: 'color:var(--dim);border-color:var(--edge);background:rgba(122,92,30,.08)',
  ok: 'color:#2f5320;border-color:#6f8f4f;background:#dcecca',
  warn: 'color:#8a5a10;border-color:#caa24a;background:#f6e6c0',
  error: 'color:#8f2a2a;border-color:#bf3a3a;background:#fbeae6',
  info: 'color:#2c4a6b;border-color:#5a86b8;background:#dde8f4',
};

/** badge(label, tone?) -> small pill. tone: neutral|ok|warn|error|info */
export function badge(label, tone = 'neutral', opts = {}) {
  const s = el('span', { class: 'ui-badge' + (opts.class ? ' ' + opts.class : ''), title: opts.title });
  s.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font:600 10.5px/1 "Open Sans",sans-serif;'
    + 'padding:3px 8px;border-radius:10px;border:1px solid;white-space:nowrap;'
    + (BADGE_TONE[tone] || BADGE_TONE.neutral);
  if (opts.icon) s.appendChild(icon(opts.icon, 24, { class: 'ui-badge-ic' }));
  s.appendChild(document.createTextNode(String(label == null ? '' : label)));
  return s;
}

/* ═══════════════════════════ card ═══════════════════════════════════════════ */

/**
 * card({title, icon, subtitle, body, actions, class}) -> panel node.
 * `body` and `actions` accept a Node, a string or an array of them.
 */
export function card(o = {}) {
  const head = (o.title != null || o.icon || o.actions)
    ? el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', borderBottom: '1px solid var(--edge)' } },
      o.icon ? icon(o.icon, 24) : null,
      o.title != null ? el('div', { style: { fontFamily: 'Cinzel', fontSize: '13px', fontWeight: '700', color: 'var(--gold2)' } }, String(o.title)) : null,
      o.subtitle ? el('div', { class: 'esub', style: { marginTop: '0', marginLeft: '6px' } }, String(o.subtitle)) : null,
      o.actions ? el('div', { style: { marginLeft: 'auto', display: 'flex', gap: '6px' } }, o.actions) : null)
    : null;
  const c = el('div', { class: 'ui-card' + (o.class ? ' ' + o.class : '') },
    head,
    o.body != null ? el('div', { class: 'ui-card-b', style: { padding: '12px 14px' } }, o.body) : null);
  c.style.cssText = 'border:1px solid var(--edge);border-radius:8px;background:rgba(255,252,242,.55);overflow:hidden';
  return c;
}

/* ═══════════════════════════ emptyState / errorState ════════════════════════ */

/** emptyState({title, hint, icon, action}) -> centred placeholder (.empty). */
export function emptyState(o = {}) {
  return el('div', { class: 'empty', style: { padding: '28px 16px', gap: '8px', display: 'grid', justifyItems: 'center' } },
    o.icon ? icon(o.icon, 48) : null,
    el('div', {}, String(o.title || 'Nothing here')),
    o.hint ? el('div', { class: 'esub', style: { fontFamily: '"Open Sans",sans-serif', letterSpacing: '0' } }, String(o.hint)) : null,
    o.action || null);
}

/**
 * errorState({error, title, onRetry}) -> failure panel.
 * `error` may be an Error, an ApiError or a raw string (ccJSON throws strings —
 * AUDIT B9); errMessage() normalises all three, so the panel never shows
 * "undefined".
 */
export function errorState(o = {}) {
  const msg = errMessage(o.error);
  const d = el('div', { style: { display: 'grid', justifyItems: 'center', gap: '8px', padding: '28px 16px', textAlign: 'center' } },
    icon('error', 48),
    el('div', { style: { fontFamily: 'Cinzel', fontSize: '13px', color: 'var(--crimson)' } }, String(o.title || 'Something went wrong')),
    el('div', { class: 'esub', style: { maxWidth: '520px', wordBreak: 'break-word' } }, msg),
    o.onRetry ? btn({ label: 'Retry', variant: 'mini', icon: 'refresh', busyLabel: 'Retrying…', onClick: o.onRetry }) : null);
  return d;
}

/* ═══════════════════════════ formField ══════════════════════════════════════ */

/**
 * formField(o) -> {node, input, get(), set(v)} using the existing .fld styling.
 *
 *   o.label, o.name, o.value, o.placeholder, o.hint, o.required, o.disabled
 *   o.type: 'text' (default) | 'number' | 'password' | 'textarea' | 'select' | 'checkbox'
 *   o.options: for 'select' — [{value,label}] or ['a','b']
 *   o.onInput / o.onChange: (value, event) => void
 */
export function formField(o = {}) {
  const id = o.id || ('ff-' + Math.random().toString(36).slice(2, 9));
  let input;
  if (o.type === 'textarea') input = el('textarea', { id, name: o.name, placeholder: o.placeholder, rows: o.rows || 4 });
  else if (o.type === 'select') {
    input = el('select', { id, name: o.name });
    for (const opt of (o.options || [])) {
      const v = typeof opt === 'object' ? opt.value : opt;
      const l = typeof opt === 'object' ? (opt.label != null ? opt.label : opt.value) : opt;
      input.appendChild(el('option', { value: v }, String(l)));
    }
  } else input = el('input', { id, name: o.name, type: o.type || 'text', placeholder: o.placeholder });

  if (o.type === 'checkbox') input.checked = !!o.value;
  else if (o.value != null) input.value = o.value;
  if (o.disabled) input.disabled = true;
  if (o.required) input.required = true;

  const read = () => (o.type === 'checkbox' ? input.checked : input.value);
  if (o.onInput) input.addEventListener('input', e => o.onInput(read(), e));
  if (o.onChange) input.addEventListener('change', e => o.onChange(read(), e));

  const node = el('div', { class: 'fld' + (o.class ? ' ' + o.class : '') },
    o.label != null ? el('label', { for: id }, String(o.label) + (o.required ? ' *' : '')) : null,
    input,
    o.hint ? el('div', { class: 'esub' }, String(o.hint)) : null);

  return { node, input, get: read, set: v => { if (o.type === 'checkbox') input.checked = !!v; else input.value = v == null ? '' : v; } };
}

/* ═══════════════════════════ filterBar ══════════════════════════════════════ */

/**
 * filterBar(o) -> {node, setActive(key), value()} — chips + optional search box.
 *
 *   o.chips   [{key,label,count}]  ('' is a legitimate key, used for "All")
 *   o.active  currently selected key
 *   o.onPick  (key) => void
 *   o.search  {placeholder, value, onInput(text)}  optional
 *   o.actions extra nodes pushed to the right
 */
export function filterBar(o = {}) {
  let active = o.active == null ? '' : o.active;
  const chipRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', flex: '1 1 auto' } });
  const chips = new Map();
  for (const c of (o.chips || [])) {
    const key = c.key == null ? '' : c.key;
    const chip = el('span', {
      class: 'fchip' + (key === active ? ' on' : ''),
      style: { cursor: 'pointer', flex: '0 0 auto' },
      dataset: { k: key },
      onclick: () => { setActive(key); if (o.onPick) o.onPick(key); },
    }, String(c.label != null ? c.label : key || 'All') + (c.count != null ? ' (' + c.count + ')' : ''));
    chips.set(key, chip);
    chipRow.appendChild(chip);
  }
  function setActive(k) { active = k; for (const [key, chip] of chips) chip.classList.toggle('on', key === k); }

  let searchInput = null;
  if (o.search) {
    searchInput = el('input', { type: 'search', placeholder: o.search.placeholder || 'Filter…', value: o.search.value || '' });
    searchInput.style.cssText = 'background:#fbf5e3;border:1px solid var(--edge);border-radius:6px;padding:6px 10px;font-family:Spectral,serif;min-width:180px';
    if (o.search.onInput) searchInput.addEventListener('input', () => o.search.onInput(searchInput.value));
  }

  const node = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: '8px 0' } },
    chipRow, searchInput, o.actions ? el('div', { style: { display: 'flex', gap: '6px' } }, o.actions) : null);

  return { node, setActive, value: () => active, search: () => (searchInput ? searchInput.value : '') };
}

/* ═══════════════════════════ dataTable ══════════════════════════════════════ */

/**
 * dataTable(o) -> table node. Replaces the 6 hand-copied tables of AUDIT §2.4;
 * the inline styles below are the ones those 6 copies already used, so a
 * migrated table renders identically.
 *
 *   o.columns [{key, label, align, width, style, class, render(row, i) -> Node|string}]
 *              c.style : styles inline SUPPLEMENTAIRES sur la cellule (pas l'en-tete) —
 *              c'est ce que les 6 copies faisaient colonne par colonne (monospace, nowrap…).
 *              c.class : classe posee SUR LA CELLULE. Deux des copies mettaient `class="esub"`
 *              sur le <td> ; `.esub` porte font-size:13px, donc deplacer la classe dans un
 *              <span> a l'interieur aurait change la taille du texte.
 *              c.headStyle : styles inline sur SON en-tete (la 6e copie ne mettait un padding
 *              que sur la premiere colonne).
 *              c.title(row, i) -> infobulle posee sur la cellule. Sur le <td>, pas sur un
 *              <span> interieur : la copie d'origine la donnait a toute la cellule, y compris
 *              sa partie vide.
 *   o.rows    array of records
 *   o.empty   Node|string shown instead of the table when rows is empty
 *   o.onRowClick (row, i, ev) => void
 *   o.rowClass  (row, i) => string
 *   o.head / o.cell / o.rowStyle : surcharges de style pour th / td / tr. Necessaires
 *              parce que la 6e copie (journal, index.html) n'a JAMAIS eu l'habillage des
 *              5 autres : en-tete sans fond, filets en pointilles. Migrer sans ces trois
 *              crochets aurait change ce que l'admin voit.
 *   o.max     hard cap on rendered rows (a "+N more" line is appended)
 *
 * Les valeurs par defaut ci-dessous sont celles des 5 copies majoritaires
 * (padding 6px 8px, en-tete rgba(122,92,30,.12), filet var(--line,#e2d4b0)) : une table
 * migree rend donc a l'identique, ce qui est verifiable a l'ecran.
 */
export function dataTable(o = {}) {
  const rows = o.rows || [], cols = o.columns || [];
  if (!rows.length) return typeof o.empty === 'string' || o.empty == null
    ? emptyState({ title: o.empty || 'No rows' })
    : o.empty;

  const t = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } });
  const thead = el('thead');
  const htr = el('tr');
  for (const c of cols) {
    const th = el('th', { style: Object.assign({ textAlign: c.align || 'left', background: 'rgba(122,92,30,.12)', padding: '6px 8px' }, o.head, c.headStyle) }, String(c.label != null ? c.label : c.key));
    if (c.width) th.style.width = c.width;
    htr.appendChild(th);
  }
  thead.appendChild(htr);
  t.appendChild(thead);

  const tbody = el('tbody');
  const shown = o.max ? rows.slice(0, o.max) : rows;
  shown.forEach((row, i) => {
    const tr = el('tr', { class: o.rowClass ? o.rowClass(row, i) : null,
      style: Object.assign({ borderTop: '1px solid var(--line,#e2d4b0)' }, o.rowStyle) });
    if (o.onRowClick) { tr.style.cursor = 'pointer'; tr.onclick = ev => o.onRowClick(row, i, ev); }
    for (const c of cols) {
      const td = el('td', { class: c.class || null, title: c.title ? c.title(row, i) : null,
        style: Object.assign({ padding: '6px 8px' }, c.align ? { textAlign: c.align } : null, o.cell, c.style) });
      const v = c.render ? c.render(row, i) : row[c.key];
      append(td, v == null ? '' : v);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);

  if (o.max && rows.length > o.max) {
    const more = el('tfoot', {}, el('tr', {}, el('td', { colspan: String(cols.length), style: { padding: '6px 7px', color: 'var(--faint)', fontSize: '11px' } },
      '… ' + (rows.length - o.max) + ' more — refine the filter.')));
    t.appendChild(more);
  }
  return t;
}

/* ═══════════════════════════ dialogues ══════════════════════════════════════
   ⛔ modal() et confirmDialog() ONT ETE SUPPRIMES d'ici le 2026-08-06.

   Ce fichier portait une seconde implementation du meme concept que ui/dialogs.js.
   Deux implementations concurrentes d'un dialogue, c'est deux comportements de
   fermeture, deux gestions du clavier et deux pieges a corriger separement.

   ui/dialogs.js survit, pour trois raisons verifiables :
     • il est CABLE et eprouve (uiConfirm/uiConflict/uiPrompt/initDialogs sont
       importes par index.html et servent deja) ; modal() n'avait aucun appelant ;
     • il s'appuie sur les modales THEMEES deja presentes dans la page
       (#confirmModal…), donc ce que l'utilisateur voit ne change pas ;
     • il gere deja Echap et Entree sur `.modal.open`.
   confirmDialog() n'etait qu'une indirection d'une ligne vers uiConfirm : la
   supprimer retire un intermediaire, pas une fonctionnalite.

   Decision et motif : docs/DECISIONS.md.
   ═══════════════════════════════════════════════════════════════════════════ */


