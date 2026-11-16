import { el, clear } from '../core/dom.js';
import { card, dataTable, emptyState, errorState, btn, badge } from '../components.js';
import { fmtNum } from '../core/format.js';
import { CR, CR_END_COLOR, crFetch, crSym, crWhen, crAgo, crNum, crPct, crKindBadge } from './crashes_state.js';

const SVG = 'http://www.w3.org/2000/svg';
const SAVE_COLOR = '#6f8f4f';

const GUARD_INFO = {
  site: ['Known crash site', 'A confirmed game_.exe crash site: the function returns cleanly instead of crashing'],
  wild_jump: ['Wild jump', 'Call through a broken pointer: the bad call is skipped and the caller continues'],
  near_null: ['Near-null access', 'Read or write through a null object field: treated as an empty field'],
  d3dx_table: ['D3DX constant table', 'Freed shader constant table: the call fails cleanly (D3DERR_INVALIDCALL)'],
  dead_object: ['Destroyed object', 'Destroyed or reused actor skipped by the type check at 0x6E456F'],
  icon_image: ['Invalid icon image', 'Garbage CEGUI Image pointer ignored when drawing an icon'],
  set_visible: ['setVisible on a freed window', 'CEGUI setVisible called on a destroyed window: ignored'],
  workresult: ['Work result window', 'Re-entrant or freed work result click: ignored'],
  invalid_param: ['CRT invalid parameter', 'Failed STL check that used to kill the game (int3): resumed, capped per caller'],
  vertex_buffer: ['Destroyed vertex buffer', 'Lock of a vertex buffer destroyed after a device loss: clean failure'],
  nedpfree: ['Foreign heap block', 'Free of a block nedmalloc does not own: kept alive instead of the CRT abort'],
  extra_data: ['NiObjectNET extra data', 'Extra data list NULL with entries: treated as empty instead of crash +0x4E3D8'],
  timer_walk: ['Timer list walk', 'Timer list reallocated by a callback: walk kept by index (crash 0x69CF8F)'],
  float_array: ['Missing asset array', 'Float array of a missing asset: loop skipped (freeze avoided)'],
  render_target: ['Render target group', 'Default render group failed: frame skipped instead of an endless recursion'],
  render_depth: ['Depth render target', 'Depth target of a failed render group: frame skipped'],
  render_this: ['Render pass on code', 'Render pass with a code pointer as object: pass skipped (crash 0x1B63xx)'],
  guild_slot: ['Guild-town UI slot', 'Null guild-town window slot skipped'],
  lottery_init: ['Lottery window init', 'Lottery window built on an incompatible layout: init left cleanly'],
  lottery_event: ['Lottery event', 'Lottery event with its detail window missing: skipped'],
  shader_cache: ['Poisoned shader cache', 'Poisoned shader cache entries removed at start (recompiled by the game)'],
};

function guardName(g) { return (GUARD_INFO[g] || [g || '?'])[0]; }

function guardCell(g) {
  const info = GUARD_INFO[g];
  return el('span', { title: info ? info[1] : 'Guard reported by the DLL' }, el('b', {}, guardName(g)), ' ', el('small', { class: 'crx-mono crx-dim' }, g || '?'));
}

function sv(tag, attrs, ...kids) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) n.setAttribute(k, String(v));
  for (const k of kids) if (k != null) n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return n;
}

function niceTop(max) {
  const raw = Math.max(1, max) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = 10 * p;
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) { step = m * p; break; }
  return [Math.ceil(Math.max(1, max) / step) * step, step];
}

