const DROP_MS = 1800;
const DROP_PX = 340;
const DROP_CAP = 3;
const DROP_STEPS = 22;
const DROP_MIN = 0.2;

export const latSvg = (w, h) => `<svg class="hc-s" width="${w}" height="${h}" style="width:${w}px;height:${h}px"><rect width="100%" height="100%" fill="url(#hc-pat)"/></svg>`;

function ease(t) {
  return 1 - Math.pow(1 - t, 1.6);
}

function dropFrames(fade) {
  const grow = [];
  const counter = [];
  for (let i = 0; i <= DROP_STEPS; i++) {
    const t = i / DROP_STEPS;
    const k = DROP_MIN + (1 - DROP_MIN) * ease(t);
    const o = fade ? (t < 0.08 ? t / 0.08 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4)) : 1;
    grow.push({ transform: `scale(${k.toFixed(4)})`, opacity: String(o.toFixed(3)), offset: t });
    counter.push({ transform: `scale(${(1 / k).toFixed(4)})`, offset: t });
  }
  return [grow, counter];
}

export function drop(s, x, y) {
  if (!s.rips.animate) return;
  while (s.drops.length >= DROP_CAP) {
    const old = s.drops.shift();
    old.anims.forEach((a) => a.cancel());
    old.el.remove();
  }
  const d = DROP_PX * 2;
  const r = document.createElement('i');
  r.className = 'hc-rip';
  r.style.cssText = `left:${(x - DROP_PX).toFixed(1)}px;top:${(y - DROP_PX).toFixed(1)}px;width:${d}px;height:${d}px`;
  r.innerHTML = latSvg(s.w, s.h);
  const p = r.firstChild;
  p.style.cssText = `left:${(DROP_PX - x).toFixed(1)}px;top:${(DROP_PX - y).toFixed(1)}px;transform-origin:${x.toFixed(1)}px ${y.toFixed(1)}px`;
  s.rips.appendChild(r);
  const [grow, counter] = dropFrames(true);
  const opts = { duration: DROP_MS, easing: 'linear', fill: 'forwards' };
  const anims = [r.animate(grow, opts), p.animate(counter, opts)];
  const rec = { el: r, anims };
  s.drops.push(rec);
  anims[0].onfinish = () => {
    r.remove();
    const i = s.drops.indexOf(rec);
    if (i >= 0) s.drops.splice(i, 1);
  };
}
