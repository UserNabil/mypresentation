export const COLS = 20;
export const ROWS = 13;
export const START = { x: 4, y: 6 };
export const START_LEN = 3;
const CORRIDOR = { y: 6, from: 1, to: 10 };
export const SPARE = 40;
const MAX_ATTEMPTS = 60;

const TABLE = [
  [6, 5.0, 'none', 0],
  [8, 5.5, 'rocks', 4],
  [10, 6.0, 'bars', 2],
  [10, 6.5, 'cells', 8],
  [12, 7.0, 'room', 1],
  [12, 7.5, 'cells', 12],
  [14, 8.0, 'rooms', 2],
  [14, 8.5, 'cells', 16],
  [16, 9.0, 'rows', 3],
  [16, 9.5, 'cells', 20],
  [18, 10.0, 'cells', 24],
  [20, 10.5, 'cells', 28]
];

export function spec(stage) {
  const n = Math.max(1, Math.floor(Number(stage) || 1));
  if (n <= TABLE.length) {
    const [target, speed, kind, count] = TABLE[n - 1];
    return { stage: n, target, speed, kind, count };
  }
  const extra = n - TABLE.length;
  return {
    stage: n,
    target: 20,
    speed: Math.min(12, 10.5 + 0.25 * extra),
    kind: 'cells',
    count: 28 + 4 * Math.min(2, Math.floor(extra / 2))
  };
}

export const idx = (x, y) => y * COLS + x;
export const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

function between(r, lo, hi) {
  return lo + Math.floor(r() * (hi - lo + 1));
}

function mirror4(x, y) {
  return [[x, y], [COLS - 1 - x, y], [x, ROWS - 1 - y], [COLS - 1 - x, ROWS - 1 - y]];
}

function put(walls, cells) {
  for (const [x, y] of cells) if (inside(x, y)) walls[idx(x, y)] = 1;
}

function scatter(walls, r, count, lo) {
  const base = Math.floor(count / 4);
  const seen = new Set();
  let guard = 0;
  while (seen.size < base && guard++ < 500) {
    const x = between(r, lo.x, 9);
    const y = between(r, lo.y, 5);
    const k = idx(x, y);
    if (seen.has(k)) continue;
    seen.add(k);
    put(walls, mirror4(x, y));
  }
}

function bars(walls, r) {
  const cells = [];
  if (r() < 0.5) {
    const y = between(r, 2, 4);
    const x0 = between(r, 2, 7);
    for (let x = x0; x < x0 + 4; x++) cells.push([x, y]);
  } else {
    const x = between(r, 2, 8);
    const y0 = between(r, 0, 2);
    for (let y = y0; y < y0 + 4; y++) cells.push([x, y]);
  }
  put(walls, cells);
  put(walls, cells.map(([x, y]) => [COLS - 1 - x, ROWS - 1 - y]));
}

function frame(left, right, top, bottom) {
  const midX = Math.floor((left + right) / 2);
  const doorX = new Set([midX, midX + 1]);
  const doorY = new Set([5, 6, 7]);
  const cells = [];
  for (let x = left; x <= right; x++) if (!doorX.has(x)) cells.push([x, top], [x, bottom]);
  for (let y = top; y <= bottom; y++) if (!doorY.has(y)) cells.push([left, y], [right, y]);
  return cells;
}

function room(walls, r) {
  const left = between(r, 4, 6);
  const top = between(r, 2, 3);
  put(walls, frame(left, COLS - 1 - left, top, ROWS - 1 - top));
}

function rooms(walls, r) {
  const left = between(r, 1, 2);
  const right = between(r, 7, 8);
  const top = between(r, 1, 3);
  const cells = frame(left, right, top, ROWS - 1 - top);
  put(walls, cells);
  put(walls, cells.map(([x, y]) => [COLS - 1 - x, y]));
}