function dayChart(perDay) {
  const W = 900, H = 220, L = 46, R = 46, T = 12, B = 28;
  const days = perDay.map(d => ({ day: String(d.day || '').slice(0, 10), s: crNum(d.saves), r: crNum(d.realized), ss: crNum(d.sessions_saved), rep: crNum(d.reporting) }));
  const [top, step] = niceTop(Math.max(...days.map(d => d.s)));
  const [rtop, rstep] = niceTop(Math.max(...days.map(d => d.r)));
  const y = v => T + (H - T - B) * (1 - v / top);
  const yr = v => T + (H - T - B) * (1 - v / rtop);
  const bw = (W - L - R) / Math.max(1, days.length);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Crashes avoided and crashes that happened per day' });
  for (let v = 0; v <= top; v += step) {
    svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'rgba(122,92,30,.18)', 'stroke-width': 1 }));
    svg.appendChild(sv('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#4f6b36' }, String(v)));
  }
  for (let v = 0; v <= rtop; v += rstep) svg.appendChild(sv('text', { x: W - R + 6, y: yr(v) + 4, 'font-size': 11, fill: '#8f2a2a' }, String(v)));
  const every = Math.max(1, Math.ceil(days.length / 12));
  const pts = [];
  days.forEach((d, i) => {
    const x = L + i * bw;
    const g = sv('g', {});
    if (d.s) g.appendChild(sv('rect', { x: x + bw * 0.14, width: Math.max(1, bw * 0.72), y: y(d.s), height: Math.max(0.5, y(0) - y(d.s)), rx: 2, fill: SAVE_COLOR }));
    g.appendChild(sv('rect', { x, y: T, width: bw, height: H - T - B, fill: 'transparent' }));
    g.appendChild(sv('title', {}, d.day + ' — ' + fmtNum(d.s) + ' crashes avoided in ' + fmtNum(d.ss) + ' sessions, ' + fmtNum(d.r) + ' crashes / hangs / abnormal exits (' + fmtNum(d.rep) + ' sessions with guard stats)'));
    svg.appendChild(g);
    pts.push([x + bw / 2, yr(d.r)]);
    if (i % every === 0) svg.appendChild(sv('text', { x: x + bw / 2, y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: '#6e5c3e' }, d.day.slice(5)));
  });
  if (pts.length > 1) svg.appendChild(sv('polyline', { points: pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), fill: 'none', stroke: CR_END_COLOR.crash, 'stroke-width': 1.6 }));
  for (const p of pts) svg.appendChild(sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 2.2, fill: CR_END_COLOR.crash }));
  svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: '#9c8862', 'stroke-width': 1 }));
  const legend = el('div', { class: 'crx-legend' },
    el('span', {}, el('i', { style: { background: SAVE_COLOR } }), 'crashes avoided (left axis)'),
    el('span', {}, el('i', { style: { background: CR_END_COLOR.crash } }), 'crashes + hangs + abnormal exits (right axis)'));
  return el('div', { class: 'crx-chart' }, svg, legend);
}

function tile(value, label, tone, title) {
  return el('div', { class: 'crx-kpi' + (tone ? ' ' + tone : ''), title: title || null }, el('b', {}, typeof value === 'string' ? value : fmtNum(value)), el('span', {}, label));
}

function kpis(a) {
  const t = a.totals || {};
  const rep = crNum(t.reporting);
  return el('div', { class: 'crx-kpis' },
    tile(crNum(t.saves), 'crashes avoided · last ' + a.days + ' days', 'crx-kpi-ok', 'Every save of a crash_guard guard, in the sessions that report guard stats (crash_guard 1.2.0 and later)'),
    tile(crNum(t.sessions_saved), 'sessions saved at least once', '', rep ? crPct(crNum(t.sessions_saved) / rep) + ' of the ' + fmtNum(rep) + ' sessions with guard stats' : 'No session with guard stats yet'),
    tile(crNum(t.installs_saved), 'game installs saved', '', fmtNum(crNum(t.accounts_saved)) + ' accounts'),
    tile(crNum(t.realized_reporting), 'crashes that happened', crNum(t.realized_reporting) ? 'crx-kpi-crash' : '',
      'Crashes + hangs (killed) + abnormal exits in the same sessions. All sessions, older DLLs included: ' + fmtNum(crNum(t.realized)) + ' (' + fmtNum(crNum(t.crash)) + ' crashes, ' + fmtNum(crNum(t.hang)) + ' hangs, ' + fmtNum(crNum(t.abnormal_exit)) + ' abnormal exits)'),
    tile(t.saves_per_realized != null ? '×' + Number(t.saves_per_realized).toFixed(1) : '—', 'avoided per crash that happened', '',
      t.saved_share != null ? crPct(t.saved_share) + ' of the would-be crashes were avoided' : 'No crash in the sessions with guard stats'),
    tile(t.saves_per_hour != null ? Number(t.saves_per_hour).toFixed(2) : '—', 'crashes avoided per hour played', '', fmtNum(crNum(t.uptime_reporting_h)) + ' hours played with guard stats'));
}

function dllSplit(byDll) {
  const parts = Object.entries(byDll || {}).sort((a, b) => crNum(b[1]) - crNum(a[1]));
  if (!parts.length) return '—';
  const shown = parts.slice(0, 3).map(([v, n]) => v + ': ' + fmtNum(n)).join(' · ');
  return el('span', { class: 'crx-mono crx-dim', title: parts.map(([v, n]) => v + ': ' + n).join('\n') }, shown + (parts.length > 3 ? ' …' : ''));
}

function crashedCell(n) { return crNum(n) ? el('b', { class: 'crx-bad', title: 'Sessions where this guard saved the game but that crashed later anyway' }, fmtNum(n)) : '0'; }

