import { lineIcon } from '/studio/js/ui/line_icons.js';
import { createTimer } from './timer.js';
import { createOverlay, fmt } from './overlay.js';
import { rng, seedOf } from './rng.js';
import * as store from './store.js';
import { loadRoster } from './roster.js';
import { buildFrame, ensureCss, node, toastIcon } from './frame.js';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
let current = null;
let opening = null;
const HELPER_GAP = 400;

export { ensureCss };

export function currentGame() {
  return current;
}

export async function openGame(game, opts = {}) {
  const opener = opts.opener || document.activeElement;
  const token = {};
  opening = token;
  if (current) current.close('replaced');
  const [roster] = await Promise.all([loadRoster(), game.css ? ensureCss(game.css) : null]);
  if (opening !== token) return null;
  opening = null;
  if (current) current.close('replaced');
  const startLevel = Math.max(1, Math.floor(Number(opts.level) || 1));
  const fixedSeed = opts.seed != null && opts.seed !== '' ? String(opts.seed) : '';
  const s = {
    phase: 'intro', level: startLevel, runSeed: fixedSeed || String(Date.now()), stats: {},
    run: { score: 0, level: startLevel, clears: 0, started: false, recorded: false, extra: {}, merge: {} }
  };
  const helperAt = {};
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const observers = [];
  const timers = new Set();
  const inerted = [];

  const {
    scrim, dialog, chip, statEls, timerEl, timerText, pauseBtn, closeBtn, body, board, overlayEl, toast, sr,
    helperEls, restartBtn
  } = buildFrame(game);
  for (const [id, h] of Object.entries(helperEls)) h.b.addEventListener('click', () => useHelper(id));

  const overlay = createOverlay(overlayEl, () => toast.classList.remove('is-on'));
  const timer = createTimer(v => {
    timerText.textContent = v.text;
    timerEl.classList.toggle('is-low', v.low);
    timerEl.classList.toggle('is-paused', v.paused);
    timerEl.classList.toggle('is-idle', v.mode === 'idle');
  });

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }

  function sync() {
    const covered = overlay.visible();
    board.inert = covered;
    body.classList.toggle('is-covered', covered);
    const paused = s.phase === 'pause';
    pauseBtn.innerHTML = lineIcon(paused ? 'play' : 'pause', 18);
    pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseBtn.disabled = !(s.phase === 'play' || s.phase === 'pause');
    for (const h of Object.values(helperEls)) h.b.classList.toggle('is-off', s.phase !== 'play');
  }

  function resetStats() {
    s.stats = {};
    for (const st of game.stats || []) statEls[st.id].textContent = '0';
  }

  const ctx = {
    game, board, roster,
    iconEl: (entry, px) => roster.iconEl(entry, px),
    size: () => ({ w: board.clientWidth, h: board.clientHeight }),
    level(n) {
      s.level = n;
      s.run.level = Math.max(s.run.level, n);
      chip.textContent = 'Level ' + n;
    },
    stat(id, value) {
      s.stats[id] = value;
      if (id === 'score') s.run.score = Number(value) || 0;
      if (statEls[id]) statEls[id].textContent = fmt(value);
    },
    helperState(id, st = {}) {
      const h = helperEls[id];
      if (!h) return;
      if (st.count != null) h.count.textContent = String(st.count);
      h.b.disabled = st.disabled != null ? !!st.disabled : st.count === 0;
      h.b.setAttribute('aria-label', h.label + (st.count != null ? ', ' + st.count + ' left' : ''));
    },
    timer: {
      countdown(sec, onEnd) { timer.countdown(sec, () => { if (s.phase !== 'closed' && onEnd) onEnd(); }); },
      stopwatch: () => timer.stopwatch(), add: sec => timer.add(sec), stop: () => timer.stop(),
      remaining: () => timer.remaining(), elapsed: () => timer.elapsed()
    },
    rng: (...parts) => rng(...parts),
    seed: (level, attempt = 0) => seedOf(game.id, s.runSeed, level, attempt),
    flash(text, tone = 'info') {
      toast.replaceChildren();
      const ti = node('span', 'mg-toast-ic');
      ti.innerHTML = toastIcon(tone);
      const tt = node('span', 'mg-toast-t');
      tt.textContent = text;
      toast.append(ti, tt);
      toast.className = 'mg-toast is-' + tone + ' is-on';
      clearTimeout(toast._t);
      toast._t = later(() => toast.classList.remove('is-on'), 2400);
    },
    announce(text) {
      sr.textContent = '';
      later(() => { sr.textContent = text; }, 30);
    },
    levelDone(spec = {}) {
      s.phase = 'screen';
      s.run.clears += 1;
      const actions = [{ id: 'close', label: 'Close' }];
      if (spec.retry) actions.push({ id: 'retry', label: 'Retry level', icon: 'rotate-ccw' });
      if (spec.next !== false) actions.push({ id: 'next', label: 'Next level', icon: 'chevrons-right', primary: true });
      const p = overlay.show({
        kind: 'level', icon: 'circle-check', tone: 'ok', title: spec.title || 'Level cleared',
        sub: spec.sub, lines: spec.lines, actions, wide: true
      });
      sync();
      return p.then(choice => {
        if (s.phase === 'closed') return 'close';
        if (choice === 'close') { close('close'); return 'close'; }
        if (choice === 'next' || choice === 'retry') {
          overlay.hide();
          s.phase = 'play';
          sync();
          board.focus({ preventScroll: true });
        }
        return choice;
      });
    },
    runOver(spec = {}) {
      s.phase = 'screen';
      timer.stop();
      const score = spec.score != null ? Number(spec.score) : s.run.score;
      const res = store.record(game.id, {
        score, level: spec.level != null ? spec.level : s.run.level, clears: s.run.clears,
        extra: { ...s.run.extra, ...(spec.extra || {}) }, merge: { ...s.run.merge, ...(spec.merge || {}) }
      });
      s.run.recorded = true;
      s.lastRecord = res;
      const lines = [...(spec.lines || []), ['Best score', res.best.score, res.isBest ? 'accent' : '']];
      const p = overlay.show({
        kind: 'over', icon: 'trophy', tone: res.isBest ? 'accent' : '', title: spec.title || 'Run over',
        badge: res.isBest ? 'New best' : '', sub: spec.sub, lines, wide: true,
        actions: [{ id: 'close', label: 'Close' }, { id: 'again', label: 'New run', icon: 'rotate-ccw', primary: true }]
      });
      sync();
      return p.then(choice => {
        if (s.phase === 'closed') return 'close';
        if (choice === 'close') close('close');
        else if (choice === 'again') newRun();
        return choice === 'again' ? 'again' : 'close';
      });
    },
    pref: store.pref(game.id),
    reducedMotion: () => mq.matches,
    onTheme(cb) {
      const mo = new MutationObserver(() => cb({
        theme: document.documentElement.dataset.theme || 'light',
        accent: document.documentElement.dataset.accent || 'gold'
      }));
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
      observers.push(mo);
    },
    extra(values = {}, merge = {}) {
      Object.assign(s.run.extra, values);
      Object.assign(s.run.merge, merge);
    },
    later,
    sound: { play() {} }
  };

  const api = game.create(ctx) || {};

  function endRunRecord() {
    if (s.run.started && !s.run.recorded) {
      s.lastRecord = store.record(game.id, {
        score: s.run.score, level: s.run.level, clears: s.run.clears, extra: s.run.extra, merge: s.run.merge
      });
      s.run.recorded = true;
    }
  }

  function beginRun() {
    timers.forEach(id => clearTimeout(id));
    timers.clear();
    toast.classList.remove('is-on');
    overlay.hide();
    timer.reset();
    timer.thaw('pause');
    s.run = { score: 0, level: startLevel, clears: 0, started: true, recorded: false, extra: {}, merge: {} };
    resetStats();
    ctx.level(startLevel);
    s.phase = 'play';
    sync();
    board.focus({ preventScroll: true });
    if (api.start) api.start(startLevel);
  }

  function newRun() {
    if (!fixedSeed) s.runSeed = String(Date.now());
    beginRun();
  }

  function restart() {
    if (s.phase === 'closed') return;
    endRunRecord();
    newRun();
  }

  function showIntro() {
    s.phase = 'intro';
    const best = store.best(game.id);
    const extra = api.intro ? api.intro() : null;
    overlay.show({
      kind: 'intro', icon: game.icon, title: game.name, sub: game.pitch, rules: game.rules, body: extra,
      lines: best && game.bestLines ? game.bestLines(best) : [], foot: game.keys, wide: true,
      actions: [{ id: 'play', label: 'Play', icon: 'play', primary: true }]
    }).then(choice => { if (choice === 'play' && s.phase === 'intro') beginRun(); });
    sync();
  }

  function pause(reason = 'user') {
    if (s.phase !== 'play') return;
    s.phase = 'pause';
    timer.freeze('pause');
    if (api.pause) api.pause();
    const auto = reason === 'blur' || reason === 'hidden';
    overlay.show({
      kind: 'pause', icon: 'pause', title: 'Paused',
      sub: auto ? 'The game paused because the window lost focus.' : 'The timer is stopped and the board is hidden.',
      actions: [{ id: 'restart', label: 'Restart', icon: 'rotate-ccw' }, { id: 'resume', label: 'Resume', icon: 'play', primary: true }]
    }).then(choice => {
      if (choice === 'resume') resume();
      else if (choice === 'restart') restart();
    });
    sync();
  }

  function resume() {
    if (s.phase !== 'pause') return;
    overlay.hide();
    s.phase = 'play';
    timer.thaw('pause');
    if (api.resume) api.resume();
    sync();
    board.focus({ preventScroll: true });
  }

  function useHelper(id) {
    const h = helperEls[id];
    if (s.phase !== 'play' || !h || h.b.disabled || !api.helper) return;
    const now = performance.now();
    if (now - (helperAt[id] || -Infinity) < HELPER_GAP) return;
    helperAt[id] = now;
    api.helper(id);
  }

  function trap(e) {
    const list = [...dialog.querySelectorAll(FOCUSABLE)].filter(x =>
      !x.disabled && !x.closest('[inert]') && !x.closest('[hidden]') && x.getClientRects().length);
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    const a = document.activeElement;
    if (!dialog.contains(a)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }

  function onKey(e) {
    if (s.phase === 'closed') return;
    if (e.key === 'Tab') { s.backTab = e.shiftKey; later(() => { s.backTab = false; }, 0); trap(e); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const consume = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (overlay.visible()) {
      if (k === 'Escape') { consume(); close('esc'); return; }
      if (k === 'Enter') {
        const b = overlay.primary();
        const a = document.activeElement;
        if (b && !(a && a.tagName === 'BUTTON' && dialog.contains(a))) { consume(); b.click(); }
        return;
      }
      if ((k === 'p' || k === 'P') && s.phase === 'pause') { consume(); resume(); }
      return;
    }
    if (s.phase !== 'play') return;
    if (api.key && api.key(e)) { consume(); return; }
    if (k === 'Escape') { consume(); close('esc'); return; }
    if (k === 'p' || k === 'P') { consume(); pause('user'); return; }
    const h = (game.helpers || []).find(x => x.key && x.key.toLowerCase() === k.toLowerCase());
    if (h) { consume(); if (!e.repeat) useHelper(h.id); }
  }

  function onVisibility() {
    if (document.hidden) { timer.freeze('hidden'); pause('hidden'); } else timer.thaw('hidden');
  }
  function onBlur() { timer.freeze('blur'); pause('blur'); }
  function onFocus() { timer.thaw('blur'); }

  let resizeFrame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (api.resize && s.phase !== 'closed') api.resize(ctx.size()); });
  });

  let resolveClosed;
  const closed = new Promise(r => { resolveClosed = r; });

  function close(reason = 'close') {
    if (s.phase === 'closed') return;
    endRunRecord();
    s.phase = 'closed';
    overlay.cancel('close');
    try { if (api.destroy) api.destroy(); } catch (err) { console.error(err); }
    timer.destroy();
    ro.disconnect();
    cancelAnimationFrame(resizeFrame);
    observers.forEach(o => o.disconnect());
    timers.forEach(id => clearTimeout(id));
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    inerted.forEach(el => { el.inert = false; });
    scrim.remove();
    if (current === handle) current = null;
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    resolveClosed(reason);
    if (opts.onClose) opts.onClose(reason, s.lastRecord || null);
  }

  pauseBtn.addEventListener('click', () => (s.phase === 'pause' ? resume() : pause('user')));
  closeBtn.addEventListener('click', () => close('close'));
  restartBtn.addEventListener('click', restart);
  board.addEventListener('focus', e => {
    if (s.backTab && e.relatedTarget && board.contains(e.relatedTarget)) {
      const list = [...dialog.querySelectorAll(FOCUSABLE)].filter(x =>
        !x.disabled && !board.contains(x) && !x.closest('[inert]') && !x.closest('[hidden]') && x.getClientRects().length);
      const before = list.filter(x => x.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING);
      const to = before.length ? before[before.length - 1] : list[list.length - 1];
      if (to) { to.focus(); return; }
    }
    if (api.focus) api.focus();
  });

  const handle = {
    game, ctx, closed, close,
    pause: () => pause('user'),
    resume,
    restart,
    timeWarp(sec) { timer.add(timer.view().mode === 'down' ? -sec : sec); },
    state: () => ({
      id: game.id, phase: s.phase, level: s.level, screen: overlay.screen(), seed: s.runSeed,
      stats: { ...s.stats }, run: { ...s.run },
      timer: { ...timer.view(), remaining: timer.remaining(), elapsed: timer.elapsed() },
      debug: api.debug ? api.debug() : {}
    })
  };
  current = handle;

  try {
    for (const c of document.body.children) {
      if (!c.inert) { c.inert = true; inerted.push(c); }
    }
    document.body.appendChild(scrim);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    ro.observe(board);
    ctx.level(startLevel);
    resetStats();
    timer.reset();
    sync();
    if (opts.autostart) beginRun();
    else showIntro();
  } catch (err) {
    close('error');
    throw err;
  }
  return handle;
}
