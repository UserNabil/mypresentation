import { shuffle } from '../../shell/rng.js';
import { pick } from '../../shell/roster.js';

export const MISS_MS = 700;
export const PEEK_MS = 1200;
const PEEK_START = 2;
const PEEK_MAX = 3;
const PEEK_GIFTS = [5, 9];

const EASY = { tiers: [1], maxPerTone: 1, twins: 0 };
const MID = { tiers: [1, 2], maxPerTone: 2, twins: 0 };
const ALL = { tiers: [1, 2, 3], maxPerTone: 0, twins: 0 };

const LEVELS = [
  { cols: 2, rows: 2, time: 20, ...EASY },
  { cols: 3, rows: 2, time: 25, ...EASY },
  { cols: 4, rows: 3, time: 40, ...EASY },
  { cols: 4, rows: 4, time: 50, ...EASY },
  { cols: 5, rows: 4, time: 60, ...MID },
  { cols: 6, rows: 4, time: 70, ...MID },
  { cols: 6, rows: 5, time: 85, ...MID },
  { cols: 6, rows: 6, time: 100, ...ALL },
  { cols: 6, rows: 6, time: 90, ...ALL },
  { cols: 6, rows: 6, time: 80, ...ALL, twins: 6 },
  { cols: 6, rows: 6, time: 70, ...ALL, twins: 6 },
  { cols: 6, rows: 6, time: 60, ...ALL, twins: 9 }
];

export function spec(level) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  const base = LEVELS[Math.min(n, LEVELS.length) - 1];
  return { ...base, level: n, pairs: (base.cols * base.rows) / 2, big: base.cols === 6 && base.rows === 6 };
}

export function pickMonsters(entries, sp, r) {
  return pick(entries, r, sp.pairs, { tiers: sp.tiers, maxPerTone: sp.maxPerTone || 0, twins: sp.twins || 0 });
}

export function deal(entries, sp, r) {
  const monsters = pickMonsters(entries, sp, r);
  if (monsters.length < sp.pairs) throw new Error('Roster too small for level ' + sp.level);
  return shuffle(monsters.flatMap(m => [m.key, m.key]), r);
}

export function createBoard(sp, keys) {
  return {
    spec: sp,
    cards: keys.map((key, i) => ({ i, key, up: false, found: false })),
    open: [],
    wrong: [],
    misses: 0,
    streak: 0,
    bestStreak: 0,
    found: 0,
    points: 0
  };
}

export function streakBonus(streak) {
  return Math.min(100, 25 * Math.max(0, streak - 1));
}

export function hideWrong(b) {
  const hidden = b.wrong;
  for (const i of hidden) b.cards[i].up = false;
  b.wrong = [];
  return hidden;
}

export function flip(b, i) {
  const c = b.cards[i];
  const hidden = b.wrong.length ? hideWrong(b) : [];
  if (!c || c.found || c.up) return { type: 'ignored', i, hidden };
  c.up = true;
  b.open.push(i);
  if (b.open.length < 2) return { type: 'flip', i, hidden };
  const [a, d] = b.open;
  b.open = [];
  if (b.cards[a].key === b.cards[d].key) {
    b.cards[a].found = true;
    b.cards[d].found = true;
    b.found += 1;
    b.streak += 1;
    b.bestStreak = Math.max(b.bestStreak, b.streak);
    const gain = 100 + streakBonus(b.streak);
    b.points += gain;
    return { type: 'match', i, pair: [a, d], key: c.key, gain, streak: b.streak, done: b.found === b.spec.pairs, hidden };
  }
  b.misses += 1;
  b.streak = 0;
  b.wrong = [a, d];
  return { type: 'miss', i, pair: [a, d], hidden };
}

export function levelBonus(b, secondsLeft) {
  const time = 10 * Math.floor(Math.max(0, secondsLeft));
  const perfect = b.misses === 0 && b.found === b.spec.pairs ? 200 : 0;
  return { time, perfect, total: time + perfect };
}

export function peeksForStart(level) {
  return Math.min(PEEK_MAX, PEEK_START + PEEK_GIFTS.filter(g => level >= g).length);
}

export function peeksAfterLevel(peeks, nextLevel) {
  return PEEK_GIFTS.includes(nextLevel) ? Math.min(PEEK_MAX, peeks + 1) : peeks;
}
