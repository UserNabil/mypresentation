import { el, clear } from '../core/dom.js';
import { card, dataTable, errorState, btn, emptyState, badge } from '../components.js';
import { fmtNum } from '../core/format.js';
import { CR, CR_END_KINDS, crFetch, crEndBadge, crKindBadge, crStatusBadge, crSig, crSym, crWhen, crAgo, crUptime } from './crashes_state.js';

const TEXT_FILTERS = [
  ['account', 'Account', 'exact account name'],
  ['character', 'Character', 'character name'],
  ['dll_version', 'DLL version', 'e.g. 0.42.0'],
  ['feature', 'Feature', 'e.g. effect_filter'],
  ['q', 'Search', 'account, session, install…'],
];

const FILTER_LABEL = { end_kind: 'end', account: 'account', character: 'character', dll_version: 'DLL', feature: 'feature', hangs: 'hangs', since: 'since', q: 'search', session_id: 'session', install_id: 'install' };

function filterForm() {
  const end = el('select', { dataset: { f: 'end_kind' } }, el('option', { value: '' }, 'All'),
    CR_END_KINDS.map(([v, l]) => el('option', { value: v, selected: CR.sessFilters.end_kind === v ? true : null }, l)));
  const hangs = el('input', { type: 'checkbox', dataset: { f: 'hangs' }, checked: CR.sessFilters.hangs ? true : null });
  const form = el('form', { class: 'crx-filters', autocomplete: 'off' },
    el('label', {}, 'End', end),
    TEXT_FILTERS.map(([k, label, ph]) => el('label', {}, label,
      el('input', { type: k === 'q' ? 'search' : 'text', dataset: { f: k }, placeholder: ph, value: CR.sessFilters[k] || '' }))),
    el('label', {}, 'Since', el('input', { type: 'date', dataset: { f: 'since' }, value: CR.sessFilters.since || '' })),
    el('label', { class: 'crx-check' }, hangs, 'With hangs only'),
    el('div', { class: 'crx-fbtns' },
      btn({ label: 'Apply', icon: 'search', type: 'submit', class: 'xs' }),
      btn({ label: 'Clear', variant: 'ghost', class: 'xs', onClick: () => CR.nav.showSessions({}) })));
  form.onsubmit = ev => {
    ev.preventDefault();
    form.querySelectorAll('[data-f]').forEach(i => {
      CR.sessFilters[i.dataset.f] = i.type === 'checkbox' ? (i.checked ? '1' : '') : String(i.value || '').trim();
    });
    CR.sessOffset = 0;
    CR.nav.go('sessions');
  };
  return form;
}

function activeChips() {
  const on = Object.entries(CR.sessFilters).filter(([, v]) => v);
  if (!on.length) return null;
  return el('div', { class: 'crx-active' }, el('span', { class: 'crx-dim' }, 'Filtered by'),
    on.map(([k, v]) => el('span', { class: 'fchip on crx-chip', title: 'Remove this filter', onclick: () => { CR.sessFilters[k] = ''; CR.sessOffset = 0; CR.nav.go('sessions'); } },
      (FILTER_LABEL[k] || k) + ': ' + (k === 'hangs' ? 'yes' : v) + '  ✕')));
}

const COLUMNS = [
  { key: 'started_at', label: 'Started', style: { whiteSpace: 'nowrap' }, render: r => el('span', { title: 'received ' + crWhen(r.received_at) }, crWhen(r.started_at || r.received_at), el('small', { class: 'crx-dim' }, ' ' + crAgo(r.started_at || r.received_at))) },
  { key: 'account', label: 'Account', render: r => el('b', {}, r.account || '—') },
  { key: 'character_name', label: 'Character', render: r => r.character_name || '—' },
  { key: 'dll_version', label: 'DLL', class: 'crx-mono', render: r => r.dll_version || '—' },
  { key: 'end_kind', label: 'End', render: r => crEndBadge(r.end_kind) },
  { key: 'uptime_s', label: 'Uptime', align: 'right', style: { whiteSpace: 'nowrap' }, render: r => crUptime(r.uptime_s) },
  { key: 'hangs', label: 'Hangs', align: 'right', render: r => (r.hangs ? el('b', { class: 'crx-hang' }, String(r.hangs)) : '0') },
  { key: 'recovered', label: 'Recovered', align: 'right', title: () => 'crash_guard recoveries during the session', render: r => String(r.recovered || 0) },
  { key: 'mem_peak_mb', label: 'Peak MB', align: 'right', render: r => (r.mem_peak_mb != null ? fmtNum(r.mem_peak_mb) : '—') },
  { key: 'reports', label: 'Reports', align: 'right', render: r => (r.reports ? el('span', { class: 'crx-count' }, String(r.reports)) : '') },
];

