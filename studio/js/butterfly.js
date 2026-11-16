// butterfly.js — un papillon vivant qui erre, fuit le curseur, se pose et se souvient.
// Module ES2020, aucune dépendance, aucun canvas : sprite sheet animée par background-position,
// déplacée par transform composited. export initButterfly(opts).
//
// Rendu : UN SEUL élément position:fixed, pointer-events:none, aria-hidden, injecté dans <body>.
// Comportement : somme de steering behaviours (wander + flee + perch + containment) clampée, intégration
// Euler. Persistance inter-pages via sessionStorage (positions normalisées). Une seule boucle rAF,
// suspendue quand l'onglet est caché. Respecte prefers-reduced-motion et n'apparaît pas sous 768px.

const CONFIG   /* interne : aucun appelant hors de ce module */ = {
  size: 48,                       // taille rendue (px)
  maxSpeed: 190,                  // px/s au repos
  panicMultiplier: 2.5,           // ×maxSpeed en panique
  fleeRadius: 160,                // px — rayon de fuite du curseur
  panicRadius: 60,                // px — sous ça : panique
  catchRadius: 12,                // px — "attrapé"
  wanderStrength: 42,             // px/s² — force d'errance
  perchDelay: 2500,               // ms d'IMMOBILITÉ de la souris avant que le papillon vienne s'y poser
  perchDuration: [8000, 20000],   // ms — durée de pose (aléatoire dans l'intervalle)
  rotationLimit: 35 * Math.PI / 180,   // ±35° en radians
  edgeMargin: 80,                 // px — début de la force de confinement
  spritePaths: {
    base: '/studio/img/butterfly/',      // servi depuis web/ (mount /)
    manifest: '/studio/img/butterfly/manifest.json',
  },
};

const SS_KEY = 'reforged.butterfly.v1';
const LS_CAUGHT = 'reforged.butterfly.caught';

