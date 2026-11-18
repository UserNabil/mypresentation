import { el, clear } from '../core/dom.js';
import { searchScope } from '../ui/search_scope.js';
import { dataTable, errorState, btn, emptyState } from '../components.js';
import { fmtNum } from '../core/format.js';
import { CR, CR_KINDS, CR_STATUS_FILTER, crFetch, crKindBadge, crStatusBadge, crSig, crSym, crWhen, crAgo, crCatalog, crCatMeta, crCatOf, crCatBadge } from './crashes_state.js';

const TEXT_FILTERS = [
  ['account', 'Account', 'account name'],
  ['character', 'Character', 'character name'],
  ['signature', 'Signature', '0xC0000005:game_.exe+0x…'],
  ['dll_version', 'DLL version', 'e.g. 0.42.0'],
  ['q', 'Search', 'account, session, module…'],
];

function select(key, label, options) {
  const s = el('select', { dataset: { f: key } },
    el('option', { value: '' }, 'All'),
    options.map(([v, l]) => el('option', { value: v, selected: CR.filters[key] === v ? true : null }, l)));
  return el('label', {}, label, s);
}

function filterForm() {
  const form = el('form', { class: 'crx-filters', autocomplete: 'off' },
    select('kind', 'Kind', CR_KINDS),
    select('status', 'Status', CR_STATUS_FILTER.map(s => [s, s])),
    TEXT_FILTERS.map(([k, label, ph]) => el('label', {}, label,
      el('input', { type: k === 'q' ? 'search' : 'text', dataset: { f: k }, placeholder: ph, value: CR.filters[k] || '' }))),
    el('label', {}, 'Since', el('input', { type: 'date', dataset: { f: 'since' }, value: CR.filters.since || '' })),
    el('div', { class: 'crx-fbtns' },
      btn({ label: 'Apply', icon: 'search', type: 'submit', class: 'xs' }),
      btn({ label: 'Clear', variant: 'ghost', class: 'xs', onClick: () => { for (const k of Object.keys(CR.filters)) CR.filters[k] = ''; CR.offset = 0; CR.nav.go('list'); } })));
  const sq = form.querySelector('[data-f="q"]');
  if (sq) searchScope.bindInput({ key: 'crashes', label: 'Crashes', placeholder: 'Account, session, module', onQuery: v => { CR.filters.q = v; CR.offset = 0; CR.nav.go('list'); } }, sq);
  form.onsubmit = ev => {
    ev.preventDefault();
    form.querySelectorAll('[data-f]').forEach(i => { CR.filters[i.dataset.f] = String(i.value || '').trim(); });
    CR.offset = 0;
    CR.nav.go('list');
  };
  return form;
}

const FILTER_LABEL = { kind: 'kind', status: 'status', account: 'account', character: 'character', signature: 'signature', dll_version: 'DLL', since: 'since', q: 'search', category: 'family' };

function activeChips() {
  const on = Object.entries(CR.filters).filter(([, v]) => v);
  if (!on.length) return null;
  return el('div', { class: 'crx-active' }, el('span', { class: 'crx-dim' }, 'Filtered by'),
    on.map(([k, v]) => el('span', { class: 'fchip on crx-chip', title: 'Remove this filter', onclick: () => { CR.filters[k] = ''; CR.offset = 0; CR.nav.go('list'); } },
      (FILTER_LABEL[k] || k) + ': ' + v + '  ✕')));
}

const COLUMNS = [
  { key: 'crashed_at', label: 'When', style: { whiteSpace: 'nowrap' }, render: r => el('span', { title: 'received ' + crWhen(r.submitted_at) }, crWhen(r.crashed_at || r.submitted_at), el('small', { class: 'crx-dim' }, ' ' + crAgo(r.crashed_at || r.submitted_at))) },
  { key: 'account', label: 'Account', render: r => el('b', {}, r.account || '—') },
  { key: 'character_name', label: 'Character', render: r => r.character_name || r.player_name || '—' },
  { key: 'server_id', label: 'Server', align: 'center', render: r => r.server_id || (String((r).connect_host || '').split(/[:,]/)[0] || '—') },
  { key: 'crash_kind', label: 'Kind', render: r => crKindBadge(r.crash_kind) },
  { key: 'category', label: 'Family', render: r => crCatBadge(crCatOf(r)) },
  { key: 'signature', label: 'Signature', render: r => el('div', { class: 'crx-sigcell' }, crSig(r.signature), crSym(r.symbol)) },
  { key: 'dll_version', label: 'DLL', class: 'crx-mono', render: r => r.dll_version || '—' },
  { key: 'client_version', label: 'Client', class: 'crx-mono', render: r => r.client_version || r.game_version || '—' },
  { key: 'status', label: 'Status', render: r => crStatusBadge(r.status) },
];

function pager(total, count, reload) {
  const from = total ? CR.offset + 1 : 0;
  const to = CR.offset + count;
  const size = el('select', { title: 'Rows per page' }, [25, 50, 100, 200].map(n => el('option', { value: String(n), selected: n === CR.limit ? true : null }, n + ' / page')));
  size.onchange = () => { CR.limit = parseInt(size.value, 10) || 50; CR.offset = 0; reload(); };
  return el('div', { class: 'crx-pager' },
    el('span', {}, total != null ? fmtNum(from) + '–' + fmtNum(to) + ' of ' + fmtNum(total) : ''),
    size,
    btn({ label: 'Previous', icon: 'back', variant: 'ghost', class: 'xs', disabled: CR.offset <= 0, onClick: () => { CR.offset = Math.max(0, CR.offset - CR.limit); reload(); } }),
    btn({ label: 'Next', variant: 'ghost', class: 'xs', disabled: total == null || to >= total, onClick: () => { CR.offset += CR.limit; reload(); } }));
}

export async function renderList(body) {
  const results = el('div', { class: 'crx-results' });
  const reload = async () => {
    clear(results);
    results.appendChild(el('div', { class: 'empty crx-loading' }, 'Loading reports…'));
    let j;
    const srv = Object.assign({ limit: CR.limit, offset: CR.offset, env: CR.env }, CR.filters);
    const wantCat = srv.category || '';
    delete srv.category;
    if (wantCat) { srv.limit = 200; srv.offset = CR.offset; }
    try { j = await crFetch('', srv); }
    catch (e) {
      clear(results);
      results.appendChild(errorState({ error: e, title: 'Crash reports unavailable', onRetry: reload }));
      return;
    }
    let items = j.items || [];
    if (wantCat) items = items.filter(r => crCatOf(r) === wantCat);
    const total = wantCat ? items.length : (j.total != null ? j.total : items.length);
    if (!Object.values(CR.filters).some(Boolean)) CR.total = total;
    clear(results);
    results.appendChild(pager(total, items.length, reload));
    results.appendChild(dataTable({
      columns: COLUMNS, rows: items,
      empty: emptyState({ title: 'No report matches', hint: 'Relax a filter, or widen the period.' }),
      rowClass: r => 'crx-row crx-st-' + (r.status || 'new'),
      onRowClick: r => CR.nav.openReport(r.id),
    }));
    if (items.length > 20) results.appendChild(pager(total, items.length, reload));
  };
  clear(body);
  await crCatalog();
  body.appendChild(filterForm());
  const chips = activeChips();
  if (chips) body.appendChild(chips);
  body.appendChild(results);
  await reload();
}
