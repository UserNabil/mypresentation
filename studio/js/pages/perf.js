import { $, el, clear } from '../core/dom.js';
import { icon, btn, badge, errorState, emptyState } from '../components.js';
import { fmtDate, ago, fmtNum } from '../core/format.js';
import { PF, pfFetch, pfTone, pfNum, pfCauseBadge, PF_ENVS } from './perf_state.js';
import { openPerfDetail } from './perf_detail.js';

const COLS = [
  { key: 'received_at', label: 'Received', sort: true, render: r => el('span', { title: ago(r.received_at) }, fmtDate(r.received_at)) },
  { key: 'account', label: 'Account', sort: true, render: r => el('b', {}, r.account || '—') },
  { key: 'character', label: 'Character', sort: true, render: r => r.character || r.character_name || '—' },
  { key: 'env', label: 'Env', render: r => envBadge(r.env) },
  { key: 'eden_version', label: 'EDEN', cls: 'prf-mono', render: r => r.eden_version || '—' },
  { key: 'fps_avg', label: 'FPS avg', sort: true, num: true, tone: 'fps' },
  { key: 'fps_low1', label: '1% low', sort: true, num: true, tone: 'low1' },
  { key: 'frame_ms', label: 'Frame ms', sort: true, num: true, tone: 'frame' },
  { key: 'worst_ms', label: 'Worst ms', sort: true, num: true, tone: 'worst', digits: 0 },
  { key: 'logic_ms', label: 'Game logic ms', sort: true, num: true, tone: 'part' },
  { key: 'gpu_wait_ms', label: 'GPU wait ms', sort: true, num: true, tone: 'part' },
  { key: 'ui_ms', label: 'UI ms', sort: true, num: true, tone: 'part' },
  { key: 'ram_mb', label: 'RAM MB', sort: true, num: true, digits: 0 },
  { key: 'gpu', label: 'GPU', render: r => el('span', { class: 'prf-gpu', title: r.gpu || '' }, r.gpu || '—') },
  { key: 'map', label: 'Map', num: true, digits: 0 },
  { key: 'cause', label: 'Cause', render: r => pfCauseBadge(r, true) },
];

export function initPerf(host) { PF.host = host; }

export async function openPerf() {
  const H = PF.host;
  if (!H || !H.guardPage('perf.view', 'Performance')) return;
  H.edenSetView('perf');
  const c = $('#content');
  if (!c) return;
  try { localStorage.removeItem('eden.perf.demo'); } catch (_) { void 0; }
  PF.offset = 0;
  clear(c);
  c.appendChild(shell());
  reload();
}

function envBadge(env) {
  const tone = { prod: 'error', preprod: 'warn', dev: 'info' }[env] || 'neutral';
  return badge(env || 'unknown', tone);
}

function shell() {
  return el('div', { class: 'prf-wrap' },
    el('div', { class: 'prf-head' },
      el('h2', {}, icon('stat_speed', 24), 'Performance'),
      el('span', { id: 'prf-src' }),
      el('div', { class: 'prf-head-r' },
        btn({ label: 'Refresh', icon: 'refresh', variant: 'ghost', class: 'xs', onClick: () => reload() }))),
    el('div', { class: 'esub prf-lead' }, 'Performance reports sent by players from the game (perf_hud overlay, "Export..." button) and stored on the back-office. Nothing is sent automatically: each row is one click on Export. Colours follow the in-game panel. Click a row for the full report.'),
    filterForm(),
    el('div', { id: 'prf-banner' }),
    el('div', { id: 'prf-summary' }),
    el('div', { id: 'prf-results' }));
}

