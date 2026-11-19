import { makeBoard, cloneBoard, reach, findPath, removePair, settle, groups, occupied } from './path.js';
import { shuffle } from '../../shell/rng.js';

export const LINK_MS = 350;
export const COMBO_SEC = 3;
const TRIES = 200;
const BUDGET = 20000;
const HINT_MAX = 6;
const ROTATION = ['down', 'left', 'up', 'right', 'none'];

const TABLE = [
  null,
  [6, 4, 6, 0, 150, 'none'],
  [8, 4, 8, 0, 170, 'none'],
  [8, 6, 12, 0, 220, 'none'],
  [10, 6, 15, 0, 260, 'none'],
  [12, 6, 18, 0, 300, 'none'],
  [12, 7, 21, 0, 330, 'none'],
  [14, 8, 28, 0, 380, 'none'],
  [14, 8, 28, 0, 380, 'down'],
  [14, 8, 28, 0, 370, 'left'],
  [14, 8, 24, 8, 360, 'none'],
  [14, 8, 20, 16, 340, 'center'],
  [14, 8, 20, 16, 320, 'down']
];

export const GRAVITY_TEXT = {
  none: 'Off', down: 'Down', up: 'Up', left: 'Left', right: 'Right', center: 'Centre'
};

export function spec(level) {
  const n = Math.max(1, Math.floor(level));
  if (n <= 12) {
    const [cols, rows, quads, doubles, time, gravity] = TABLE[n];
    return { level: n, cols, rows, quads, doubles, types: quads + doubles, time, gravity };
  }
  return {
    level: n, cols: 14, rows: 8, quads: 20, doubles: 16, types: 36,
    time: Math.max(240, 320 - 10 * (n - 12)), gravity: ROTATION[(n - 13) % ROTATION.length]
  };
}

export function tiersFor(sp) {
  if (sp.types <= 12) return [1];
  if (sp.types <= 24) return [1, 2];
  return [1, 2, 3];
}

function pairList(sp) {
  const out = [];
  for (let t = 0; t < sp.quads; t++) out.push(t, t);
  for (let t = sp.quads; t < sp.types; t++) out.push(t);
  return out;
}

export function remainingPairs(b) {
  const out = [];
  for (const [t, list] of groups(b)) for (let k = 0; k + 1 < list.length; k += 2) out.push(t);
  return out;
}

function carve(cols, rows, gravity, cellsIn, pairs, r) {
  const sim = makeBoard(cols, rows, gravity);
  for (const i of cellsIn) {
    sim.cells[i] = 0;
    sim.ids[i] = i;
  }
  const typeOf = new Map();
  const order = shuffle(pairs.slice(), r);
  const plan = [];
  for (const t of order) {
    const cand = shuffle(occupied(sim), r);
    let done = false;
    for (const a of cand) {
      const partners = reach(sim, a);
      if (!partners.length) continue;
      const c = partners[Math.floor(r() * partners.length)];
      typeOf.set(sim.ids[a], t);
      typeOf.set(sim.ids[c], t);
      plan.push([sim.ids[a], sim.ids[c]]);
      removePair(sim, a, c);
      done = true;
      break;
    }
    if (!done) return null;
  }
  return { typeOf, plan };
}

function assign(cols, rows, gravity, cellsIn, pairs, r) {
  if (cellsIn.length !== pairs.length * 2) throw new Error('cells and pairs differ');
  for (let k = 0; k < TRIES; k++) {
    const res = carve(cols, rows, gravity, cellsIn, pairs, r);
    if (!res) continue;
    const cells = new Array(cols * rows).fill(-1);
    for (const i of cellsIn) cells[i] = res.typeOf.get(i);
    return { cells, plan: res.plan, tries: k + 1 };
  }
  return null;
}

export function generate(sp, rngFor) {
  const all = [];
  for (let i = 0; i < sp.cols * sp.rows; i++) all.push(i);
  for (let attempt = 0; attempt < 50; attempt++) {
    const res = assign(sp.cols, sp.rows, sp.gravity, all, pairList(sp), rngFor(attempt));
    if (res) return { board: makeBoard(sp.cols, sp.rows, sp.gravity, res.cells), plan: res.plan, attempt };
  }
  throw new Error('no board');
}

