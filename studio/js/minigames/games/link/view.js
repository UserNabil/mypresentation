const SVG = 'http://www.w3.org/2000/svg';
const GAP = 4;

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

export function createView(ctx, onPick) {
  const root = el('div', 'mg-bl-field');
  const tilesEl = el('div', 'mg-bl-tiles');
  tilesEl.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'mg-bl-path');
  svg.setAttribute('aria-hidden', 'true');
  const grid = el('div', 'mg-bl-grid');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Field');
  root.append(tilesEl, svg, grid);

  let board = null;
  let keys = [];
  let buttons = [];
  let tiles = new Map();
  let cursor = 0;
  let sel = -1;
  let hintPair = null;
  let T = 56;
  let M = 32;
  let W = 0;
  let H = 0;

  const entry = t => ctx.roster.byKey[keys[t]];
  const nameOf = t => { const e = entry(t); return e ? e.name : 'Beast'; };
  const colOf = i => i % board.cols;
  const rowOf = i => Math.floor(i / board.cols);
  const left = x => M + x * (T + GAP);
  const cx = x => (x < 0 ? M / 2 : x >= board.cols ? W - M / 2 : left(x) + T / 2);
  const cy = y => (y < 0 ? M / 2 : y >= board.rows ? H - M / 2 : left(y) + T / 2);

  function label(i) {
    const pos = 'row ' + (rowOf(i) + 1) + ', column ' + (colOf(i) + 1);
    const t = board.cells[i];
    if (t < 0) return 'Empty, ' + pos;
    return nameOf(t) + (i === sel ? ', selected' : '') + ', ' + pos;
  }

  function fit() {
    const { w, h } = ctx.size();
    if (!board || !w || !h) return;
    const cap = board.cols >= 12 ? 56 : board.cols >= 8 ? 76 : 88;
    let t = cap;
    const size = s => {
      const m = Math.round(s / 2) + GAP;
      return [board.cols * s + (board.cols - 1) * GAP + 2 * m, board.rows * s + (board.rows - 1) * GAP + 2 * m, m];
    };
    while (t > 24) {
      const [fw, fh] = size(t);
      if (fw <= w && fh <= h) break;
      t -= 1;
    }
    const [fw, fh, m] = size(t);
    T = t;
    M = m;
    W = fw;
    H = fh;
    root.style.width = W + 'px';
    root.style.height = H + 'px';
    root.style.setProperty('--mg-bl-t', T + 'px');
    root.style.setProperty('--mg-bl-m', M + 'px');
    root.style.setProperty('--mg-bl-cols', String(board.cols));
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    const art = T - Math.max(8, Math.round(T / 7));
    for (const tile of tiles.values()) {
      const a = tile.querySelector('.mg-art');
      if (a) a.style.setProperty('--mg-art', art + 'px');
    }
    place(false);
  }

  function makeTile(id, t) {
    const tile = el('div', 'mg-bl-tile');
    tile.dataset.id = String(id);
    const inner = el('span', 'mg-bl-in');
    inner.appendChild(ctx.iconEl(entry(t), T - Math.max(8, Math.round(T / 7))));
    tile.appendChild(inner);
    tile.dataset.t = String(t);
    return tile;
  }

  function place(animate) {
    root.classList.toggle('is-still', !animate);
    board.ids.forEach((id, i) => {
      if (id < 0) return;
      const tile = tiles.get(id);
      if (!tile) return;
      tile.style.transform = 'translate(' + left(colOf(i)) + 'px, ' + left(rowOf(i)) + 'px)';
    });
    if (!animate) {
      void root.offsetWidth;
      root.classList.remove('is-still');
    }
  }

  function decorate() {
    const selId = sel >= 0 ? board.ids[sel] : -1;
    const hintIds = hintPair ? hintPair.map(i => board.ids[i]) : [];
    for (const [id, tile] of tiles) {
      tile.classList.toggle('is-sel', id === selId);
      tile.classList.toggle('is-hint', hintIds.includes(id));
    }
    buttons.forEach((b, i) => {
      b.setAttribute('aria-label', label(i));
      b.classList.toggle('is-empty', board.cells[i] < 0);
      b.setAttribute('aria-selected', i === sel ? 'true' : 'false');
    });
  }

  function build(next, typeKeys) {
    board = next;
    keys = typeKeys;
    cursor = 0;
    sel = -1;
    hintPair = null;
    tilesEl.replaceChildren();
    svg.replaceChildren();
    grid.replaceChildren();
    tiles = new Map();
    buttons = [];
    board.ids.forEach((id, i) => {
      if (id < 0) return;
      const tile = makeTile(id, board.cells[i]);
      tiles.set(id, tile);
      tilesEl.appendChild(tile);
    });
    for (let y = 0; y < board.rows; y++) {
      const row = el('div', 'mg-bl-row');
      row.setAttribute('role', 'row');
      for (let x = 0; x < board.cols; x++) {
        const i = y * board.cols + x;
        const b = el('button', 'mg-bl-cell');
        b.type = 'button';
        b.tabIndex = i === cursor ? 0 : -1;
        b.dataset.i = String(i);
        b.setAttribute('role', 'gridcell');
        b.addEventListener('click', () => {
          setCursor(i, false);
          onPick(i);
        });
        buttons.push(b);
        row.appendChild(b);
      }
      grid.appendChild(row);
    }
    if (root.parentNode !== ctx.board) ctx.board.replaceChildren(root);
    fit();
    decorate();
  }

  function setCursor(i, move = true) {
    if (!buttons[i]) return;
    if (buttons[cursor]) buttons[cursor].tabIndex = -1;
    cursor = i;
    buttons[i].tabIndex = 0;
    if (move) buttons[i].focus({ preventScroll: true });
  }

  function retrigger(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function drawPath(pts) {
    const line = document.createElementNS(SVG, 'polyline');
    line.setAttribute('points', pts.map(([x, y]) => cx(x) + ',' + cy(y)).join(' '));
    line.setAttribute('class', 'mg-bl-line');
    line.style.strokeWidth = String(Math.max(3, Math.round(T / 12)));
    const g = document.createElementNS(SVG, 'g');
    g.appendChild(line);
    for (const p of [pts[0], pts[pts.length - 1]]) {
      const c = document.createElementNS(SVG, 'circle');
      c.setAttribute('cx', String(cx(p[0])));
      c.setAttribute('cy', String(cy(p[1])));
      c.setAttribute('r', String(Math.max(4, Math.round(T / 9))));
      c.setAttribute('class', 'mg-bl-dot');
      g.appendChild(c);
    }
    svg.appendChild(g);
    return g;
  }

  return {
    build,
    layout: fit,
    setCursor,
    move(dx, dy) {
      const x = Math.min(board.cols - 1, Math.max(0, colOf(cursor) + dx));
      const y = Math.min(board.rows - 1, Math.max(0, rowOf(cursor) + dy));
      setCursor(y * board.cols + x);
    },
    focusCurrent() { setCursor(cursor); },
    cursor: () => cursor,
    inGrid: () => grid.contains(document.activeElement),
    select(i) {
      sel = i;
      decorate();
    },
    hint(pair) {
      hintPair = pair;
      decorate();
      for (const i of pair || []) {
        const tile = tiles.get(board.ids[i]);
        if (tile) retrigger(tile, 'is-hint');
      }
    },
    bad(pair) {
      for (const i of pair) {
        const tile = tiles.get(board.ids[i]);
        if (!tile) continue;
        retrigger(tile, 'is-bad');
        clearTimeout(tile._bad);
        tile._bad = ctx.later(() => tile.classList.remove('is-bad'), 420);
      }
    },
    link(pts, ids, ms) {
      const g = drawPath(pts);
      for (const id of ids) {
        const tile = tiles.get(id);
        if (!tile) continue;
        tiles.delete(id);
        tile.classList.add('is-gone');
        ctx.later(() => tile.remove(), ctx.reducedMotion() ? 0 : 200);
      }
      ctx.later(() => g.remove(), ms);
    },
    sync(animate) {
      sel = -1;
      hintPair = null;
      place(animate && !ctx.reducedMotion());
      decorate();
    },
    retype() {
      for (const [id, tile] of tiles) {
        const i = board.ids.indexOf(id);
        if (i < 0) continue;
        const t = board.cells[i];
        if (tile.dataset.t === String(t)) continue;
        const inner = tile.querySelector('.mg-bl-in');
        inner.replaceChildren(ctx.iconEl(entry(t), T - Math.max(8, Math.round(T / 7))));
        tile.dataset.t = String(t);
      }
      sel = -1;
      hintPair = null;
      decorate();
      if (!ctx.reducedMotion()) retrigger(root, 'is-shuffled');
    },
    tileSize: () => T,
    clear() {
      root.replaceChildren(tilesEl, svg, grid);
      tilesEl.replaceChildren();
      svg.replaceChildren();
      grid.replaceChildren();
      tiles = new Map();
      buttons = [];
    }
  };
}
