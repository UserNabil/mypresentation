import { lineIcon } from '/studio/js/ui/line_icons.js';
import { COLS, ROWS } from './levels.js';

const MAX_CELL = 48;
const SIDE_W = 184;
const SIDE_GAP = 20;
const ROT = { right: 0, down: 90, left: 180, up: 270 };

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

export function createView(ctx) {
  const wrap = el('div', 'mg-pp-wrap');
  const arena = el('div', 'mg-pp-arena');
  arena.setAttribute('aria-hidden', 'true');
  const field = el('div', 'mg-pp-field');
  const hint = el('div', 'mg-pp-hint');
  const bump = el('div', 'mg-pp-bump');
  arena.append(field, bump, hint);
  const side = el('aside', 'mg-pp-side');
  wrap.append(arena, side);
  let st = null;
  let cell = 40;
  let showSide = true;
  let segEls = new Map();
  let petEl = null;
  let petKey = '';
  const sideEls = {};

  function sideRow(id, icon, label) {
    const row = el('div', 'mg-pp-row');
    const ic = el('span', 'mg-pp-row-ic', lineIcon(icon, 16));
    const t = el('div', 'mg-pp-row-t');
    const l = el('span', 'mg-pp-row-l');
    l.textContent = label;
    const v = el('b', 'mg-pp-row-v');
    t.append(l, v);
    row.append(ic, t);
    sideEls[id] = { row, v };
    return row;
  }

  function buildSide() {
    side.replaceChildren();
    const goal = el('div', 'mg-pp-goal');
    const gl = el('span', 'mg-pp-goal-l');
    gl.textContent = 'Stage goal';
    const gv = el('b', 'mg-pp-goal-v');
    const bar = el('div', 'mg-pp-bar');
    const fill = el('span', 'mg-pp-bar-f');
    bar.appendChild(fill);
    goal.append(gl, gv, bar);
    sideEls.goal = { v: gv, fill };
    const lead = el('div', 'mg-pp-lead');
    const ll = el('span', 'mg-pp-goal-l');
    ll.textContent = 'Lead pet';
    const lw = el('div', 'mg-pp-lead-w');
    const ln = el('b', 'mg-pp-lead-n');
    lead.append(ll, lw);
    sideEls.lead = { box: lw, name: ln };
    side.append(goal, lead, sideRow('brake', 'gauge', 'Brake'), sideRow('shield', 'shield', 'Shield'),
      sideRow('bonus', 'star', 'Bonus pet'), sideRow('speed', 'footprints', 'Pace'));
  }

  function place(node, x, y) {
    node.style.transform = 'translate(' + x * cell + 'px,' + y * cell + 'px)';
  }

  function seg(s, head) {
    const n = el('div', 'mg-pp-seg' + (head ? ' is-head' : ''));
    const entry = ctx.roster.byKey[s.key];
    n.appendChild(ctx.iconEl(entry, Math.round(cell * (head ? 0.92 : 0.8))));
    if (head) {
      n.appendChild(el('span', 'mg-pp-dir', lineIcon('chevron-right', 14)));
      n.appendChild(el('span', 'mg-pp-guard', lineIcon('shield', 12)));
    }
    place(n, s.x, s.y);
    return n;
  }

  function layout() {
    const { w, h } = ctx.size();
    if (!w || !h) return;
    showSide = w >= 760;
    const room = showSide ? w - SIDE_W - SIDE_GAP : w;
    cell = Math.max(12, Math.floor(Math.min(MAX_CELL, (room - 4) / COLS, (h - 4) / ROWS)));
    wrap.classList.toggle('no-side', !showSide);
    wrap.style.setProperty('--mg-pp-cell', cell + 'px');
    arena.style.width = cell * COLS + 'px';
    arena.style.height = cell * ROWS + 'px';
    side.style.height = cell * ROWS + 'px';
    const home = showSide ? side : arena;
    if (hint.parentNode !== home) home.appendChild(hint);
    if (st) drawAll();
  }

  function drawRocks() {
    for (const r of field.querySelectorAll('.mg-pp-rock')) r.remove();
    const frag = document.createDocumentFragment();
    for (let k = 0; k < st.walls.length; k++) {
      if (!st.walls[k]) continue;
      const r = el('div', 'mg-pp-rock');
      const x = k % COLS;
      place(r, x, (k - x) / COLS);
      frag.appendChild(r);
    }
    field.prepend(frag);
  }

  function drawPet() {
    const p = st.pet;
    if (!p) {
      if (petEl) petEl.remove();
      petEl = null;
      petKey = '';
      return;
    }
    const key = p.n + ':' + p.key;
    if (!petEl || petKey !== key) {
      if (petEl) petEl.remove();
      petEl = el('div', 'mg-pp-pet' + (p.bonus ? ' is-bonus' : ''));
      petEl.appendChild(ctx.iconEl(ctx.roster.byKey[p.key], Math.round(cell * 0.8)));
      if (p.bonus) {
        petEl.appendChild(el('span', 'mg-pp-star', lineIcon('star', 12)));
        petEl.appendChild(el('span', 'mg-pp-ttl', '<i></i>'));
      }
      petKey = key;
      field.appendChild(petEl);
    }
    place(petEl, p.x, p.y);
    if (p.bonus) petEl.style.setProperty('--mg-pp-ttl', String(Math.max(0, p.ttl) / 30));
  }

  function drawLine() {
    const keep = new Set();
    st.line.forEach((s, i) => {
      keep.add(s.id);
      let n = segEls.get(s.id);
      if (!n) {
        n = seg(s, i === 0);
        segEls.set(s.id, n);
        field.appendChild(n);
      } else place(n, s.x, s.y);
      n.style.zIndex = String(200 - Math.min(i, 150));
      if (i === 0) n.style.setProperty('--mg-pp-rot', ROT[st.queue[0] || st.dir] + 'deg');
    });
    for (const [id, n] of segEls) {
      if (!keep.has(id)) {
        n.remove();
        segEls.delete(id);
      }
    }
  }

  function mark(x, y, soft) {
    bump.classList.remove('is-on', 'is-soft');
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    void bump.offsetWidth;
    bump.classList.add('is-on');
    bump.classList.toggle('is-soft', soft);
    place(bump, x, y);
  }

  function drawAll() {
    for (const n of segEls.values()) n.remove();
    segEls = new Map();
    if (petEl) petEl.remove();
    petEl = null;
    arena.classList.add('is-snap');
    drawRocks();
    drawLine();
    drawPet();
    void arena.offsetWidth;
    arena.classList.remove('is-snap');
  }

  return {
    build(state, info) {
      st = state;
      arena.classList.remove('is-crash', 'is-brake', 'is-guard');
      bump.classList.remove('is-on');
      if (wrap.parentNode !== ctx.board) ctx.board.replaceChildren(wrap);
      buildSide();
      const lead = ctx.roster.byKey[info.lead];
      sideEls.lead.box.replaceChildren(ctx.iconEl(lead, 36), sideEls.lead.name);
      sideEls.lead.name.textContent = lead ? lead.name : info.lead;
      layout();
    },
    layout,
    frame() {
      drawLine();
      drawPet();
    },
    step(ms) {
      arena.style.setProperty('--mg-pp-step', Math.round(ms) + 'ms');
    },
    still(on) {
      arena.classList.toggle('is-still', !!on);
    },
    hint(text, tone) {
      hint.replaceChildren();
      hint.className = 'mg-pp-hint' + (text ? ' is-on' : '') + (tone ? ' is-' + tone : '');
      if (!text) return;
      for (const part of text) {
        if (part.kbd) {
          const k = document.createElement('kbd');
          k.textContent = part.kbd;
          hint.appendChild(k);
        } else hint.appendChild(document.createTextNode(part));
      }
    },
    crash(x, y) {
      arena.classList.add('is-crash');
      mark(x, y, false);
    },
    bump(x, y) {
      mark(x, y, true);
      ctx.later(() => bump.classList.remove('is-on', 'is-soft'), 900);
    },
    flags(f) {
      arena.classList.toggle('is-brake', !!f.brake);
      arena.classList.toggle('is-guard', !!f.guard);
    },
    side(v) {
      if (!sideEls.goal) return;
      sideEls.goal.v.textContent = v.collected + ' of ' + v.target + ' pets';
      sideEls.goal.fill.style.width = Math.round(100 * Math.min(1, v.collected / v.target)) + '%';
      for (const id of ['brake', 'shield', 'bonus', 'speed']) {
        const s = sideEls[id];
        s.v.textContent = v[id].text;
        s.row.className = 'mg-pp-row' + (v[id].tone ? ' is-' + v[id].tone : '');
      }
    },
    cell: () => cell,
    clear() {
      wrap.remove();
      segEls = new Map();
      petEl = null;
      st = null;
    }
  };
}
