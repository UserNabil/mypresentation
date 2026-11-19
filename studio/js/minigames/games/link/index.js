import { findPath, removePair, anyLink, occupied } from './path.js';
import {
  spec, tiersFor, generate, reshuffle, hint, prunePlan, pairGain, comboMult, levelBonus, hintsForStart, shufflesForStart,
  hintsAfterLevel, shufflesAfterLevel, GRAVITY_TEXT, LINK_MS, COMBO_SEC
} from './gen.js';
import { createView } from './view.js';

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const PULL = {
  down: 'Gravity: tiles fall down after each link.',
  up: 'Gravity: tiles rise up after each link.',
  left: 'Gravity: tiles slide left after each link.',
  right: 'Gravity: tiles slide right after each link.',
  center: 'Gravity: columns close in toward the middle.'
};

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function multText(combo) {
  return '×' + String(Math.round(comboMult(combo) * 100) / 100);
}

export default {
  id: 'link',
  name: 'Beast Link',
  pitch: 'Link twin beasts with a path of at most two turns and clear the field before time runs out.',
  icon: 'link',
  css: '/studio/css/modern/minigames_link.css',
  rules: [
    'Pick two matching beasts. They link if a path with at most two turns runs through empty cells or around the edge.',
    'Quick links within 3 seconds build a combo, up to ×2 points.',
    'Clear the field before time runs out. From level 8 some fields have gravity.'
  ],
  stats: [{ id: 'score', label: 'Score' }, { id: 'pairs', label: 'Pairs left' }, { id: 'combo', label: 'Combo' },
    { id: 'gravity', label: 'Gravity' }],
  helpers: [
    { id: 'hint', label: 'Hint', icon: 'lightbulb', key: 'h' },
    { id: 'shuffle', label: 'Shuffle', icon: 'repeat', key: 's' }
  ],
  keys: 'Arrows move · Enter or Space picks · Esc drops the pick · H hint · S shuffle · P pauses',
  bestLines: best => [
    ['Best score', best.score || 0],
    ['Highest level', best.level || 0],
    ['Best combo', best.bestCombo ? best.bestCombo + ' links' : '–']
  ],
  create(ctx) {
    let level = 1;
    let sp = spec(1);
    let board = null;
    let plan = [];
    let sel = -1;
    let hintPair = null;
    let hints = 0;
    let shuffles = 0;
    let runScore = 0;
    let levelPoints = 0;
    let linked = 0;
    let combo = 0;
    let bestCombo = 0;
    let levelCombo = 0;
    let lastAt = null;
    let autoCount = 0;
    let active = false;
    const view = createView(ctx, i => pick(i));

    const pairsLeft = () => (board ? occupied(board).length / 2 : 0);

    function showStats() {
      ctx.stat('score', runScore);
      ctx.stat('pairs', pairsLeft());
      ctx.stat('combo', combo > 1 ? multText(combo) : '×1');
      ctx.stat('gravity', GRAVITY_TEXT[sp.gravity]);
      ctx.helperState('hint', { count: hints, disabled: hints <= 0 || !active });
      ctx.helperState('shuffle', { count: shuffles, disabled: shuffles <= 0 || !active });
    }

    function setup(n) {
      level = n;
      sp = spec(n);
      ctx.level(n);
      const art = ctx.roster.pick(ctx.rng(ctx.seed(n, 0), 'art'), sp.types, { tiers: tiersFor(sp) });
      const g = generate(sp, a => ctx.rng(ctx.seed(n, a), 'field'));
      board = g.board;
      plan = g.plan;
      sel = -1;
      hintPair = null;
      combo = 0;
      levelCombo = 0;
      levelPoints = 0;
      linked = 0;
      lastAt = null;
      autoCount = 0;
      view.build(board, art.map(e => e.key));
      active = true;
      showStats();
      ctx.timer.countdown(sp.time, timeUp);
      ctx.announce('Level ' + n + ': ' + pairsLeft() + ' pairs in ' + sp.time + ' seconds.');
      if (sp.gravity !== 'none') ctx.flash(PULL[sp.gravity], 'info');
    }

    function drop() {
      sel = -1;
      view.select(-1);
    }

    function pick(i) {
      if (!active || !board) return;
      view.setCursor(i, false);
      if (board.cells[i] < 0) return;
      if (sel < 0) {
        sel = i;
        view.select(i);
        return;
      }
      if (sel === i) {
        drop();
        return;
      }
      const a = sel;
      const pts = board.cells[a] === board.cells[i] ? findPath(board, a, i) : null;
      if (!pts) {
        combo = 0;
        lastAt = null;
        view.bad([a, i]);
        sel = i;
        view.select(i);
        showStats();
        ctx.announce(board.cells[a] === board.cells[i] ? 'No path with two turns or fewer.' : 'Those beasts do not match.');
        return;
      }
      link(a, i, pts);
    }

    function link(a, c, pts) {
      const now = ctx.timer.remaining();
      combo = lastAt != null && lastAt - now <= COMBO_SEC ? combo + 1 : 1;
      lastAt = now;
      if (combo > bestCombo) ctx.extra({ bestCombo: combo }, { bestCombo: 'max' });
      bestCombo = Math.max(bestCombo, combo);
      levelCombo = Math.max(levelCombo, combo);
      const gain = pairGain(combo);
      runScore += gain;
      levelPoints += gain;
      linked += 1;
      const ids = [board.ids[a], board.ids[c]];
      removePair(board, a, c);
      plan = prunePlan(plan, ids[0], ids[1]);
      sel = -1;
      hintPair = null;
      view.link(pts, ids, LINK_MS);
      view.sync(true);
      if (combo >= 3) ctx.flash('Combo ' + multText(combo) + ' · +' + gain, 'ok');
      ctx.announce('Linked. ' + pairsLeft() + ' pairs left.');
      showStats();
      if (pairsLeft() === 0) {
        levelClear();
        return;
      }
      if (!anyLink(board)) {
        autoCount += 1;
        plan = reshuffle(board, ctx.rng(ctx.seed(level, 0), 'auto', autoCount)) || [];
        view.retype();
        ctx.flash('No links left, the field was reshuffled', 'info');
        ctx.announce('No links left, the field was reshuffled.');
      }
    }

    function levelClear() {
      active = false;
      ctx.timer.stop();
      const left = ctx.timer.remaining();
      const bonus = levelBonus(left, hints);
      runScore += bonus.total;
      showStats();
      const nextHints = hintsAfterLevel(hints);
      const nextShuffles = shufflesAfterLevel(shuffles, level);
      const gains = [];
      if (nextHints > hints) gains.push('one more Hint');
      if (nextShuffles > shuffles) gains.push('one more Shuffle');
      const lines = [
        ['Pairs linked', linked],
        ['Best combo', levelCombo + (levelCombo === 1 ? ' link' : ' links')],
        ['Link points', levelPoints],
        ['Time bonus', '+' + bonus.time.toLocaleString('en-US')],
        ['Unused hints', bonus.hints ? '+' + bonus.hints.toLocaleString('en-US') : '0', bonus.hints ? 'ok' : ''],
        ['Run score', runScore, 'total']
      ];
      const sub = mmss(left) + ' left on the clock.' + (gains.length ? ' You earn ' + gains.join(' and ') + '.' : '');
      ctx.announce('Field cleared.');
      ctx.levelDone({ title: 'Field cleared', sub, lines }).then(choice => {
        if (choice !== 'next') return;
        hints = nextHints;
        shuffles = nextShuffles;
        setup(level + 1);
        view.setCursor(0);
      });
    }

    function timeUp() {
      if (!active) return;
      active = false;
      drop();
      showStats();
      ctx.runOver({
        title: 'Time is up',
        sub: 'The clock ran out on level ' + level + '.',
        lines: [
          ['Run score', runScore, 'total'],
          ['Level reached', level],
          ['Pairs left on this level', pairsLeft()],
          ['Best combo', bestCombo ? bestCombo + ' links' : '–']
        ],
        score: runScore,
        level,
        extra: { bestCombo },
        merge: { bestCombo: 'max' }
      });
    }

    function useHint() {
      if (hintPair && board.cells[hintPair[0]] >= 0 && board.cells[hintPair[1]] >= 0) {
        view.hint(hintPair);
        return;
      }
      const h = hint(board, ctx.rng(ctx.seed(level, 0), 'hint', linked, hints), undefined, plan);
      if (!h) return;
      hints -= 1;
      hintPair = h.pair;
      view.hint(h.pair);
      ctx.announce('Hint: two linkable beasts are highlighted.');
      showStats();
    }

    function useShuffle() {
      shuffles -= 1;
      plan = reshuffle(board, ctx.rng(ctx.seed(level, 0), 'shuffle', linked, shuffles)) || [];
      sel = -1;
      hintPair = null;
      view.retype();
      ctx.flash('Field shuffled', 'info');
      ctx.announce('The field was shuffled.');
      showStats();
    }

    return {
      start(n) {
        runScore = 0;
        bestCombo = 0;
        hints = hintsForStart(n);
        shuffles = shufflesForStart(n);
        setup(n);
        view.setCursor(0);
      },
      pause() {},
      resume() {
        view.focusCurrent();
      },
      helper(id) {
        if (!active) return;
        if (id === 'hint' && hints > 0) useHint();
        else if (id === 'shuffle' && shuffles > 0) useShuffle();
      },
      key(e) {
        if (!active) return false;
        const a = ARROWS[e.key];
        if (a) {
          view.move(a[0], a[1]);
          return true;
        }
        if (e.key === 'Escape' && sel >= 0) {
          drop();
          ctx.announce('Pick dropped.');
          return true;
        }
        if ((e.key === 'Enter' || e.key === ' ') && view.inGrid()) {
          pick(view.cursor());
          return true;
        }
        return false;
      },
      focus() {
        if (active) view.focusCurrent();
      },
      resize() {
        view.layout();
      },
      intro() {
        return null;
      },
      debug() {
        return {
          level, cols: sp.cols, rows: sp.rows, types: sp.types, time: sp.time, gravity: sp.gravity, hints, shuffles,
          combo, bestCombo, runScore, sel, cursor: view.cursor(), pairsLeft: pairsLeft(), active, hint: hintPair,
          link: board ? anyLink(board) : null, cells: board ? board.cells.slice() : [], tile: view.tileSize()
        };
      },
      destroy() {
        active = false;
        view.clear();
      }
    };
  }
};