function filterForm() {
  const f = PF.filters;
  const accounts = el('datalist', { id: 'prf-accounts' });
  const env = el('select', { dataset: { f: 'env' } }, PF_ENVS.map(([v, l]) => el('option', { value: v, selected: f.env === v ? true : null }, l)));
  const text = (k, label, ph, type, extra) => el('label', {}, label,
    el('input', Object.assign({ type: type || 'text', dataset: { f: k }, placeholder: ph || '', value: f[k] || '' }, extra || {})));
  const form = el('form', { class: 'prf-filters', autocomplete: 'off' },
    text('account', 'Account', 'any account', 'text', { list: 'prf-accounts' }), accounts,
    text('character', 'Character', 'character name'),
    el('label', {}, 'Env', env),
    text('since', 'From', '', 'date'),
    text('until', 'To', '', 'date'),
    text('q', 'Search', 'GPU, cause, version, report text…', 'search'),
    el('div', { class: 'prf-fbtns' },
      btn({ label: 'Apply', icon: 'search', type: 'submit', class: 'xs' }),
      btn({ label: 'Clear', variant: 'ghost', class: 'xs', onClick: () => { for (const k of Object.keys(PF.filters)) PF.filters[k] = ''; rebuildFilters(); reload(); } })));
  form.onsubmit = ev => {
    ev.preventDefault();
    form.querySelectorAll('[data-f]').forEach(i => { PF.filters[i.dataset.f] = String(i.value || '').trim(); });
    PF.offset = 0;
    reload();
  };
  return form;
}

function rebuildFilters() {
  const old = document.querySelector('.prf-filters');
  if (old) old.replaceWith(filterForm());
  fillAccounts();
}

function fillAccounts() {
  const dl = $('#prf-accounts');
  if (!dl) return;
  clear(dl);
  for (const a of PF.facets.accounts || []) dl.appendChild(el('option', { value: a }));
}

