/* ============================================================================
   pages/card_duel_cards.js — Card Duel page, Cards tab: every card of the
   catalogue + the custom cards of the designer file, searchable and
   filterable, a card drawn like in game, what it needs in the Treasure Archive,
   CSV export / import. Create, edit, duplicate, delete custom cards:
   card_duel_card_edit.js; change, reset, retire game cards: card_duel_override.js.
   ============================================================================ */

import { el, clear } from '../core/dom.js';
import { btn, badge, card, emptyState, errorState } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { searchScope } from '../ui/search_scope.js';
import { RARITY, SKILL_HELP, cardNode, chip, sidesText, note, download, put } from './card_duel_render.js';
import { openEditor, openItemEditor, removeBlock, saveDesigner } from './card_duel_card_edit.js';
import { openOverride, resetOverride, retireCard, unretireCard } from './card_duel_override.js';

const ROOT = '/api/cardduel';
const PAGE = 150;
const F = { q: '', kind: '', element: '', rarity: '', source: '', status: 'live', sort: 'name', dir: 1, shown: PAGE, sel: null };
const T = { host: null, node: null, data: null };

export async function renderCards(node, H, force) {
  T.host = H;
  T.node = node;
  clear(node).appendChild(emptyState({ title: 'Reading the cards…', icon: 'dice' }));
  try {
    T.data = await H.cards(force);
  } catch (e) {
    clear(node).appendChild(errorState({ error: e, title: 'Cannot read the cards', onRetry: () => renderCards(node, H, true) }));
    return;
  }
  draw();
}

function rows() {
  const q = F.q.trim().toLowerCase();
  const out = T.data.rows.filter(r => {
    if (F.status === 'live' && r.retired) return false;
    if (F.status === 'retired' && !r.retired) return false;
    if (F.status === 'custom' && !r.custom) return false;
    if (F.status === 'override' && !r.override) return false;
    if (F.kind && r.kind !== F.kind) return false;
    if (F.element && r.element !== F.element) return false;
    if (F.rarity !== '' && String(r.rarity) !== F.rarity) return false;
    if (F.source && !(r.sources || []).includes(F.source)) return false;
    if (q) {
      const hay = (r.name + ' ' + r.id + ' ' + (r.title || '') + ' ' + (r.skills || []).join(' ') + ' ' + (r.maps || []).join(' ')
        + ' ' + (r.item ? r.item.id + ' ' + r.item.name : '')).toLowerCase();
      if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  });
  const key = { name: r => r.name.toLowerCase(), id: r => r.id, rarity: r => r.rarity * 1000 + sum(r), power: r => sum(r),
    element: r => r.element, kind: r => r.kind, level: r => r.level }[F.sort] || (r => r.name);
  out.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * F.dir);
  return out;
}

const sum = r => (r.sides || []).reduce((a, b) => a + b, 0);

function select(label, key, options) {
  const s = el('select', { class: 'cd-in', title: label });
  s.appendChild(el('option', { value: '' }, label + ': all'));
  for (const [v, t] of options) s.appendChild(el('option', { value: v }, t));
  s.value = F[key];
  s.onchange = () => { F[key] = s.value; F.shown = PAGE; drawTable(); };
  return s;
}

