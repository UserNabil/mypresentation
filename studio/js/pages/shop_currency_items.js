/* ============================================================================
   pages/shop_currency_items.js — Shop Currencies page, second half: items sold
   in a currency (C_Item / S_Item columns 30 and 31), item search, result toasts
   and the dev-only test helpers (give currency items, restart_safe).
   Backend: shop_currencies.py (/api/shop-currency/*).
   ============================================================================ */

import { el, clear, append, enc } from '../core/dom.js';
import { icon, btn, badge, card, emptyState, errorState, dataTable, formField } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { uiConfirm, uiPrompt } from '../ui/dialogs.js';

const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '10px' };
const INPUT = { padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--edge)', background: '#fbf5e3', fontSize: '12px' };

export function itemCell(ref) {
  if (!ref) return '';
  const flags = [];
  if (ref.in_client === false) flags.push(badge('not in C_Item', 'error'));
  if (ref.in_server === false) flags.push(badge('not in S_Item', 'error'));
  return el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
    ref.icon ? el('img', { src: '/api/icon?etype=item&name=' + enc(ref.icon), width: '24', height: '24', alt: '', loading: 'lazy',
      onerror: function () { this.style.visibility = 'hidden'; } }) : null,
    el('span', {}, ref.name || '(no name)'),
    el('span', { class: 'cda-dim cda-small' }, '#' + ref.id),
    flags);
}

export function showResult(r) {
  if (!r) return;
  const ok = r.ok !== false;
  const parts = [r.message || (ok ? 'Saved' : 'Failed')];
  if (r.server_warning) parts.push(r.server_warning);
  for (const w of r.warnings || []) parts.push('Note: ' + w);
  const tone = !ok ? 'error' : ((r.warnings || []).length ? 'warn' : 'ok');
  toast(parts.join(' - '), tone, { duration: 12000 });
}

export function itemSearch(root, onPick) {
  const inp = el('input', { type: 'text', placeholder: 'Find an item by name or id…', style: Object.assign({ maxWidth: '360px' }, INPUT) });
  const out = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } });
  let timer = null, seq = 0;
  inp.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = inp.value.trim(), my = ++seq;
      if (!q) { clear(out); return; }
      try {
        const r = await api.get(root + '/find?q=' + enc(q));
        if (my !== seq) return;
        clear(out);
        for (const it of r.items || []) {
          const b = el('button', { type: 'button', class: 'cda-chip', title: 'Use item ' + it.id }, itemCell(it));
          b.onclick = () => onPick(it.id, it);
          out.appendChild(b);
        }
        if (!(r.items || []).length) out.appendChild(el('span', { class: 'cda-dim' }, 'No item matches.'));
      } catch (e) { clear(out).appendChild(el('span', { class: 'cda-dim' }, errMessage(e))); }
    }, 250);
  };
  return el('div', { class: 'cda-small', style: { display: 'grid', gap: '4px', margin: '6px 0' } }, inp, out);
}

async function sell(item, unit, price, cx) {
  try {
    showResult(await api.post(cx.ROOT + '/item-price', { item, unit, price }));
  } catch (e) {
    toast(errMessage(e), 'error', { duration: 10000 });
    return;
  }
  await cx.refresh();
}

async function restore(item, cx) {
  if (!await uiConfirm('Remove item ' + item + ' from this currency? Its original price unit and price (recorded when it was put on sale, '
    + 'else read from the newest server backup of S_Item) are written back to C_Item and S_Item. Then: server restart and client repack.',
    'Remove from currency', 'Remove')) return;
  try {
    showResult(await api.post(cx.ROOT + '/item-restore', { item }));
  } catch (e) {
    toast(errMessage(e), 'error', { duration: 10000 });
    return;
  }
  await cx.refresh();
}

function priceCell(r, side, unit) {
  const present = side === 'c' ? r.in_client : r.in_server;
  if (present === false) return badge('missing', 'error');
  if (present == null) return el('span', { class: 'cda-dim' }, '?');
  const u = r[side + '_unit'], p = r[side + '_price'];
  if (u === unit) return el('b', {}, String(p == null ? '' : p));
  return el('span', { class: 'cda-dim' }, 'unit ' + u + ', price ' + (p == null ? '' : p));
}

