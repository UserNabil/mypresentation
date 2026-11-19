const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function makeBoard(cols, rows, gravity = 'none', cells = null) {
  const n = cols * rows;
  const c = cells ? cells.slice() : new Array(n).fill(-1);
  return { cols, rows, gravity, cells: c, ids: c.map((v, i) => (v >= 0 ? i : -1)) };
}

export function cloneBoard(b) {
  return { cols: b.cols, rows: b.rows, gravity: b.gravity, cells: b.cells.slice(), ids: b.ids.slice() };
}

function open(b, x, y) {
  if (x < 0 || y < 0 || x >= b.cols || y >= b.rows) return x >= -1 && y >= -1 && x <= b.cols && y <= b.rows;
  return b.cells[y * b.cols + x] < 0;
}

function clearRow(b, y, x1, x2) {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  for (let x = lo + 1; x < hi; x++) if (!open(b, x, y)) return false;
  return true;
}

function clearCol(b, x, y1, y2) {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  for (let y = lo + 1; y < hi; y++) if (!open(b, x, y)) return false;
  return true;
}

function length(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
  return s;
}

export function findPath(b, a, c) {
  if (a === c || a < 0 || c < 0) return null;
  const ax = a % b.cols;
  const ay = Math.floor(a / b.cols);
  const cx = c % b.cols;
  const cy = Math.floor(c / b.cols);
  if (ay === cy && clearRow(b, ay, ax, cx)) return [[ax, ay], [cx, cy]];
  if (ax === cx && clearCol(b, ax, ay, cy)) return [[ax, ay], [cx, cy]];
  let best = null;
  const keep = pts => { if (!best || length(pts) < length(best)) best = pts; };
  if (ax !== cx && ay !== cy) {
    if (open(b, cx, ay) && clearRow(b, ay, ax, cx) && clearCol(b, cx, ay, cy)) keep([[ax, ay], [cx, ay], [cx, cy]]);
    if (open(b, ax, cy) && clearCol(b, ax, ay, cy) && clearRow(b, cy, ax, cx)) keep([[ax, ay], [ax, cy], [cx, cy]]);
    if (best) return best;
  }
  if (ay !== cy) {
    for (let x = -1; x <= b.cols; x++) {
      if (x === ax || x === cx) continue;
      if (open(b, x, ay) && open(b, x, cy) && clearRow(b, ay, ax, x) && clearCol(b, x, ay, cy) && clearRow(b, cy, x, cx)) {
        keep([[ax, ay], [x, ay], [x, cy], [cx, cy]]);
      }
    }
  }
  if (ax !== cx) {
    for (let y = -1; y <= b.rows; y++) {
      if (y === ay || y === cy) continue;
      if (open(b, ax, y) && open(b, cx, y) && clearCol(b, ax, ay, y) && clearRow(b, y, ax, cx) && clearCol(b, cx, y, cy)) {
        keep([[ax, ay], [ax, y], [cx, y], [cx, cy]]);
      }
    }
  }
  return best;
}

function turns(pts) {
  return pts ? pts.length - 2 : -1;
}

export function reach(b, a) {
  const W = b.cols + 2;
  const H = b.rows + 2;
  const best = new Int8Array(W * H * 4).fill(9);
  const out = new Set();
  const ax = a % b.cols;
  const ay = Math.floor(a / b.cols);
  const queue = [];
  const visit = (x, y, d, t) => {
    if (x < -1 || y < -1 || x > b.cols || y > b.rows) return;
    const inside = x >= 0 && y >= 0 && x < b.cols && y < b.rows;
    if (inside && b.cells[y * b.cols + x] >= 0) {
      if (x !== ax || y !== ay) out.add(y * b.cols + x);
      return;
    }
    const k = ((y + 1) * W + (x + 1)) * 4 + d;
    if (best[k] <= t) return;
    best[k] = t;
    queue.push(x, y, d, t);
  };
  for (let d = 0; d < 4; d++) visit(ax + DIRS[d][0], ay + DIRS[d][1], d, 0);
  for (let q = 0; q < queue.length; q += 4) {
    const x = queue[q];
    const y = queue[q + 1];
    const d = queue[q + 2];
    const t = queue[q + 3];
    for (let d2 = 0; d2 < 4; d2++) {
      if (d2 === (d + 2) % 4) continue;
      const t2 = t + (d2 === d ? 0 : 1);
      if (t2 > 2) continue;
      visit(x + DIRS[d2][0], y + DIRS[d2][1], d2, t2);
    }
  }
  return [...out];
}

function lines(b) {
  const { cols, rows, gravity } = b;
  const out = [];
  const col = (x, from, to) => {
    const l = [];
    const step = from <= to ? 1 : -1;
    for (let y = from; y !== to + step; y += step) l.push(y * cols + x);
    return l;
  };
  const row = (y, from, to) => {
    const l = [];
    const step = from <= to ? 1 : -1;
    for (let x = from; x !== to + step; x += step) l.push(y * cols + x);
    return l;
  };
  if (gravity === 'down') for (let x = 0; x < cols; x++) out.push(col(x, rows - 1, 0));
  else if (gravity === 'up') for (let x = 0; x < cols; x++) out.push(col(x, 0, rows - 1));
  else if (gravity === 'left') for (let y = 0; y < rows; y++) out.push(row(y, 0, cols - 1));
  else if (gravity === 'right') for (let y = 0; y < rows; y++) out.push(row(y, cols - 1, 0));
  else if (gravity === 'center') {
    const h = Math.floor(rows / 2);
    for (let x = 0; x < cols; x++) {
      out.push(col(x, h - 1, 0));
      out.push(col(x, h, rows - 1));
    }
  }
  return out;
}

export function settle(b) {
  const moved = [];
  for (const line of lines(b)) {
    let w = 0;
    for (let r = 0; r < line.length; r++) {
      const from = line[r];
      if (b.cells[from] < 0) continue;
      const to = line[w++];
      if (to === from) continue;
      b.cells[to] = b.cells[from];
      b.ids[to] = b.ids[from];
      b.cells[from] = -1;
      b.ids[from] = -1;
      moved.push([from, to]);
    }
  }
  return moved;
}

export function removePair(b, a, c) {
  b.cells[a] = -1;
  b.cells[c] = -1;
  b.ids[a] = -1;
  b.ids[c] = -1;
  return settle(b);
}

export function groups(b) {
  const g = new Map();
  b.cells.forEach((t, i) => {
    if (t < 0) return;
    if (!g.has(t)) g.set(t, []);
    g.get(t).push(i);
  });
  return g;
}

export function allLinks(b, limit = Infinity) {
  const out = [];
  for (const list of groups(b).values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (findPath(b, list[i], list[j])) {
          out.push([list[i], list[j]]);
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

export function anyLink(b) {
  const l = allLinks(b, 1);
  return l.length ? l[0] : null;
}

export function occupied(b) {
  const out = [];
  b.cells.forEach((t, i) => { if (t >= 0) out.push(i); });
  return out;
}