function pager(total, count, reload) {
  const from = total ? CR.sessOffset + 1 : 0;
  const to = CR.sessOffset + count;
  const size = el('select', { title: 'Rows per page' }, [25, 50, 100, 200].map(n => el('option', { value: String(n), selected: n === CR.sessLimit ? true : null }, n + ' / page')));
  size.onchange = () => { CR.sessLimit = parseInt(size.value, 10) || 50; CR.sessOffset = 0; reload(); };
  return el('div', { class: 'crx-pager' },
    el('span', {}, total != null ? fmtNum(from) + '–' + fmtNum(to) + ' of ' + fmtNum(total) : ''),
    size,
    btn({ label: 'Previous', icon: 'back', variant: 'ghost', class: 'xs', disabled: CR.sessOffset <= 0, onClick: () => { CR.sessOffset = Math.max(0, CR.sessOffset - CR.sessLimit); reload(); } }),
    btn({ label: 'Next', variant: 'ghost', class: 'xs', disabled: total == null || to >= total, onClick: () => { CR.sessOffset += CR.sessLimit; reload(); } }));
}

async function renderSessionList(body) {
  const results = el('div', { class: 'crx-results' });
  const reload = async () => {
    clear(results);
    results.appendChild(el('div', { class: 'empty crx-loading' }, 'Loading sessions…'));
    let j;
    try { j = await crFetch('/sessions', Object.assign({ limit: CR.sessLimit, offset: CR.sessOffset, env: CR.env }, CR.sessFilters)); }
    catch (e) {
      clear(results);
      results.appendChild(errorState({ error: e, title: 'Sessions unavailable', onRetry: reload }));
      if (!CR.demo) results.appendChild(el('div', { class: 'crx-center' }, btn({ label: 'Show demo data instead', icon: 'preview', variant: 'ghost', onClick: () => CR.nav.setDemo(true) })));
      return;
    }
    if (CR.tab !== 'sessions' || CR.sessionId != null) return;
    const items = j.items || [];
    const total = j.total != null ? j.total : items.length;
    if (!Object.values(CR.sessFilters).some(Boolean)) CR.sessTotal = total;
    clear(results);
    results.appendChild(pager(total, items.length, reload));
    results.appendChild(dataTable({
      columns: COLUMNS, rows: items,
      empty: emptyState({ title: 'No session matches', hint: 'Session summaries arrive with crash_reporter 0.2.0: clean sessions in batches, crashed ones with their report.' }),
      rowClass: r => 'crx-row crx-end-' + (r.end_kind || 'open'),
      onRowClick: r => CR.nav.openSession(r.id),
    }));
    if (items.length > 20) results.appendChild(pager(total, items.length, reload));
  };
  body.appendChild(filterForm());
  const chips = activeChips();
  if (chips) body.appendChild(chips);
  body.appendChild(results);
  await reload();
}

function kv(label, value, title) {
  return el('div', { class: 'crx-kv', title: title || null }, el('small', {}, label), el('div', {}, value == null || value === '' ? '—' : value));
}

function sessionSummary(d) {
  const s = d.session || {};
  const m = s.mem || {};
  const mem = [m.private_mb != null ? 'private ' + m.private_mb + ' MB' : '', m.virtual_mb != null ? 'virtual ' + m.virtual_mb + ' MB' : '',
    (m.peak_virtual_mb != null ? m.peak_virtual_mb : d.mem_peak_mb) != null ? 'peak ' + (m.peak_virtual_mb != null ? m.peak_virtual_mb : d.mem_peak_mb) + ' MB' : ''].filter(Boolean).join(' · ');
  const acc = d.account ? el('a', { class: 'crx-link', title: 'All sessions of this account', onclick: () => CR.nav.showSessions({ account: d.account }) }, d.account) : '—';
  return card({ title: 'Session', icon: 'usage_time', body: el('div', { class: 'crx-sum' },
    el('div', { class: 'crx-kv crx-kv-wide' }, el('small', {}, 'Account / character / server'),
      el('div', {}, acc, ' / ', d.character_name || s.character || '—', s.level ? ' (Lv ' + s.level + ')' : '', ' · server ', d.server_id || (String((d).connect_host || '').split(/[:,]/)[0] || '—'))),
    kv('End', crEndBadge(d.end_kind)),
    kv('Started', crWhen(d.started_at) + (d.started_at ? ' · ' + crAgo(d.started_at) : '')),
    kv('Ended', d.ended_at ? crWhen(d.ended_at) : (d.end_kind ? '—' : 'still running or never reported')),
    kv('Uptime', crUptime(d.uptime_s != null ? d.uptime_s : s.uptime_s)),
    kv('Hangs', String(d.hangs || 0)),
    kv('crash_guard recoveries', String(d.recovered || 0)),
    kv('Memory', mem),
    kv('Handles / GDI', s.handles != null || s.gdi != null ? (s.handles != null ? s.handles : '?') + ' / ' + (s.gdi != null ? s.gdi : '?') : null),
    kv('Last map', s.map),
    kv('DLL version', d.dll_version || s.dll_version),
    kv('Client version', d.client_version),
    kv('OS', d.os || s.os),
    kv('Server host', d.connect_host || s.connect_host),
    el('div', { class: 'crx-kv crx-kv-wide' }, el('small', {}, 'Session id'), el('div', { class: 'crx-mono' }, d.session_id || '—')),
    el('div', { class: 'crx-kv crx-kv-wide', title: 'Persistent per game install' }, el('small', {}, 'Install id'),
      el('div', {}, d.install_id ? el('a', { class: 'crx-link crx-mono', title: 'All sessions of this install', onclick: () => CR.nav.showSessions({ install_id: d.install_id }) }, d.install_id) : '—')),
    kv('Received from', d.source === 'summary' ? 'session summary' : d.source === 'report' ? 'crash / hang report' : d.source)) });
}