function draw() {
  const node = T.node;
  const d = T.data;
  clear(node);
  const dz = d.designer || {};
  const nCustom = d.rows.filter(r => r.custom).length;
  const nOver = d.rows.filter(r => r.override).length;
  const nRet = d.rows.filter(r => r.retire_designer).length;
  if (dz.unsupported) node.appendChild(note('warn', (dz.errors || []).join(' ')));
  else {
    node.appendChild(note('info', 'Game cards (' + (d.rows.length - nCustom) + ') are generated from the monsters, bosses, NPCs and places of the game data'
      + (d.overridable ? ': Change writes only the values you change (' + nOver + ' changed so far), Retire stops a card from being obtained (' + nRet + ' retired so far). '
        : ': read only with this card_duel version (Pull latest features for card_duel 0.7.0 to change or retire them). ')
      + 'Custom cards (' + nCustom + ') and card items (' + (d.items || []).length + ') live in the same designer file of card_duel (' + (dz.path || 'designer/custom_cards.ini') + '). '
      + 'Players get every change once card_duel is pushed and deployed (Help, Publishing).'));
    if (!dz.writable) node.appendChild(note('warn', 'Changes are not written on this PC: ' + (dz.why || '') + '.'));
    if ((dz.errors || []).length) node.appendChild(note('err', 'The designer file has errors (the Deploy refuses it): ' + dz.errors.join('; ')));
    if ((dz.warnings || []).length) node.appendChild(note('warn', 'Designer file notes: ' + dz.warnings.join('; ')));
  }
  const search = el('input', { class: 'cd-in cd-grow', type: 'search', placeholder: 'Search a name, id, title, skill, map, item…', value: F.q, style: { minWidth: '240px' } });
  search.oninput = () => { F.q = search.value; F.shown = PAGE; drawTable(); };
  searchScope.bindInput({ key: 'duel-cards', label: 'Cards', placeholder: 'Search a name, id, title, skill, map, item', onQuery: v => { F.q = v; F.shown = PAGE; drawTable(); } }, search);
  const status = el('select', { class: 'cd-in' }, [['live', 'Cards players can get'], ['all', 'All cards'], ['custom', 'Custom cards (designer file)'], ['override', 'Changed game cards (overrides)'], ['retired', 'Retired cards']]
    .map(([v, t]) => el('option', { value: v }, t)));
  status.value = F.status;
  status.onchange = () => { F.status = status.value; F.shown = PAGE; drawTable(); };
  const tools = el('div', { class: 'cd-row', style: { marginBottom: '8px' } }, search, status,
    select('Kind', 'kind', d.kinds.map(k => [k, k])),
    select('Element', 'element', d.elements.map(k => [k, k])),
    select('Rarity', 'rarity', RARITY.map((r, k) => [String(k), r])),
    select('Source', 'source', [['item drop', 'Item dropped by its monster'], ['item by mail', 'Item mailed at the first card'],
      ['map loot', 'Random loot of a map'], ['activity reward', 'Activity reward'], ['card item', 'Card item (designer file)'], ['custom', 'Custom card'],
      ['override', 'Changed game card'], ['retired', 'Retired']]));
  const acts = el('div', { class: 'cd-row', style: { marginBottom: '8px' } },
    T.host.canCards() ? btn({ label: 'New custom card', icon: 'add', onClick: () => openEditor(T.host, null, refresh) }) : null,
    btn({ label: 'Export CSV', icon: 'export', variant: 'ghost', title: 'The cards of the current status filter',
      onClick: () => download(ROOT + '/cards/export.csv?scope=' + (F.status === 'custom' ? 'custom' : F.status === 'live' ? 'live' : 'all')) }),
    T.host.canCards() ? btn({ label: 'Import CSV', icon: 'import', variant: 'ghost', onClick: importCsv }) : null,
    btn({ label: 'Download custom_cards.ini', icon: 'export', variant: 'ghost', title: 'The designer file as it is on this PC',
      onClick: () => download(ROOT + '/designer/file') }),
    el('span', { class: 'cd-grow' }), el('span', { id: 'cd-count', class: 'cd-small' }));
  node.appendChild(tools);
  node.appendChild(acts);
  node.appendChild(el('div', { class: 'cd-grid2' }, el('div', { id: 'cd-table' }), el('div', { id: 'cd-detail' })));
  drawTable();
  drawDetail();
}

function th(label, key) {
  return el('th', { onclick: () => { F.dir = F.sort === key ? -F.dir : 1; F.sort = key; drawTable(); } },
    label + (F.sort === key ? (F.dir > 0 ? ' ▲' : ' ▼') : ''));
}

