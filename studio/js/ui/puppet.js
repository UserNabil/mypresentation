const BASE = '/studio/img/brand/puppet/';
const SETS = [{ dir: BASE + '2x', k: 1 }, { dir: BASE + '1x', k: 0.5 }, { dir: BASE + 'q', k: 0.25 }];
const WING_SUFFIX = ['', '_256', '_128'];
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const EXPR = {
  neutral: { eyes: 'open', mouth: 'smile', blush: 0.8 },
  happy: { eyes: 'happy', mouth: 'smile', blush: 1 },
  laugh: { eyes: 'happy', mouth: 'laugh', blush: 1, shake: 1 },
  surprised: { eyes: 'surprised', mouth: 'o_small', blush: 0.15, hy: -7, hsy: 1.05 },
  sad: { eyes: 'open', mouth: 'sad', blush: 0.25, hy: 6, hrot: -3, droop: 24, gy: 0.9, brows: true, sweat: true },
  sleepy: { eyes: 'sleepy', mouth: 'flat', blush: 0.55, hy: 5, hrot: 4, droop: 12 },
  cheeky: { eyes: 'open', mouth: 'tongue', blush: 1, hrot: 6, gx: 0.8, gy: -0.2 }
};

const imgCache = {};
function loadImg(src, n) {
  n = n || 0;
  if (!imgCache[src]) {
    imgCache[src] = new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => {
        delete imgCache[src];
        if (n < 3) setTimeout(() => loadImg(src, n + 1).then(res, rej), 250 * (n + 1));
        else rej(new Error('missing ' + src));
      };
      i.src = src;
    });
  }
  return imgCache[src];
}

let rigPromise = null;
export function loadRig() {
  if (!rigPromise) rigPromise = fetch(BASE + 'rig.json').then((r) => r.json());
  return rigPromise;
}

const setPromises = {};
function loadSet(rig, si) {
  if (!setPromises[si]) {
    const names = Object.keys(rig.parts);
    setPromises[si] = Promise.all(names.map((n) => loadImg(SETS[si].dir + '/' + n + '.png').then((i) => [n, i]))).then(async (arr) => {
      const m = Object.fromEntries(arr);
      m.wing_l = await loadImg(BASE + 'wings/bee_wing_l' + WING_SUFFIX[si] + '.png');
      m.wing_r = await loadImg(BASE + 'wings/bee_wing_r' + WING_SUFFIX[si] + '.png');
      return m;
    }).catch((e) => { delete setPromises[si]; throw e; });
  }
  return setPromises[si];
}

const TINT_PARTS = ['head', 'head_back', 'body', 'body_back', 'antenna_l', 'antenna_r', 'arm_l', 'arm_r', 'arm_up_l', 'arm_up_r'];
const tintCache = {};
const GOLD_HUE = 43;

function tintCanvas(img, delta) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 8) continue;
    const r = a[i] / 255, g = a[i + 1] / 255, b = a[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
    if (dd < 0.2) continue;
    const s = dd / (1 - Math.abs(2 * l - 1));
    if (s < 0.45 || l < 0.35) continue;
    let h;
    if (mx === r) h = ((g - b) / dd) % 6; else if (mx === g) h = (b - r) / dd + 2; else h = (r - g) / dd + 4;
    h *= 60;
    if (h < 0) h += 360;
    if (h < 30 || h > 62) continue;
    const nh = (h + delta + 360) % 360;
    const cc = (1 - Math.abs(2 * l - 1)) * s, hp = nh / 60, xx = cc * (1 - Math.abs((hp % 2) - 1)), m = l - cc / 2;
    let R = 0, G = 0, B = 0;
    if (hp < 1) { R = cc; G = xx; } else if (hp < 2) { R = xx; G = cc; } else if (hp < 3) { G = cc; B = xx; } else if (hp < 4) { G = xx; B = cc; } else if (hp < 5) { R = xx; B = cc; } else { R = cc; B = xx; }
    a[i] = Math.round((R + m) * 255);
    a[i + 1] = Math.round((G + m) * 255);
    a[i + 2] = Math.round((B + m) * 255);
  }
  x.putImageData(d, 0, 0);
  return c;
}

async function tintSet(base, si, hue) {
  const delta = Math.round(hue - GOLD_HUE);
  if (Math.abs(delta) < 3) return base;
  const key = si + ':' + delta;
  if (!tintCache[key]) {
    const out = Object.assign({}, base);
    TINT_PARTS.forEach((n) => { if (base[n]) out[n] = tintCanvas(base[n], delta); });
    tintCache[key] = out;
  }
  return tintCache[key];
}

function spring2(s, target, dt, hz, zeta) {
  const w = 2 * Math.PI * hz;
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const a = -w * w * (s.x - target) - 2 * zeta * w * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
}

const CH = ['rx', 'ry', 'rrot', 'rsx', 'rsy', 'hrot', 'hx', 'hy', 'hsx', 'hsy', 'arml', 'armr', 'wamp', 'whz', 'blush', 'gx', 'gy', 'droop', 'wag', 'fly', 'brow', 'fpx', 'fpy'];
const RATE = { rx: 16, ry: 18, rrot: 14, rsx: 16, rsy: 16, hrot: 12, hx: 12, hy: 14, hsx: 16, hsy: 16, arml: 15, armr: 15, wamp: 7, whz: 6, blush: 9, gx: 24, gy: 24, droop: 8, wag: 10, fly: 30, brow: 9, fpx: 12, fpy: 12 };
const IDLE = { rsx: 1, rsy: 1, hsx: 1, hsy: 1, wamp: 7, whz: 9, blush: 0.8 };