// ── utilitaires ───────────────────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const len = (x, y) => Math.hypot(x, y);
function lerpAngle(a, b, t) {           // lissage d'angle par le plus court chemin
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

// bruit lissé pour le wander (PAS de Math.random() par frame : ça tremble). Valeur qui dérive.
function makeSmoothNoise(seed) {
  let phase = seed;
  return (dt) => {
    phase += dt * (0.6 + 0.4 * Math.sin(phase * 0.7));  // avance non uniforme mais continue
    return Math.sin(phase) * 0.6 + Math.sin(phase * 2.13 + 1.7) * 0.4;  // ∈ ~[-1,1], lisse
  };
}

// ── état runtime ──────────────────────────────────────────────────────────────────────────────
let started = false;

export async function initButterfly(opts = {}) {
  if (started) return;
  // A11Y / garde-fous : jamais sous 768px, jamais si l'utilisateur veut moins d'animation.
  if (typeof window === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.innerWidth < 768) return;

  const cfg = { ...CONFIG, ...opts };

  // manifest + préchargement des sprites AVANT le 1er rendu
  let manifest;
  try {
    manifest = await fetch(cfg.spritePaths.manifest, { cache: 'force-cache' }).then(r => r.json());
  } catch (_) { return; }               // pas d'assets → on n'injecte rien
  const clips = ['flight', 'glide', 'perch', 'caught'].filter(k => manifest[k]);
  if (!clips.includes('flight')) return;
  await Promise.all(clips.map(k => new Promise(res => {
    const im = new Image(); im.onload = im.onerror = res; im.src = cfg.spritePaths.base + k + '.webp';
  })));

  started = true;

  // ── élément unique ─────────────────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'reforged-butterfly';
  el.setAttribute('aria-hidden', 'true');
  el.style.width = el.style.height = cfg.size + 'px';
  document.body.appendChild(el);

  // ── traînée d'ÉTOILES : pool d'éléments réutilisés (composité : transform + opacity uniquement) ──
  const STAR_POOL = 18;
  const stars = [];
  const starLayer = document.createElement('div');
  starLayer.className = 'reforged-butterfly-stars';
  starLayer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(starLayer);
  for (let i = 0; i < STAR_POOL; i++) {
    const s = document.createElement('div');
    s.className = 'rbf-star';
    starLayer.appendChild(s);
    stars.push({ el: s, life: 0, ttl: 1, x: 0, y: 0, sz: 6, rot: 0 });
  }
  let starCursor = 0, starAcc = 0;
  function emitStar(x, y) {
    const st = stars[starCursor]; starCursor = (starCursor + 1) % STAR_POOL;
    // petit décalage stable (pas de Math.random par frame — dérive douce via l'index et le temps)
    const a = (starCursor * 0.7) + performance.now() * 0.002;
    st.x = x + Math.cos(a) * 8;
    st.y = y + Math.sin(a) * 8;
    st.sz = 5 + (starCursor % 4);
    st.rot = a * 40;
    st.ttl = 0.55 + (starCursor % 3) * 0.12;
    st.life = st.ttl;
  }
  function updateStars(dt) {
    for (const st of stars) {
      if (st.life <= 0) { if (st.el.style.opacity !== '0') st.el.style.opacity = '0'; continue; }
      st.life -= dt;
      const k = Math.max(0, st.life / st.ttl);          // 1 → 0
      st.y -= dt * 14;                                    // légère montée
      st.el.style.opacity = (k * 0.9).toFixed(3);
      st.el.style.transform =
        `translate3d(${st.x.toFixed(1)}px, ${st.y.toFixed(1)}px, 0) rotate(${st.rot}deg) scale(${(0.4 + k * 0.9).toFixed(3)})`;
      st.el.style.width = st.el.style.height = st.sz + 'px';
    }
  }

  // état physique (coordonnées viewport en px)
  const S = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, flip: 1,
              state: 'flight', spriteFrame: 0, spriteAcc: 0,
              caughtT: 0, panicUntil: 0, calmSince: 0, perchUntil: 0, perchTarget: null };

  // curseur (position + vélocité lissée pour la prédiction)
  const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, seen: false, t: 0, stillSince: 0 };

  const noiseA = makeSmoothNoise(Math.PI * 0.3);   // pas de Math.random en boucle ; seed fixe suffit
  let wanderAngle = 0;

  // ── restauration depuis sessionStorage (positions NORMALISÉES) ──────────────────────────────
  const W = () => window.innerWidth, H = () => window.innerHeight;
  function spawnFromEdge() {
    const side = Math.floor((Date.now() / 997) % 4);   // "aléatoire" stable sans Math.random
    if (side === 0) { S.x = -20; S.y = H() * 0.4; S.vx = cfg.maxSpeed * 0.6; }
    else if (side === 1) { S.x = W() + 20; S.y = H() * 0.6; S.vx = -cfg.maxSpeed * 0.6; }
    else if (side === 2) { S.x = W() * 0.5; S.y = -20; S.vy = cfg.maxSpeed * 0.6; }
    else { S.x = W() * 0.5; S.y = H() + 20; S.vy = -cfg.maxSpeed * 0.6; }
    S.state = 'flight'; S.calmSince = performance.now();
  }
  (function restore() {
    let raw = null;
    try { raw = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); } catch (_) {}
    if (!raw || typeof raw.nx !== 'number') { spawnFromEdge(); return; }
    S.x = clamp(raw.nx, 0, 1) * W(); S.y = clamp(raw.ny, 0, 1) * H();
    S.vx = raw.vx || 0; S.vy = raw.vy || 0;
    S.state = (raw.state === 'perch') ? 'flight' : (raw.state || 'flight');  // ne pas rester collé au perchoir d'une autre page
    S.calmSince = performance.now();
    // avancer la simulation du temps écoulé, plafonné à 2s (pas de rattrapage accéléré)
    const dtGap = Math.min(2, Math.max(0, (Date.now() - (raw.ts || Date.now())) / 1000));
    integrate(dtGap, /*coast*/true);
  })();

  // ── persistance : throttle 500ms + pagehide + visibilitychange ──────────────────────────────
  let lastSave = 0;
  function persist() {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({
        nx: clamp(S.x / W(), 0, 1), ny: clamp(S.y / H(), 0, 1),
        vx: S.vx, vy: S.vy, state: S.state, ts: Date.now(),
      }));
    } catch (_) {}
  }
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

  // ── curseur ───────────────────────────────────────────────────────────────────────────────
  window.addEventListener('pointermove', (e) => {
    const now = performance.now(), dt = mouse.t ? Math.max(1e-3, (now - mouse.t) / 1000) : 0.016;
    if (mouse.seen) {
      // vélocité curseur lissée (lerp) — sert à prédire où il va
      mouse.vx = lerp(mouse.vx, (e.clientX - mouse.x) / dt, 0.35);
      mouse.vy = lerp(mouse.vy, (e.clientY - mouse.y) / dt, 0.35);
    }
    // suivi de l'IMMOBILITÉ : un vrai mouvement (>2px) réinitialise l'horloge d'immobilité.
    if (!mouse.seen || Math.abs(e.clientX - mouse.x) > 2 || Math.abs(e.clientY - mouse.y) > 2) {
      mouse.stillSince = now;
    }
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = now; mouse.seen = true;
  }, { passive: true });

  // ── steering ─────────────────────────────────────────────────────────────────────────────
  function steer(dt) {
    let ax = 0, ay = 0;

    // 1) WANDER — cible errante par bruit lissé (pas de tremblement)
    wanderAngle += noiseA(dt) * 1.6 * dt;
    ax += Math.cos(wanderAngle) * cfg.wanderStrength;
    ay += Math.sin(wanderAngle) * cfg.wanderStrength;

    // La SOURIS est le pôle du comportement : quand elle BOUGE, le papillon la fuit ; quand elle est
    // IMMOBILE depuis un moment, il vient s'y poser (au lieu de fuir).
    const now = performance.now();
    const mouseStill = mouse.seen && (now - mouse.stillSince > cfg.perchDelay);
    let disturbed = false;

    if (mouse.seen && !mouseStill) {
      // 2) FLEE — fuir la position PRÉDITE du curseur (position + vél*0.12s), force ∝ 1/d², plafonnée
      const px = mouse.x + mouse.vx * 0.12, py = mouse.y + mouse.vy * 0.12;
      const dx = S.x - px, dy = S.y - py, d = len(dx, dy) || 1;
      if (d < cfg.fleeRadius) {
        disturbed = true;
        const inv = 1 / (d * d);
        const force = clamp(inv * cfg.fleeRadius * cfg.fleeRadius * 240, 0, 2600);  // ∝1/d², plafonné
        ax += (dx / d) * force; ay += (dy / d) * force;
        if (d < cfg.panicRadius && S.panicUntil < performance.now())
          S.panicUntil = performance.now() + 800;                                  // panique 800ms
      }
    }

    // 3) PERCH SUR LA SOURIS — si la souris est immobile assez longtemps, le papillon VIENT s'y poser.
    if (disturbed && S.state === 'perch') leavePerch();      // la souris a rebougé alors qu'il était posé
    if (S.state !== 'perch' && mouseStill) {
      const dx = mouse.x - S.x, dy = mouse.y - S.y, d = len(dx, dy) || 1;
      // en mode "vise la souris" on COUPE le wander/errance (sinon il dérive et n'arrive jamais).
      ax = ay = 0;
      // attraction ferme, un peu croissante avec la distance (arrive vite même de loin), plafonnée.
      const pull = clamp(cfg.maxSpeed * 2.2 + d * 1.2, 0, cfg.maxSpeed * 3.4);
      ax += (dx / d) * pull; ay += (dy / d) * pull;
      if (d < 16) enterPerch();                              // assez proche → se pose
    }
    if (S.state === 'perch') {
      if (mouseStill) {
        // collé à la souris tant qu'elle ne bouge pas — reste posé TANT QUE la souris est immobile
        // (pas d'échéance qui le ferait repartir sans raison sous le curseur immobile).
        S.x = lerp(S.x, mouse.x, 0.3); S.y = lerp(S.y, mouse.y, 0.3);
        S.vx *= 0.4; S.vy *= 0.4; ax = ay = 0;
      } else {
        leavePerch();                                        // souris rebougée → envol
      }
    }

    // 4) CONTAINMENT — force douce vers l'intérieur près des bords (jamais de téléportation)
    const m = cfg.edgeMargin;
    if (S.x < m) ax += (m - S.x) * 6;
    if (S.x > W() - m) ax -= (S.x - (W() - m)) * 6;
    if (S.y < m) ay += (m - S.y) * 6;
    if (S.y > H() - m) ay -= (S.y - (H() - m)) * 6;

    return { ax, ay, disturbed };
  }

  // Le perchoir est désormais LA SOURIS IMMOBILE (plus de cibles DOM). enterPerch fige le papillon sur
  // le curseur pour perchDuration ; leavePerch le renvoie en vol.
  function enterPerch() {
    S.state = 'perch'; S.vx = S.vy = 0;
    const [a, b] = cfg.perchDuration;
    S.perchUntil = performance.now() + a + ((Date.now() % (b - a + 1)));   // durée pseudo-aléatoire stable
  }
  function leavePerch() { S.state = 'flight'; S.calmSince = performance.now(); }

  // ── intégration + états caught ───────────────────────────────────────────────────────────────
  function integrate(dt, coast) {
    dt = Math.min(dt, 1 / 30);                       // dt borné
    // état CAUGHT : figé, joue la séquence une fois puis reprend le vol
    if (S.state === 'caught') {
      S.caughtT += dt;
      const clip = manifest.caught;
      if (S.caughtT * clip.fps >= clip.frames) { S.state = 'flight'; S.caughtT = 0; S.calmSince = performance.now(); }
      return;
    }

    const { ax, ay } = coast ? { ax: 0, ay: 0 } : steer(dt);
    // Euler
    S.vx += ax * dt; S.vy += ay * dt;
    // amortissement doux
    S.vx *= 0.985; S.vy *= 0.985;
    // clamp vitesse (panique = maxSpeed ×2.5)
    const panic = performance.now() < S.panicUntil;
    const vmax = cfg.maxSpeed * (panic ? cfg.panicMultiplier : 1);
    const sp = len(S.vx, S.vy);
    if (sp > vmax) { S.vx = S.vx / sp * vmax; S.vy = S.vy / sp * vmax; }
    S.x += S.vx * dt; S.y += S.vy * dt;

    // CAUGHT ? le curseur EN MOUVEMENT a rejoint le papillon malgré la fuite (filet de sécurité).
    // Ne PAS déclencher si la souris est immobile (là, il vient s'y POSER : d→0 est voulu) ni s'il est
    // déjà posé — sinon se poser sur le curseur immobile serait interprété à tort comme "attrapé".
    if (mouse.seen && !coast && S.state !== 'perch') {
      const mouseStill = (performance.now() - mouse.stillSince > cfg.perchDelay);
      if (!mouseStill) {
        const d = len(S.x - mouse.x, S.y - mouse.y);
        if (d < cfg.catchRadius) {
          S.state = 'caught'; S.caughtT = 0; S.vx = S.vy = 0;
          try { localStorage.setItem(LS_CAUGHT, String((parseInt(localStorage.getItem(LS_CAUGHT) || '0', 10) || 0) + 1)); } catch (_) {}
        }
      }
    }
  }

  // ── rendu ────────────────────────────────────────────────────────────────────────────────
  function currentClip() {
    if (S.state === 'caught') return 'caught';
    if (S.state === 'perch') return manifest.perch ? 'perch' : 'flight';
    // glide quand rapide et rectiligne, flight sinon
    return (manifest.glide && len(S.vx, S.vy) > cfg.maxSpeed * 0.75) ? 'glide' : 'flight';
  }
  function render(dt) {
    const clip = currentClip(), m = manifest[clip];
    // cadence sprite pilotée par la vitesse (repos → fuite), DÉCOUPLÉE du rAF
    const sp = len(S.vx, S.vy);
    const speedT = clamp(sp / cfg.maxSpeed, 0, 1);
    const fps = (S.state === 'caught') ? m.fps : lerp(m.fps, m.fps * 1.8, speedT);
    S.spriteAcc += dt * fps;
    if (S.spriteAcc >= 1) {
      const step = Math.floor(S.spriteAcc); S.spriteAcc -= step;
      if (S.state === 'caught') S.spriteFrame = Math.min(S.spriteFrame + step, m.frames - 1);
      else S.spriteFrame = (S.spriteFrame + step) % m.frames;
    }
    if (S.spriteFrame >= m.frames) S.spriteFrame = 0;

    // orientation : θ suit le vecteur vitesse, borné ±35°, lissé ; flip horizontal quand vx<0
    if (sp > 6) {
      let target = Math.atan2(S.vy, Math.abs(S.vx) < 1e-3 ? 1e-3 : S.vx);
      // on ne veut que l'inclinaison verticale du vol, l'horizontale est portée par le flip
      let tilt = clamp(Math.atan2(S.vy, Math.abs(S.vx)), -cfg.rotationLimit, cfg.rotationLimit);
      S.angle = lerpAngle(S.angle, tilt, 0.12);
      S.flip = S.vx < 0 ? -1 : 1;
    }

    // background : la sheet est horizontale (frames de sprite = size natif 128 → on scale via background-size)
    el.style.setProperty('--bf-url', `url("${cfg.spritePaths.base}${clip}.webp")`);
    el.style.setProperty('--bf-frames', m.frames);
    el.style.setProperty('--bf-frame', S.spriteFrame);
    el.style.transform =
      `translate3d(${(S.x - cfg.size / 2).toFixed(2)}px, ${(S.y - cfg.size / 2).toFixed(2)}px, 0) ` +
      `rotate(${(S.angle * S.flip).toFixed(3)}rad) scaleX(${S.flip})`;
  }

  // ── boucle unique rAF (suspendue si onglet caché ; reprise dt réinitialisé) ───────────────────
  let last = performance.now(), raf = 0;
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 1 / 60;                      // reprise après suspension : pas de rattrapage
    integrate(dt, false);
    render(dt);
    // ÉTOILES : émettre en fonction de la vitesse (plus il va vite, plus il sème d'étoiles).
    // Pas quand il est posé. Cadence découplée du rAF via un accumulateur.
    const sp = len(S.vx, S.vy);
    if (S.state !== 'perch' && S.state !== 'caught' && sp > cfg.maxSpeed * 0.15) {
      starAcc += dt * lerp(6, 22, clamp(sp / cfg.maxSpeed, 0, 1));   // 6→22 étoiles/s
      while (starAcc >= 1) { starAcc -= 1; emitStar(S.x, S.y); }
    }
    updateStars(dt);
    if (now - lastSave > 500) { lastSave = now; persist(); }
    raf = requestAnimationFrame(frame);
  }
  function start() { last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { persist(); stop(); }
    else { last = performance.now(); start(); }     // dt réinitialisé à la reprise
  });

  start();
  return { el, state: S, config: cfg };
}

export default initButterfly;