function drawTable() {
  const box = T.node.querySelector('#cd-table');
  if (!box) return;
  const list = rows();
  const cnt = T.node.querySelector('#cd-count');
  if (cnt) cnt.textContent = list.length + ' card(s)';
  const tb = el('tbody');
  for (const r of list.slice(0, F.shown)) {
    const tags = [];
    if (r.custom) tags.push(chip('custom', 'design', 'Designer file'));
    if (r.override) tags.push(chip('changed', 'design', 'Override in the designer file: ' + Object.keys(r.override).join(', ')));
    if (r.retired) tags.push(chip('retired', 'retired', r.retired));
    const tr = el('tr', { class: F.sel === r.id ? 'sel' : '', onclick: () => { F.sel = r.id; drawDetail(); drawTable(); } },
      el('td', {}, r.name, ' ', tags),
      el('td', { class: 'cd-small' }, String(r.id)),
      el('td', {}, r.kind),
      el('td', {}, r.element),
      el('td', {}, chip(RARITY[r.rarity], 'r' + r.rarity)),
      el('td', { class: 'cd-sides', title: 'North East South West (A = 10), total ' + sum(r) }, sidesText(r.sides)),
      el('td', {}, (r.skills || []).map(s => chip(s, '', SKILL_HELP[s]))),
      el('td', { class: 'cd-small' }, (r.sources || []).filter(s => s !== 'retired' && s !== 'override').join(', ')));
    tb.appendChild(tr);
  }
  const table = el('table', { class: 'cd-table' }, el('thead', {}, el('tr', {}, th('Name', 'name'), th('Id', 'id'), th('Kind', 'kind'),
    th('Element', 'element'), th('Rarity', 'rarity'), th('Sides', 'power'), el('th', {}, 'Skills'), el('th', {}, 'How players get it'))), tb);
  clear(box).appendChild(el('div', { class: 'cd-scroll' }, table));
  if (list.length > F.shown) box.appendChild(btn({ label: 'Show ' + Math.min(PAGE, list.length - F.shown) + ' more', variant: 'ghost',
    onClick: () => { F.shown += PAGE; drawTable(); } }));
  if (!list.length) box.appendChild(emptyState({ title: 'No card matches the filters' }));
}

function line(label, ...v) { return el('div', { class: 'cd-row', style: { alignItems: 'baseline' } }, el('b', { style: { minWidth: '120px' } }, label), el('span', {}, ...v)); }

