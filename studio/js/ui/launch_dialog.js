/* Launch confirmation with display options (window mode, resolution, frame cap, graphics quality).
   Values are read from the packed client's client.ini by /api/launch/target and written back by /api/launch
   only when they differ from the file. Resolves null on Cancel, else the body to POST to /api/launch. */

import { setupVariants } from './launch_variants.js';

const QLABEL = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', custom: 'Keep current (custom)' };
let _resolve = null;
let _base = null;

const $ = s => document.querySelector(s);

function _opt(value, label, selected) {
  const o = document.createElement('option');
  o.value = value; o.textContent = label; if (selected) o.selected = true;
  return o;
}

function _screenSize() {
  try {
    const r = window.devicePixelRatio || 1;
    return [Math.round(screen.width * r), Math.round(screen.height * r)];
  } catch (_) { return [0, 0]; }
}

function _fillRes(d) {
  const sel = $('#lm-res'); sel.innerHTML = '';
  const cur = (d.width && d.height) ? d.width + 'x' + d.height : '';
  const [sw, sh] = _screenSize();
  const native = (sw && sh) ? sw + 'x' + sh : '';
  const list = (d.resolutions || []).filter(r => {
    if (!sw || !sh) return true;
    const [w, h] = r.split('x').map(Number);
    return w <= sw && h <= sh;
  });
  if (native && !list.includes(native)) list.push(native);
  if (cur && !list.includes(cur)) list.push(cur);
  list.sort((a, b) => { const [aw, ah] = a.split('x').map(Number), [bw, bh] = b.split('x').map(Number); return aw * ah - bw * bh || aw - bw; });
  for (const r of list) {
    const tags = [];
    if (r === native) tags.push('screen');
    if (r === cur) tags.push('current');
    sel.appendChild(_opt(r, r.replace('x', ' × ') + (tags.length ? '  (' + tags.join(', ') + ')' : ''), r === (cur || native)));
  }
}

function _fillFps(d) {
  const sel = $('#lm-fps'); sel.innerHTML = '';
  const list = [...(d.fps_choices || [30, 60, 120, 144])];
  if (d.fps && !list.includes(d.fps)) list.push(d.fps);
  list.sort((a, b) => a - b);
  for (const f of list) sel.appendChild(_opt(String(f), f + ' FPS' + (f === d.fps ? '  (current)' : ''), f === (d.fps || 60)));
}

function _fillQuality(d) {
  const sel = $('#lm-quality'); sel.innerHTML = '';
  const cur = d.quality || 'custom';
  if (cur === 'custom') sel.appendChild(_opt('custom', QLABEL.custom, true));
  for (const q of (d.qualities || ['low', 'medium', 'high', 'ultra']))
    sel.appendChild(_opt(q, QLABEL[q] + (q === cur ? '  (current)' : ''), q === cur));
}

function _done(v) {
  $('#launchModal').classList.remove('open');
  const r = _resolve; _resolve = null;
  if (r) r(v);
}

function _count() {
  const n = Number($('#lm-count').value) || 1;
  try { localStorage.setItem('launch.count', String(n)); } catch (_) { }
  return Math.min(6, Math.max(1, n));
}

function _collect() {
  const body = { env: _env };
  const n = _count();
  if (n > 1) body.count = n;
  if (!_base) return body;
  const fs = $('#lm-mode').value === 'full';
  if (fs !== _base.fullscreen) body.fullscreen = fs;
  const res = $('#lm-res').value;
  if (res) {
    const [w, h] = res.split('x').map(Number);
    if (w !== _base.width || h !== _base.height) { body.width = w; body.height = h; }
  }
  const fps = Number($('#lm-fps').value);
  if (fps && fps !== _base.fps) body.fps = fps;
  const q = $('#lm-quality').value;
  if (q && q !== 'custom' && q !== _base.quality) body.quality = q;
  return body;
}

let _env = null;
let _fetch = null;

function _problem(t) {
  const el = $('#lm-problem');
  const txt = t && t.problem ? String(t.problem) : '';
  if (el) { el.textContent = txt; el.style.display = txt ? '' : 'none'; }
  $('#lm-yes').disabled = !!(t && t.blocking);
}

function _show(env, srv, display) {
  _env = env;
  $('#lm-title').textContent = 'Launch the game on "' + env + '"?';
  $('#lm-msg').textContent = srv
    ? 'connect.ini → ' + String(srv).replace(',', ':') + ', then launching your launcher.'
    : 'Launch your launcher? (no game server set for "' + env + '" — connect.ini unchanged.)';
  const box = $('#lm-display'), warn = $('#lm-warn');
  _base = (display && !display.error && display.exists) ? display : null;
  if (_base) {
    box.style.display = '';
    $('#lm-mode').value = _base.fullscreen ? 'full' : 'window';
    _fillRes(_base); _fillFps(_base); _fillQuality(_base);
    warn.textContent = _base.game_running
      ? 'The game is already running: it rewrites client.ini when it closes, which would undo these settings. Close it first for them to stick.'
      : '';
    warn.style.display = _base.game_running ? '' : 'none';
  } else {
    box.style.display = 'none';
    warn.textContent = display && display.error ? 'Display options unavailable: ' + display.error
      : 'Display options unavailable: client.ini not found in the packed client folder (Settings).';
    warn.style.display = '';
  }
  $('#lm-env').classList.toggle('lm-prod', env === 'prod');
}

function _fillEnv(envs, env, active) {
  const sel = $('#lm-env'); sel.innerHTML = '';
  const list = (envs && envs.length) ? envs : [env];
  for (const e of list) sel.appendChild(_opt(e, e + (e === active ? '  (active in the tool)' : ''), e === env));
  $('#lm-envwrap').style.display = list.length > 1 ? '' : 'none';
}

let _wired = false;
function _wire() {
  if (_wired) return; _wired = true;
  $('#lm-yes').onclick = () => _done(_collect());
  $('#lm-no').onclick = () => _done(null);
  $('#launchModal').addEventListener('click', e => { if (e.target.id === 'launchModal') _done(null); });
  $('#lm-env').addEventListener('change', async () => {
    const want = $('#lm-env').value;
    if (!_fetch || want === _env) return;
    $('#lm-yes').disabled = true;
    try {
      const t = await _fetch(want);
      $('#lm-yes').disabled = false;
      if ($('#lm-env').value === want) { _show(t.env || want, t.server, t.display || null); _problem(t); }
    } catch (_) { $('#lm-yes').disabled = false; }
  });
}

export function openLaunchDialog({ env, srv, display, envs, active, fetchTarget, target }) {
  _wire();
  let saved = '1';
  try { saved = localStorage.getItem('launch.count') || '1'; } catch (_) { }
  $('#lm-count').value = ['1', '2', '3', '4', '5', '6'].includes(saved) ? saved : '1';
  _fetch = fetchTarget || null;
  _fillEnv(envs, env, active || env);
  _show(env, srv, display);
  _problem(target || null);
  setupVariants({ getEnv: () => _env, collect: _collect, launch: _done });
  $('#launchModal').classList.add('open');
  setTimeout(() => { try { $('#lm-yes').focus(); } catch (_) { } }, 60);
  return new Promise(res => { _resolve = res; });
}

export function closeLaunchDialog() { if (_resolve) _done(null); }