export function reshuffle(b, r) {
  const cellsIn = occupied(b);
  const res = assign(b.cols, b.rows, b.gravity, cellsIn, remainingPairs(b), r);
  if (!res) return null;
  for (const i of cellsIn) b.cells[i] = res.cells[i];
  return res.plan.map(([pa, pc]) => [b.ids[pa], b.ids[pc]]);
}

export function replay(b, plan) {
  const sim = cloneBoard(b);
  for (const [ia, ic] of plan) {
    const a = sim.ids.indexOf(ia);
    const c = sim.ids.indexOf(ic);
    if (a < 0 || c < 0 || sim.cells[a] !== sim.cells[c] || !findPath(sim, a, c)) return false;
    removePair(sim, a, c);
  }
  return sim.cells.every(v => v < 0);
}

function key(b) {
  return b.cells.join(',');
}

export function solve(b, r, budget = BUDGET) {
  const seen = new Set();
  let nodes = 0;
  function moves(s) {
    const out = [];
    for (const list of groups(s).values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
      }
    }
    return shuffle(out, r);
  }
  function dfs(s) {
    if (s.cells.every(v => v < 0)) return true;
    if (nodes++ >= budget) return null;
    const k = key(s);
    if (seen.has(k)) return false;
    seen.add(k);
    let unknown = false;
    for (const [a, c] of moves(s)) {
      if (!findPath(s, a, c)) continue;
      const n = cloneBoard(s);
      removePair(n, a, c);
      const res = dfs(n);
      if (res) return true;
      if (res === null) { unknown = true; break; }
    }
    return unknown ? null : false;
  }
  const res = dfs(cloneBoard(b));
  return { solvable: res, nodes };
}

export function prunePlan(plan, ia, ic) {
  const ea = plan.findIndex(p => p.includes(ia));
  const ec = plan.findIndex(p => p.includes(ic));
  if (ea < 0 || ec < 0) return plan.filter(p => !p.includes(ia) && !p.includes(ic));
  if (ea === ec) return plan.filter((p, k) => k !== ea);
  const first = Math.min(ea, ec);
  const other = Math.max(ea, ec);
  const rest = [...plan[ea].filter(x => x !== ia), ...plan[ec].filter(x => x !== ic)];
  return plan.map((p, k) => (k === first ? rest : p)).filter((p, k) => k !== other);
}

export function hint(b, r, budget = BUDGET, plan = null) {
  if (plan && plan.length && replay(b, plan)) {
    const [ia, ic] = plan[0];
    return { pair: [b.ids.indexOf(ia), b.ids.indexOf(ic)], safe: true, planned: true };
  }
  const links = [];
  for (const list of groups(b).values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) if (findPath(b, list[i], list[j])) links.push([list[i], list[j]]);
    }
  }
  if (!links.length) return null;
  shuffle(links, r);
  let left = budget;
  for (const pair of links) {
    if (left <= 0) break;
    const n = cloneBoard(b);
    removePair(n, pair[0], pair[1]);
    const res = solve(n, r, left);
    left -= res.nodes + 1;
    if (res.solvable) return { pair, safe: true };
  }
  return { pair: links[0], safe: false };
}

export function comboMult(combo) {
  return Math.min(2, 1 + 0.25 * Math.max(0, combo - 1));
}

export function pairGain(combo) {
  return Math.round(50 * comboMult(combo));
}

export function levelBonus(secondsLeft, hintsLeft) {
  const time = 5 * Math.max(0, Math.floor(secondsLeft));
  const hints = 100 * Math.max(0, hintsLeft);
  return { time, hints, total: time + hints };
}

export function hintsForStart(level) {
  return Math.min(HINT_MAX, 4 + Math.max(0, level - 1));
}

export function shufflesForStart(level) {
  return 2 + Math.floor(Math.max(0, level - 1) / 3);
}

export function hintsAfterLevel(held) {
  return Math.min(HINT_MAX, held + 1);
}

export function shufflesAfterLevel(held, cleared) {
  return held + (cleared % 3 === 0 ? 1 : 0);
}

