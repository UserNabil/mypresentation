import { el, clear } from '../core/dom.js';
import { card, dataTable, emptyState, errorState, btn, badge } from '../components.js';
import { fmtNum } from '../core/format.js';
import { toast } from '../ui/toast.js';
import { CR, CR_END_COLOR, crFetch, crPost, crSig, crSym, crWhen, crAgo, crNum, crPct, crEndLabel } from './crashes_state.js';

const SVG = 'http://www.w3.org/2000/svg';
const END_ORDER = ['clean', 'crash', 'hang', 'abnormal_exit', 'running'];

function sv(tag, attrs, ...kids) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) n.setAttribute(k, String(v));
  for (const k of kids) if (k != null) n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return n;
}

function niceStep(max) {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

function sessionsChart(perDay) {
  const W = 900, H = 230, L = 42, R = 44, T = 12, B = 28;
  const days = perDay.map(d => ({ day: String(d.day || '').slice(0, 10), k: d.by_end || {}, n: crNum(d.sessions), cf: d.crash_free }));
  const max = Math.max(1, ...days.map(d => d.n));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const y = v => T + (H - T - B) * (1 - v / top);
  const lowCf = Math.min(0.9, ...days.filter(d => d.cf != null).map(d => d.cf));
  const cfMin = Math.floor(lowCf * 20) / 20;
  const yc = v => T + (H - T - B) * (1 - (v - cfMin) / Math.max(0.0001, 1 - cfMin));
  const bw = (W - L - R) / Math.max(1, days.length);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Sessions per day' });
  for (let v = 0; v <= top; v += step) {
    svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'rgba(122,92,30,.18)', 'stroke-width': 1 }));
    svg.appendChild(sv('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#6e5c3e' }, String(v)));
  }
  for (const v of [cfMin, (cfMin + 1) / 2, 1]) svg.appendChild(sv('text', { x: W - R + 6, y: yc(v) + 4, 'font-size': 11, fill: '#8f2a2a' }, Math.round(v * 1000) / 10 + '%'));
  const every = Math.max(1, Math.ceil(days.length / 12));
  const pts = [];
  days.forEach((d, i) => {
    const x = L + i * bw;
    let acc = 0;
    const g = sv('g', {});
    const parts = [];
    for (const k of END_ORDER) {
      const n = crNum(d.k[k]);
      if (!n) continue;
      parts.push(n + ' ' + crEndLabel(k === 'running' ? 'open' : k).toLowerCase());
      g.appendChild(sv('rect', { x: x + bw * 0.14, width: Math.max(1, bw * 0.72), y: y(acc + n), height: Math.max(0.5, y(acc) - y(acc + n)), rx: 2, fill: CR_END_COLOR[k] }));
      acc += n;
    }
    g.appendChild(sv('rect', { x, y: T, width: bw, height: H - T - B, fill: 'transparent' }));
    g.appendChild(sv('title', {}, d.day + ' — ' + (d.n ? d.n + ' sessions, crash-free ' + crPct(d.cf) + ': ' + parts.join(', ') : 'no session')));
    svg.appendChild(g);
    if (d.cf != null) pts.push([x + bw / 2, yc(d.cf)]);
    if (i % every === 0) svg.appendChild(sv('text', { x: x + bw / 2, y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: '#6e5c3e' }, d.day.slice(5)));
  });
  if (pts.length > 1) svg.appendChild(sv('polyline', { points: pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), fill: 'none', stroke: '#8f2a2a', 'stroke-width': 1.6, 'stroke-dasharray': '4 3' }));
  svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: '#9c8862', 'stroke-width': 1 }));
  const legend = el('div', { class: 'crx-legend' },
    END_ORDER.filter(k => days.some(d => crNum(d.k[k]))).map(k => el('span', {}, el('i', { style: { background: CR_END_COLOR[k] } }), crEndLabel(k === 'running' ? 'open' : k))),
    el('span', {}, el('i', { class: 'crx-dash' }), 'crash-free % (right axis)'));
  return el('div', { class: 'crx-chart' }, svg, legend);
}

