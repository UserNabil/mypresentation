/* ============================================================================
   pages/shop_currency.js — Shop Currencies (SA only): what the shop_currency
   feature reads on the active environment. A currency = one line
   unit|item id|display name| in S_ShopCurrency.ini (server Data/db, restart)
   and C_ShopCurrency.ini (game_unpacked data/db, then repack). Prod is
   read-only. Items + test helpers live in shop_currency_items.js.
   Backend: shop_currencies.py (/api/shop-currency/*).
   ============================================================================ */

import { $, el, clear, append } from '../core/dom.js';
import { icon, btn, badge, card, emptyState, errorState, dataTable, formField } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { uiConfirm } from '../ui/dialogs.js';
import { itemCell, showResult, itemSearch, renderItemsPanel, renderTestPanel } from './shop_currency_items.js';

const ROOT = '/api/shop-currency';
const S = { host: null, ov: null, feat: null, sel: null, form: null };

export function initShopCurrency(host) { S.host = host; }

export async function openShopCurrency() {
  const H = S.host;
  if (!H || !H.guardPage('shopcurrency.manage', 'Shop Currencies')) return;
  H.edenSetView('shopcurrency');
  const c = $('#content');
  if (!c) return;
  clear(c);
  S.form = null;
  c.appendChild(el('div', { id: 'sc-wrap', class: 'cda-wrap' },
    el('div', { id: 'sc-head' }), el('div', { id: 'sc-notes', class: 'cda-notes' }), el('div', { id: 'sc-kpis', class: 'cda-kpis' }),
    el('div', { id: 'sc-cur' }), el('div', { id: 'sc-items' }), el('div', { id: 'sc-test' })));
  renderHead();
  await refresh();
  loadFeature();
}

function cx() {
  const ov = S.ov || {};
  return { S, ROOT, refresh, writable: !ov.write_block && !ov.client_block, testable: !ov.test_block && !ov.write_block };
}

async function refresh() {
  const cur = $('#sc-cur');
  if (!cur) return;
  if (!S.ov) clear(cur).appendChild(emptyState({ title: 'Reading the server and client tables…', icon: 'gold' }));
  try {
    S.ov = await api.get(ROOT + '/overview');
  } catch (e) {
    clear(cur).appendChild(errorState({ error: e, title: 'Cannot read the shop currencies', onRetry: refresh }));
    return;
  }
  render();
}

function render() {
  renderHead();
  renderNotes();
  renderKpis();
  renderCurrencies();
  renderItemsPanel($('#sc-items'), cx());
  renderTestPanel($('#sc-test'), cx());
}

async function loadFeature() {
  try { S.feat = await api.get(ROOT + '/feature'); } catch (e) { S.feat = { error: errMessage(e) }; }
  renderHead();
}

function featBadge(f) {
  if (!f) return badge('shop: reading…', 'neutral');
  if (f.error) return badge((f.feature || 'shop') + ': state unknown', 'warn', { title: f.error });
  const tone = f.state === 'active' ? 'ok' : (f.installed ? 'warn' : 'error');
  const stale = f.installed && f.current === false ? ' (repo ' + (f.repo_version || '?') + ')' : '';
  return badge((f.feature || 'shop') + ' ' + (f.version || '') + stale + ': ' + (f.label || f.state || '?'), tone, { title: f.note || '' });
}

