import {
  spec, deal, createBoard, flip, hideWrong, levelBonus, peeksForStart, peeksAfterLevel, MISS_MS, PEEK_MS
} from './logic.js';
import { createView } from './view.js';

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export default {
  id: 'recall',
  name: 'Bestiary Recall',
  pitch: 'Flip two cards, find the twin beasts, clear the bestiary before the hourglass runs out.',
  icon: 'brain',
  css: '/studio/css/modern/minigames_recall.css',
  rules: [
    'Flip two cards. Twin beasts stay face up, anything else turns back over.',
    'Pairs in a row build a streak bonus. A miss costs no time.',
    'Clear the board before the hourglass runs out to reach the next level.'
  ],
  stats: [{ id: 'score', label: 'Score' }, { id: 'pairs', label: 'Pairs' }, { id: 'streak', label: 'Streak' }],
  helpers: [{ id: 'peek', label: 'Peek', icon: 'eye', key: 'h' }],
  keys: 'Arrows move · Enter or Space flips · H peeks · P pauses · Esc closes',
  bestLines: best => [
    ['Best score', best.score || 0],
    ['Highest level', best.level || 0],
    ['Levels cleared', best.clears || 0],
    ['Fastest 6×6', best.fastest != null ? Number(best.fastest).toFixed(1) + ' s' : '–']
  ],
  create(ctx) {
    let level = 1;
    let sp = spec(1);
    let board = null;
    let peeks = 0;
    let runScore = 0;
    let fastest = null;
    let active = false;
    let peeking = false;
    let missTimer = 0;
    let peekTimer = 0;
    let peekEnd = 0;
    let peekLeft = 0;
    const view = createView(ctx, i => doFlip(i));

    function showStats() {
      ctx.stat('score', runScore);
      ctx.stat('pairs', (board ? board.found : 0) + '/' + sp.pairs);
      ctx.stat('streak', board ? board.streak : 0);
      ctx.helperState('peek', { count: peeks, disabled: peeks <= 0 || !active });
    }

    function clearMiss() {
      clearTimeout(missTimer);
      missTimer = 0;
      if (board && board.wrong.length) view.updateAll(hideWrong(board));
    }

    function endPeek() {
      clearTimeout(peekTimer);
      peekTimer = 0;
      peeking = false;
      view.setPeek(false);
    }

    function showPeek(ms) {
      peeking = true;
      view.setPeek(true);
      peekEnd = performance.now() + ms;
      peekTimer = setTimeout(endPeek, ms);
    }

    function setup(n) {
      clearMiss();
      endPeek();
      level = n;
      sp = spec(n);
      ctx.level(n);
      const r = ctx.rng(ctx.seed(n, 0));
      board = createBoard(sp, deal(ctx.roster.all, sp, r));
      view.build(board);
      active = true;
      showStats();
      ctx.timer.countdown(sp.time, timeUp);
      ctx.announce('Level ' + n + ': ' + sp.pairs + ' pairs in ' + sp.time + ' seconds.');
    }

    function doFlip(i) {
      if (!active || peeking) return;
      clearTimeout(missTimer);
      missTimer = 0;
      const ev = flip(board, i);
      view.updateAll(ev.hidden);
      if (ev.type === 'ignored') return;
      view.update(i);
      if (ev.type === 'match') {
        runScore += ev.gain;
        view.updateAll(ev.pair);
        view.pulse(ev.pair, 'is-hit');
        const who = ctx.roster.byKey[ev.key];
        ctx.announce((who ? who.name : 'Pair') + ' found' + (ev.streak > 1 ? ', streak ' + ev.streak : '') + '.');
        if (ev.streak > 2) ctx.flash('Streak ×' + ev.streak + ' · +' + ev.gain, 'ok');
        showStats();
        if (ev.done) levelClear();
        return;
      }
      if (ev.type === 'miss') {
        view.updateAll(ev.pair);
        showStats();
        missTimer = setTimeout(() => {
          missTimer = 0;
          if (board) view.updateAll(hideWrong(board));
        }, MISS_MS);
      }
    }

    function levelClear() {
      active = false;
      endPeek();
      ctx.timer.stop();
      const left = ctx.timer.remaining();
      const used = sp.time - left;
      const bonus = levelBonus(board, left);
      runScore += bonus.total;
      if (sp.big) {
        fastest = fastest == null ? used : Math.min(fastest, used);
        ctx.extra({ fastest: Math.round(fastest * 10) / 10 }, { fastest: 'min' });
      }
      showStats();
      const nextPeeks = peeksAfterLevel(peeks, level + 1);
      const lines = [
        ['Pairs found', sp.pairs],
        ['Misses', board.misses],
        ['Best streak', board.bestStreak],
        ['Pair points', board.points],
        ['Time bonus', '+' + bonus.time.toLocaleString('en-US')],
        ['Perfect bonus', bonus.perfect ? '+' + bonus.perfect : '0', bonus.perfect ? 'ok' : ''],
        ['Run score', runScore, 'total']
      ];
      const sub = (bonus.perfect ? 'Perfect board. ' : '') + mmss(left) + ' left on the hourglass.' +
        (nextPeeks > peeks ? ' You earn one more Peek.' : '');
      ctx.announce('Level ' + level + ' cleared.');
      ctx.levelDone({ title: 'Level ' + level + ' cleared', sub, lines }).then(choice => {
        if (choice !== 'next') return;
        peeks = nextPeeks;
        setup(level + 1);
        view.focusEdge(false);
      });
    }

    function timeUp() {
      if (!active) return;
      active = false;
      clearMiss();
      endPeek();
      showStats();
      ctx.runOver({
        title: 'Time is up',
        sub: 'The hourglass ran out on level ' + level + '.',
        lines: [
          ['Run score', runScore, 'total'],
          ['Level reached', level],
          ['Pairs on this level', board.found + ' of ' + sp.pairs]
        ],
        score: runScore,
        level,
        extra: fastest != null ? { fastest: Math.round(fastest * 10) / 10 } : {},
        merge: { fastest: 'min' }
      });
    }

    return {
      start(n) {
        runScore = 0;
        fastest = null;
        peeks = peeksForStart(n);
        setup(n);
        view.focusEdge(false);
      },
      pause() {
        clearMiss();
        peekLeft = peeking ? Math.max(0, peekEnd - performance.now()) : 0;
        endPeek();
      },
      resume() {
        if (active && peekLeft > 0) showPeek(peekLeft);
        peekLeft = 0;
        view.focusCurrent();
      },
      helper(id) {
        if (id !== 'peek' || !active || peeking || peeks <= 0) return;
        peeks -= 1;
        clearMiss();
        showPeek(PEEK_MS);
        showStats();
        ctx.announce('Peek: every card is shown for a moment.');
      },
      key(e) {
        if (!active) return false;
        const a = ARROWS[e.key];
        if (a) {
          view.move(a[0], a[1]);
          return true;
        }
        if (e.key === 'Home' || e.key === 'End') {
          view.focusEdge(e.key === 'End');
          return true;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          const i = view.focusedIndex();
          if (i < 0) return false;
          doFlip(i);
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
          level, cols: sp.cols, rows: sp.rows, pairs: sp.pairs, time: sp.time, peeks, peeking, active, runScore,
          misses: board ? board.misses : 0, streak: board ? board.streak : 0,
          cards: board ? board.cards.map(c => ({ key: c.key, up: c.up, found: c.found })) : []
        };
      },
      destroy() {
        active = false;
        clearTimeout(missTimer);
        clearTimeout(peekTimer);
        view.clear();
      }
    };
  }
};