function renderSource() {
  const s = $('#prf-src');
  if (!s) return;
  clear(s);
  pfFetch('/source').then(j => {
    clear(s);
    s.appendChild(j.configured
      ? badge('BO · ' + String(j.base_url || '').replace(/^https?:\/\//, ''), 'neutral', { title: 'Back-office API key read from: ' + j.key_source })
      : badge('BO API key missing', 'error', { title: 'Set bo_crash_api_key in the tool config, or CRASH_BOT_API_KEY in the environment or discord_bot/.env' }));
  }).catch(() => clear(s));
}

async function reload() {
  const res = $('#prf-results');
  const banner = $('#prf-banner');
  const sum = $('#prf-summary');
  if (!res) return;
  renderSource();
  clear(banner);
  clear(sum);
  clear(res);
  res.appendChild(el('div', { class: 'empty prf-loading' }, 'Loading reports…'));
  const params = Object.assign({ limit: PF.limit, offset: PF.offset, sort: PF.sort, order: PF.order }, PF.filters);
  let j;
  try { j = await pfFetch('', params); }
  catch (e) {
    clear(res);
    res.appendChild(errorState({ error: e, title: 'Performance reports unavailable', onRetry: reload }));
    return;
  }
  clear(res);
  if (j && j.ok === false) {
    banner.appendChild(el('div', { class: 'prf-banner' + (j.missing ? '' : ' prf-banner-err') }, icon('warning', 24),
      el('div', {}, el('b', {}, j.missing ? 'Performance reports are not available on the back-office yet' : 'The back-office refused the request'),
        el('div', { class: 'prf-dim' }, j.missing ? 'The BO answered 404 on /api/tool/perf_reports: deploy the BO version that stores perf reports.' : String(j.error || '')))));
    return;
  }
  PF.rows = j.items || [];
  PF.total = j.total != null ? j.total : PF.rows.length;
  PF.facets = j.facets || PF.facets || {};
  fillAccounts();
  renderSummary(sum);
  res.appendChild(pager());
  res.appendChild(table());
  if (PF.rows.length > 25) res.appendChild(pager());
}

function median(vals) {
  const v = vals.filter(x => x != null && isFinite(Number(x))).map(Number).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function renderSummary(host) {
  if (!PF.rows.length) return;
  const groups = new Map();
  for (const r of PF.rows) {
    const ch = r.character || r.character_name || '';
    const k = (r.account || '') + '\u0000' + ch;
    if (!groups.has(k)) groups.set(k, { account: r.account || '', character: ch, rows: [] });
    groups.get(k).rows.push(r);
  }
  const list = Array.from(groups.values()).sort((a, b) => b.rows.length - a.rows.length || a.account.localeCompare(b.account));
  const chips = list.map(g => {
    const last = g.rows.map(r => r.received_at).filter(Boolean).sort().pop();
    const med = median(g.rows.map(r => r.fps_avg));
    const lows = g.rows.map(r => r.fps_low1).filter(x => x != null && isFinite(Number(x))).map(Number);
    const worst = lows.length ? Math.min(...lows) : null;
    const card = el('button', { type: 'button', class: 'prf-player', title: 'Filter on ' + g.account + ' / ' + (g.character || '?') },
      el('div', { class: 'prf-player-n' }, el('b', {}, g.account || '—'), ' / ', g.character || '—'),
      el('div', { class: 'prf-player-s' },
        el('span', {}, g.rows.length + (g.rows.length > 1 ? ' reports' : ' report')),
        el('span', { title: last ? fmtDate(last) : '' }, 'last ' + (last ? ago(last) : '—')),
        el('span', {}, 'median FPS ', el('b', { class: pfTone('fps', med) }, pfNum(med))),
        el('span', {}, 'worst 1% low ', el('b', { class: pfTone('low1', worst) }, pfNum(worst)))));
    card.onclick = () => {
      PF.filters.account = g.account;
      PF.filters.character = g.character;
      PF.offset = 0;
      rebuildFilters();
      reload();
    };
    return card;
  });
  host.appendChild(el('div', { class: 'prf-sumhead prf-dim' }, 'Per player, from the ' + PF.rows.length + ' loaded rows (click to filter)'));
  host.appendChild(el('div', { class: 'prf-players' }, chips));
}

function pager() {
  const from = PF.total ? PF.offset + 1 : 0;
  const to = PF.offset + PF.rows.length;
  return el('div', { class: 'prf-pager' },
    el('span', {}, fmtNum(from) + '–' + fmtNum(to) + ' of ' + fmtNum(PF.total)),
    btn({ label: 'Previous', icon: 'back', variant: 'ghost', class: 'xs', disabled: PF.offset <= 0, onClick: () => { PF.offset = Math.max(0, PF.offset - PF.limit); reload(); } }),
    btn({ label: 'Next', variant: 'ghost', class: 'xs', disabled: to >= PF.total, onClick: () => { PF.offset += PF.limit; reload(); } }));
}

function sortBy(key) {
  if (PF.sort === key) PF.order = PF.order === 'desc' ? 'asc' : 'desc';
  else { PF.sort = key; PF.order = key === 'account' || key === 'character' ? 'asc' : 'desc'; }
  PF.offset = 0;
  reload();
}

function table() {
  if (!PF.rows.length) return emptyState({ title: 'No performance report matches', hint: 'Relax a filter, or wait for a player to press Export... in the game.' });
  const head = el('tr', {}, COLS.map(c => {
    const on = PF.sort === c.key;
    const th = el('th', { class: (c.num ? 'prf-num' : '') + (c.sort ? ' prf-sortable' : '') + (on ? ' prf-sorted' : ''),
      title: c.sort ? 'Sort by ' + c.label : null }, c.label, on ? (PF.order === 'desc' ? ' ▼' : ' ▲') : '');
    if (c.sort) th.onclick = () => sortBy(c.key);
    return th;
  }));
  const body = el('tbody', {}, PF.rows.map(r => {
    const tr = el('tr', { class: 'prf-row' }, COLS.map(c => {
      if (c.render) return el('td', { class: c.cls || null }, c.render(r));
      const v = r[c.key];
      return el('td', { class: 'prf-num ' + (c.tone ? pfTone(c.tone, v) : '') }, pfNum(v, c.digits));
    }));
    tr.onclick = () => openPerfDetail(r.id);
    return tr;
  }));
  return el('div', { class: 'prf-tablewrap' }, el('table', { class: 'prf-table' }, el('thead', {}, head), body));
}
