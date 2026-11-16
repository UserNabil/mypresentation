/* ============================================================================
   pages/card_duel_archive.js — Card Duel page, Archive tab: what every card
   needs in the Treasure Archive and whether the server of the environment and
   the unpacked client of this PC have it (card_items.json of the feature,
   checked with cardduel_data, the module the card_duel deploy writes with).
   ============================================================================ */

import { el, clear } from '../core/dom.js';
import { btn, badge, card, emptyState, errorState } from '../components.js';
import { api } from '../core/api.js';
import { note } from './card_duel_render.js';

const ROOT = '/api/cardduel';

export async function renderArchive(node, H) {
  clear(node);
  node.appendChild(card({ title: 'What a card needs in the Treasure Archive', icon: 'treasure_archive', body: el('div', { class: 'cd-help' },
    el('ul', {},
      el('li', {}, el('b', {}, 'An item "Card: <name>"'), ' (server S_Item.ini, client c_item.ini + t_item.ini) with its icon (UI\\itemicon\\ECnnnn.dds). '
        + 'Blocks: monster 53001-54999, boss 55001-55999, NPC 56001-57999, place 58001-58999.'),
      el('li', {}, el('b', {}, 'An archive row'), ' (server S_Collection.ini, client c_collection.ini), category 32, in the sheet of its kind: '
        + 'Special Items > Monster Cards, Boss Cards, NPC Cards or Place Cards.'),
      el('li', {}, el('b', {}, 'A way to get the item'), ': monster and boss cards drop it from their monster (1.5 pct, boss 5 pct, server S_DropItem.ini, '
        + 'client c_dropitem.ini); every other card mails it the first time the player gets the card. Losing a card never takes the item back.'),
      el('li', {}, el('b', {}, 'Card items of the designer file'), ' (59001-59999) only need their item rows (S_Item, c_item, t_item): they are used up when used and have no archive row.'),
      el('li', {}, 'The server rows are written by the card_duel Deploy (Features page); the client rows go into game_unpacked and reach players with the next '
        + 'repack (never written into the pkg directly). A restart of the whole server stack is needed after new server rows.'))) }));
  const res = el('div', {}, emptyState({ title: 'Checking the server of ' + H.env + ' and the client of this PC…', icon: 'treasure_archive' }));
  node.appendChild(res);
  node.appendChild(btn({ label: 'Check again', icon: 'refresh', variant: 'ghost', busyLabel: 'Checking…', onClick: () => renderArchive(node, H) }));
  let a;
  try {
    a = await api.get(ROOT + '/archive');
  } catch (e) {
    clear(res).appendChild(errorState({ error: e, title: 'Archive check failed', onRetry: () => renderArchive(node, H) }));
    return;
  }
  let names = {};
  try {
    const d = await H.cards();
    for (const r of d.rows) {
      if (r.item) names[r.item.id] = r.name;
      for (const x of r.card_items || []) names[x.item] = x.name;
    }
  } catch (_) { names = {}; }
  clear(res);
  res.appendChild(el('div', { class: 'cd-grid2' },
    table('Server of ' + H.env + (a.db ? ' (' + a.db + ')' : ''), a.counts, a.missing, names,
      'Missing server rows: run the card_duel Deploy for ' + H.env + ' (Features page), then restart the server stack.'),
    a.client && a.client.error ? card({ title: 'Client of this PC', icon: 'client', body: note('warn', a.client.error) })
      : table('Client of this PC (' + (a.client.db || '?') + ')', a.client.counts, a.client.missing, names,
        'Missing client rows: install the card_duel client data (Features page, card_duel, client data), then repack.')));
}

function table(title, counts, missing, names, fix) {
  const rows = [];
  let bad = 0;
  for (const f of Object.keys(counts || {})) {
    const [have, want] = counts[f];
    if (have < want) bad++;
    const miss = (missing && missing[f]) || [];
    rows.push(el('tr', {}, el('td', {}, f), el('td', {}, have + ' / ' + want),
      el('td', {}, have >= want ? badge('complete', 'ok') : badge((want - have) + ' missing', 'error')),
      el('td', { class: 'cd-small' }, miss.slice(0, 12).map(i => (names[i] ? names[i] + ' (' + i + ')' : String(i))).join(', ')
        + (miss.length > 12 ? ' … +' + (miss.length - 12) : ''))));
  }
  return card({ title, icon: 'treasure_archive', body: el('div', {},
    el('table', { class: 'cd-table' }, el('tr', {}, el('th', {}, 'File'), el('th', {}, 'Rows'), el('th', {}, 'State'), el('th', {}, 'Missing')), rows),
    bad ? note('warn', fix) : note('ok', 'Every card item has its rows.')) });
}