function drawDetail() {
  const box = T.node.querySelector('#cd-detail');
  if (!box) return;
  clear(box);
  const r = T.data.rows.find(x => x.id === F.sel);
  if (!r) { box.appendChild(card({ title: 'Card', icon: 'dice', body: emptyState({ title: 'Pick a card in the list', hint: 'Its picture, archive item and actions show here.' }) })); return; }
  const it = r.item;
  const sheet = { monster: 'Monster Cards', boss: 'Boss Cards', npc: 'NPC Cards', place: 'Place Cards' }[r.kind] || 'none yet';
  const H = T.host;
  const ov = T.data.overridable;
  const retire = !ov ? null : r.retire_designer
    ? btn({ label: 'Un-retire', icon: 'undo', variant: 'mini', title: 'Remove its [retire] block', onClick: () => unretireCard(H, r, refresh) })
    : (r.retired ? null : btn({ label: 'Retire', icon: 'delete', variant: 'mini', title: 'Nobody can get it any more; owned copies stay playable', onClick: () => retireCard(H, r, refresh) }));
  const actions = H.canCards() ? (r.custom ? [
    btn({ label: 'Edit', icon: 'edit', variant: 'mini', onClick: () => openEditor(H, r, refresh) }),
    btn({ label: 'Duplicate', icon: 'add', variant: 'mini', onClick: () => openEditor(H, r, refresh, true) }),
    btn({ label: 'Card item', icon: 'add_item', variant: 'mini', title: 'An item that gives this card when used', onClick: () => openItemEditor(H, r, null, refresh) }),
    retire,
    btn({ label: 'Delete', icon: 'delete', variant: 'mini', title: 'Removes the block: owned copies become unknown cards. Retire is the safe way.', onClick: () => removeBlock(H, 'card', r.id, r.name, refresh) }),
  ] : [
    ov ? btn({ label: 'Change', icon: 'edit', variant: 'mini', title: 'Change values of this game card ([override] in the designer file)', onClick: () => openOverride(H, r, refresh) }) : null,
    ov && r.override ? btn({ label: 'Reset', icon: 'undo', variant: 'mini', title: 'Back to the generated values', onClick: () => resetOverride(H, r, refresh) }) : null,
    retire,
    btn({ label: 'Copy as custom card', icon: 'add', variant: 'mini', title: 'Start a new custom card from this one', onClick: () => openEditor(H, r, refresh, true) }),
    btn({ label: 'Card item', icon: 'add_item', variant: 'mini', title: 'An item that gives this card when used', onClick: () => openItemEditor(H, r, null, refresh) }),
  ]) : null;
  const items = (r.card_items || []).map(x => el('div', { class: 'cd-row' }, chip(String(x.item)), el('b', {}, x.name), el('span', { class: 'cd-small cd-grow' }, x.desc),
    H.canCards() ? btn({ label: 'Edit', variant: 'mini', onClick: () => openItemEditor(H, r, x, refresh) }) : null,
    H.canCards() ? btn({ label: 'Delete', variant: 'mini', onClick: () => removeBlock(H, 'item', x.item, x.name, refresh) }) : null));
  box.appendChild(card({ title: r.name, icon: 'dice', actions, body: el('div', {},
    el('div', { class: 'cd-preview' }, cardNode(r, { width: 220 }), el('div', { style: { flex: '1 1 200px' } },
      line('Id', String(r.id) + (r.src ? ' (game id ' + r.src + ')' : '')),
      line('Kind', r.kind + (r.title ? ', ' + r.title : '')),
      line('Rarity', RARITY[r.rarity] + ', level ' + r.level),
      line('Sides', 'N ' + r.sides[0] + ', E ' + r.sides[1] + ', S ' + r.sides[2] + ', W ' + r.sides[3] + ' (total ' + sum(r) + ')'),
      line('Skills', (r.skills || []).length ? (r.skills || []).map(s => el('div', { class: 'cd-small' }, SKILL_HELP[s] || s)) : 'none'),
      line('Players get it', (r.sources || []).join(', ') || 'only from a GM (/card give)'),
      r.activities && r.activities.length ? line('Activities', r.activities.join(', ')) : null,
      r.map_count ? line('Maps (' + r.map_count + ')', r.maps.join(', ')) : null,
      r.retired ? line('Retired', r.retired + (r.retire_designer ? ' (designer file: nobody can get it, owned copies stay playable)' : ' (cards.json)')) : null,
      r.override ? line('Changed', Object.keys(r.override).join(', ') + ' (generated: ' + r.base.name + ', ' + RARITY[r.base.rarity] + ' ' + r.base.element
        + ', sides ' + (r.base.sides || []).join(' ') + ', level ' + r.base.level + ')') : null,
      r.custom ? line('Designer file', (r.custom.art ? 'picture ' + r.custom.art : 'no picture (element picture)') + ', random drops '
        + (r.custom.loot ? 'on maps ' + r.custom.nodes.join(', ') : 'off') + (r.custom.balance === 'free' ? ', balance free' : '')) : null)),
    items.length ? el('div', {}, el('h4', {}, 'Card items (designer file)'), items) : null,
    el('h4', {}, 'Treasure Archive'),
    it ? el('div', {},
      line('Item', it.id + ' "' + it.name + '" (icon ' + it.icon + ')'),
      line('Archive sheet', 'Special Items > ' + sheet + ', order ' + it.order),
      line('Archive text', it.coll_desc),
      line('Item text', it.desc),
      line('Obtained', it.drops && it.drops.length ? 'dropped by its monster (' + it.rate + ' pct); picking it up gives the card'
        : 'mailed the first time a player gets the card'),
      r.legacy_items ? line('Old items', r.legacy_items.join(', ')) : null)
      : note('info', r.custom ? 'A custom card has no Treasure Archive item: players get it from its card items (used up when used) or from a GM.'
        : 'No archive item for this card.')) }));
}

