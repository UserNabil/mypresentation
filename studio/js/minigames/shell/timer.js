export function clock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export function createTimer(onRender = () => {}, now = () => performance.now()) {
  let mode = 'idle';
  let duration = 0;
  let spentMs = 0;
  let since = null;
  let halted = false;
  let onEnd = null;
  let handle = 0;
  const frozen = new Set();

  const active = () => (mode === 'down' || mode === 'up') && !halted;
  const running = () => active() && frozen.size === 0;
  const spent = () => spentMs + (since !== null ? now() - since : 0);
  const remainingMs = () => Math.max(0, duration - spent());

  function settle() {
    if (since !== null) {
      spentMs += now() - since;
      since = null;
    }
  }

  function arm() {
    if (running() && since === null) since = now();
  }

  function view() {
    const sec = mode === 'down' ? Math.ceil(remainingMs() / 1000) : spent() / 1000;
    return {
      mode,
      text: mode === 'idle' ? '00:00' : clock(sec),
      low: mode === 'down' && !halted && remainingMs() < 10000,
      paused: frozen.size > 0 && active()
    };
  }

  function render() {
    onRender(view());
  }

  function loop() {
    if (handle) return;
    handle = setInterval(tick, 100);
  }

  function unloop() {
    if (handle) clearInterval(handle);
    handle = 0;
  }

  function tick() {
    if (mode === 'down' && running() && remainingMs() <= 0) {
      settle();
      spentMs = duration;
      halted = true;
      unloop();
      render();
      const fn = onEnd;
      onEnd = null;
      if (fn) fn();
      return;
    }
    render();
  }

  function begin(m, sec, fn) {
    mode = m;
    duration = Math.max(0, sec || 0) * 1000;
    spentMs = 0;
    since = null;
    halted = false;
    onEnd = fn || null;
    arm();
    loop();
    render();
  }

  return {
    countdown(sec, fn) { begin('down', sec, fn); },
    stopwatch() { begin('up', 0, null); },
    add(sec) {
      const ms = (Number(sec) || 0) * 1000;
      if (mode === 'down') duration = Math.max(0, duration + ms);
      else if (mode === 'up') spentMs = Math.max(0, spentMs + ms);
      tick();
    },
    stop() {
      settle();
      halted = true;
      onEnd = null;
      unloop();
      render();
    },
    reset() {
      settle();
      mode = 'idle';
      halted = false;
      onEnd = null;
      spentMs = 0;
      duration = 0;
      unloop();
      render();
    },
    remaining() { return mode === 'down' ? remainingMs() / 1000 : 0; },
    elapsed() { return spent() / 1000; },
    freeze(reason) {
      frozen.add(reason);
      settle();
      render();
    },
    thaw(reason) {
      frozen.delete(reason);
      arm();
      render();
    },
    frozen() { return frozen.size > 0; },
    view,
    destroy() {
      unloop();
      onEnd = null;
    }
  };
}
