import { el, clear } from '../core/dom.js';
import { card, dataTable, emptyState, errorState, btn } from '../components.js';
import { fmtNum } from '../core/format.js';
import { CR, CR_KINDS, CR_KIND_COLOR, crFetch, crKindLabel, crNewBadge, crSig, crSym, crWhen, crAgo, crNum, crCount, crExcName, crStatusBadge, crBar, crCatalog, crCatMeta, crCatOf, crCatBadge } from './crashes_state.js';

const CHART_KINDS = CR_KINDS.concat([['other', 'Other']]);

const SVG = 'http://www.w3.org/2000/svg';

function sv(tag, attrs, ...kids) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) n.setAttribute(k, String(v));
  for (const k of kids) if (k != null) n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return n;
}

function dayOf(d) { return String(d.day || d.date || '').slice(0, 10); }

function kindCounts(d) {
  const src = d.by_kind && typeof d.by_kind === 'object' ? d.by_kind : d;
  const out = {};
  for (const [k] of CR_KINDS) out[k] = crNum(src[k]);
  const known = Object.values(out).reduce((a, b) => a + b, 0);
  const total = crNum(d.total != null ? d.total : d.count);
  out.other = Math.max(0, total - known);
  return out;
}

function niceStep(max) {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

function dayChart(perDay) {
  const W = 900, H = 230, L = 38, R = 10, T = 12, B = 28;
  const days = perDay.map(d => ({ day: dayOf(d), k: kindCounts(d) }));
  const totals = days.map(d => Object.values(d.k).reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const y = v => T + (H - T - B) * (1 - v / top);
  const bw = (W - L - R) / Math.max(1, days.length);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Reports per day' });
  for (let v = 0; v <= top; v += step) {
    svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'rgba(122,92,30,.18)', 'stroke-width': 1 }));
    svg.appendChild(sv('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#6e5c3e' }, String(v)));
  }
  const every = Math.max(1, Math.ceil(days.length / 12));
  days.forEach((d, i) => {
    const x = L + i * bw;
    let acc = 0;
    const g = sv('g', {});
    const parts = [];
    for (const [k] of CHART_KINDS) {
      const n = d.k[k];
      if (!n) continue;
      parts.push(n + ' ' + crKindLabel(k).toLowerCase());
      g.appendChild(sv('rect', { x: x + bw * 0.14, width: Math.max(1, bw * 0.72), y: y(acc + n), height: Math.max(0.5, y(acc) - y(acc + n)), rx: 2, fill: CR_KIND_COLOR[k] }));
      acc += n;
    }
    g.appendChild(sv('rect', { x, y: T, width: bw, height: H - T - B, fill: 'transparent' }));
    g.appendChild(sv('title', {}, d.day + ' — ' + (parts.join(', ') || 'no report')));
    svg.appendChild(g);
    if (i % every === 0) svg.appendChild(sv('text', { x: x + bw / 2, y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: '#6e5c3e' }, d.day.slice(5)));
  });
  svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: '#9c8862', 'stroke-width': 1 }));
  const legend = el('div', { class: 'crx-legend' }, CHART_KINDS.filter(([k]) => days.some(d => d.k[k])).map(([k, l]) =>
    el('span', {}, el('i', { style: { background: CR_KIND_COLOR[k] } }), l)));
  return el('div', { class: 'crx-chart' }, svg, legend);
}

function kindEntries(byKind) {
  if (Array.isArray(byKind)) return byKind.map(x => [x.kind || x.crash_kind || 'other', crCount(x)]);
  return Object.entries(byKind || {}).map(([k, v]) => [k, crNum(v)]);
}

function kindCard(byKind) {
  const rows = kindEntries(byKind).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  const pick = k => (CR_KIND_COLOR[k] && k !== 'other' ? () => CR.nav.showList({ kind: k }) : null);
  const total = rows.reduce((a, r) => a + r[1], 0);
  const body = rows.length ? el('div', { class: 'crx-bars' }, rows.map(([k, n]) => el('div', { class: 'crx-bar' + (pick(k) ? ' crx-link' : ''), title: pick(k) ? 'Show these reports' : null, onclick: pick(k) },
    el('span', {}, crKindLabel(k)), crBar([{ n, color: CR_KIND_COLOR[k] || '#9a6a2b' }], total),
    el('b', {}, fmtNum(n) + ' · ' + Math.round(100 * n / Math.max(1, total)) + '%')))) : emptyState({ title: 'No report in this period' });
  return card({ title: 'By kind', icon: 'rate', body });
}