function saleForm(unit, cx) {
  const item = formField({ label: 'Item id', type: 'number', placeholder: 'item to sell' });
  const price = formField({ label: 'Price (number of currency items)', type: 'number', value: 1, hint: '1-65535 per item bought' });
  const go = btn({ label: 'Put on sale in unit ' + unit, icon: 'cart', busyLabel: 'Writing C_Item and S_Item…',
    onClick: () => sell(item.get(), unit, price.get(), cx) });
  return el('div', { class: 'cda-job' },
    el('div', { class: 'cda-job-h' }, icon('cart', 24), el('b', {}, 'Sell an item in this currency')),
    el('div', { class: 'esub' }, 'Writes Price Unit = ' + unit + ' (column 30) and the price (column 31) in C_Item and S_Item, '
      + 'through the same edit as the item pages (server first, backups, History). The item must already be listed in an '
      + 'NPC shop. Then: server restart and client repack.'),
    el('div', { style: GRID }, item.node, price.node),
    itemSearch(cx.ROOT, id => item.set(id)),
    el('div', { style: { marginTop: '6px' } }, go));
}

export async function renderItemsPanel(host, cx) {
  if (!host) return;
  const S = cx.S;
  clear(host);
  if (S.sel == null || !S.ov) return;
  const unit = S.sel;
  const cur = S.ov.currencies.find(r => r.unit === unit);
  const title = 'Items sold in unit ' + unit + (cur ? ' - ' + (cur.ref.name || cur.name || 'item ' + cur.item) : ' (not configured)');
  const body = el('div', {}, emptyState({ title: 'Reading C_Item and S_Item…', icon: 'bag' }));
  host.appendChild(card({ title, icon: 'bag', body,
    actions: btn({ label: 'Close', variant: 'mini', onClick: () => { S.sel = null; clear(host); } }) }));
  let data;
  try {
    data = await api.get(cx.ROOT + '/items?unit=' + unit);
  } catch (e) {
    clear(body).appendChild(errorState({ error: e, title: 'Cannot read the items', onRetry: () => renderItemsPanel(host, cx) }));
    return;
  }
  if (S.sel !== unit) return;
  clear(body);
  if (data.server_error) body.appendChild(el('div', { class: 'cda-warn' }, icon('warning', 24), 'S_Item: ' + data.server_error));
  const canEdit = cx.writable && !!cur;
  if (canEdit) body.appendChild(saleForm(unit, cx));
  else if (!cur) body.appendChild(el('div', { class: 'cda-warn' }, icon('warning', 24), 'Unit ' + unit + ' is not configured: these items cannot be bought until a currency is added for it.'));
  body.appendChild(dataTable({
    rows: data.items,
    empty: 'No item is sold in unit ' + unit + ' yet.',
    columns: [
      { key: 'id', label: 'Item', render: r => itemCell(r) },
      { key: 'c', label: 'Client price (C_Item)', render: r => priceCell(r, 'c', unit) },
      { key: 's', label: 'Server price (S_Item)', render: r => priceCell(r, 's', unit) },
      { key: 'issues', label: 'Checks', render: r => r.issues.length
        ? el('ul', { class: 'cda-list cda-warnlist', style: { margin: '0' } }, r.issues.map(i => el('li', {}, i)))
        : badge('ok', 'ok') },
      { key: 'act', label: '', render: r => el('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } }, btn({ label: 'Set price', variant: 'mini', icon: 'edit', disabled: !canEdit,
        title: 'Writes unit ' + unit + ' and the price in C_Item and S_Item (also fixes a client/server mismatch)',
        onClick: async () => {
          const def = r.s_unit === unit ? r.s_price : (r.c_unit === unit ? r.c_price : '');
          const v = await uiPrompt('Price in unit ' + unit + ' for item ' + r.id + ' (1-65535), written to C_Item and S_Item',
            'Set price', def == null ? '' : String(def));
          if (v != null && v !== '') await sell(r.id, unit, v, cx);
        } }), btn({ label: 'Remove', variant: 'mini', icon: 'delete', disabled: !cx.writable,
        title: 'Take this item out of the currency: back to its original price unit and price in C_Item and S_Item',
        onClick: () => restore(r.id, cx) })) },
    ],
  }));
}

async function give(cx, charId, unit, qty, force) {
  try {
    const r = await api.post(cx.ROOT + '/give', { char_id: charId, unit, qty, force });
    toast('Given: ' + r.qty + ' x item ' + r.item + ' to character ' + r.char_id + ' (now ' + r.count + ' in the bag)', 'ok', { duration: 9000 });
  } catch (e) {
    if (!force && e.status === 409 && /online/i.test(errMessage(e))) {
      if (await uiConfirm(errMessage(e) + '. Give anyway?', 'Character online?', 'Give anyway')) await give(cx, charId, unit, qty, true);
      return;
    }
    toast(errMessage(e), 'error', { duration: 10000 });
  }
}

