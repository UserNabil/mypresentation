import { $, el, clear } from '../core/dom.js';
import { icon, btn, badge, emptyState, errorState } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';

const ROOT = '/api/page-access';
const PA = { host: null, data: null, staff: [] };

export function initPageAccess(host) { PA.host = host; }

export async function openPageAccess() {
  const H = PA.host;
  if (!H || !H.guardPage('accounts.manage', 'Page Access')) return;
  H.edenSetView('pageaccess');
  const c = $('#content');
  if (!c) return;
  clear(c);
  c.appendChild(el('div', { id: 'pa-wrap', class: 'cda-wrap' }, emptyState({ title: 'Loading…', icon: 'accounts' })));
  await load();
}

async function load() {
  const w = $('#pa-wrap');
  try {
    const [data, staff] = await Promise.all([api.get(ROOT), api.get('/api/accounts/game-staff?per_page=500').catch(() => ({ items: [] }))]);
    PA.data = data;
    PA.staff = (staff && staff.items) || [];
  } catch (e) {
    if (w) clear(w).appendChild(errorState({ error: e, title: 'Page Access unavailable', onRetry: load }));
    return;
  }
  render();
}

async function setGrant(username, page, on) {
  try {
    const r = await api.post(ROOT, { username, page, on });
    PA.data.grants = r.grants || {};
    toast((on ? 'Granted ' : 'Removed ') + labelOf(page) + (on ? ' to ' : ' from ') + username, 'success', 2400);
  } catch (e) {
    toast(errMessage(e), 'error');
  }
  render();
}

function labelOf(k) { const p = (PA.data.pages || []).find(x => x.key === k); return p ? p.label : k; }

function roleOf(account) {
  const s = PA.staff.find(x => (x.account || '').toLowerCase() === account);
  return s ? (s.role || '') : '';
}

function render() {
  const w = $('#pa-wrap');
  if (!w) return;
  clear(w);
  const d = PA.data || {};
  const pages = d.pages || [];
  const grants = d.grants || {};
  const users = Object.keys(grants).sort();

  w.appendChild(el('div', { class: 'cda-head' },
    el('h2', {}, icon('accounts', 24), ' Page Access'),
    el('p', { class: 'cda-sub' },
      'Open a page to one account, whatever its role. Stored on the ',
      el('b', {}, String(d.env || '?').toUpperCase()),
      ' environment only (switch environment to grant elsewhere). A grant opens the page and its API, nothing else; SA keeps every page.'),
    el('p', { class: 'cda-sub', style: { margin: '4px 0 0' } }, 'Type an account (the list suggests staff accounts), pick a page, then Grant. Tick or untick the boxes below to change the pages of an account.')));

  const FIELD = { padding: '8px 10px', border: '1px solid rgba(122,92,30,.35)', borderRadius: '6px', background: '#fffaf0', color: 'var(--ink)', fontSize: '14px', height: '38px', boxSizing: 'border-box' };
  const input = el('input', { type: 'text', id: 'pa-user', list: 'pa-staff', placeholder: 'account name (e.g. bunbun)', style: Object.assign({ width: '260px' }, FIELD) });
  const sel = el('select', { id: 'pa-page', style: Object.assign({ minWidth: '320px' }, FIELD) }, pages.map(p => el('option', { value: p.key }, p.label)));
  const dl = el('datalist', { id: 'pa-staff' }, PA.staff.map(s => el('option', { value: s.account }, (s.character || '') + (s.role ? ' [' + s.role + ']' : ''))));
  w.appendChild(el('div', { class: 'pa-form', style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '14px 0 18px', padding: '12px', border: '1px solid rgba(122,92,30,.2)', borderRadius: '8px', background: 'rgba(255,250,235,.6)' } },
    input, sel, dl,
    btn({ label: 'Grant', icon: 'accounts', onClick: async () => {
      const u = (input.value || '').trim();
      if (!u) { toast('Type an account name', 'warn'); return; }
      await setGrant(u, sel.value, true);
    } }),
    btn({ label: 'Refresh', variant: 'secondary', onClick: load })));

  if (!users.length) {
    w.appendChild(emptyState({ title: 'No page granted on this environment', icon: 'accounts' }));
    return;
  }
  const head = el('tr', {}, el('th', {}, 'Account'), pages.map(p => el('th', { title: p.label, style: { textAlign: 'center' } }, icon(p.icon || 'accounts', 24), el('div', { style: { fontSize: '11px' } }, p.label))));
  const rows = users.map(u => {
    const mine = new Set((grants[u] || []).map(g => g.page));
    const info = Object.fromEntries((grants[u] || []).map(g => [g.page, g]));
    return el('tr', {},
      el('td', {}, el('b', {}, u), ' ', roleOf(u) ? badge(roleOf(u), 'neutral') : null),
      pages.map(p => {
        const cb = el('input', { type: 'checkbox', checked: mine.has(p.key) ? true : null,
          title: mine.has(p.key) ? ('granted by ' + (info[p.key].by || '?') + ' on ' + (info[p.key].at || '?') + ' UTC') : 'not granted' });
        cb.onchange = () => setGrant(u, p.key, cb.checked);
        return el('td', { style: { textAlign: 'center' } }, cb);
      }));
  });
  const tbl = el('table', { class: 'pa-table', style: { width: '100%', borderCollapse: 'collapse', background: 'rgba(255,250,235,.6)', border: '1px solid rgba(122,92,30,.2)', borderRadius: '8px' } }, el('thead', {}, head), el('tbody', {}, rows));
  tbl.querySelectorAll('th,td').forEach(c => { c.style.padding = '8px 10px'; c.style.borderBottom = '1px solid rgba(122,92,30,.15)'; });
  w.appendChild(el('div', { style: { overflowX: 'auto' } }, tbl));
}
