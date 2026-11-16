/* ============================================================================
   LIVE GAMEBRYO VIEWER — the game's own engine, driven like a 3D view.

   The tool keeps ONE gb_render daemon resident: every camera move re-renders a
   frame (~60 ms) and the browser swaps the image. It is not a still picture —
   you drag to rotate, wheel to zoom, and it turns on its own.

   Why it is built this way (both points were bugs, not preferences)
   ----------------------------------------------------------------
   • **Preload, then swap.** Setting `.src` on the VISIBLE <img> blanks it while
     the next frame downloads, so rotating looked like freezing. Every frame is
     loaded into a detached Image() and only assigned once decoded.
   • **Coalesce.** One request in flight at a time; a move during that flight
     just marks « one more wanted ». Without this, dragging queues dozens of
     renders and the daemon falls minutes behind the mouse.

   Shared by the 3D Assets page and by the monster/item sheets, so both show the
   same thing the player sees.

   createLiveViewer({ img, msg, wrap, urlFor, onFail })
     img    <img> that displays the frames
     msg    element used to say what is happening (may be null)
     wrap   element that captures drag/wheel (defaults to img.parentNode)
     urlFor ({yaw,pitch,dist,t}) -> the request URL
     onFail (reason) -> called when the engine cannot render this asset
   ========================================================================== */

const DEFAULTS = { yaw: 0.6435, pitch: 0.716, dist: 1.15, t: 0 };

export function createLiveViewer(opts) {
  const img = opts.img;
  const msg = opts.msg || null;
  const wrap = opts.wrap || (img && img.parentNode);
  const S = Object.assign({}, DEFAULTS, {
    pending: false, next: false, auto: null, play: null,
    dragging: false, lx: 0, ly: 0, dead: false, first: true,
  });

  function say(text) { if (msg) { msg.textContent = text; msg.style.display = 'grid'; } }
  function quiet() { if (msg) msg.style.display = 'none'; }

  function fetchFrame() {
    if (S.dead || !img) return;
    if (S.pending) { S.next = true; return; }       // coalesce: only the latest camera flies
    S.pending = true;
    const tmp = new Image();                        // preload: the visible frame never blanks
    tmp.onload = () => {
      img.src = tmp.src;
      S.pending = false; S.first = false; quiet();
      if (S.next) { S.next = false; fetchFrame(); }
    };
    tmp.onerror = async () => {
      S.pending = false;
      if (S.first) {
        /* First frame pays the engine boot (~8 s). A failure here is real: read the cause
           the route sends back instead of leaving an empty frame on screen. */
        let why = 'the engine could not render this asset';
        try {
          const r = await fetch(tmp.src);
          const j = await r.json(); why = j.detail || why;
        } catch (e) { /* keep the generic reason */ }
        stop();
        if (opts.onFail) opts.onFail(why); else say(why);
        return;
      }
      if (S.next) { S.next = false; fetchFrame(); }
    };
    tmp.src = opts.urlFor({ yaw: S.yaw, pitch: S.pitch, dist: S.dist, t: S.t });
  }

  function start() {
    S.dead = false; S.first = true;
    Object.assign(S, DEFAULTS);
    say('the game engine is loading this model…');
    fetchFrame();
  }

  function stop() {
    if (S.auto) { clearInterval(S.auto); S.auto = null; }
    if (S.play) { clearInterval(S.play); S.play = null; }
    S.dead = true; S.pending = false; S.next = false;
  }

  /** Turntable — this is what makes it read as 3D without touching anything. */
  function setAuto(on) {
    if (S.auto) { clearInterval(S.auto); S.auto = null; }
    if (!on) return;
    S.auto = setInterval(() => {
      if (S.dragging || S.dead) return;
      S.yaw += 0.055;
      fetchFrame();
    }, 90);
  }
  function autoOn() { return !!S.auto; }

  /** Advance the engine clock: particle effects and material animations play. */
  function setPlay(on) {
    if (S.play) { clearInterval(S.play); S.play = null; }
    if (!on) { S.t = 0; fetchFrame(); return; }
    S.play = setInterval(() => {
      if (S.dead) return;
      S.t += 0.05; if (S.t > 8) S.t = 0;
      fetchFrame();
    }, 90);
  }
  function playOn() { return !!S.play; }

  if (wrap) {
    wrap.style.cursor = 'grab';
    wrap.addEventListener('mousedown', e => {
      S.dragging = true; S.lx = e.clientX; S.ly = e.clientY;
      wrap.style.cursor = 'grabbing'; e.preventDefault();
    });
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      S.dist = Math.max(0.4, Math.min(6, S.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
      fetchFrame();
    }, { passive: false });
  }
  const onMove = e => {
    if (!S.dragging || S.dead) return;
    const dx = e.clientX - S.lx, dy = e.clientY - S.ly;
    S.lx = e.clientX; S.ly = e.clientY;
    S.yaw -= dx * 0.012;
    /* Clamp the pitch: past the poles the camera flips and the image is unreadable. */
    S.pitch = Math.max(0.08, Math.min(3.05, S.pitch + dy * 0.012));
    fetchFrame();
  };
  const onUp = () => { if (S.dragging) { S.dragging = false; if (wrap) wrap.style.cursor = 'grab'; } };
  addEventListener('mousemove', onMove);
  addEventListener('mouseup', onUp);

  function destroy() {
    stop();
    removeEventListener('mousemove', onMove);
    removeEventListener('mouseup', onUp);
  }

  return { start, stop, destroy, setAuto, autoOn, setPlay, playOn, state: S };
}
