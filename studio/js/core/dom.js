/* ============================================================================
   core/dom.js — DOM helpers and HTML escaping.

   EXTRACTED VERBATIM from static/index.html (module block) — see docs/DECISIONS.md.
     $      was index.html:2524
     enc    was index.html:2524
     esc    was index.html:2528
     cssCol was index.html:2549
   The four implementations below are byte-for-byte the originals: this file is a
   MOVE, not a rewrite. Anything added after them is new and marked as such.

   ⚠ This module holds NO state. Import it from anywhere, any number of times.
   ============================================================================ */

/* ---- moved as-is ---------------------------------------------------------- */

/** querySelector, short form. Returns the first match or null. */
export const $ = s => document.querySelector(s);

/** encodeURIComponent, short form (used in every URL built by hand). */
export const enc = encodeURIComponent;

/** Escapes & < > " for safe interpolation inside an HTML string.
    ⚠ Does NOT escape the single quote: only use it inside double-quoted
    attributes or in text position, exactly as the original did. */
export const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Validates a CSS colour (hex / rgb(a) / name) before injecting it into a
    style attribute -> anti-XSS. Falls back to the parchment gold. */
export const cssCol = c => { c = String(c == null ? '' : c); return /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d.,\s%]+\)$|^[a-zA-Z]{1,20}$/.test(c) ? c : '#9a6a2b'; };

/* ---- new (nothing in index.html uses these yet) ---------------------------- */

/** querySelectorAll as a real Array. */
const $$   /* pas encore d'appelant : reexporte des qu'une page l'utilise */ = (s, root) => Array.from((root || document).querySelectorAll(s));

/** Builds an element. This is the ONLY sanctioned way to produce markup in new
    code: it never goes through innerHTML, so a value can never become markup.
      el('div', {class:'row', title:'x'}, 'text', otherNode)
    - `attrs.class` / `className`  -> class attribute
    - `attrs.style` (object)       -> individual style properties
    - `attrs.dataset` (object)     -> data-* attributes
    - `attrs.on` (object)          -> addEventListener per key
    - any other key                -> setAttribute, EXCEPT function values which
                                      are assigned as properties (onclick, …)
    - children: string | Node | array | null/false/undefined (skipped) */
export function el(tag, attrs, ...children) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') n.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(n.dataset, v);
    else if (k === 'on' && typeof v === 'object') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else if (typeof v === 'function') n[k] = v;
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  append(n, children);
  return n;
}

/** Appends children (string | Node | nested arrays); ignores null/false. */
export function append(parent, children) {
  for (const c of (Array.isArray(children) ? children : [children])) {
    if (c == null || c === false || c === '') continue;
    if (Array.isArray(c)) append(parent, c);
    else parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return parent;
}

/** Empties a node without innerHTML=''. */
export function clear(node) { if (node) while (node.firstChild) node.removeChild(node.firstChild); return node; }

/** Replaces a node's children in one go. */
function mount   /* pas encore d'appelant : reexporte des qu'une page l'utilise */(node, children) { clear(node); append(node, children); return node; }

/** DocumentFragment from a list of children. */
export function frag(children) { return append(document.createDocumentFragment(), children); }