function dllCard(list) {
  const rows = (list || []).map(d => ({ v: d.dll_version || d.version || '?', n: crCount(d), c: crNum(d.crash), a: crNum(d.abnormal_exit), acc: d.accounts, sig: d.signatures }));
  const ver = v => String(v).split('.').map(x => parseInt(x, 10) || 0);
  rows.sort((x, y) => { const a = ver(x.v), b = ver(y.v); for (let i = 0; i < Math.max(a.length, b.length); i++) if ((b[i] || 0) !== (a[i] || 0)) return (b[i] || 0) - (a[i] || 0); return 0; });
  const max = Math.max(1, ...rows.map(r => r.n));
  const body = rows.length ? el('div', { class: 'crx-bars' }, rows.map(r => el('div', { class: 'crx-bar crx-link', title: 'Show the reports of this DLL version', onclick: () => CR.nav.showList({ dll_version: r.v }) },
    el('span', { class: 'crx-mono' }, r.v),
    crBar(r.c || r.a ? [{ n: r.c, color: CR_KIND_COLOR.crash, title: r.c + ' crashes' }, { n: r.a, color: CR_KIND_COLOR.abnormal_exit, title: r.a + ' abnormal exits' }, { n: Math.max(0, r.n - r.c - r.a), color: '#9a6a2b' }] : [{ n: r.n, color: '#9a6a2b' }], max),
    el('b', { title: (r.acc != null ? r.acc + ' accounts' : '') + (r.sig != null ? ', ' + r.sig + ' signatures' : '') }, fmtNum(r.n) + (r.acc != null ? ' · ' + r.acc + ' acc.' : ''))))) : emptyState({ title: 'No DLL version reported' });
  return card({ title: 'By DLL version', icon: 'chip', subtitle: 'regressions show up here first', body });
}

function isNew(r, fresh) {
  if (r.is_new != null) return !!r.is_new;
  if (fresh.has(r.signature)) return true;
  const t = new Date(r.first_seen);
  return !isNaN(+t) && Date.now() - +t < 7 * 86400000;
}

function codeOf(r) {
  const p = String(r.signature || '').split(':');
  return r.exc_code || (/^crt_/.test(p[0]) ? p[1] : p[0]);
}

function sigNote(sig) {
  const s = String(sig || '');
  if (s.startsWith('hang:')) return 'Main thread frozen';
  if (s.startsWith('crt_exit:')) return 'Game CRT exit (non-zero code)';
  if (s.startsWith('crt_abort:')) return 'Game CRT abort';
  return '';
}

function sigCard(list, fresh) {
  const rows = list || [];
  const cols = [
    { key: 'signature', label: 'Signature', render: r => el('div', { class: 'crx-sigcell' }, crCatBadge(crCatOf(r), { css: 'margin-right:6px' }), crSig(r.signature), isNew(r, fresh) ? crNewBadge() : null, crSym(r.symbol),
      el('small', {}, sigNote(r.signature) || crExcName(codeOf(r)))) },
    { key: 'count', label: 'Reports', align: 'right', render: r => el('span', { title: r.total != null ? r.total + ' since first seen' : null }, fmtNum(crCount(r))) },
    { key: 'accounts', label: 'Accounts', align: 'right', render: r => fmtNum(r.accounts) },
    { key: 'first_seen', label: 'First seen', render: r => el('span', { title: crWhen(r.first_seen) }, crAgo(r.first_seen) || '—') },
    { key: 'last_seen', label: 'Last seen', render: r => el('span', { title: crWhen(r.last_seen) }, crAgo(r.last_seen) || '—') },
    { key: 'dll_versions', label: 'DLL', render: r => (r.dll_versions || []).join(', ') },
  ];
  if (rows.some(r => r.status)) cols.push({ key: 'status', label: 'Status', render: r => (r.status ? crStatusBadge(r.status) : '') });
  return card({ title: 'Top signatures', icon: 'bug', subtitle: 'click a row to list its reports', class: 'crx-span',
    body: dataTable({ columns: cols, rows, empty: 'No exception signature in this period', onRowClick: r => CR.nav.showList({ signature: r.signature }) }) });
}

function newCard(list) {
  const rows = list || [];
  const body = rows.length ? el('div', { class: 'crx-newlist' }, rows.map(r => el('div', { class: 'crx-newrow crx-link', onclick: () => CR.nav.showList({ signature: r.signature }) },
    crNewBadge(), crSig(r.signature), crSym(r.symbol),
    el('span', { class: 'crx-dim' }, 'first ' + (crAgo(r.first_seen) || '?') + ' · ' + fmtNum(crCount(r)) + ' report' + (crCount(r) === 1 ? '' : 's') + ' · ' + fmtNum(r.accounts) + ' acc.')))) :
    emptyState({ title: 'No new signature', hint: 'Nothing crashed in a way never seen before during the last 7 days.' });
  return card({ title: 'New signatures', icon: 'warning', subtitle: 'first seen in the last 7 days', body });
}