const ACTIONS = {
  dance1: {
    dur: 5.2,
    face: { eyes: 'happy', mouth: 'smile', blush: 1 },
    fn(a, T, e, t) {
      const w = 2 * Math.PI * 0.9 * t;
      T.rx += e * 44 * Math.sin(w);
      T.ry += e * -9 * Math.abs(Math.sin(w * 2 + 0.3));
      T.rrot += e * 7 * Math.sin(w);
      T.hrot += e * -8 * Math.sin(w);
      T.arml += e * (70 + 45 * Math.sin(w * 2));
      T.armr += e * -(70 - 45 * Math.sin(w * 2));
      T.wamp += e * 6;
    }
  },
  dance2: {
    dur: 5,
    face: { eyes: 'happy', mouth: 'laugh', blush: 1 },
    fn(a, T, e, t) {
      const f = 2.1;
      const p = Math.abs(Math.sin(Math.PI * f * t));
      const air = Math.sin(Math.PI * f * t);
      T.ry += e * -58 * p * p;
      const ground = 1 - p;
      T.rsy += e * (0.1 * (p - 0.5) * 2 - 0.1 * Math.pow(ground, 6));
      T.rsx += e * (-0.06 * (p - 0.5) * 2 + 0.1 * Math.pow(ground, 6));
      T.arml += e * (88 * p);
      T.armr += e * -(88 * p);
      T.hrot += e * 5 * Math.sin(2 * Math.PI * f * 0.5 * t);
      T.wamp += e * 8;
      T.whz += e * 6;
    }
  },
  dance3: {
    dur: 4.4,
    face: { eyes: 'happy', mouth: 'smile', blush: 1 },
    fn(a, T, e, t, u) {
      const spin = clamp(u / 0.78, 0, 1);
      const th = 2 * Math.PI * (a.def.turns || 2) * smooth(spin);
      const cs = Math.cos(th);
      a.back = cs < 0;
      T.rsx = Math.max(0.1, Math.abs(cs));
      a.spin = true;
      T.rrot += e * 9 * Math.sin(2 * Math.PI * 4.2 * t) * (1 - smooth((u - 0.8) / 0.2));
      T.ry += e * -14 * Math.sin(Math.PI * spin);
      T.arml += e * 55;
      T.armr += e * -55;
      T.wamp += e * 8;
    }
  },
  cheer: {
    dur: 3.4,
    face: { eyes: 'happy', mouth: 'laugh', blush: 1 },
    fn(a, T, e, t) {
      const p = Math.abs(Math.sin(Math.PI * 1.7 * t));
      T.arml += e * (108 + 10 * Math.sin(t * 13));
      T.armr += e * -(108 + 10 * Math.sin(t * 13 + 1));
      T.ry += e * -30 * p * p;
      T.rsy += e * 0.07 * (p - 0.5);
      T.hrot += e * 4 * Math.sin(t * 6);
      T.hy += e * -4;
      T.wamp += e * 9;
      T.whz += e * 7;
    }
  },
  wave: {
    dur: 3.2,
    face: { eyes: 'open', mouth: 'smile', blush: 1 },
    fn(a, T, e, t) {
      T.armr += e * -(104 + 18 * Math.sin(2 * Math.PI * 3.4 * t));
      T.hrot += e * 6;
      T.hx += e * -3;
      T.rrot += e * -2;
      T.gx += e * -0.2;
    }
  },
  shake: {
    dur: 1.7,
    face: { eyes: 'surprised', mouth: 'sad', blush: 0.1, brows: true, sweat: true },
    fn(a, T, e, t, u) {
      const decay = Math.pow(1 - u, 1.3);
      T.rx += e * 15 * Math.sin(2 * Math.PI * 9 * t) * decay;
      T.rrot += e * 4 * Math.sin(2 * Math.PI * 9 * t + 1) * decay;
      T.hrot += e * -5 * Math.sin(2 * Math.PI * 9 * t) * decay;
      T.droop += e * 30;
      T.arml += e * 12;
      T.armr += e * -12;
      T.hy += e * 5;
    }
  },
  fly: {
    dur: 4.2,
    face: { eyes: 'open', mouth: 'laugh', blush: 1 },
    fn(a, T, e, t, u, p) {
      const D = p.flyDist;
      const out = 1.55, gap = 0.2, inn = 1.55;
      let x = 0;
      if (t < out) { const v = t / out; x = D * v * v * v; }
      else if (t < out + gap) x = D * 1.4;
      else if (t < out + gap + inn) { const v = (t - out - gap) / inn; x = -D * Math.pow(1 - v, 2.2); }
      a.direct = x;
      const vx = a.prevX === undefined ? 0 : (x - a.prevX) / Math.max(0.001, p.lastDt);
      a.prevX = x;
      a.tilt = lerp(a.tilt || 0, clamp(vx * 0.014, -22, 22), 0.25);
      T.rrot += a.tilt;
      T.ry += -10 * Math.sin(t * 5.5) + (t < out ? -35 * smooth(t / out) : 0);
      T.wamp += 16;
      T.whz += 18;
      T.arml += 40;
      T.armr += -40;
      T.hrot += a.tilt * -0.4;
    }
  },
  peek: {
    dur: 6.4,
    face: { eyes: 'open', mouth: 'smile', blush: 1 },
    fn(a, T, e, t, u, p) {
      const hidden = p.hideDist;
      const peekY = p.peekDist;
      let y;
      if (t < 0.9) y = lerp(hidden, peekY, 1 - Math.pow(1 - smooth(t / 0.9), 3));
      else if (t < 2.9) y = peekY - 6 * Math.sin((t - 0.9) * 5);
      else if (t < 3.3) y = lerp(peekY, hidden, smooth((t - 2.9) / 0.4));
      else if (t < 4.0) y = hidden;
      else if (t < 4.75) { const v = (t - 4.0) / 0.75; y = lerp(hidden, -26, 1 - Math.pow(1 - v, 3)); }
      else if (t < 5.3) y = lerp(-26, 0, smooth((t - 4.75) / 0.55));
      else y = 0;
      a.hard = y;
      if (t > 0.9 && t < 2.9) {
        const ph = (t - 0.9) / 2;
        T.gx += ph < 0.35 ? -1 : ph < 0.7 ? 1 : 0;
        T.gy += -0.1;
        T.hrot += ph < 0.35 ? -4 : ph < 0.7 ? 4 : 0;
        T.hx += ph < 0.35 ? -6 : ph < 0.7 ? 6 : 0;
      }
      if (t > 4.2 && t < 5.4) {
        const q = smooth((t - 4.2) / 0.4);
        T.arml += 60 * q;
        T.armr += -60 * q;
        T.rsy += 0.1 * Math.sin((t - 4.4) * 9) * Math.max(0, 1 - (t - 4.4) / 0.9);
      }
      if (t > 5.0) T.armr += -(100 + 16 * Math.sin((t - 5) * 18)) * smooth((t - 5) / 0.25) * (1 - smooth((t - 6) / 0.4));
    }
  }
};