function tile(value, label, tone, title) {
  return el('div', { class: 'crx-kpi' + (tone ? ' ' + tone : ''), title: title || null }, el('b', {}, typeof value === 'string' ? value : fmtNum(value)), el('span', {}, label));
}

function kpis(a) {
  const t = a.totals || {};
  const ci = t.crash_free_ci || [];
  const h = crNum(t.uptime_h);
  return el('div', { class: 'crx-kpis' },
    tile(crNum(t.sessions), 'sessions · last ' + a.days + ' days'),
    tile(crNum(t.installs), 'game installs'),
    tile(crPct(t.crash_free, 2), 'crash-free sessions', crNum(t.crash_free) < 0.97 && t.crash_free != null ? 'crx-kpi-crash' : 'crx-kpi-ok',
      ci[0] != null ? '95% interval ' + crPct(ci[0], 2) + ' – ' + crPct(ci[1], 2) : null),
    tile(h >= 1 ? (100 * crNum(t.crash) / h).toFixed(2) : '—', 'crashes per 100 h played', '', fmtNum(Math.round(h)) + ' hours played'),
    tile(crNum(t.hang_events), 'hangs detected', crNum(t.hang_events) ? 'crx-kpi-hang' : ''),
    tile(crNum(t.recovered), 'crash_guard recoveries'));
}

function alertIcon(type) { return type === 'spike' ? 'rate' : type === 'regression' ? 'warning' : 'bug'; }

function alertAction(a) {
  const env = () => { if (a.env) CR.nav.useEnv(a.env); };
  if (a.type === 'regression' && a.signature) return () => { env(); CR.nav.showList({ signature: a.signature, dll_version: a.dll_version || '' }); };
  if (a.signature) return () => { env(); CR.nav.showList({ signature: a.signature }); };
  return () => { env(); CR.nav.go('overview'); };
}

function alertsCard(state, reload) {
  const st = state || {};
  const list = (st.alerts || []).filter(a => !CR.env || !a.env || a.env === CR.env);
  const check = btn({ label: 'Check now', icon: 'refresh', variant: 'ghost', class: 'xs', title: 'Ask the back-office now and notify GMs of anything new', onClick: async () => {
    try {
      const r = await crPost('/alerts/check', {});
      toast(r.error ? 'Check done with a warning: ' + r.error : (r.alerts || []).length + ' active alert(s), ' + (r.emitted || 0) + ' new notification(s)', r.error ? 'warn' : 'ok', { duration: 5000 });
      reload();
    } catch (e) { toast('Alert check failed: ' + (e.message || e), 'error', { duration: 7000 }); }
  } });
  const body = el('div', { class: 'crx-alerts' },
    list.length ? list.map(a => el('div', { class: 'crx-alert crx-link crx-al-' + (a.severity || 'warn'), onclick: alertAction(a), title: 'Open the matching reports' },
      el('div', { class: 'crx-alert-h' }, badge(a.type === 'new_signature' ? 'new signature' : a.type, a.severity === 'error' ? 'error' : 'warn'), el('b', {}, a.title || '')),
      a.body ? el('div', { class: 'crx-dim' }, a.body) : null,
      a.symbol ? crSym(a.symbol) : null)) :
      el('div', { class: 'esub' }, st.last_check ? 'No active alert: no new signature in the last 24 h, no spike above 3× the 7-day average, no regression in the latest DLL.' : 'Not checked yet in this session of the tool.'),
    el('div', { class: 'crx-alert-foot crx-dim' },
      st.demo ? 'Demo data: computed locally, no notification is sent.' :
        (st.enabled === false ? 'Background check disabled (config crash_alerts = false).' :
          'Checked every ' + (st.interval_min || 15) + ' min in the background; new alerts become GM notifications.') +
        (st.last_check ? ' Last check ' + crAgo(st.last_check) + '.' : ''),
      st.error ? el('span', { class: 'crx-err' }, ' ' + st.error) : null));
  return card({ title: 'Alerts', icon: 'notifications', class: 'crx-span', actions: check, body });
}