function accountCard(list) {
  const cols = [
    { key: 'account', label: 'Account', render: r => el('b', {}, r.account || '—') },
    { key: 'count', label: 'Reports', align: 'right', render: r => fmtNum(crCount(r)) },
    { key: 'signatures', label: 'Signatures', align: 'right', render: r => (r.signatures != null ? fmtNum(r.signatures) : '') },
    { key: 'characters', label: 'Characters', render: r => (r.characters || []).join(', ') },
    { key: 'last_seen', label: 'Last', render: r => el('span', { title: crWhen(r.last_seen) }, crAgo(r.last_seen) || '—') },
  ];
  return card({ title: 'Most affected accounts', icon: 'accounts',
    body: dataTable({ columns: cols, rows: list || [], empty: 'No account in this period', onRowClick: r => CR.nav.showList({ account: r.account }) }) });
}

function familiesCard(st) {
  // group the known signatures into families so the page reads for everyone
  const agg = {};
  const addTo = (id, n) => { agg[id] = (agg[id] || 0) + n; };
  for (const r of (st.top_signatures || [])) addTo(crCatOf(r), crCount(r));
  const kinds = Object.fromEntries(kindEntries(st.by_kind));
  if (kinds.hang && !agg.hang && !agg.hang_dll) addTo('hang', kinds.hang);
  const rows = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, r) => a + r[1], 0);
  const body = rows.length ? el('div', { class: 'crx-bars' }, rows.map(([id, n]) => {
    const m = crCatMeta(id);
    return el('div', { class: 'crx-bar crx-link', title: (m.text || '') + ' — click to list these reports',
      onclick: () => CR.nav.showList({ category: id }) },
      el('span', {}, crCatBadge(id)),
      crBar([{ n, color: m.color }], total),
      el('b', {}, fmtNum(n) + ' · ' + Math.round(100 * n / Math.max(1, total)) + '%'),
      el('small', { class: 'crx-dim', style: 'grid-column:1/-1' }, m.text || ''));
  })) : emptyState({ title: 'No report in this period' });
  return card({ title: 'Crash families', icon: 'bug', class: 'crx-span',
    subtitle: 'every report grouped by known cause, with the state of its fix — click a family to see its reports',
    body });
}

function kpis(st) {
  const kinds = Object.fromEntries(kindEntries(st.by_kind));
  const total = st.total != null ? crNum(st.total) : Object.values(kinds).reduce((a, b) => a + b, 0);
  const shown = (st.accounts || []).length;
  const accounts = st.accounts_total != null ? fmtNum(st.accounts_total) : fmtNum(shown) + (shown >= 20 ? '+' : '');
  const tile = (n, label, tone) => el('div', { class: 'crx-kpi' + (tone ? ' ' + tone : '') }, el('b', {}, typeof n === 'string' ? n : fmtNum(n)), el('span', {}, label));
  return el('div', { class: 'crx-kpis' },
    tile(total, 'reports · last ' + CR.days + ' days'),
    tile(kinds.crash || 0, 'crashes (exception)', 'crx-kpi-crash'),
    tile(kinds.abnormal_exit || 0, 'abnormal exits', 'crx-kpi-abn'),
    kinds.hang ? tile(kinds.hang, 'hangs (game resumed)', 'crx-kpi-hang') : null,
    tile(accounts, 'accounts affected'),
    tile((st.new_signatures || []).length, 'new signatures (7 days)', (st.new_signatures || []).length ? 'crx-kpi-new' : ''));
}

export async function renderOverview(body) {
  body.appendChild(el('div', { class: 'empty crx-loading' }, 'Loading crash statistics…'));
  let st;
  try { [st] = await Promise.all([crFetch('/stats', { days: CR.days, env: CR.env }), crCatalog()]); }
  catch (e) {
    clear(body);
    body.appendChild(errorState({ error: e, title: 'Crash statistics unavailable', onRetry: () => CR.nav.go('overview') }));
    if (!CR.demo) body.appendChild(el('div', { class: 'crx-center' }, btn({ label: 'Show demo data instead', icon: 'preview', variant: 'ghost', onClick: () => CR.nav.setDemo(true) })));
    return;
  }
  if (CR.tab !== 'overview') return;
  clear(body);
  body.appendChild(kpis(st));
  body.appendChild(el('div', { class: 'crx-grid' },
    familiesCard(st),
    card({ title: 'Reports per day', icon: 'duration', class: 'crx-span', body: (st.per_day || []).length ? dayChart(st.per_day) : emptyState({ title: 'No data' }) }),
    kindCard(st.by_kind), dllCard(st.by_dll_version),
    sigCard(st.top_signatures, new Set((st.new_signatures || []).map(s => s.signature))),
    newCard(st.new_signatures), accountCard(st.accounts)));
}