function guardCard(rows, onPick) {
  const cols = [
    { key: 'guard', label: 'Guard', render: r => guardCell(r.guard) },
    { key: 'sites', label: 'Sites', align: 'right', render: r => fmtNum(r.sites) },
    { key: 'saves', label: 'Avoided', align: 'right', render: r => el('b', { class: 'crx-good' }, fmtNum(r.saves)) },
    { key: 'sessions', label: 'Sessions', align: 'right', render: r => fmtNum(r.sessions) },
    { key: 'installs', label: 'Installs', align: 'right', render: r => fmtNum(r.installs) },
    { key: 'accounts', label: 'Accounts', align: 'right', render: r => fmtNum(r.accounts) },
    { key: 'crashed_sessions', label: 'Crashed later', align: 'right', render: r => crashedCell(r.crashed_sessions) },
    { key: 'by_dll', label: 'By DLL', render: r => dllSplit(r.by_dll) },
  ];
  return card({ title: 'Crashes avoided by guard', icon: 'barrier', subtitle: 'click a guard to list its sites', class: 'crx-span',
    body: dataTable({ columns: cols, rows: rows || [], empty: emptyState({ title: 'No crash avoided in this period', hint: 'Guard stats come with the session summaries of crash_guard 1.2.0 (reporter 0.4.0) and later.' }), onRowClick: r => onPick(r.guard) }) });
}

function siteCard(rows, filter, onClear) {
  const list = (rows || []).filter(r => !filter || r.guard === filter);
  const cols = [
    { key: 'guard', label: 'Guard', render: r => el('span', { title: (GUARD_INFO[r.guard] || [])[1] || '' }, guardName(r.guard)) },
    { key: 'at', label: 'Site', render: r => el('div', { class: 'crx-sigcell' }, el('code', { class: 'crx-sig' }, r.at || '(no address)'), crSym(r.symbol)) },
    { key: 'saves', label: 'Avoided', align: 'right', render: r => el('b', { class: 'crx-good' }, fmtNum(r.saves)) },
    { key: 'sessions', label: 'Sessions', align: 'right', render: r => fmtNum(r.sessions) },
    { key: 'installs', label: 'Installs', align: 'right', render: r => fmtNum(r.installs) },
    { key: 'accounts', label: 'Accounts', align: 'right', render: r => fmtNum(r.accounts) },
    { key: 'crashed_sessions', label: 'Crashed later', align: 'right', render: r => crashedCell(r.crashed_sessions) },
    { key: 'dll_versions', label: 'DLL', render: r => el('span', { class: 'crx-mono' }, (r.dll_versions || []).join(', ') || '—') },
    { key: 'last_seen', label: 'Last seen', render: r => el('span', { title: 'First seen ' + crWhen(r.first_seen) + ' · last seen ' + crWhen(r.last_seen) }, crAgo(r.last_seen) || '—') },
  ];
  const actions = filter ? btn({ label: 'All guards', icon: 'undo', variant: 'ghost', class: 'xs', onClick: onClear }) : null;
  return card({ title: filter ? 'Sites of ' + guardName(filter) : 'Crashes avoided by site', icon: 'objectives', subtitle: 'module + offset of the guarded code; game_.exe sites named from the IDA export', class: 'crx-span', actions,
    body: dataTable({ columns: cols, rows: list, empty: 'No site in this period' }) });
}

function dllCard(rows) {
  const cols = [
    { key: 'dll_version', label: 'DLL', render: r => el('span', { class: 'crx-mono' }, r.dll_version || '?', crNum(r.reporting) ? null : el('span', { title: 'This DLL does not send guard stats (crash_guard older than 1.2.0): its crashes are known, its avoided crashes are not' }, ' ', badge('no guard stats', 'warn'))) },
    { key: 'sessions', label: 'Sessions', align: 'right', render: r => fmtNum(r.sessions) },
    { key: 'reporting', label: 'With stats', align: 'right', render: r => fmtNum(r.reporting) },
    { key: 'saves', label: 'Avoided', align: 'right', render: r => el('b', { class: 'crx-good' }, fmtNum(r.saves)) },
    { key: 'sessions_saved', label: 'Sessions saved', align: 'right', render: r => el('span', { title: crNum(r.reporting) ? crPct(crNum(r.sessions_saved) / crNum(r.reporting)) + ' of the sessions with stats' : '' }, fmtNum(r.sessions_saved)) },
    { key: 'installs_saved', label: 'Installs saved', align: 'right', render: r => fmtNum(r.installs_saved) },
    { key: 'realized', label: 'Happened', align: 'right', title: () => 'Crashes + hangs + abnormal exits (all sessions of this DLL)', render: r => el('span', { title: fmtNum(r.crash) + ' crashes, ' + fmtNum(r.hang) + ' hangs, ' + fmtNum(r.abnormal_exit) + ' abnormal exits; ' + fmtNum(r.realized_reporting) + ' in sessions with stats' }, fmtNum(r.realized)) },
    { key: 'saves_per_realized', label: 'Avoided / happened', align: 'right', render: r => (r.saves_per_realized != null ? '×' + Number(r.saves_per_realized).toFixed(1) : '—') },
  ];
  return card({ title: 'By DLL version', icon: 'chip', subtitle: 'click a row for its sessions', class: 'crx-span',
    body: dataTable({ columns: cols, rows: rows || [], empty: 'No session in this period', onRowClick: r => CR.nav.showSessions({ dll_version: r.dll_version }) }) });
}

