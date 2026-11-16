import { badge } from '../components.js';

export const PF = {
  host: null,
  demo: false,
  filters: { account: '', character: '', env: '', since: '', until: '', q: '' },
  sort: 'received_at',
  order: 'desc',
  limit: 100,
  offset: 0,
  rows: [],
  total: 0,
  facets: {},
};

export const PF_ENVS = [['', 'All'], ['dev', 'Dev'], ['preprod', 'Preprod'], ['prod', 'Prod'], ['unknown', 'Unknown'], ['other', 'Other']];

const TONES = {
  fps: v => (v >= 50 ? 'g' : v >= 30 ? 'a' : 'r'),
  low1: v => (v >= 30 ? 'g' : v >= 20 ? 'a' : 'r'),
  frame: v => (v < 20.5 ? 'g' : v < 33.5 ? 'a' : 'r'),
  worst: v => (v < 50 ? 'g' : v < 100 ? 'a' : 'r'),
  part: v => (v < 6 ? 'g' : v < 12 ? 'a' : 'r'),
};

export function pfTone(kind, v) {
  if (v == null || v === '' || !isFinite(Number(v)) || !TONES[kind]) return '';
  return 'prf-' + TONES[kind](Number(v));
}

export function pfNum(v, digits) {
  if (v == null || v === '' || !isFinite(Number(v))) return '—';
  return Number(v).toFixed(digits == null ? 1 : digits);
}

const CAUSE_TONE = { 0: 'neutral', 1: 'warn', 2: 'error' };

export function pfCauseBadge(r, short) {
  const lvl = Number(r && r.cause_level) || 0;
  const text = String((r && r.cause) || (lvl ? 'Problem detected' : 'No problem detected'));
  const label = short && text.length > 42 ? text.slice(0, 40) + '…' : text;
  return badge(label, CAUSE_TONE[lvl] || 'neutral', { title: text + (r && r.advice ? '\n' + r.advice : '') });
}

function url(path, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== '' && v != null) q.set(k, String(v));
  if (PF.demo) q.set('demo', '1');
  q.set('__quiet', '1');
  return '/api/perf_reports' + (path || '') + '?' + q.toString();
}

export async function pfFetch(path, params) {
  let r;
  try { r = await fetch(url(path, params)); }
  catch (_) { throw new Error('the tool did not answer — is it still running?'); }
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try {
      const j = await r.json();
      if (j && (j.detail || j.error || j.message)) msg = String(j.detail || j.error || j.message);
    } catch (_) { msg = 'HTTP ' + r.status; }
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  const txt = await r.text();
  try { return txt ? JSON.parse(txt) : {}; }
  catch (_) { throw new Error('malformed answer from the tool'); }
}