function versionCmp(a, b) {
  const pa = String(a).split(/[.\-+_]/).map(x => parseInt(x, 10) || 0), pb = String(b).split(/[.\-+_]/).map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  return 0;
}

function ciBar(rate, ci, maxv, color) {
  const w = v => (100 * Math.max(0, Math.min(1, crNum(v) / Math.max(1e-9, maxv)))).toFixed(2) + '%';
  const box = el('div', { class: 'crx-ci' });
  if (ci && ci[0] != null) box.appendChild(el('i', { class: 'crx-ci-r', style: { left: w(ci[0]), width: 'calc(' + w(ci[1]) + ' - ' + w(ci[0]) + ')', background: color } }));
  if (rate != null) box.appendChild(el('i', { class: 'crx-ci-p', style: { left: w(rate), background: color } }));
  return box;
}

function crashFreeCard(rows) {
  const list = (rows || []).slice().sort((a, b) => versionCmp(a.dll_version, b.dll_version));
  const cols = [
    { key: 'dll_version', label: 'DLL', render: r => el('span', { class: 'crx-mono' }, r.dll_version || '?', r.reporting ? null : el('span', { title: 'No clean session summary from this version (crash_reporter older than 0.2.0): only crashed sessions are known, the rate is not meaningful' }, ' ', badge('no summaries', 'warn'))) },
    { key: 'sessions', label: 'Sessions', align: 'right', render: r => fmtNum(r.sessions) },
    { key: 'installs', label: 'Installs', align: 'right', render: r => fmtNum(r.installs) },
    { key: 'crash_free', label: 'Crash-free', style: { minWidth: '190px' }, render: r => el('div', { class: 'crx-cfcell', title: r.crash_free_ci && r.crash_free_ci[0] != null ? '95% interval ' + crPct(r.crash_free_ci[0], 2) + ' – ' + crPct(r.crash_free_ci[1], 2) : '' },
      el('b', { class: crNum(r.crash_free) < 0.97 ? 'crx-bad' : 'crx-good' }, crPct(r.crash_free, 2)),
      ciBar(r.crash_free != null ? 1 - r.crash_free : null, r.crash_free_ci && r.crash_free_ci[0] != null ? [1 - r.crash_free_ci[1], 1 - r.crash_free_ci[0]] : null, Math.max(0.02, ...list.filter(x => x.reporting).map(x => 1 - crNum(x.crash_free_ci && x.crash_free_ci[0] != null ? x.crash_free_ci[0] : x.crash_free))), CR_END_COLOR.crash)) },
    { key: 'crashes_per_100h', label: 'Crashes / 100 h', align: 'right', render: r => (r.crashes_per_100h != null ? String(r.crashes_per_100h) : '—') },
    { key: 'crash', label: 'Crash', align: 'right', render: r => fmtNum(r.crash) },
    { key: 'hang', label: 'Hang', align: 'right', title: () => 'Sessions killed while frozen', render: r => fmtNum(r.hang) },
    { key: 'abnormal_exit', label: 'Abnormal', align: 'right', render: r => fmtNum(r.abnormal_exit) },
    { key: 'hang_events', label: 'Hang events', align: 'right', render: r => fmtNum(r.hang_events) },
    { key: 'recovered', label: 'Recovered', align: 'right', render: r => fmtNum(r.recovered) },
  ];
  return card({ title: 'Crash-free sessions by DLL version', icon: 'chip', subtitle: 'bar = crash rate with its 95% interval; click a row for its sessions', class: 'crx-span',
    body: dataTable({ columns: cols, rows: list, empty: 'No session in this period', onRowClick: r => CR.nav.showSessions({ dll_version: r.dll_version }) }) });
}

const SIGNAL = { higher: ['Higher crash rate', 'error'], lower: ['Lower crash rate', 'ok'], none: ['No clear difference', 'neutral'] };

