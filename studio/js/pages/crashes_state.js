import { $, el, clear } from '../core/dom.js';
import { badge } from '../components.js';
import { fmtDate, ago } from '../core/format.js';

export const CR = {
  host: null,
  days: 30,
  env: '',
  tab: 'overview',
  filters: { kind: '', status: '', account: '', character: '', signature: '', dll_version: '', since: '', q: '' },
  offset: 0,
  limit: 50,
  detailId: null,
  total: null,
  sessFilters: { end_kind: '', account: '', character: '', dll_version: '', feature: '', hangs: '', since: '', q: '', session_id: '', install_id: '' },
  sessOffset: 0,
  sessLimit: 50,
  sessionId: null,
  sessTotal: null,
  nav: {},
};

export const CR_END_KINDS = [['clean', 'Clean exit'], ['crash', 'Crash'], ['hang', 'Hang (killed)'], ['abnormal_exit', 'Abnormal exit'], ['open', 'Running / unknown']];
export const CR_END_COLOR = { clean: '#6f8f4f', crash: '#bf3a3a', hang: '#5a86b8', abnormal_exit: '#cf9b2a', running: '#c9bc9c', open: '#c9bc9c' };
const END_TONE = { clean: 'ok', crash: 'error', hang: 'info', abnormal_exit: 'warn' };

export function crEndLabel(k) {
  const f = CR_END_KINDS.find(x => x[0] === (k || 'open'));
  return f ? f[1] : k;
}

export function crEndBadge(k) { return badge(crEndLabel(k), END_TONE[k] || 'neutral'); }

export function crSym(symbol) {
  return symbol ? el('small', { class: 'crx-sym', title: 'Function in game_.exe (IDA export, data/symbols/game_exe_funcs.json)' }, symbol) : null;
}

export function crPct(x, digits) {
  if (x == null || !isFinite(Number(x))) return '—';
  return (100 * Number(x)).toFixed(digits == null ? 1 : digits) + '%';
}

export const CR_STATUSES = ['new', 'investigating', 'resolved', 'wontfix'];
export const CR_STATUS_FILTER = CR_STATUSES.concat(['resolved', 'wontfix']);
export const CR_KINDS = [['crash', 'Crash'], ['abnormal_exit', 'Abnormal exit'], ['hang', 'Hang'], ['recovered', 'Recovered']];
export const CR_KIND_COLOR = { crash: '#bf3a3a', abnormal_exit: '#cf9b2a', hang: '#5a86b8', recovered: '#6f8f4f', other: '#9c8862' };

const KIND_TONE = { crash: 'error', abnormal_exit: 'warn', hang: 'info', recovered: 'ok' };
const STATUS_TONE = { new: 'info', investigating: 'warn', known: 'neutral', fixed: 'ok', resolved: 'ok', wontfix: 'neutral' };
const EXC = {
  '0xC0000005': 'Access violation',
  '0xC000008C': 'Array bounds exceeded',
  '0xC0000094': 'Integer divide by zero',
  '0xC00000FD': 'Stack overflow',
  '0xC0000409': 'Stack buffer overrun (fail-fast)',
  '0xC0000374': 'Heap corruption',
  '0xC000001D': 'Illegal instruction',
  '0xC0000096': 'Privileged instruction',
  '0x80000003': 'Breakpoint',
  '0xE06D7363': 'C++ exception',
  '0xC0000017': 'Out of memory',
};

export function crNormCode(code) {
  const s = String(code || '').trim();
  const m = /^0x([0-9a-f]+)$/i.exec(s);
  return m ? '0x' + m[1].toUpperCase().padStart(8, '0') : s;
}

export function crExcName(code) { return EXC[crNormCode(code)] || ''; }

export function crKindLabel(k) {
  const f = CR_KINDS.find(x => x[0] === k);
  return f ? f[1] : (k || '—');
}

export function crKindBadge(k) { return badge(crKindLabel(k), KIND_TONE[k] || 'neutral'); }

export function crStatusBadge(s) { return badge(s || 'new', STATUS_TONE[s || 'new'] || 'neutral'); }

export function crNewBadge() { return badge('NEW', 'error', { class: 'crx-newb', title: 'First seen in the last 7 days' }); }

export function crWhen(iso) { return iso ? fmtDate(iso) : '—'; }

export function crAgo(iso) { return iso ? ago(iso) : ''; }

export function crNum(v) { const n = Number(v); return isFinite(n) ? n : 0; }

export function crCount(r) { return crNum(r && (r.count != null ? r.count : r.n)); }

export function crUptime(s) {
  const v = Math.round(crNum(s));
  if (!v) return '—';
  const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), sec = v % 60;
  if (h) return h + ' h ' + String(m).padStart(2, '0') + ' min';
  if (m) return m + ' min ' + String(sec).padStart(2, '0') + ' s';
  return sec + ' s';
}

export function crSig(sig, onClick) {
  const c = el('code', { class: 'crx-sig' + (onClick ? ' crx-link' : ''), title: sig ? (onClick ? 'Show every report with this signature' : sig) : 'No exception recorded' }, sig || '—');
  if (onClick && sig) c.onclick = ev => { ev.stopPropagation(); onClick(sig); };
  return c;
}

function crUrl(path, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== '' && v != null) q.set(k, String(v));
  const s = q.toString();
  return '/api/crashes' + (path || '') + (s ? '?' + s : '');
}

function quiet(url) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + '__quiet=1'; }

async function errorOf(r) {
  let msg = 'HTTP ' + r.status;
  try {
    const j = await r.json();
    if (j && (j.detail || j.error || j.message)) msg = String(j.detail || j.error || j.message);
  } catch (_) { msg = 'HTTP ' + r.status; }
  const e = new Error(msg);
  e.status = r.status;
  return e;
}