function renderHead() {
  const h = $('#sc-head');
  if (!h) return;
  const env = (S.ov && S.ov.env) || '';
  clear(h).appendChild(el('div', { class: 'cda-head' },
    el('h2', {}, icon('gold', 24), 'Shop Currencies'),
    el('span', { class: 'cda-src' },
      badge('SA only', 'info', { title: 'Reserved to Super-Admins' }),
      env ? badge(env === 'prod' ? 'PROD - read-only' : 'Environment: ' + env, env === 'prod' ? 'error' : (env === 'dev' ? 'ok' : 'warn')) : null,
      featBadge(S.feat)),
    el('div', { class: 'cda-head-r' },
      btn({ label: 'Refresh', icon: 'refresh', variant: 'ghost', busyLabel: 'Reading…', onClick: async () => { await refresh(); loadFeature(); } }))));
  h.appendChild(el('div', { class: 'esub cda-lead' }, 'A shop currency is an item. A shop item whose Price Unit (column 30 of C_Item and S_Item) '
    + 'is a configured unit costs its price (column 31) x the quantity in currency items, checked and taken from the bags before the item is given. '
    + 'The same line unit|item id|display name| goes in S_ShopCurrency.ini (server Data/db, read by each ZoneServer at its first purchase: restart) '
    + 'and C_ShopCurrency.ini (client, read from the pkg: repack).'));
}

function renderNotes() {
  const n = $('#sc-notes');
  if (!n || !S.ov) return;
  clear(n);
  const ov = S.ov;
  const note = (err, text) => n.appendChild(el('div', { class: err ? 'cda-err' : 'cda-warn' }, icon(err ? 'error' : 'warning', 24), text));
  if (ov.write_block) note(true, ov.write_block);
  if (ov.client_block) note(true, 'Client: ' + ov.client_block);
  if (ov.server.error) note(true, 'Server: ' + ov.server.error);
  if (ov.items_error) note(false, 'Item catalogs: ' + ov.items_error);
  if (ov.pkg.error) note(false, 'Pkg: ' + ov.pkg.error);
  for (const [label, side] of [['S_ShopCurrency.ini (server)', ov.server], ['C_ShopCurrency.ini (client)', ov.client]]) {
    for (const x of side.ignored || []) note(false, label + ' line ' + x.line + ' is ignored by the game: "' + x.text + '" (' + x.why + ')');
  }
}

function kpi(value, label, tone, title) {
  return el('div', { class: 'cda-kpi' + (tone ? ' ' + tone : ''), title: title || null }, el('b', {}, String(value)), el('span', {}, label));
}

function renderKpis() {
  const k = $('#sc-kpis');
  if (!k || !S.ov) return;
  const { server: sv, client: cl, pkg: pk, restart_pending: rp } = S.ov;
  clear(k);
  append(k, [
    kpi(sv.error ? '?' : (sv.exists ? sv.count : 'none'), 'Server table S_ShopCurrency.ini', sv.error ? 'bad' : (sv.exists ? 'good' : 'warn'), sv.path),
    kpi(cl.exists ? cl.count : 'none', 'Client table C_ShopCurrency.ini (game_unpacked)', cl.exists ? 'good' : 'warn', cl.path),
    kpi(!pk.available ? '?' : (pk.in_sync ? 'in sync' : 'repack'),
      !pk.available ? 'Pkg not found' : (pk.in_sync ? 'Pkg holds the same table' : (pk.has_file ? 'Pkg differs from game_unpacked' : 'Not in the pkg yet')),
      pk.in_sync ? 'good' : 'warn'),
    kpi(rp.length ? 'needed' : 'none', rp.length ? 'Server restart pending (' + rp.length + ' change(s))' : 'No server restart pending', rp.length ? 'warn' : 'good',
      rp.map(x => x.ts + ' ' + x.target).join('\n')),
  ]);
}

function sideBadge(r, side) {
  const v = r[side];
  if (!v) {
    return side === 'server'
      ? badge('missing', 'error', { title: 'Not in S_ShopCurrency.ini: buying is refused in game ("' + r.unit + '" Item Error)' })
      : badge('missing', 'warn', { title: 'Not in C_ShopCurrency.ini: the shop rows show no price' });
  }
  if (r.state === 'differs') return badge('item ' + v.item + (v.name ? ', ' + v.name : ''), 'warn', { title: 'Server and client lines differ' });
  return badge('ok', 'ok');
}

