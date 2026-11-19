import { buildArena, spec } from './levels.js';
import {
  makePicker, createState, turn, step, spawn, shieldStop, stageBonus, brakesForStart, brakesAfterClear, tickMs,
  BRAKE_MS, BONUS_EVERY
} from './logic.js';
import { createView } from './view.js';
import { createLeadPicker } from './leads.js';
import { currentGame } from '../../shell/modal.js';

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
};
const HIT = { wall: 'hit the arena wall', rock: 'hit a rock', line: 'ran into its own line' };
const START_HINT = ['Press ', { kbd: '←' }, { kbd: '↑' }, { kbd: '↓' }, { kbd: '→' }, ' or ', { kbd: 'WASD' }, ' to set off'];

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export default {
  id: 'parade',
  name: 'Pet Parade',
  pitch: 'Lead a growing parade of Eden pets around the arena without bumping into walls or your own line.',
  icon: 'paw-print',
  css: '/studio/css/modern/minigames_parade.css',
  rules: [
    'Steer the lead pet to each new pet. It joins the back of your line.',
    'Walls, rocks and your own line end the run.',
    'Every fifth pet is a bonus pet that soon wanders off.'
  ],
  stats: [{ id: 'score', label: 'Score' }, { id: 'pets', label: 'Pets' }, { id: 'line', label: 'Line' }],
  helpers: [
    { id: 'brake', label: 'Brake', icon: 'gauge', key: 'b' },
    { id: 'shield', label: 'Shield', icon: 'shield', key: 'g' }
  ],
  keys: 'Arrows or WASD steer · B brakes · G shields · Space or P pauses · Esc closes',
  bestLines: best => [
    ['Best score', best.score || 0],
    ['Best stage', best.level || 0],
    ['Longest line', best.longest || 0]
  ],
  create(ctx) {
    const view = createView(ctx);
    const leads = createLeadPicker(ctx);
    let stage = 1;
    let sp = spec(1);
    let st = null;
    let spawnRng = null;
    let attempt = 0;
    let lead = '';
    let runScore = 0;
    let longest = 0;
    let brakes = 0;
    let brakeMs = 0;
    let shieldLeft = 1;
    let shieldArmed = false;
    let active = false;
    let running = false;
    let started = false;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let shownBrake = '';

    const interval = () => tickMs(sp.speed, brakeMs > 0);

    function sideState() {
      const toBonus = BONUS_EVERY - (st.spawned % BONUS_EVERY);
      const bonusOn = st.pet && st.pet.bonus;
      return {
        collected: st.collected,
        target: sp.target,
        brake: brakeMs > 0
          ? { text: 'On · ' + (brakeMs / 1000).toFixed(1) + ' s', tone: 'info' }
          : { text: brakes + ' left', tone: brakes ? '' : 'off' },
        shield: shieldArmed
          ? { text: 'Armed', tone: 'accent' }
          : { text: shieldLeft ? 'Ready' : 'Used', tone: shieldLeft ? '' : 'off' },
        bonus: bonusOn
          ? { text: 'Here · ' + st.pet.ttl + ' steps', tone: 'accent' }
          : { text: toBonus === BONUS_EVERY ? 'Next pet' : 'In ' + toBonus + ' pets', tone: '' },
        speed: { text: (sp.speed * (brakeMs > 0 ? 0.6 : 1)).toFixed(1) + ' cells/s', tone: brakeMs > 0 ? 'info' : '' }
      };
    }

    function showStats() {
      ctx.stat('score', runScore);
      ctx.stat('pets', (st ? st.collected : 0) + '/' + sp.target);
      ctx.stat('line', st ? st.line.length : 0);
      ctx.helperState('brake', { count: brakes, disabled: !active || brakes <= 0 || brakeMs > 0 });
      ctx.helperState('shield', { count: shieldLeft, disabled: !active || shieldLeft <= 0 || shieldArmed });
      if (st) {
        view.side(sideState());
        view.flags({ brake: brakeMs > 0, guard: shieldArmed });
      }
    }

    function stopLoop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function startLoop() {
      if (running || !active) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function frame(now) {
      raf = 0;
      if (!running || !active) return;
      const dt = Math.min(250, Math.max(0, now - last));
      last = now;
      if (st.moving && !st.stopped) {
        if (brakeMs > 0) {
          brakeMs = Math.max(0, brakeMs - dt);
          const label = (brakeMs / 1000).toFixed(1);
          if (label !== shownBrake || brakeMs === 0) {
            shownBrake = label;
            if (brakeMs === 0) ctx.announce('Brake is over.');
            view.step(interval());
            showStats();
          }
        }
        acc += dt;
        let guard = 0;
        while (active && st.moving && !st.stopped && acc >= interval() && guard < 4) {
          acc -= interval();
          guard += 1;
          tick();
        }
        if (guard >= 4) acc = 0;
      } else acc = 0;
      if (running && active) raf = requestAnimationFrame(frame);
    }

    function tick() {
      const ev = step(st, spawnRng);
      if (ev.type === 'crash') return crash(ev);
      if (ev.type === 'eat') {
        runScore += ev.points;
        longest = Math.max(longest, st.line.length);
        ctx.extra({ longest }, { longest: 'max' });
        const who = ctx.roster.byKey[ev.pet.key];
        const name = who ? who.name : 'A pet';
        if (ev.pet.bonus) ctx.flash(name + ' joined · bonus +' + ev.points, 'ok');
        ctx.announce(name + ' joined the parade, ' + st.collected + ' of ' + sp.target + '.');
      }
      if (ev.expired) ctx.flash('The bonus pet wandered off', 'warn');
      if (ev.spawned && ev.spawned.bonus) ctx.announce('A bonus pet appeared.');
      view.frame();
      if (ev.type === 'eat' || ev.expired || ev.spawned || (st.pet && st.pet.bonus)) showStats();
      if (ev.done) stageClear();
    }

    function crash(ev) {
      if (shieldArmed) {
        shieldArmed = false;
        shieldStop(st, ev.dir);
        acc = 0;
        view.bump(ev.x, ev.y);
        view.frame();
        view.hint(['Shield used · pick a new direction'], 'accent');
        ctx.announce('Shield used. The parade stopped. Pick a new direction.');
        showStats();
        return;
      }
      active = false;
      stopLoop();
      ctx.timer.stop();
      view.frame();
      view.crash(ev.x, ev.y);
      showStats();
      const what = HIT[ev.what] || 'crashed';
      ctx.announce('The parade ' + what + '.');
      ctx.later(() => {
        ctx.runOver({
          title: 'The parade crashed',
          sub: 'Your line ' + what + ' on stage ' + stage + '.',
          lines: [
            ['Run score', runScore, 'total'],
            ['Stage reached', stage],
            ['Pets on this stage', st.collected + ' of ' + sp.target],
            ['Longest line', longest]
          ],
          score: runScore,
          level: stage,
          extra: { longest }
        });
      }, ctx.reducedMotion() ? 250 : 650);
    }

    function stageClear() {
      active = false;
      stopLoop();
      ctx.timer.stop();
      const elapsed = ctx.timer.elapsed();
      const bonus = stageBonus(sp, elapsed);
      runScore += bonus.total;
      showStats();
      const nextBrakes = brakesAfterClear(brakes, stage);
      const lines = [
        ['Pets collected', sp.target],
        ['Stage time', mmss(elapsed)],
        ['Line length', st.line.length],
        ['Stage bonus', '+' + bonus.clear.toLocaleString('en-US')],
        ['Time bonus', '+' + bonus.time.toLocaleString('en-US'), bonus.time ? 'ok' : ''],
        ['Run score', runScore, 'total']
      ];
      const sub = 'Stage ' + (stage + 1) + ' runs at ' + spec(stage + 1).speed.toFixed(1) + ' cells per second.' +
        (nextBrakes > brakes ? ' You earn one more Brake.' : '');
      ctx.announce('Stage ' + stage + ' cleared.');
      ctx.levelDone({ title: 'Stage ' + stage + ' cleared', sub, lines }).then(choice => {
        if (choice !== 'next') return;
        brakes = nextBrakes;
        setup(stage + 1);
      });
    }

    function setup(n) {
      stopLoop();
      stage = n;
      sp = spec(n);
      ctx.level(n);
      const arena = buildArena(n, a => ctx.rng(ctx.seed(n, a)));
      attempt = arena.attempt;
      const base = ctx.seed(n, 0);
      st = createState(arena.walls, arena.spec, lead, makePicker(ctx.roster.all, ctx.rng(base, 'pets'), lead));
      spawnRng = ctx.rng(base, 'spawn');
      spawn(st, spawnRng);
      longest = Math.max(longest, st.line.length);
      ctx.extra({ longest }, { longest: 'max' });
      brakeMs = 0;
      acc = 0;
      started = false;
      active = true;
      view.build(st, { lead });
      view.still(ctx.reducedMotion());
      view.step(interval());
      view.hint(START_HINT);
      ctx.timer.stopwatch();
      ctx.timer.stop();
      showStats();
      ctx.announce('Stage ' + n + ': collect ' + sp.target + ' pets. Press a direction to set off.');
    }

    function steer(dir) {
      const wasStopped = st.stopped;
      if (!turn(st, dir)) return;
      if (!started) {
        started = true;
        ctx.timer.stopwatch();
        acc = interval() * 0.5;
      }
      if (wasStopped) acc = interval() * 0.5;
      view.hint(null);
      view.frame();
      startLoop();
    }

    return {
      start(n) {
        lead = leads.value();
        runScore = 0;
        longest = 0;
        brakes = brakesForStart(n);
        shieldLeft = 1;
        shieldArmed = false;
        setup(n);
      },
      pause() {
        stopLoop();
      },
      resume() {
        if (active && started) startLoop();
      },
      helper(id) {
        if (!active) return;
        if (id === 'brake' && brakes > 0 && brakeMs <= 0) {
          brakes -= 1;
          brakeMs = BRAKE_MS;
          shownBrake = '';
          view.step(interval());
          ctx.flash('Brake on · the parade slows down for 4 s', 'info');
          ctx.announce('Brake on for four seconds.');
        } else if (id === 'shield' && shieldLeft > 0 && !shieldArmed) {
          shieldLeft -= 1;
          shieldArmed = true;
          ctx.flash('Shield ready · your next crash is cancelled', 'ok');
          ctx.announce('Shield ready. Your next crash is cancelled.');
        } else return;
        showStats();
      },
      key(e) {
        if (!active || !st) return false;
        const dir = KEYS[e.key];
        if (dir) {
          steer(dir);
          return true;
        }
        if (e.key === ' ' && !(e.target && e.target.closest && e.target.closest('button'))) {
          const h = currentGame();
          if (h && h.ctx === ctx) h.pause();
          return true;
        }
        return false;
      },
      focus() {},
      resize() {
        view.layout();
      },
      intro() {
        return leads.element();
      },
      debug() {
        return {
          stage, target: sp.target, speed: sp.speed, kind: sp.kind, attempt, lead, active, started, runScore, longest,
          brakes, brakeMs: Math.round(brakeMs), shield: { left: shieldLeft, armed: shieldArmed }, cell: view.cell(),
          collected: st ? st.collected : 0, spawned: st ? st.spawned : 0, length: st ? st.line.length : 0,
          dir: st ? st.dir : '', moving: st ? st.moving : false, stopped: st ? st.stopped : false,
          line: st ? st.line.map(s => [s.x, s.y]) : [],
          pet: st && st.pet ? { x: st.pet.x, y: st.pet.y, key: st.pet.key, bonus: st.pet.bonus, ttl: st.pet.ttl } : null,
          walls: st ? [...st.walls.keys()].filter(k => st.walls[k]) : []
        };
      },
      destroy() {
        active = false;
        stopLoop();
        view.clear();
      }
    };
  }
};