function giveBlock(cx) {
  const conf = cx.S.ov.currencies.filter(r => r.server);
  if (!conf.length) return el('div', { class: 'cda-dim' }, 'Give currency items: configure a currency on the server first.');
  const q = el('input', { type: 'text', placeholder: 'Character or account name…', style: INPUT });
  const who = el('select', { style: INPUT }, el('option', { value: '' }, '(search a character)'));
  const unit = el('select', { style: INPUT }, conf.map(r => el('option', { value: String(r.unit) },
    'Unit ' + r.unit + ' - ' + (r.ref.name || r.name || 'item ' + r.item) + ' (#' + r.server.item + ')')));
  const qty = el('input', { type: 'number', value: '10', min: '1', max: String(cx.S.ov.limits.max_give), style: Object.assign({ width: '90px' }, INPUT) });
  let timer = null;
  q.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const r = await api.get(cx.ROOT + '/characters?q=' + enc(q.value.trim()));
        clear(who);
        const list = r.characters || [];
        if (!list.length) who.appendChild(el('option', { value: '' }, '(no character)'));
        for (const c of list) who.appendChild(el('option', { value: String(c.id) }, c.name + ' (' + c.account + ') - level ' + c.level + ' - #' + c.id));
      } catch (e) { toast(errMessage(e), 'error'); }
    }, 300);
  };
  const go = btn({ label: 'Give', icon: 'add_item', busyLabel: 'Writing the bag…', onClick: () => {
    if (!who.value) { toast('Pick a character first', 'warn'); return; }
    return give(cx, who.value, unit.value, qty.value, false);
  } });
  return el('div', { class: 'cda-job' },
    el('div', { class: 'cda-job-h' }, icon('bag', 24), el('b', {}, 'Give currency items to a character')),
    el('div', { class: 'esub' }, 'Adds the currency item of the chosen unit to the main bag in the dev database (same writer as the Altar test account). '
      + 'Log the character out first: a ZoneServer that holds it overwrites the bag when it saves.'),
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' } }, q, who, unit, qty, go));
}

function restartBlock(cx) {
  const go = btn({ label: 'Restart ZoneServers (restart_safe)', icon: 'restart_server', busyLabel: 'Restarting the dev servers…', onClick: async () => {
    if (!await uiConfirm('Restart the dev game servers with restart_safe? Each ZoneServer reads S_ShopCurrency.ini again at its first purchase. '
      + 'Players on dev are disconnected for 1 to 3 minutes.', 'Restart dev servers', 'Restart')) return;
    try {
      const r = await api.post(cx.ROOT + '/restart');
      toast(r.message || (r.ok ? 'Servers restarted' : 'Restart not confirmed'), r.ok ? 'ok' : 'warn', { duration: 12000 });
    } catch (e) { toast(errMessage(e), 'error', { duration: 12000 }); }
    await cx.refresh();
  } });
  const pack = btn({ label: 'Open Packaging (repack)', icon: 'packaging', variant: 'ghost', onClick: () => {
    const b = document.getElementById('btn-pack');
    if (b) b.click(); else toast('Packaging is not available for your role', 'warn');
  } });
  return el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } }, go, pack);
}

export function renderTestPanel(host, cx) {
  if (!host) return;
  clear(host);
  const ov = cx.S.ov;
  if (!ov) return;
  if (!cx.testable) {
    host.appendChild(el('div', { class: 'cda-dim cda-small' }, 'Test helpers: ' + (ov.test_block || ov.write_block)));
    return;
  }
  const steps = el('ol', { class: 'cda-list' },
    el('li', {}, 'Add the currency: a free unit, an existing stackable item (in C_Item and S_Item), a display name.'),
    el('li', {}, 'Open its items and put one or two shop items on sale in that unit (they must already be in an NPC shop).'),
    el('li', {}, 'Restart ZoneServers below: the server reads S_ShopCurrency.ini and S_Item.ini again.'),
    el('li', {}, 'Repack the client (Packaging), then relaunch the game: it reads C_ShopCurrency.ini and c_item.ini from the pkg.'),
    el('li', {}, 'Give currency items to a logged-out character, log in, open the shop: price with the currency icon, buy, check the bag and the chat ("Decrease <name> x N").'));
  host.appendChild(card({ title: 'Test helpers (dev only)', icon: 'launch_game', body: [steps, giveBlock(cx), restartBlock(cx)] }));
}