function realizedCard(a) {
  const t = a.totals || {};
  const rows = a.realized_reports || [];
  const cols = [
    { key: 'kind', label: 'Type', render: r => crKindBadge(r.kind) },
    { key: 'reports', label: 'Reports', align: 'right', render: r => fmtNum(r.reports) },
    { key: 'accounts', label: 'Accounts', align: 'right', render: r => fmtNum(r.accounts) },
    { key: 'reasons', label: 'Stopped by', render: r => { const e = Object.entries(r.reasons || {}); return e.length ? el('span', { class: 'crx-mono crx-dim' }, e.map(([k, n]) => k + ': ' + fmtNum(n)).join(' · ')) : '—'; } },
  ];
  const note = el('div', { class: 'esub crx-note' }, 'Sessions of the period that ended badly: ' + fmtNum(crNum(t.crash)) + ' crashes, ' + fmtNum(crNum(t.hang)) + ' hangs (killed), ' + fmtNum(crNum(t.abnormal_exit)) + ' abnormal exits; ' + fmtNum(crNum(t.hang_events)) + ' hangs detected in all. The reports below are what the back-office received (a resumed hang is a report too).');
  return card({ title: 'Crashes that happened', icon: 'bug', subtitle: 'by report type; click a row for the reports', class: 'crx-span',
    body: el('div', {}, note, dataTable({ columns: cols, rows, empty: emptyState({ title: 'No crash report in this period' }), onRowClick: r => CR.nav.showList({ kind: r.kind }) })) });
}

export async function renderGuards(body) {
  body.appendChild(el('div', { class: 'empty crx-loading' }, 'Loading crash_guard stats…'));
  let a;
  try {
    a = await crFetch('/guards', { days: CR.days, env: CR.env });
  } catch (e) {
    clear(body);
    body.appendChild(errorState({ error: e, title: 'crash_guard stats unavailable', onRetry: () => CR.nav.go('guards') }));
    if (!CR.demo) body.appendChild(el('div', { class: 'crx-center' }, btn({ label: 'Show demo data instead', icon: 'preview', variant: 'ghost', onClick: () => CR.nav.setDemo(true) })));
    return;
  }
  if (CR.tab !== 'guards') return;
  clear(body);
  if (a && a.missing) {
    body.appendChild(emptyState({ icon: 'barrier', title: 'crash_guard stats not available on the back-office', hint: a.error || '' }));
    if (!CR.demo) body.appendChild(el('div', { class: 'crx-center' }, btn({ label: 'Show demo data instead', icon: 'preview', variant: 'ghost', onClick: () => CR.nav.setDemo(true) })));
    return;
  }
  let filter = '';
  const sitesHost = el('div', { class: 'crx-span' });
  const drawSites = () => { clear(sitesHost); sitesHost.appendChild(siteCard(a.sites, filter, () => { filter = ''; drawSites(); })); };
  body.appendChild(kpis(a));
  body.appendChild(el('div', { class: 'crx-grid' },
    card({ title: 'Per day', icon: 'duration', subtitle: 'crashes avoided vs crashes that happened', class: 'crx-span',
      body: (a.per_day || []).some(d => crNum(d.saves) || crNum(d.realized)) ? dayChart(a.per_day) : emptyState({ title: 'Nothing in this period' }) }),
    guardCard(a.guards, g => { filter = g; drawSites(); sitesHost.scrollIntoView({ behavior: 'smooth', block: 'start' }); }),
    sitesHost,
    dllCard(a.by_dll),
    realizedCard(a)));
  drawSites();
  body.appendChild(el('div', { class: 'esub crx-symnote' }, 'Only the sessions sent by crash_guard 1.2.0 and later carry guard counters (' + fmtNum(crNum((a.totals || {}).reporting)) + ' of ' + fmtNum(crNum((a.totals || {}).sessions)) + ' sessions in this period). A session reports each guarded site once with its count; a site seen for the first time in a session is sent within a minute (live summary, at most 4 per session, 15 min apart), the totals come with the session summary. Ratios compare the crashes avoided with the crashes, hangs and abnormal exits of the same sessions.'));
}