function featureCard(a) {
  const rows = a.feature_risk || [];
  const scope = a.feature_scope || {};
  const maxv = Math.max(0.02, ...rows.map(r => Math.max(crNum(r.ci_on && r.ci_on[1]), crNum(r.ci_off && r.ci_off[1]))));
  const cols = [
    { key: 'feature', label: 'Feature', render: r => el('b', {}, r.feature) },
    { key: 'sessions_on', label: 'With', align: 'right', title: () => 'Ended sessions with the feature active', render: r => fmtNum(r.sessions_on) },
    { key: 'rate_on', label: 'Crash rate with', align: 'right', render: r => el('span', { title: '95% interval ' + crPct(r.ci_on && r.ci_on[0], 2) + ' – ' + crPct(r.ci_on && r.ci_on[1], 2) + ' · ' + r.crashes_on + ' crashes, ' + r.bad_on + ' crash/hang/abnormal' }, crPct(r.rate_on, 2)) },
    { key: 'sessions_off', label: 'Without', align: 'right', render: r => fmtNum(r.sessions_off) },
    { key: 'rate_off', label: 'Crash rate without', align: 'right', render: r => el('span', { title: '95% interval ' + crPct(r.ci_off && r.ci_off[0], 2) + ' – ' + crPct(r.ci_off && r.ci_off[1], 2) + ' · ' + r.crashes_off + ' crashes, ' + r.bad_off + ' crash/hang/abnormal' }, crPct(r.rate_off, 2)) },
    { key: 'ci', label: 'With (red) vs without (grey)', style: { minWidth: '180px' }, render: r => el('div', { class: 'crx-ci2' }, ciBar(r.rate_on, r.ci_on, maxv, CR_END_COLOR.crash), ciBar(r.rate_off, r.ci_off, maxv, '#8c7c5c')) },
    { key: 'relative_risk', label: 'Ratio', align: 'right', render: r => (r.relative_risk != null ? '×' + Number(r.relative_risk).toFixed(2) : '—') },
    { key: 'signal', label: 'Signal', render: r => (!crNum(r.sessions_off) ? el('span', { title: 'Active in every session: nothing to compare against' }, badge('always active', 'neutral'))
      : el('span', {}, badge(...(SIGNAL[r.signal] || SIGNAL.none)), r.low_sample ? el('span', { title: 'Fewer than 30 sessions on one side: read with care' }, ' ', badge('small sample', 'warn')) : null)) },
  ];
  const note = el('div', { class: 'esub crx-note' }, (scope.dll_versions || []).length
    ? 'Ended sessions of the DLL versions that send session summaries (' + scope.dll_versions.join(', ') + '): ' + fmtNum(scope.sessions || 0) + ' sessions. "Higher" means the two 95% intervals do not overlap; it is a correlation, a feature used mostly on a buggy DLL build will look risky too.'
    : 'No DLL version sends session summaries yet (crash_reporter 0.2.0): without clean sessions there is nothing to compare.');
  return card({ title: 'Feature risk', icon: 'feature', subtitle: 'crash rate of sessions with the feature active vs inactive', class: 'crx-span',
    body: el('div', {}, note, dataTable({ columns: cols, rows, empty: 'No feature data', onRowClick: r => CR.nav.showSessions({ feature: r.feature, end_kind: 'crash' }) })) });
}

function regressionCard(rows) {
  const cols = [
    { key: 'signature', label: 'Signature', render: r => el('div', { class: 'crx-sigcell' }, crSig(r.signature), r.latest ? badge('latest DLL', 'error') : null, crSym(r.symbol)) },
    { key: 'dll_version', label: 'First seen in', render: r => el('span', { class: 'crx-mono' }, r.dll_version) },
    { key: 'previous_version', label: 'Absent up to', render: r => el('span', { class: 'crx-mono crx-dim' }, r.previous_version || '—') },
    { key: 'n_total', label: 'Reports', align: 'right', render: r => el('span', { title: r.n_window + ' in the period, ' + r.n_in_version + ' in ' + r.dll_version }, fmtNum(r.n_total)) },
    { key: 'accounts_in_version', label: 'Accounts', align: 'right', render: r => fmtNum(r.accounts_in_version) },
    { key: 'last_seen', label: 'Last seen', render: r => el('span', { title: crWhen(r.last_seen) }, crAgo(r.last_seen) || '—') },
  ];
  return card({ title: 'Regressions', icon: 'warning', subtitle: 'signatures never seen before a given DLL version', class: 'crx-span',
    body: dataTable({ columns: cols, rows: rows || [], empty: emptyState({ title: 'No regression', hint: 'Every signature of the period already existed in the oldest DLL version known.' }), onRowClick: r => CR.nav.showList({ signature: r.signature }) }) });
}