async function send(url, init) {
  try { return await fetch(quiet(url), init); }
  catch (_) { throw new Error('the tool did not answer — is it still running?'); }
}

export const CR_ENVS = [['', 'All servers'], ['dev', 'Dev'], ['preprod', 'Preprod'], ['prod', 'Prod'], ['other', 'Other / unknown']];

function noteEnv(params, j) {
  if (!params || !params.env || !j || typeof j !== 'object' || j.ok === undefined) return;
  const w = $('#crx-envwarn');
  if (!w) return;
  clear(w);
  if (j.env !== params.env) w.appendChild(badge('Server filter ignored: back-office not updated', 'warn', { title: 'The back-office answered without applying the server filter: these numbers mix every server' }));
}

export async function crFetch(path, params, init) {
  const r = await send(crUrl(path, params), init);
  if (!r.ok) throw await errorOf(r);
  const txt = await r.text();
  let j;
  try { j = txt ? JSON.parse(txt) : {}; }
  catch (_) { throw new Error('malformed answer from the tool'); }
  noteEnv(params, j);
  return j;
}

export async function crPost(path, body) {
  return crFetch(path, null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
}

function decode(buf) {
  const u8 = new Uint8Array(buf);
  let t = new TextDecoder('utf-8').decode(u8);
  const bad = (t.match(/�/g) || []).length;
  if (bad > 3) {
    try {
      const b = new TextDecoder('big5').decode(u8);
      if ((b.match(/�/g) || []).length < bad) t = b;
    } catch (_) { return t; }
  }
  return t;
}

export async function crFetchText(path) {
  const r = await send(crUrl(path), undefined);
  if (!r.ok) throw await errorOf(r);
  return decode(await r.arrayBuffer());
}

export function crFileUrl(id, name, download) {
  return crUrl('/' + id + '/file/' + encodeURIComponent(name), download ? { download: 1 } : null);
}

export function crZipUrl(id) { return crUrl('/' + id + '/zip'); }

export function crBar(parts, total) {
  const t = el('div', { class: 'crx-bar-t' });
  const sum = Math.max(1, total || parts.reduce((a, p) => a + crNum(p.n), 0));
  for (const p of parts) {
    if (!crNum(p.n)) continue;
    t.appendChild(el('i', { title: p.title || '', style: { width: (100 * crNum(p.n) / sum).toFixed(2) + '%', background: p.color } }));
  }
  return t;
}


// ---- Crash families (mirror of crash_bo.CRASH_CATALOG; catalog text fetched once) ----
export const CR_CAT_FALLBACK = [
  { id: 'summary',  label: 'Session summary',        color: '#6e7781', status: 'info' },
  { id: 'oom',      label: 'Out of memory (32-bit)', color: '#9a6700', status: 'environment' },
  { id: 'hang_dll', label: 'Freeze - Eden DLL',      color: '#8250df', status: 'ours' },
  { id: 'hang',     label: 'Freeze - game',          color: '#a475f9', status: 'watching' },
  { id: 'timer',    label: 'Timer walk',             color: '#bc4c00', status: 'fix-ready' },
  { id: 'd3dx',     label: 'D3DX shader table',      color: '#d1242f', status: 'mitigated' },
  { id: 'render',   label: 'Render state 1B63xx',    color: '#cf222e', status: 'investigating' },
  { id: 'crt',      label: 'CRT abort (heap)',       color: '#c4432b', status: 'mitigated' },
  { id: 'eden',     label: 'Eden DLL fault',         color: '#8250df', status: 'ours' },
  { id: 'other',    label: 'Unclassified',           color: '#57606a', status: 'investigating' },
];
let _cat = null;
export async function crCatalog() {
  if (_cat) return _cat;
  try {
    const r = await crFetch('/catalog', {});
    _cat = (r && r.catalog && r.catalog.length) ? r.catalog : CR_CAT_FALLBACK;
  } catch (_) { _cat = CR_CAT_FALLBACK; }
  return _cat;
}
export function crCatMeta(id) {
  const all = _cat || CR_CAT_FALLBACK;
  return all.find(c => c.id === id) || all[all.length - 1];
}
export function crCatOf(r) {
  if (r && r.category) return r.category;
  const sig = String((r && r.signature) || '').toLowerCase();
  const kind = String((r && r.crash_kind) || '').toLowerCase();
  const mem = (r && r.mem_peak_mb) || 0;
  let off = 0;
  try { off = parseInt(String((r && r.exc_offset) || '0'), 16) || 0; } catch (_) { off = 0; }
  if (!sig && (kind === '' || kind === 'summary' || kind === 'resume')) return 'summary';
  if (mem >= 3500) return 'oom';
  if (sig.startsWith('hang:')) return sig.includes('eden.dll') ? 'hang_dll' : 'hang';
  if (sig.includes('0x29cf8f')) return 'timer';
  if (sig.includes('0x184915') || sig.includes('0x18141a') || sig.includes('0x18143d')) return 'd3dx';
  if (sig.includes('game_.exe') && off >= 0x1B6300 && off <= 0x1B64FF) return 'render';
  if (sig.startsWith('crt_abort')) return 'crt';
  if (sig.includes('eden.dll')) return 'eden';
  return 'other';
}
export function crCatBadge(id, opts) {
  const m = crCatMeta(id);
  const b = el('span', { class: 'crx-cat', title: (m.text || m.status || '') }, m.label);
  b.style.cssText = 'display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;'
    + 'color:#fff;background:' + m.color + ';white-space:nowrap;' + ((opts && opts.css) || '');
  return b;
}