ACTIONS.sway = Object.assign({}, ACTIONS.dance1, { dur: 1.7 });
ACTIONS.happy = Object.assign({}, ACTIONS.cheer, { dur: 2.2 });
ACTIONS.spin1 = Object.assign({}, ACTIONS.dance3, { dur: 1.7, turns: 1 });
ACTIONS.hop = {
  dur: 1.1,
  face: { eyes: 'happy', mouth: 'smile', blush: 1 },
  fn(a, T, e, t, u) {
    const air = Math.sin(Math.PI * clamp((u - 0.15) / 0.7, 0, 1));
    const pre = Math.max(0, 1 - u / 0.15);
    const post = u > 0.85 ? Math.sin(Math.PI * (u - 0.85) / 0.15) : 0;
    T.ry += e * -34 * air;
    T.rsy += e * (0.09 * air - 0.14 * pre - 0.1 * post);
    T.rsx += e * (-0.05 * air + 0.1 * pre + 0.08 * post);
    T.arml += e * 50 * air;
    T.armr += e * -50 * air;
  }
};

const ACTION_EASE = { fly: [0.01, 0.01], peek: [0.01, 0.2] };

export class Puppet {
  constructor(canvas, opts, rig) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.rig = rig;
    this.opts = Object.assign({ bee: 200, w: 320, h: 260, fps: 60, dpr: Math.min(2, window.devicePixelRatio || 1) }, opts);
    this.tm = Math.random() * 10;
    this.ch = {};
    this.T = {};
    CH.forEach((c) => { this.ch[c] = IDLE[c] !== undefined ? IDLE[c] : 0; });
    this.expr = 'neutral';
    this.actions = [];
    this.asleep = false;
    this.sl = 0;
    this.pop = { x: 0, v: 0 };
    this.antRel = { l: 0, r: 0 };
    this.breath = 0;
    this.antLz = { x: 0, v: 0 };
    this.antRz = { x: 0, v: 0 };
    this.armZ = { x: 0, v: 0 };
    this.talk = null;
    this.blink = null;
    this.nextBlink = rnd(1.2, 3);
    this.gaze = { next: rnd(0.8, 2), ix: 0, iy: 0, had: false, pa: 0 };
    this.egs = { lx: { x: 0, v: 0 }, ly: { x: 0, v: 0 }, rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 } };
    this.hs = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } };
    this.rel = null;
    this.calm = false;
    this.pointer = null;
    this.follow = true;
    this.speed = 1;
    this.reduced = false;
    this.zs = [];
    this.nextSway = rnd(2, 5);
    this.sway = null;
    this.wingPhase = 0;
    this.flyDist = 600;
    this.hideDist = 400;
    this.peekDist = 200;
    this.lastDt = 1 / 60;
    this.face = { eyes: 'open', prevEyes: null, ef: 1, mouth: 'smile', prevMouth: null, mf: 1 };
    this.accent = '#9A6A00';
    this.hue = null;
    this.acc = 0;
    this.visible = true;
    this.ready = false;
    this.resize(this.opts.w, this.opts.h, this.opts.bee);
  }

  async resize(w, h, bee) {
    const o = this.opts;
    o.w = w; o.h = h; o.bee = bee;
    const dpr = o.dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    if (o.cssSize !== false) { this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; }
    this.k = (bee * dpr) / 512;
    const ratio = 0.58 * this.k;
    this.si = ratio > 0.5 ? 0 : ratio > 0.25 ? 1 : 2;
    this.baseImgs = await loadSet(this.rig, this.si);
    this.imgs = this.hue === null ? this.baseImgs : await tintSet(this.baseImgs, this.si, this.hue);
    const wr = (this.cv.width / this.k);
    this.flyDist = wr / 2 + 300;
    const hw = this.cv.height / this.k;
    this.hideDist = hw / 2 + 256 - 14;
    this.peekDist = hw / 2 + 256 - 205;
    this.eyeOff = {};
    ['l', 'r'].forEach((s) => {
      const p = this.rig.parts['eye3_fill_' + s];
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.ceil(p.w * p.s * this.k));
      c.height = Math.max(2, Math.ceil((p.h * p.s + 6) * this.k));
      this.eyeOff[s] = { c, x: c.getContext('2d') };
    });
    this.ready = true;
    this.renderStatic();
  }

  setReduced(v) {
    this.reduced = v;
    if (!v) wakeLoop();
    if (v) {
      this.actions = [];
      this.talk = null;
      this.blink = null;
      this.asleep = false;
      this.sl = 0;
      CH.forEach((c) => { this.ch[c] = IDLE[c] !== undefined ? IDLE[c] : 0; });
      this.antLz.x = this.antRz.x = this.antLz.v = this.antRz.v = 0;
      Object.values(this.egs).forEach((q) => { q.x = 0; q.v = 0; });
      Object.values(this.hs).forEach((q) => { q.x = 0; q.v = 0; });
      this.renderStatic();
    }
  }

  renderStatic() {
    if (!this.ready) return;
    this.ch.blush = EXPR[this.expr].blush;
    this.resolveFace(0, true);
    this.ch.brow = this.targetBrow;
    this.draw();
  }

  setExpression(name) {
    if (!EXPR[name]) return;
    this.expr = name;
    this.pop.v += -7;
    if (this.reduced) this.renderStatic();
  }

  setPointer(p) { this.pointer = p; }

  async setTint(hue) {
    if (hue === this.hue && this.imgs) return;
    this.hue = hue;
    if (!this.baseImgs) return;
    this.imgs = hue === null ? this.baseImgs : await tintSet(this.baseImgs, this.si, hue);
    if (this.reduced) this.renderStatic();
  }

  play(name) {
    if (this.reduced || !ACTIONS[name]) return;
    if (this.actions.some((a) => (a.name === 'fly' || a.name === 'peek') && !a.ending)) return;
    if (this.asleep) this.wake(true);
    this.actions.forEach((a) => { if (!a.ending) { a.ending = true; a.endT = 0; } });
    const def = ACTIONS[name];
    this.actions.push({ name, def, t: 0, ending: false, endT: 0, ease: ACTION_EASE[name] || [0.25, 0.35] });
    this.pop.v += -4;
  }

  sleep() {
    if (this.reduced) return;
    this.actions.forEach((a) => { if (!a.ending) { a.ending = true; a.endT = 0; } });
    this.asleep = true;
  }

  wake(quiet) {
    if (!this.asleep) return;
    this.asleep = false;
    this.pop.v += -10;
    this.wakeFlash = quiet ? 0 : 0.7;
  }

  speak(dur) {
    if (this.reduced) return;
    this.talk = { until: this.tm + dur, next: 0, key: 'smile' };
  }

  stopAll() {
    this.actions = this.actions.filter((a) => a.name !== 'fly' && a.name !== 'peek');
    this.ch.rx = 0;
    this.actions.forEach((a) => { a.ending = true; a.endT = 0; });
    this.talk = null;
    if (this.asleep) this.wake(true);
  }

  isBusy() { return this.actions.length > 0 || this.asleep || !!this.talk; }

  resolveFace(dt, instant) {
    const base = EXPR[this.expr];
    let eyes = base.eyes, mouth = base.mouth, blush = base.blush;
    let ov = null;
    for (const a of this.actions) {
      const e = this.envOf(a);
      if (e > 0.35 && a.def.face) ov = a.def.face;
    }
    let brows = !!base.brows;
    if (ov) { eyes = ov.eyes; mouth = ov.mouth; blush = ov.blush; brows = !!ov.brows; }
    if (this.wakeFlash > 0) { eyes = 'surprised'; mouth = 'o_small'; this.wakeFlash -= dt; }
    if (this.sl > 0.15) {
      eyes = this.sl > 0.6 ? 'closed' : 'sleepy';
      mouth = this.sl > 0.6 ? 'closed' : 'flat';
      blush = 0.6;
    }
    if (this.talk) {
      if (this.tm > this.talk.until) { this.talk = null; }
      else {
        this.talk.next -= dt;
        if (this.talk.next <= 0) {
          const opts = ['A', 'E', 'O', 'M', 'A', 'E', 'smile', 'O', 'A'].filter((m) => m !== this.talk.key);
          this.talk.key = pick(opts);
          this.talk.next = rnd(0.07, 0.17);
        }
        mouth = this.talk.key;
      }
    }
    const f = this.face;
    if (instant) {
      f.eyes = eyes; f.mouth = mouth; f.ef = 1; f.mf = 1; f.prevEyes = null; f.prevMouth = null;
    } else {
      if (eyes !== f.eyes) { f.prevEyes = f.eyes; f.eyes = eyes; f.ef = 0; }
      if (mouth !== f.mouth) { f.prevMouth = f.mouth; f.mouth = mouth; f.mf = 0; }
      f.ef = Math.min(1, f.ef + dt / 0.07);
      f.mf = Math.min(1, f.mf + dt / (this.talk ? 0.04 : 0.08));
    }
    this.targetBlush = blush;
    this.targetBrow = brows ? 1 : 0;
  }

  envOf(a) {
    const inn = a.ease[0], out = a.ease[1];
    let e = smooth(a.t / inn);
    if (a.t > a.def.dur - out) e *= smooth((a.def.dur - a.t) / out);
    if (a.ending) e *= 1 - smooth(a.endT / 0.3);
    return e;
  }

  update(dtReal) {
    const dt = Math.min(dtReal, 1 / 15) * this.speed;
    this.lastDt = dt || 1 / 60;
    this.tm += dt;
    const tm = this.tm;
    const T = this.T;
    CH.forEach((c) => { T[c] = IDLE[c] !== undefined ? IDLE[c] : 0; });
    const sl = this.sl;
    const breathHz = lerp(0.3, 0.17, sl);
    const breath = Math.sin(tm * 2 * Math.PI * breathHz);
    this.breath = breath * lerp(1, 1.5, sl);
    T.ry += lerp(5, 2, sl) * Math.sin(tm * 2 * Math.PI * 0.42 + 1) - 2;
    T.rrot += 1.3 * Math.sin(tm * 2 * Math.PI * 0.37);
    T.rx += 3 * Math.sin(tm * 2 * Math.PI * 0.21 + 0.5);
    T.hrot += 2.6 * Math.sin(tm * 2 * Math.PI * 0.29) + 1.4 * Math.sin(tm * 2 * Math.PI * 0.71 + 2);
    T.hx += 1.8 * Math.sin(tm * 2 * Math.PI * 0.23 + 1.3);
    T.hy += -3 * (0.5 + 0.5 * breath);
    T.arml += 3 * Math.sin(tm * 2 * Math.PI * 0.5) + 2;
    T.armr += -3 * Math.sin(tm * 2 * Math.PI * 0.5 + 1.7) - 2;
    T.wag += 4 * Math.sin(tm * 2 * Math.PI * 0.6);
    T.wamp += 1.5 * Math.sin(tm * 1.7);
    if (this.flyingFn && this.flyingFn()) {
      T.wamp += 10;
      T.whz += 8;
      T.ry += -6 * Math.sin(tm * 2 * Math.PI * 0.9);
    }

    if (this.calm) {
      T.ry = 0; T.rrot = 0; T.rx = 0; T.hrot = 0; T.hx = 0; T.hy = 0; T.arml = 0; T.armr = 0; T.wag = 0;
      this.breath = 0;
    }
    if (!this.asleep && !this.sway && !this.calm && tm > this.nextSway) {
      this.sway = { t: 0, dur: rnd(1.4, 2.2), side: Math.random() < 0.5 ? 'l' : 'r', amp: rnd(10, 20) };
    }
    if (this.sway) {
      const s = this.sway;
      s.t += dt;
      const e = Math.sin(Math.PI * clamp(s.t / s.dur, 0, 1));
      const v = s.amp * e * e * (1 + 0.4 * Math.sin(s.t * 10));
      if (s.side === 'l') T.arml += v; else T.armr -= v;
      T.hrot += (s.side === 'l' ? 1 : -1) * 2 * e;
      if (s.t >= s.dur) { this.sway = null; this.nextSway = tm + rnd(4, 9); }
    }

    if (this.asleep) this.sl = Math.min(1, this.sl + dt / 1.8); else this.sl = Math.max(0, this.sl - dt / 0.9);
    const slE = smooth(this.sl);
    T.hrot += 13 * slE;
    T.hy += 14 * slE;
    T.hx += 4 * slE;
    T.arml += -10 * slE;
    T.armr += 10 * slE;
    T.wamp -= 5.5 * slE;
    T.whz -= 6 * slE;
    T.droop += 20 * slE;
    T.rsy -= 0.03 * slE;

    const base = EXPR[this.expr];
    T.hy += base.hy || 0;
    T.hrot += base.hrot || 0;
    T.hsy *= base.hsy || 1;
    T.droop += base.droop || 0;
    T.gx += base.gx || 0;
    T.gy += base.gy || 0;
    if (base.shake) T.rx += 3 * Math.sin(tm * 2 * Math.PI * 11) * 1;

    this.flyAct = null;
    this.peekAct = null;
    this.spinAct = null;
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const a = this.actions[i];
      a.t += dt;
      if (a.ending) a.endT += dt;
      const e = this.envOf(a);
      a.def.fn(a, T, e, a.t, a.t / a.def.dur, this);
      if (a.name === 'fly') this.flyAct = a;
      if (a.name === 'peek') this.peekAct = a;
      if (a.spin) this.spinAct = a;
      if (a.t >= a.def.dur || (a.ending && a.endT >= 0.3)) this.actions.splice(i, 1);
    }

    this.updateGaze(dt, T);
    this.updateBlink(dt);
    this.resolveFace(dt, false);
    T.blush = this.targetBlush !== undefined ? this.targetBlush : 0.8;
    T.brow = this.targetBrow || 0;

    CH.forEach((c) => {
      const r = RATE[c];
      this.ch[c] += (T[c] - this.ch[c]) * (1 - Math.exp(-dt * r));
    });
    if (this.peekAct) this.ch.ry = this.peekAct.hard;
    if (this.flyAct) this.ch.rx = this.flyAct.direct;
    if (this.spinAct) this.ch.rsx = T.rsx;
    this.back = !!(this.spinAct && this.spinAct.back);

    this.wingPhase += dt * 2 * Math.PI * this.ch.whz;
    const c = this.ch;
    const hv = c.hrot + c.rrot;
    const uy = c.ry * 0.12 + c.hy * 0.2;
    const ux = c.rx * 0.06 + c.hx * 0.1;
    const drive = hv + uy + ux;
    spring2(this.antLz, drive, dt, 2.4, 0.5);
    spring2(this.antRz, drive, dt, 2.9, 0.45);
    this.antRel = {
      l: (this.antLz.x - drive) * 1.4 + 1.2 * Math.sin(tm * 2.1) - c.droop * 0.8,
      r: (this.antRz.x - drive) * 1.4 + 1.2 * Math.sin(tm * 2.4 + 1) + c.droop * 0.8
    };
    spring2(this.pop, 0, dt, 3.4, 0.28);
    spring2(this.armZ, c.ry, dt, 2.2, 0.4);

    if (this.sl > 0.6) {
      if (!this.nextZ || tm > this.nextZ) { this.zs.push({ t: 0 }); this.nextZ = tm + 1.3; }
    }
    for (let i = this.zs.length - 1; i >= 0; i--) { this.zs[i].t += dt; if (this.zs[i].t > 2.6) this.zs.splice(i, 1); }
  }

  aimAt(fx, fy) { this.rel = fx === null ? null : { x: fx, y: fy }; }

  updateGaze(dt, T) {
    const g = this.gaze;
    const bee = this.opts.bee;
    const kc = bee / 512;
    const R = Math.max(150, bee * 1.1);
    const pv = this.rig.pivots;
    const lim = (x, y) => { const v = Math.hypot(x, y); return v > 1 ? [x / v, y / v] : [x, y]; };
    let tgt = null;
    if (this.follow && !this.asleep) {
      if (this.rel) tgt = { x: this.rel.x * bee, y: this.rel.y * bee };
      else if (this.pointer && performance.now() - this.pointer.t < 3500) {
        const r = this.cv.getBoundingClientRect();
        const dx = this.pointer.x - (r.left + r.width / 2), dy = this.pointer.y - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) < Math.max(420, bee * 3)) tgt = { x: dx, y: dy };
      }
    }
    let L, Rr, H;
    if (tgt) {
      const eye = (e) => lim((tgt.x - (e[0] - 256) * kc) / R, (tgt.y - (e[1] - 256) * kc) / R);
      L = eye(pv.eye_l);
      Rr = eye(pv.eye_r);
      H = lim((tgt.x - (243 - 256) * kc) / R, (tgt.y - (205 - 256) * kc) / R);
      g.had = true;
    } else {
      if (g.had) { g.had = false; g.ix = 0; g.iy = 0; g.next = rnd(1.2, 2.2); }
      g.next -= dt;
      if (g.next <= 0) {
        if (Math.random() < 0.45) { g.ix = 0; g.iy = 0; }
        else { g.ix = rnd(-0.75, 0.75); g.iy = rnd(-0.5, 0.5); }
        g.next = rnd(0.7, 2.8);
      }
      L = [g.ix, g.iy];
      Rr = [g.ix, g.iy];
      H = [g.ix * 0.3, g.iy * 0.3];
    }
    if (this.asleep) { L = [0, 0]; Rr = [0, 0]; H = [0, 0]; }
    const mag = Math.hypot((L[0] + Rr[0]) / 2 - (g.pax || 0), (L[1] + Rr[1]) / 2 - (g.pay || 0));
    if (mag > 0.8 && Math.random() < 0.55) this.nextBlink = Math.min(this.nextBlink, rnd(0.05, 0.14));
    g.pax = (L[0] + Rr[0]) / 2;
    g.pay = (L[1] + Rr[1]) / 2;
    const e = this.egs;
    spring2(e.lx, L[0], dt, 5.5, 1);
    spring2(e.ly, L[1], dt, 5.5, 1);
    spring2(e.rx, Rr[0], dt, 5.5, 1);
    spring2(e.ry, Rr[1], dt, 5.5, 1);
    spring2(this.hs.x, H[0], dt, 1.15, 1);
    spring2(this.hs.y, H[1], dt, 1.15, 1);
    const hx = this.hs.x.x, hy = this.hs.y.x;
    T.hrot += hx * 4.2;
    T.hx += hx * 2.2;
    T.hy += hy * 2;
    T.rrot += hx * 0.8;
    T.rx += hx * 2;
    T.fpx += clamp(hx * 5.5, -6, 6);
    T.fpy += clamp(hy * 3.2, -4, 4);
  }

  updateBlink(dt) {
    if (this.calm) { this.blink = null; this.blinkKey = null; return; }
    if (this.blink) {
      const b = this.blink;
      b.t += dt;
      const st = b.stages;
      let acc = 0, key = null;
      for (let i = 0; i < st.length; i++) {
        acc += st[i][1];
        if (b.t < acc) { key = st[i][0]; break; }
      }
      if (key === null) {
        if (b.again) { this.blink = null; this.startBlink(false); return; }
        this.blink = null;
        this.nextBlink = rnd(2.2, 5.5);
        this.blinkKey = null;
      } else this.blinkKey = key;
      return;
    }
    this.blinkKey = null;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) this.startBlink(true);
  }

  startBlink(allowDouble) {
    const e = this.face.eyes;
    if (e !== 'open' && e !== 'surprised' && e !== 'sleepy') { this.nextBlink = 1; return; }
    const stages = e === 'open' ? [['half', 0.04], ['closed', 0.05], ['half', 0.04]] : [['closed', 0.1]];
    this.blink = { t: 0, stages, again: allowDouble && Math.random() < 0.22 };
  }

  frame(dtReal) {
    if (!this.ready || this.reduced) return;
    this.update(dtReal);
    this.draw();
  }

  part(ctx, n) {
    const p = this.rig.parts[n];
    ctx.save();
    ctx.translate(p.cx, p.cy);
    if (p.rot) ctx.rotate(p.rot * D2R);
    ctx.scale(p.s, p.s);
    ctx.drawImage(this.imgs[n], -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  tf(ctx, px, py, rot, sx, sy, dx, dy) {
    ctx.translate(px + dx, py + dy);
    if (rot) ctx.rotate(rot * D2R);
    ctx.scale(sx, sy);
    ctx.translate(-px, -py);
  }

  drawEyes(ctx, key, alpha) {
    const c = this.ch;
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ['l', 'r'].forEach((s) => {
      if (key === 'open') {
        const f = this.rig.parts['eye3_fill_' + s];
        const ir = this.rig.parts['iris3_' + s];
        const off = this.eyeOff[s];
        const PAD = 3;
        const ox = off.c.width / (f.w * f.s);
        const cx = off.x;
        const W = off.c.width, H = f.h * f.s * ox;
        const e = this.egs;
        const gx = clamp(e[s + 'x'].x + c.gx, -1.1, 1.1), gy = clamp(e[s + 'y'].x + c.gy, -1.1, 1.1);
        const amp = s === 'l' ? { xp: 0.9, xn: 3.2, yp: 3.0, yn: 2.4, fs: 0.25 } : { xp: 6, xn: 1.2, yp: 4.5, yn: 3.5, fs: 0.12 };
        const dx = gx >= 0 ? gx * amp.xp : gx * amp.xn;
        const dy = gy >= 0 ? gy * amp.yp : gy * amp.yn;
        const top = f.cy - f.h * f.s / 2;
        const left = f.cx - f.w * f.s / 2;
        const key = Math.round(gx * 30) + ',' + Math.round(gy * 30);
        if (off.key !== key || off.img !== this.imgs) {
        cx.setTransform(1, 0, 0, 1, 0, 0);
        cx.clearRect(0, 0, off.c.width, off.c.height);
        cx.globalCompositeOperation = 'source-over';
        cx.drawImage(this.imgs['eye3_fill_' + s], 0, PAD * ox, W, H);
        cx.globalCompositeOperation = 'source-atop';
        const iw = ir.w * ir.s * ox * (1 - amp.fs * Math.abs(gx)), ih = ir.h * ir.s * ox;
        const ix = (ir.cx + dx - left) * ox, iy = (ir.cy + dy - top + PAD) * ox;
        cx.drawImage(this.imgs['iris3_' + s], ix - iw / 2, iy - ih / 2, iw, ih);
        const gl = this.rig.parts['glint3_' + s];
        const gxp = (gl.cx + dx * 0.3 - left) * ox, gyp = (gl.cy + dy * 0.3 - top + PAD) * ox;
        cx.drawImage(this.imgs['glint3_' + s], gxp - gl.w * gl.s * ox / 2, gyp - gl.h * gl.s * ox / 2, gl.w * gl.s * ox, gl.h * gl.s * ox);
        cx.globalCompositeOperation = 'source-over';
        const lid = (gy > 0 ? gy * 1.3 : gy * 0.3) * ox;
        if (Math.abs(lid) < 0.02) {
          cx.drawImage(this.imgs['eye3_line_' + s], 0, PAD * ox, W, H);
        } else {
          const split = Math.round(PAD * ox + H * 0.5);
          cx.save();
          cx.beginPath(); cx.rect(0, 0, W, split); cx.clip();
          cx.drawImage(this.imgs['eye3_line_' + s], 0, PAD * ox + lid, W, H);
          cx.restore();
          cx.save();
          cx.beginPath(); cx.rect(0, split, W, off.c.height - split); cx.clip();
          cx.drawImage(this.imgs['eye3_line_' + s], 0, PAD * ox, W, H);
          cx.restore();
        }
        off.key = key;
        off.img = this.imgs;
        }
        ctx.drawImage(off.c, left, top - PAD, f.w * f.s, f.h * f.s + 2 * PAD);
      } else {
        this.part(ctx, 'eyes_' + key + '_' + s);
      }
    });
    ctx.globalAlpha = 1;
  }

  draw() {
    const ctx = this.ctx;
    const cv = this.cv;
    const k = this.k;
    const c = this.ch;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = this.opts.bee <= 64 ? 'medium' : 'high';
    const pv = this.rig.pivots;
    const pop = this.pop.x;
    const breath = this.breath || 0;
    ctx.save();
    ctx.translate(cv.width / 2 - 256 * k, cv.height / 2 - 256 * k);
    ctx.scale(k, k);
    const rsx = c.rsx * (1 + 0.04 * pop), rsy = c.rsy * (1 - 0.07 * pop);
    this.tf(ctx, pv.base[0], pv.base[1], c.rrot, rsx, rsy, c.rx, c.ry);

    const lag = clamp((this.armZ.x - c.ry) * 0.55, -22, 22);
    const angL = c.arml + lag * 0.6, angR = c.armr - lag * 0.6;
    const bsy = 1 + 0.018 * breath, bsx = 1 - 0.01 * breath;
    const frontL = !this.back && this.armBlend(angL) > 0.5, frontR = !this.back && this.armBlend(angR) > 0.5;
    if (this.back) {
      this.drawBack(ctx, pv, c, angL, angR, bsx, bsy, pop);
      ctx.restore();
      return;
    }
    this.wings(ctx);

    ctx.save();
    this.tf(ctx, pv.stinger[0], pv.stinger[1], c.wag, 1, 1, 0, 0);
    this.part(ctx, 'stinger');
    ctx.restore();

    ctx.save();
    this.tf(ctx, pv.base[0], pv.base[1], 0, bsx, bsy, 0, 0);
    this.part(ctx, 'body');
    if (!frontL) this.arm(ctx, 'l', angL);
    if (!frontR) this.arm(ctx, 'r', angR);
    this.part(ctx, 'collar');
    ctx.restore();

    ctx.save();
    this.tf(ctx, pv.neck[0], pv.neck[1], c.hrot, c.hsx * (1 - 0.03 * pop), c.hsy * (1 + 0.04 * pop), c.hx, c.hy - 3 * breath);
    ['l', 'r'].forEach((s) => {
      ctx.save();
      const a = pv['antenna_' + s];
      this.tf(ctx, a[0], a[1], this.antRel[s], 1, 1, 0, 0);
      this.part(ctx, 'antenna_' + s);
      ctx.restore();
    });
    this.part(ctx, 'head');
    ctx.save();
    ctx.translate(c.fpx, c.fpy);
    const f = this.face;
    ctx.globalAlpha = clamp(c.blush, 0, 1);
    this.part(ctx, 'blush_l');
    this.part(ctx, 'blush_r');
    ctx.globalAlpha = 1;
    const bk = this.blinkKey;
    if (bk) this.drawEyes(ctx, bk, 1);
    else {
      if (f.prevEyes && f.ef < 1) this.drawEyes(ctx, f.prevEyes, 1 - f.ef);
      this.drawEyes(ctx, f.eyes, f.prevEyes && f.ef < 1 ? f.ef : 1);
    }
    if (c.brow > 0.02) {
      const ph = (this.tm * 0.55) % 1;
      ctx.globalAlpha = clamp(c.brow, 0, 1);
      ctx.save();
      ctx.translate(0, (1 - c.brow) * 8);
      this.part(ctx, 'brow_sad_l');
      this.part(ctx, 'brow_sad_r');
      ctx.restore();
      ctx.globalAlpha = clamp(c.brow, 0, 1) * (1 - ph * ph * ph);
      ctx.save();
      ctx.translate(0, ph * 18);
      this.part(ctx, 'sweat');
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (f.prevMouth && f.mf < 1) { ctx.globalAlpha = 1 - f.mf; this.part(ctx, 'mouth_' + f.prevMouth); }
    ctx.globalAlpha = f.prevMouth && f.mf < 1 ? f.mf : 1;
    this.part(ctx, 'mouth_' + f.mouth);
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.restore();

    if (frontL || frontR) {
      ctx.save();
      this.tf(ctx, pv.base[0], pv.base[1], 0, bsx, bsy, 0, 0);
      if (frontL) this.arm(ctx, 'l', angL);
      if (frontR) this.arm(ctx, 'r', angR);
      ctx.restore();
    }

    if (this.zs.length) {
      ctx.fillStyle = this.accent;
      ctx.textAlign = 'center';
      this.zs.forEach((z, i) => {
        const u = z.t / 2.6;
        ctx.globalAlpha = Math.sin(Math.PI * u) * 0.9;
        ctx.font = '800 ' + (46 + 30 * u) + 'px system-ui, sans-serif';
        ctx.fillText('Z', 330 + 40 * u + 14 * Math.sin(u * 6) + i * 0, 130 - 120 * u);
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  armBlend(ang) { return smooth((Math.abs(ang) - 52) / 22); }

  arm(ctx, s, ang) {
    const p = this.rig.pivots['arm_' + s];
    const r = this.back ? 0 : this.armBlend(ang);
    if (r < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - r;
      this.tf(ctx, p[0], p[1], clamp(ang, -56, 56), 1, 1, 0, 0);
      this.part(ctx, 'arm_' + s);
      ctx.restore();
    }
    if (r > 0) {
      const up = this.rig.arm_up[s];
      const pp = this.rig.parts['arm_up_' + s];
      ctx.save();
      ctx.globalAlpha = r;
      ctx.translate(p[0], p[1]);
      ctx.rotate((s === 'l' ? -34 + (ang - 104) * 0.8 : 34 + (ang + 104) * 0.8) * D2R);
      ctx.scale(up.s, up.s);
      ctx.drawImage(this.imgs['arm_up_' + s], -up.u * pp.w, -up.v * pp.h, pp.w, pp.h);
      ctx.restore();
    }
  }

  wings(ctx) {
    if (this.hideWings) return;
    const c = this.ch;
    const pv = this.rig.pivots;
    const wp = Math.sin(this.wingPhase);
    const wsq = 1 - 0.1 * Math.abs(wp);
    [['l', 1], ['r', -1]].forEach(([s, sg]) => {
      ctx.save();
      const w = pv['wing_' + s];
      this.tf(ctx, w[0], w[1], sg * (c.wamp * wp), 1, wsq, 0, 0);
      ctx.drawImage(this.imgs['wing_' + s], 0, 0, 512, 512);
      ctx.restore();
    });

  }

  drawBack(ctx, pv, c, angL, angR, bsx, bsy, pop) {
    ctx.save();
    this.tf(ctx, pv.base[0], pv.base[1], 0, bsx, bsy, 0, 0);
    this.part(ctx, 'body_back');
    this.arm(ctx, 'l', angL);
    this.arm(ctx, 'r', angR);
    ctx.restore();
    this.wings(ctx);
    ctx.save();
    this.tf(ctx, pv.stinger[0], pv.stinger[1], c.wag, 1, 1, 0, 0);
    this.part(ctx, 'stinger');
    ctx.restore();
    ctx.save();
    this.tf(ctx, pv.neck[0], pv.neck[1], c.hrot, c.hsx, c.hsy * (1 + 0.04 * pop), c.hx, c.hy);
    ['l', 'r'].forEach((s) => {
      ctx.save();
      const a = pv['antenna_' + s];
      this.tf(ctx, a[0], a[1], this.antRel[s], 1, 1, 0, 0);
      this.part(ctx, 'antenna_' + s);
      ctx.restore();
    });
    this.part(ctx, 'head_back');
    ctx.restore();
  }

  dpr0() { return this.opts.dpr; }
}

const loop = { list: new Set(), raf: 0, last: 0, stats: { ms: 0, frames: 0 }, paused: false };

export function register(p, el) {
  loop.list.add(p);
  p.el = el || p.cv;
  p.acc = 0;
  if (!p.io) {
    p.io = new IntersectionObserver((es) => es.forEach((e) => { p.visible = e.isIntersecting; if (p.visible) start(); }), { rootMargin: '40px' });
    p.io.observe(p.cv);
  }
  start();
}

function tick(now) {
  loop.raf = 0;
  if (loop.paused || document.hidden) { loop.last = 0; return; }
  const dt = loop.last ? (now - loop.last) / 1000 : 1 / 60;
  loop.last = now;
  const t0 = performance.now();
  let any = false;
  loop.list.forEach((p) => {
    if (!p.visible || p.reduced || !p.ready) return;
    any = true;
    p.acc += dt;
    const step = 1 / p.opts.fps;
    if (p.acc >= step - 0.002) {
      p.frame(p.acc);
      p.acc = 0;
    }
  });
  loop.stats.ms += performance.now() - t0;
  loop.stats.frames++;
  if (any) loop.raf = requestAnimationFrame(tick);
}

function start() {
  if (!loop.raf && !loop.paused) loop.raf = requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => { loop.last = 0; if (!document.hidden) start(); });

export function wakeLoop() { loop.last = 0; start(); }
export function unregister(p) {
  loop.list.delete(p);
  if (p.io) { p.io.disconnect(); p.io = null; }
}

export function setPaused(v) { loop.paused = v; if (!v) { loop.last = 0; start(); } }
export function stats() {
  const s = loop.stats;
  const r = { ms: s.frames ? s.ms / s.frames : 0, frames: s.frames };
  s.ms = 0; s.frames = 0;
  return r;
}
export function stepAll(seconds) {
  const n = Math.round(seconds * 60);
  loop.list.forEach((p) => { if (p.reduced || !p.ready) return; for (let i = 0; i < n; i++) p.update(1 / 60); p.draw(); });
}
export const EXPRESSIONS = Object.keys(EXPR);
export const ACTION_NAMES = Object.keys(ACTIONS);