function hangCard(rows) {
  const cols = [
    { key: 'signature', label: 'Frozen at', render: r => el('div', { class: 'crx-sigcell' }, crSig(r.signature || '(no stack)'), crSym(r.symbol)) },
    { key: 'n', label: 'Hangs', align: 'right', render: r => fmtNum(r.n) },
    { key: 'resumed', label: 'Resumed', align: 'right', title: () => 'The game came back after the freeze', render: r => fmtNum(r.resumed) },
    { key: 'fatal', label: 'Killed', align: 'right', title: () => 'The player killed the frozen game', render: r => (crNum(r.fatal) ? el('b', { class: 'crx-bad' }, fmtNum(r.fatal)) : '0') },
    { key: 'accounts', label: 'Accounts', align: 'right', render: r => fmtNum(r.accounts) },
    { key: 'dll_versions', label: 'DLL', render: r => (r.dll_versions || []).join(', ') },
    { key: 'last_seen', label: 'Last seen', render: r => el('span', { title: crWhen(r.last_seen) }, crAgo(r.last_seen) || '—') },
  ];
  return card({ title: 'Hangs', icon: 'pause', subtitle: 'main thread frozen 30 s or more, grouped by the first game frame', class: 'crx-span',
    body: dataTable({ columns: cols, rows: rows || [], empty: emptyState({ title: 'No hang in this period', hint: 'Hangs are detected by the crash_reporter 0.2.0 watchdog.' }), onRowClick: r => CR.nav.showList({ signature: r.signature }) }) });
}

export async function renderAnalytics(body) {
  body.appendChild(el('div', { class: 'empty crx-loading' }, 'Loading analytics…'));
  let a, alerts;
  try {
    [a, alerts] = await Promise.all([crFetch('/analytics', { days: CR.days, env: CR.env }), crFetch('/alerts').catch(e => ({ error: e.message || String(e) }))]);
  } catch (e) {
    clear(body);
    body.appendChild(errorState({ error: e, title: 'Analytics unavailable', onRetry: () => CR.nav.go('analytics') }));
    if (!CR.demo) body.appendChild(el('div', { class: 'crx-center' }, btn({ label: 'Show demo data instead', icon: 'preview', variant: 'ghost', onClick: () => CR.nav.setDemo(true) })));
    return;
  }
  if (CR.tab !== 'analytics') return;
  clear(body);
  const sym = a.symbols || {};
  body.appendChild(kpis(a));
  body.appendChild(el('div', { class: 'crx-grid' },
    alertsCard(alerts, () => CR.nav.go('analytics')),
    card({ title: 'Sessions per day', icon: 'duration', subtitle: 'stacked by how the session ended', class: 'crx-span',
      body: (a.sessions_per_day || []).some(d => crNum(d.sessions)) ? sessionsChart(a.sessions_per_day) : emptyState({ title: 'No session summary yet', hint: 'Clean sessions are sent in batches by crash_reporter 0.2.0; crashed ones come with their report.' }) }),
    crashFreeCard(a.crash_free_by_dll),
    featureCard(a),
    regressionCard(a.regressions),
    hangCard(a.hangs_top)));
  body.appendChild(el('div', { class: 'esub crx-symnote' }, sym.loaded
    ? 'Function names: IDA export of game_.exe (' + fmtNum(sym.count || 0) + ' ranges' + (sym.source ? ', ' + sym.source : '') + ').'
    : 'Function names unavailable on the back-office (data/symbols/game_exe_funcs.json missing).'));
}