function pkgBadge(r) {
  const pk = S.ov.pkg;
  if (!pk.available) return badge('?', 'neutral', { title: pk.error || 'no pkg' });
  if (!r.repack) return badge('ok', 'ok', { title: 'The pkg holds the same line as game_unpacked' });
  return badge('repack', 'warn', { title: r.pkg ? 'The pkg holds item ' + r.pkg.item + ': repack to ship game_unpacked' : 'Not in the pkg yet: repack' });
}

function selectUnit(unit) {
  S.sel = unit;
  render();
  const p = $('#sc-items');
  if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function del(r) {
  const sold = r.sold.client + r.sold.server;
  const msg = 'Remove unit ' + r.unit + ' (item ' + r.item + ') from S_ShopCurrency.ini and C_ShopCurrency.ini? Both files are backed up first.'
    + (sold ? ' ' + sold + ' item line(s) still use this unit: buying them will be refused in game.' : '');
  if (!await uiConfirm(msg, 'Delete a currency', 'Delete')) return;
  try {
    showResult(await api.post(ROOT + '/currency/delete', { unit: r.unit }));
    if (S.sel === r.unit) S.sel = null;
  } catch (e) { toast(errMessage(e), 'error', { duration: 10000 }); }
  await refresh();
}

async function sync(direction) {
  const msg = direction === 'server_to_client'
    ? 'Overwrite C_ShopCurrency.ini in game_unpacked with the server table (then repack)?'
    : 'Overwrite S_ShopCurrency.ini on the server with the client table (then restart)?';
  if (!await uiConfirm(msg + ' The file is backed up first.', 'Copy a table', 'Copy')) return;
  try { showResult(await api.post(ROOT + '/sync', { direction })); } catch (e) { toast(errMessage(e), 'error', { duration: 10000 }); }
  await refresh();
}

function formNode() {
  const f = S.form;
  if (!f) return null;
  const add = f.mode === 'add';
  const unit = formField({ label: 'Unit', type: 'number', value: f.unit, disabled: !add,
    hint: add ? 'Free: ' + (S.ov.free_units || []).join(', ') + '. Allowed: 2, 3, 6, 7, 8, 9, 18, 24-255 (never a native currency)' : 'The unit is the key: delete and add again to change it' });
  const item = formField({ label: 'Currency item id', type: 'number', value: f.item, hint: 'Must exist in C_Item and S_Item; a stackable item is recommended' });
  const name = formField({ label: 'Display name (server messages)', value: f.name, placeholder: 'e.g. Demonic Seal',
    hint: 'Optional, plain ASCII, 31 characters max, no |. Shown in "Decrease <name> x N"; empty = the S_Item name' });
  name.input.maxLength = 31;
  const prev = el('div', { class: 'cda-small', style: { minHeight: '24px' } });
  const preview = async () => {
    const id = parseInt(item.get(), 10);
    clear(prev);
    if (!id) return;
    try {
      const ref = await api.get(ROOT + '/item/' + id);
      append(prev, [itemCell(ref), ' ', el('span', { class: 'cda-dim' }, 'max stack ' + (ref.stack == null ? '?' : ref.stack))]);
    } catch (e) { prev.appendChild(el('span', { class: 'cda-dim' }, errMessage(e))); }
  };
  item.input.addEventListener('change', preview);
  if (f.item) preview();
  const save = btn({ label: add ? 'Add currency' : 'Save', icon: 'save', busyLabel: 'Writing server then client…', onClick: async () => {
    try {
      showResult(await api.post(ROOT + '/currency', { mode: f.mode, unit: unit.get(), item: item.get(), name: name.get() }));
    } catch (e) { toast(errMessage(e), 'error', { duration: 12000 }); return; }
    S.form = null;
    await refresh();
  } });
  const cancel = btn({ label: 'Cancel', variant: 'ghost', onClick: () => { S.form = null; renderCurrencies(); } });
  return el('div', { class: 'cda-job' },
    el('div', { class: 'cda-job-h' }, icon(add ? 'add' : 'edit', 24), el('b', {}, add ? 'New currency' : 'Edit unit ' + f.unit)),
    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '10px' } }, unit.node, item.node, name.node),
    itemSearch(ROOT, id => { item.set(id); preview(); }),
    prev,
    el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } }, save, cancel));
}

