/* ============================================================================
   pages/card_duel_render.js — Card Duel page: a card drawn like in game (same
   parts and reference rectangles as features/card_duel/client/code/
   card_duel_layout.h, pictures of client/assets/source), the 3x3 board and the
   small shared helpers of the page.
   ============================================================================ */

import { el, clear, append } from '../core/dom.js';

export const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const RARITY_FILE = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
export const SKILL_HELP = {
  pierce: 'Pierce: also captures when its side EQUALS the facing side.',
  combo: 'Combo: every card it captures attacks its own neighbours at once (chain).',
  fortify: 'Fortify: +1 to every side when it defends.',
  drain: 'Drain: each card it captures costs the loser extra duel HP.',
  rally: 'Rally: +1 to every side of your cards next to it when it is laid.',
  terror: 'Terror: -1 to every side of the enemy cards next to it when it is laid.',
};
export const ELEMENT_BEATS = { Fire: 'Nature', Nature: 'Earth', Earth: 'Lightning', Lightning: 'Steel', Steel: 'Ice',
  Ice: 'Fire', Light: 'Dark', Dark: 'Light' };

const A = n => '/api/cardduel/asset/' + n;
const img = (src, cls) => el('img', { src, class: cls, alt: '', draggable: 'false', loading: 'lazy',
  on: { error: e => { e.target.style.visibility = 'hidden'; } } });

function artUrl(c, override) {
  if (override) return override;
  if (c.art_url) return c.art_url;
  return A('portrait_' + String(c.element || 'steel').toLowerCase() + '.png');
}

/** cardNode(card, {width, owner, sides, base, art, pick, flash, title}) -> in-game looking card. */
export function cardNode(c, o = {}) {
  const r = Math.max(0, Math.min(5, c.rarity | 0));
  const sides = o.sides || c.sides || [0, 0, 0, 0];
  const base = o.base || c.sides || sides;
  const n = el('div', { class: 'cd-card' + (o.pick ? ' pick' : '') + (o.flash ? ' flash' : ''),
    title: o.title || cardTitle(c), dataset: { id: String(c.id) } });
  if (o.width) { n.style.width = o.width + 'px'; n.style.setProperty('--cdw', o.width + 'px'); }
  n.appendChild(img(artUrl(c, o.art), 'art'));
  n.appendChild(img(A('card_frame_' + RARITY_FILE[r] + '.png'), 'frame'));
  n.appendChild(img(A('card_info_panel.png'), 'panel'));
  n.appendChild(img(A('element_' + String(c.element || 'steel').toLowerCase() + '.png'), 'elem'));
  n.appendChild(img(A('quality_gem_' + RARITY_FILE[r] + '.png'), 'gem'));
  const stars = el('div', { class: 'stars' });
  for (let k = 0; k <= r; k++) stars.appendChild(img(A('star.png'), ''));
  n.appendChild(stars);
  n.appendChild(el('div', { class: 'name' }, c.name || ('#' + c.id)));
  ['N', 'E', 'S', 'W'].forEach((d, k) => {
    const v = sides[k];
    const cls = v > base[k] ? ' up' : (v < base[k] ? ' down' : '');
    n.appendChild(el('div', { class: 'sd s' + d + cls }, v >= 10 ? 'A' : String(v)));
  });
  if (o.owner === 0 || o.owner === 1) n.appendChild(el('div', { class: 'own p' + o.owner }));
  return n;
}

function cardTitle(c) {
  const s = c.sides || [];
  return (c.name || '') + ' (#' + c.id + ')\n' + RARITY[c.rarity | 0] + ' ' + (c.kind || '') + ', ' + (c.element || '')
    + ', level ' + (c.level == null ? '?' : c.level) + '\nN ' + s[0] + '  E ' + s[1] + '  S ' + s[2] + '  W ' + s[3]
    + ((c.skills || []).length ? '\n' + c.skills.map(k => SKILL_HELP[k] || k).join('\n') : '');
}

export function chip(text, cls, title) { return el('span', { class: 'cd-chip' + (cls ? ' ' + cls : ''), title }, text); }

export function sidesText(s) { return (s || []).map(v => (v >= 10 ? 'A' : String(v))).join(' '); }

/** board(state, cards, {armed, onCell, flash}) -> 3x3 grid; cells are laid out N row first (0 1 2 / 3 4 5 / 6 7 8). */
export function boardNode(state, cards, o = {}) {
  const g = el('div', { class: 'cd-board' });
  (state.board || []).forEach((p, cell) => {
    const free = !p;
    const c = el('div', { class: 'cd-cell' + (free ? ' free' : '') + (free && o.armed ? ' armed' : ''),
      title: free ? 'Cell ' + cell : '' });
    if (p) {
      const card = cards[p.id] || { id: p.id, name: '#' + p.id, sides: p.sides, rarity: 0, element: 'Steel' };
      c.appendChild(cardNode(card, { owner: p.owner, sides: p.sides, base: card.sides, width: 108,
        flash: o.flash && o.flash.has(cell),
        title: cardTitle(card) + '\nOwner: ' + 'AB'[p.owner] + ', laid by ' + 'AB'[p.origin] + (p.mod ? '\nModifier ' + (p.mod > 0 ? '+' : '') + p.mod : '') }));
    } else if (o.armed && o.onCell) {
      c.onclick = () => o.onCell(cell);
    }
    g.appendChild(c);
  });
  return g;
}

export function winBar(w, d, l) {
  const t = Math.max(1, w + d + l);
  const b = el('div', { class: 'cd-bar', title: 'won ' + w + ', draw ' + d + ', lost ' + l });
  b.appendChild(el('div', { class: 'w', style: { left: '0', width: (100 * w / t) + '%' } }));
  b.appendChild(el('div', { class: 'd', style: { left: (100 * w / t) + '%', width: (100 * d / t) + '%' } }));
  b.appendChild(el('div', { class: 'l', style: { left: (100 * (w + d) / t) + '%', width: (100 * l / t) + '%' } }));
  return b;
}

export function pct(a, b) { return b ? (100 * a / b).toFixed(1) + ' %' : '-'; }

export function note(kind, ...kids) { return el('div', { class: 'cd-note ' + kind }, el('span', {}, ...kids)); }

export function download(url) {
  const a = el('a', { href: url, download: '' });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function put(node, ...kids) { clear(node); append(node, kids); return node; }
