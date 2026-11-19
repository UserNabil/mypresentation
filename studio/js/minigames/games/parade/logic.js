import { COLS, ROWS, START, START_LEN, idx, inside, mainBlock } from './levels.js';

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const BONUS_EVERY = 5;
export const BONUS_TTL = 30;
const BONUS_POINTS = 50;
export const MIN_SPAWN_DIST = 3;
const MAX_QUEUE = 2;
const BRAKE_FACTOR = 0.6;
export const BRAKE_MS = 4000;

const STEPS = Object.values(DIRS);

export function petPoints(stage, bonus) {
  return 10 * stage + (bonus ? BONUS_POINTS : 0);
}

export function stageBonus(sp, elapsed) {
  const clear = 100 * sp.stage;
  const time = 2 * Math.max(0, Math.floor(sp.target * 3 - elapsed));
  return { clear, time, total: clear + time };
}

export function brakesForStart(stage) {
  return 2 + Math.floor((Math.max(1, stage) - 1) / 4);
}

export function brakesAfterClear(count, cleared) {
  return count + (cleared % 4 === 0 ? 1 : 0);
}

export function tickMs(speed, braking) {
  return 1000 / (speed * (braking ? BRAKE_FACTOR : 1));
}

function shuffled(list, r) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makePicker(entries, r, leadKey) {
  const normal = entries.filter(e => e.tier <= 2 && e.key !== leadKey).map(e => e.key);
  const bonus = entries.filter(e => e.tier === 3 && e.key !== leadKey).map(e => e.key);
  const pools = { normal: [], bonus: [] };
  return function next(isBonus) {
    const name = isBonus && bonus.length ? 'bonus' : 'normal';
    const src = name === 'bonus' ? bonus : normal;
    if (!src.length) return leadKey;
    if (!pools[name].length) pools[name] = shuffled(src, r);
    return pools[name].pop();
  };
}

export function createState(walls, sp, leadKey, picker) {
  const line = [];
  for (let i = 0; i < START_LEN; i++) {
    line.push({ id: i, x: START.x - i, y: START.y, key: i === 0 ? leadKey : picker(false) });
  }
  return {
    walls, spec: sp, line, dir: 'right', queue: [], moving: false, stopped: false, blocked: '',
    collected: 0, spawned: 0, pet: null, ticks: 0, nextId: START_LEN, longest: line.length, picker
  };
}

export function turn(st, dir) {
  if (!DIRS[dir]) return false;
  if (st.stopped) {
    if (dir === OPPOSITE[st.dir] || dir === st.blocked) return false;
    st.stopped = false;
    st.blocked = '';
    st.queue = [dir];
    return true;
  }
  if (!st.moving) {
    if (dir === OPPOSITE[st.dir]) return false;
    st.moving = true;
    st.queue = dir === st.dir ? [] : [dir];
    return true;
  }
  if (st.queue.length >= MAX_QUEUE) return false;
  const base = st.queue.length ? st.queue[st.queue.length - 1] : st.dir;
  if (dir === base || dir === OPPOSITE[base]) return false;
  st.queue.push(dir);
  return true;
}

function lineAt(st, x, y, skipTail) {
  const end = skipTail ? st.line.length - 1 : st.line.length;
  for (let i = 0; i < end; i++) if (st.line[i].x === x && st.line[i].y === y) return i;
  return -1;
}

function hazard(st, x, y, eating) {
  if (!inside(x, y)) return 'wall';
  if (st.walls[idx(x, y)]) return 'rock';
  if (lineAt(st, x, y, !eating) >= 0) return 'line';
  return '';
}

function freeNeighbours(walls, x, y) {
  let n = 0;
  for (const [dx, dy] of STEPS) if (inside(x + dx, y + dy) && !walls[idx(x + dx, y + dy)]) n++;
  return n;
}

export function distances(st) {
  const dist = new Int16Array(COLS * ROWS).fill(-1);
  const h = st.line[0];
  const start = idx(h.x, h.y);
  dist[start] = 0;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const x = c % COLS;
    const y = (c - x) / COLS;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny)) continue;
      const k = idx(nx, ny);
      if (st.walls[k] || dist[k] >= 0) continue;
      dist[k] = dist[c] + 1;
      queue.push(k);
    }
  }
  return dist;
}

function spawnCells(st) {
  const dist = distances(st);
  if (!st.core) st.core = mainBlock(st.walls);
  const strict = [];
  const reach = [];
  const any = [];
  for (let k = 0; k < COLS * ROWS; k++) {
    if (st.walls[k]) continue;
    const x = k % COLS;
    const y = (k - x) / COLS;
    if (lineAt(st, x, y, false) >= 0) continue;
    any.push(k);
    if (dist[k] < 0) continue;
    reach.push(k);
    if (dist[k] >= MIN_SPAWN_DIST && st.core[k] && freeNeighbours(st.walls, x, y) >= 2) strict.push(k);
  }
  if (strict.length) return { cells: strict, rule: 'strict' };
  if (reach.length) return { cells: reach, rule: 'reach' };
  return { cells: any, rule: 'any' };
}

export function spawn(st, r) {
  const { cells, rule } = spawnCells(st);
  if (!cells.length) {
    st.pet = null;
    return null;
  }
  const k = cells[Math.floor(r() * cells.length)];
  st.spawned += 1;
  const bonus = st.spawned % BONUS_EVERY === 0;
  const x = k % COLS;
  st.pet = { x, y: (k - x) / COLS, key: st.picker(bonus), bonus, ttl: bonus ? BONUS_TTL : 0, n: st.spawned, rule };
  return st.pet;
}

export function step(st, r) {
  if (!st.moving || st.stopped) return { type: 'idle' };
  const dir = st.queue.length ? st.queue.shift() : st.dir;
  const [dx, dy] = DIRS[dir];
  const head = st.line[0];
  const nx = head.x + dx;
  const ny = head.y + dy;
  const pet = st.pet;
  const eating = !!pet && pet.x === nx && pet.y === ny;
  const hit = hazard(st, nx, ny, eating);
  if (hit) {
    st.queue = [];
    return { type: 'crash', what: hit, x: nx, y: ny, dir };
  }
  st.dir = dir;
  const tail = st.line[st.line.length - 1];
  const tx = tail.x;
  const ty = tail.y;
  for (let i = st.line.length - 1; i > 0; i--) {
    st.line[i].x = st.line[i - 1].x;
    st.line[i].y = st.line[i - 1].y;
  }
  head.x = nx;
  head.y = ny;
  st.ticks += 1;
  const ev = { type: 'move', dir };
  if (eating) {
    const seg = { id: st.nextId++, x: tx, y: ty, key: pet.key };
    st.line.push(seg);
    st.longest = Math.max(st.longest, st.line.length);
    st.collected += 1;
    st.pet = null;
    ev.type = 'eat';
    ev.pet = pet;
    ev.seg = seg;
    ev.points = petPoints(st.spec.stage, pet.bonus);
  } else if (pet && pet.bonus) {
    pet.ttl -= 1;
    if (pet.ttl <= 0) {
      st.pet = null;
      ev.expired = pet;
    }
  }
  ev.done = st.collected >= st.spec.target;
  if (!ev.done && !st.pet) ev.spawned = spawn(st, r);
  return ev;
}

export function shieldStop(st, dir) {
  st.stopped = true;
  st.blocked = dir;
  st.queue = [];
}