function orphanNode(w) {
  const o = S.ov.orphans || [];
  if (!o.length) return null;
  return el('div', { class: 'cda-warn', style: { display: 'block' } },
    el('b', {}, 'Units used by items but not configured'),
    el('ul', { class: 'cda-list' }, o.map(x => el('li', {},
      'Unit ' + x.unit + ': ' + x.client + ' item(s) in C_Item, ' + x.server + ' in S_Item. '
      + (x.native_when_free ? 'Native behaviour: ' + x.native_when_free + '. ' : 'Buying is refused in game ("' + x.unit + '" Item Error). '),
      btn({ label: 'Configure', variant: 'mini', disabled: !w, onClick: () => { S.form = { mode: 'add', unit: x.unit, item: '', name: '' }; renderCurrencies(); } }),
      ' ',
      btn({ label: 'Items', variant: 'mini', onClick: () => selectUnit(x.unit) })))));
}

function renderCurrencies() {
  const box = $('#sc-cur');
  if (!box || !S.ov) return;
  const ov = S.ov, w = cx().writable;
  const rows = ov.currencies || [];
  const table = dataTable({
    rows,
    empty: emptyState({ title: 'No shop currency configured', icon: 'gold', hint: 'Add one: a free unit (24-255), an existing stackable item, a display name.' }),
    columns: [
      { key: 'unit', label: 'Unit', width: '56px', render: r => el('b', { style: { color: r.unit === S.sel ? 'var(--crimson)' : '' } }, String(r.unit)) },
      { key: 'item', label: 'Currency item', render: r => itemCell(r.ref) },
      { key: 'name', label: 'Display name', render: r => r.name || el('span', { class: 'cda-dim' }, '(S_Item name)') },
      { key: 'server', label: 'Server', render: r => sideBadge(r, 'server') },
      { key: 'client', label: 'Client', render: r => sideBadge(r, 'client') },
      { key: 'pkg', label: 'Pkg', render: r => pkgBadge(r) },
      { key: 'sold', label: 'Items sold', render: r => el('span', { title: 'C_Item / S_Item lines with this Price Unit' }, r.sold.client + ' / ' + r.sold.server) },
      { key: 'act', label: '', render: r => el('span', { style: { display: 'inline-flex', gap: '4px' } },
        btn({ label: 'Items', variant: 'mini', icon: 'bag', title: 'Items sold in unit ' + r.unit, onClick: () => selectUnit(r.unit) }),
        btn({ label: 'Edit', variant: 'mini', icon: 'edit', disabled: !w, onClick: () => { S.form = { mode: 'edit', unit: r.unit, item: r.item, name: r.name }; renderCurrencies(); } }),
        btn({ label: 'Delete', variant: 'mini', icon: 'delete', disabled: !w, onClick: () => del(r) })) },
    ],
  });
  const acts = [btn({ label: 'Add currency', icon: 'add', variant: 'mini', disabled: !w, onClick: () => { S.form = { mode: 'add', unit: (ov.free_units || [])[0] || '', item: '', name: '' }; renderCurrencies(); } })];
  if (rows.some(r => r.state !== 'ok' && r.state !== 'pkg_only')) {
    acts.push(btn({ label: 'Copy server table to client', variant: 'mini', disabled: !w || !ov.server.exists, onClick: () => sync('server_to_client') }));
    acts.push(btn({ label: 'Copy client table to server', variant: 'mini', disabled: !w || !ov.client.exists, onClick: () => sync('client_to_server') }));
  }
  clear(box).appendChild(card({ title: 'Currencies', icon: 'gold', subtitle: rows.length + ' / ' + ov.limits.max_entries,
    actions: acts, body: [formNode(), table, orphanNode(w)] }));
}
