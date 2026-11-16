import { el } from '../core/dom.js';
import { api, ApiError } from '../core/api.js';
import { HANDLED } from '../core/net.js';

export const ROOT = '/api/deploy/emoji-cdn';
const QUIET = { headers: { [HANDLED]: '1' } };

export const call = {
  get: path => api.get(ROOT + path, QUIET),
  post: (path, body) => api.post(ROOT + path, body, QUIET),
};

export function errText(e) {
  if (e && e.isNetwork) return 'The tool did not answer. Is it still running? Try again in a moment.';
  const m = String((e && (typeof e.detail === 'string' ? e.detail : e.message)) || e || 'unknown error');
  const first = m.split(/\r?\n/)[0].trim();
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export const ES = {
  host: null, ctx: null, model: null, tab: 'catalog',
  q: '', cat: '', filter: 'all', page: 0, sel: null, showCats: false,
  want: 22, repack: false, upload: null, busy: false,
  report: null, dry: null, result: null, history: null,
  refresh: null, setTab: null, render: null, renderTabs: null, renderHead: null, signingAt: 0,
};

const SHEETS = new Map();
const LIVE = new Set();
let RAF = 0;

function sheet(url) {
  let im = SHEETS.get(url);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.onload = () => { for (const p of LIVE) if (p.im === im) p.f = -1; kick(); };
    im.src = url;
    SHEETS.set(url, im);
    if (SHEETS.size > 64) SHEETS.delete(SHEETS.keys().next().value);
  }
  return im;
}

function rectOf(img, f) {
  if (img.rects) return img.rects[Math.min(f, img.rects.length - 1)];
  const s = img.size || 32, c = (img.cell || 0) + f, cols = Math.max(1, img.cols || 1);
  return [(c % cols) * s, Math.floor(c / cols) * s, s, s];
}

function frameAt(img, now) {
  const n = img.frames || 1;
  return n > 1 ? Math.floor(now * (img.fps || 16) / 1000) % n : 0;
}

function tick(now) {
  RAF = 0;
  let alive = 0;
  for (const p of LIVE) {
    if (!p.c.isConnected) {
      if (now - p.born > 3000) LIVE.delete(p); else alive++;
      continue;
    }
    alive++;
    if (!p.im.complete || !p.im.naturalWidth) continue;
    const f = frameAt(p.img, now);
    if (f === p.f) continue;
    p.f = f;
    const [x, y, w, h] = rectOf(p.img, f);
    p.ctx.clearRect(0, 0, p.c.width, p.c.height);
    p.ctx.drawImage(p.im, x, y, w, h, 0, 0, p.c.width, p.c.height);
  }
  if (alive) kick();
}

function kick() { if (!RAF) RAF = requestAnimationFrame(tick); }

function canvas(img, scale, title) {
  const size = 32 * scale;
  const c = el('canvas', { width: size, height: size, class: 'emc-cv emc-x' + scale, title: title || null });
  if (!img || !img.url) { c.classList.add('emc-none'); return c; }
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  LIVE.add({ c, ctx, im: sheet(img.url), img, f: -1, born: performance.now() });
  kick();
  return c;
}

export function previewPair(img, title) {
  return el('div', { class: 'emc-pv', title: title || 'Real size (32 px) and x2' }, canvas(img, 1), canvas(img, 2));
}

export async function postForm(url, fd) {
  let r;
  try { r = await fetch(url, { method: 'POST', body: fd, headers: QUIET.headers }); } catch (e) { throw new ApiError((e && e.message) || 'network error', 0, null, url); }
  const txt = await r.text().catch(() => '');
  let body = null;
  try { body = txt ? JSON.parse(txt) : null; } catch (_) { body = null; }
  if (!r.ok) throw new ApiError((body && body.detail) || ('HTTP ' + r.status), r.status, body, url);
  return body || {};
}

export function kwText(list) { return (list || []).join(', '); }

export function catSelect(value, disabled, placeholder) {
  const cats = (ES.model && ES.model.categories) || [];
  const known = cats.some(c => c.id === value);
  return el('select', { class: 'emc-in', disabled: disabled ? true : null },
    placeholder ? el('option', { value: '', selected: known ? null : true }, placeholder) : null,
    cats.map(c => el('option', { value: c.id, selected: c.id === value ? true : null, title: 'id: ' + c.id }, c.name)),
    known || placeholder ? null : el('option', { value: value || '', selected: true }, `${value || '?'} (unknown)`));
}

export function fmtFrames(frames, fps) { return frames > 1 ? `${frames} frames · ${fps} fps` : 'static'; }

export function lim() { return (ES.ctx && ES.ctx.limits) || {}; }

const OLD_BACKEND = { can: false, signing: false, creds: false, blocks: ['This page was updated but the tool still runs its previous version: close and reopen the tool to finish the update.'] };

export function pubState() { return (ES.ctx && ES.ctx.publish) || OLD_BACKEND; }

export function canPublish() { return !!(pubState().can && ES.ctx.tenant_ok); }

export function blockText() { return pubState().blocks.join(' '); }

export function signingText(ps) {
  ps = ps || pubState();
  if (ps.signing) {
    const s = ps.signer;
    if (!s) return 'found: the game DLL accepts what this PC signs';
    return s.source === 'local' ? `release key of this PC (${s.kid})` : `key '${s.name}' (${s.kid}) granted to account ${s.account} by the back-office`;
  }
  if (ps.signing_reason) return ps.signing_reason;
  return ps.blocks.length ? ps.blocks.join(' ') : 'not available on this PC';
}

export async function refreshSigning(force) {
  if (!ES.ctx || !ES.ctx.publish || ES.ctx.publish.v !== 2) return false;
  if (!force && (ES.ctx.publish.signing || Date.now() - ES.signingAt < 15000)) return false;
  ES.signingAt = Date.now();
  let ps;
  try { ps = await call.get('/signing?refresh=1'); } catch (e) { return false; }
  if (!ps || ps.v !== 2) return false;
  const changed = JSON.stringify(ps) !== JSON.stringify(ES.ctx.publish);
  ES.ctx.publish = ps;
  return changed;
}