async function refresh() {
  T.host.dropCards();
  await renderCards(T.node, T.host, true);
}

function importCsv() {
  const inp = el('input', { type: 'file', accept: '.csv,text/csv' });
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (f.size > 4 << 20) { toast('CSV too large (4 MB at most)', 'error'); return; }
    const text = await f.text();
    let res;
    try {
      res = await api.post(ROOT + '/cards/import-preview', { csv: text });
    } catch (e) { toast('CSV refused: ' + errMessage(e), 'error'); return; }
    showImport(res);
  };
  inp.click();
}

function showImport(res) {
  const box = el('div', { class: 'cd-modal' });
  const close = () => box.remove();
  const by = s => res.rows.filter(r => r.status === s);
  const todo = by('new').concat(by('changed'));
  const overs = by('override');
  const errs = by('error');
  const list = el('div', { class: 'cd-scroll', style: { maxHeight: '50vh' } }, el('table', { class: 'cd-table' },
    el('tr', {}, el('th', {}, 'Line'), el('th', {}, 'Id'), el('th', {}, 'Name'), el('th', {}, 'Result'), el('th', {}, 'Details')),
    res.rows.filter(r => r.status !== 'same').map(r => el('tr', {}, el('td', {}, String(r.line)), el('td', {}, String(r.id)), el('td', {}, r.name || ''),
      el('td', {}, badge(r.status === 'override' ? (r.reset ? 'back to generated' : 'game card changed') : r.status, r.status === 'error' ? 'error' : r.status === 'new' ? 'info' : 'warn')),
      el('td', { class: 'cd-small' }, (r.errors || []).join('; '))))));
  const checkBox = el('div', {});
  const body = { sha: res.sha, cards: todo.map(x => ({ id: x.id, create: x.status === 'new', fields: x.fields })),
    overrides: overs.map(x => ({ id: x.id, fields: x.fields || {} })) };
  const total = todo.length + overs.length;
  box.appendChild(el('div', { class: 'cd-modal-b' }, el('h3', {}, 'Import CSV into the designer file'),
    el('div', { class: 'cd-row' }, badge(by('new').length + ' new', 'info'), badge(by('changed').length + ' changed', 'warn'),
      overs.length ? badge(overs.length + ' game card(s) changed', 'warn') : null,
      badge(by('same').length + ' unchanged', 'neutral'), badge(errs.length + ' error(s)', errs.length ? 'error' : 'neutral')),
    errs.length ? note('err', 'Fix the lines in error first: nothing is imported while a line is wrong.') : null,
    overs.length ? note('warn', overs.length + ' game card(s) change: players who own them see the new values after the Deploy ([override] blocks, only the changed values).') : null,
    list, checkBox,
    el('div', { class: 'cd-row', style: { marginTop: '10px' } }, el('span', { class: 'cd-grow' }), btn({ label: 'Cancel', variant: 'ghost', onClick: close }),
      btn({ label: 'Import ' + total + ' card(s)', icon: 'import', disabled: !total || errs.length > 0, busyLabel: 'Checking…', onClick: async () => {
        const chk = await api.post(ROOT + '/designer/check', body).catch(e => ({ ok: false, errors: [errMessage(e)] }));
        put(checkBox, (chk.errors || []).map(x => note('err', x)), (chk.warnings || []).map(x => note('warn', x)));
        if (!chk.ok) return;
        try {
          await saveDesigner(T.host, T.data, body, total + ' card(s) imported');
          close();
          await refresh();
        } catch (e) { toast('Not saved: ' + errMessage(e), 'error'); }
      } }))));
  document.body.appendChild(box);
}