function rows(walls, r) {
  for (const y of [2, ROWS - 3]) {
    const gaps = new Set();
    const g = between(r, 2, 7);
    for (const x of [g, g + 1, COLS - 1 - g, COLS - 2 - g]) gaps.add(x);
    for (let x = 1; x < COLS - 1; x++) if (!gaps.has(x)) put(walls, [[x, y]]);
  }
  const gap = between(r, 13, 16);
  for (let x = CORRIDOR.to + 2; x < COLS - 1; x++) if (x !== gap && x !== gap + 1) put(walls, [[x, CORRIDOR.y]]);
}

function layout(sp, r) {
  const walls = new Uint8Array(COLS * ROWS);
  if (sp.kind === 'rocks') scatter(walls, r, sp.count, { x: 2, y: 1 });
  else if (sp.kind === 'cells') scatter(walls, r, sp.count, { x: 0, y: 0 });
  else if (sp.kind === 'bars') bars(walls, r);
  else if (sp.kind === 'room') room(walls, r);
  else if (sp.kind === 'rooms') rooms(walls, r);
  else if (sp.kind === 'rows') rows(walls, r);
  return walls;
}

export function freeCount(walls) {
  let n = 0;
  for (const w of walls) if (!w) n++;
  return n;
}

export function connected(walls) {
  const start = idx(START.x, START.y);
  if (walls[start]) return false;
  const seen = new Uint8Array(walls.length);
  const queue = [start];
  seen[start] = 1;
  let n = 1;
  while (queue.length) {
    const c = queue.pop();
    const x = c % COLS;
    const y = (c - x) / COLS;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny)) continue;
      const k = idx(nx, ny);
      if (walls[k] || seen[k]) continue;
      seen[k] = 1;
      n++;
      queue.push(k);
    }
  }
  return n === freeCount(walls);
}

function neighbours(walls, c) {
  const x = c % COLS;
  const y = (c - x) / COLS;
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (inside(x + dx, y + dy) && !walls[idx(x + dx, y + dy)]) out.push(idx(x + dx, y + dy));
  }
  return out;
}

export function mainBlock(walls) {
  const disc = new Int16Array(COLS * ROWS).fill(-1);
  const low = new Int16Array(COLS * ROWS);
  const edges = [];
  let time = 0;
  let best = new Set();
  function visit(u, parent) {
    disc[u] = low[u] = time++;
    for (const v of neighbours(walls, u)) {
      if (disc[v] < 0) {
        edges.push([u, v]);
        visit(v, u);
        low[u] = Math.min(low[u], low[v]);
        if (low[v] >= disc[u]) {
          const comp = new Set();
          let e;
          do {
            e = edges.pop();
            comp.add(e[0]);
            comp.add(e[1]);
          } while (e[0] !== u || e[1] !== v);
          if (comp.size > best.size) best = comp;
        }
      } else if (v !== parent && disc[v] < disc[u]) {
        edges.push([u, v]);
        low[u] = Math.min(low[u], disc[v]);
      }
    }
  }
  const start = idx(START.x, START.y);
  if (!walls[start]) visit(start, -1);
  const block = new Uint8Array(COLS * ROWS);
  for (const c of best) block[c] = 1;
  return block;
}

export function corridorClear(walls) {
  for (let x = CORRIDOR.from; x <= CORRIDOR.to; x++) if (walls[idx(x, CORRIDOR.y)]) return false;
  return true;
}

export function blockSize(block) {
  let n = 0;
  for (const b of block) n += b;
  return n;
}

function valid(walls, sp) {
  const need = sp.target + START_LEN + SPARE;
  return corridorClear(walls) && connected(walls) && freeCount(walls) >= need && blockSize(mainBlock(walls)) >= need;
}

export function buildArena(stage, rngFor) {
  const sp = spec(stage);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const walls = layout(sp, rngFor(attempt));
    if (valid(walls, sp)) return { spec: sp, walls, attempt, fallback: false };
  }
  return { spec: sp, walls: new Uint8Array(COLS * ROWS), attempt: MAX_ATTEMPTS, fallback: true };
}
