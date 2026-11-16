/* ============================================================================
   ENTITY PORTRAIT — rendered by the GAME'S OWN ENGINE.

   The monster and item sheets showed a three.js rebuild of the mesh: recognisable,
   but not what the player sees. This mounts the real Gamebryo engine in the same
   frame instead — same materials, same textures, same lighting as the client.

   ⭐ The skin comes from the CATALOG, not from the .nif. A monster .nif only ever
   declares its variant 01, so Rose Knight (M312040) would be painted M31201 —
   the wrong skin. The route resolves through models3d, which carries the catalog
   variant (M31204 here). Same rule the flat preview already followed.

   Behaviour:
     • turntable on by default — it must READ as 3D without touching anything;
     • drag to rotate, wheel to zoom, « Effects » advances the engine clock so
       particle systems and animated materials play;
     • if the engine is unavailable or writes no image for this model, it falls
       back to the three.js preview and says why — the portrait is never empty.
   ========================================================================== */

import { createLiveViewer } from '../ui/gblive.js';
import { toast } from '../ui/toast.js';

const $ = s => document.querySelector(s);
const enc = encodeURIComponent;

let LV = null;
let CUR = null;                 /* {etype, code} currently mounted */
let AVAIL = null;
let PREFER_THREE = false;       /* the admin asked for the flat preview on this session */

try { PREFER_THREE = localStorage.getItem('eden.portrait.three') === '1'; } catch (e) { /* privé */ }

async function available() {
  if (AVAIL) return AVAIL;
  try { AVAIL = await (await fetch('/api/assets3d/gb/available')).json(); }
  catch (e) { AVAIL = { ok: false, reason: 'could not reach the tool' }; }
  return AVAIL;
}

function controls() {
  return `<div class="v3bar" id="v3bar">
      <button class="v3btn on" id="v3-auto" title="Turntable">↻</button>
      <button class="v3btn" id="v3-play" title="Play the effects (particles, animated materials)">▶</button>
      <button class="v3btn" id="v3-flat" title="Switch back to the flat preview (three.js)">◍</button>
    </div>`;
}

/** Mount the engine portrait. Returns false when it could not be used (caller keeps three.js). */
export async function mountEntityEngine(etype, code, onFallback, remount) {
  const host = $('#viewer3d');
  if (!host || !etype || !code) return false;
  if (PREFER_THREE) { flatBar(remount); return false; }
  const av = await available();
  if (!av.ok) return false;
  if (!$('#viewer3d')) return false;               // la fiche a changé pendant l'attente

  stopEntityEngine();
  CUR = { etype, code };
  if (!host.querySelector('#ent-gb')) {
    host.insertAdjacentHTML('beforeend', '<img id="ent-gb" class="ent-gb" alt="">' + controls());
  }
  const img = $('#ent-gb');
  if (img) img.style.display = '';
  const bar = $('#v3bar'); if (bar) bar.style.display = '';

  LV = createLiveViewer({
    img, msg: $('#v3-msg'), wrap: host,
    urlFor: c => '/api/model3d/gblive.jpg?etype=' + enc(etype) + '&code=' + enc(code)
      + '&yaw=' + c.yaw.toFixed(4) + '&pitch=' + c.pitch.toFixed(4)
      + '&dist=' + c.dist.toFixed(3) + '&t=' + c.t.toFixed(2),
    onFail: why => {
      toast('Game engine could not render this model — flat preview instead. ' + why, 'warn', 5000);
      hide();
      if (onFallback) onFallback();
    },
  });
  LV.start();
  LV.setAuto(true);

  const a = $('#v3-auto');
  if (a) a.onclick = () => { LV.setAuto(!LV.autoOn()); a.classList.toggle('on', LV.autoOn()); };
  const p = $('#v3-play');
  if (p) p.onclick = () => { LV.setPlay(!LV.playOn()); p.classList.toggle('on', LV.playOn()); };
  const f = $('#v3-flat');
  if (f) f.onclick = () => { setPreferThree(true); hide(); if (onFallback) onFallback(); flatBar(remount); };
  return true;
}

function setPreferThree(v) {
  PREFER_THREE = v;
  /* Choix EXPLICITE, mémorisé : certains modèles se lisent mieux à plat, et on ne va pas
     le redemander à chaque fiche. Mais il doit rester RÉVERSIBLE — d'où la barre ci-dessous,
     qui survit en mode plat : sans elle le bouton menait à une impasse. */
  try {
    if (v) localStorage.setItem('eden.portrait.three', '1');
    else localStorage.removeItem('eden.portrait.three');
  } catch (e) { /* privé */ }
}

/** En mode plat, on garde UNE commande : celle qui ramène le moteur. */
function flatBar(remount) {
  const host = $('#viewer3d'); if (!host) return;
  let bar = $('#v3bar');
  if (!bar) {
    host.insertAdjacentHTML('beforeend', controls());
    bar = $('#v3bar');
  }
  if (!bar) return;
  bar.style.display = '';
  ['#v3-auto', '#v3-play'].forEach(sel => { const b = $(sel); if (b) b.style.display = 'none'; });
  const f = $('#v3-flat');
  if (f) {
    f.style.display = '';
    f.title = 'Back to the game engine';
    f.textContent = '🎮';
    f.onclick = () => { setPreferThree(false); if (remount) remount(); };
  }
}

function hide() {
  if (LV) { LV.stop(); }
  const img = $('#ent-gb'); if (img) img.style.display = 'none';
  const bar = $('#v3bar'); if (bar) bar.style.display = 'none';
}

export function stopEntityEngine() {
  if (LV) { LV.destroy(); LV = null; }
  CUR = null;
}