const CRUMB_TONE = { crash: 'error', hang: 'info', abnormal_exit: 'warn', crash_guard_recovered: 'ok', exit_game: 'ok', enter_game: 'neutral' };

function breadcrumbs(d) {
  const list = ((d.session || {}).breadcrumbs || []).filter(b => b && typeof b === 'object');
  if (!list.length) return card({ title: 'Breadcrumbs', icon: 'lifetime', body: el('div', { class: 'esub' }, 'No event trail in this session (sent from crash_reporter 0.2.0).') });
  const t0 = Date.parse(d.started_at || (d.session || {}).start || list[0].t);
  const rel = t => {
    const v = Date.parse(t);
    if (isNaN(v) || isNaN(t0)) return '';
    const s = Math.max(0, Math.round((v - t0) / 1000));
    return '+' + (s >= 3600 ? Math.floor(s / 3600) + ' h ' : '') + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  return card({ title: 'Breadcrumbs', icon: 'lifetime', subtitle: list.length + ' event' + (list.length === 1 ? '' : 's') + ' (last 50)',
    body: el('ol', { class: 'crx-crumbs' }, list.map(b => el('li', {},
      el('span', { class: 'crx-mono crx-dim', title: crWhen(b.t) }, rel(b.t)),
      badge(String(b.e || b.event || '?'), CRUMB_TONE[b.e || b.event] || 'neutral'),
      el('span', {}, b.v != null ? String(b.v) : '')))) });
}

function linkedReports(d) {
  const list = d.reports || [];
  const body = list.length ? el('div', { class: 'crx-newlist' }, list.map(r => el('div', { class: 'crx-newrow crx-link', title: 'Open report #' + r.id, onclick: () => CR.nav.openReport(r.id) },
    el('b', {}, '#' + r.id), crKindBadge(r.crash_kind), crStatusBadge(r.status), crSig(r.signature), crSym(r.symbol),
    el('span', { class: 'crx-dim' }, crAgo(r.crashed_at || r.submitted_at))))) :
    el('div', { class: 'esub' }, 'No crash or hang report for this session.');
  return card({ title: 'Reports of this session', icon: 'bug', body });
}

function features(d) {
  const f = d.features || (d.session || {}).features || {};
  const names = Object.keys(f).sort();
  const body = names.length ? el('div', { class: 'crx-chips' }, names.map(n => el('span', { class: 'crx-link', title: 'Sessions with this feature', onclick: () => CR.nav.showSessions({ feature: n }) }, badge(n + (f[n] ? ' ' + f[n] : ''), 'neutral')))) : el('div', { class: 'esub' }, 'No feature list.');
  return card({ title: 'Active features', icon: 'feature', subtitle: names.length ? names.length + ' loaded' : '', body });
}

function rawJson(d) {
  if (!d.session) return null;
  const pre = el('pre', { class: 'crx-code crx-json' }, JSON.stringify(d.session, null, 1));
  const box = el('details', { class: 'crx-raw' }, el('summary', {}, 'session.json as received'), pre);
  return box;
}

async function renderSessionDetail(body, id) {
  body.appendChild(el('div', { class: 'empty crx-loading' }, 'Loading session…'));
  let d;
  try { d = await crFetch('/sessions/' + id); }
  catch (e) {
    clear(body);
    body.appendChild(el('div', { class: 'crx-dhead' }, btn({ label: 'Back to sessions', icon: 'back', variant: 'ghost', class: 'xs', onClick: () => { CR.sessionId = null; CR.nav.go('sessions'); } })));
    body.appendChild(errorState({ error: e, title: 'Session unavailable', onRetry: () => CR.nav.go('sessions') }));
    return;
  }
  if (CR.tab !== 'sessions' || CR.sessionId !== id) return;
  clear(body);
  body.appendChild(el('div', { class: 'crx-dhead' },
    btn({ label: 'Back to sessions', icon: 'back', variant: 'ghost', class: 'xs', onClick: () => { CR.sessionId = null; CR.nav.go('sessions'); } }),
    el('h3', {}, 'Session'), el('code', { class: 'crx-sig' }, d.session_id || '#' + id), crEndBadge(d.end_kind),
    d.demo ? badge('demo', 'warn') : null));
  body.appendChild(el('div', { class: 'crx-dgrid' },
    el('div', { class: 'crx-dmain' }, sessionSummary(d), breadcrumbs(d), rawJson(d)),
    el('div', { class: 'crx-dside' }, linkedReports(d), features(d))));
}

export async function renderSessions(body) {
  clear(body);
  if (CR.sessionId != null) return renderSessionDetail(body, CR.sessionId);
  return renderSessionList(body);
}
