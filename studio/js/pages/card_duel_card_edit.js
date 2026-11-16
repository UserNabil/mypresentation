/* ============================================================================
   pages/card_duel_card_edit.js — Card Duel page: create / edit / duplicate /
   delete a custom card and its card items in the designer file of card_duel
   (designer/custom_cards.ini). Every change is checked by the parser of the
   feature (server/cardduel_custom.py) before it is written. A tool without the
   ee_admin source (feature_ee copy) downloads the changed file instead.
   ============================================================================ */

import { el, clear } from '../core/dom.js';
import { btn, badge } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { uiConfirm } from '../ui/dialogs.js';
import { RARITY, SKILL_HELP, ELEMENT_BEATS, cardNode, note, put } from './card_duel_render.js';

const ROOT = '/api/cardduel';
const DIRS = ['North', 'East', 'South', 'West'];
const KINDS = ['monster', 'boss', 'npc', 'place'];

/** Sends a change of the designer file: written on the admin PC, downloaded as a .zip elsewhere. */
export async function saveDesigner(H, data, body, what) {
  const d = data.designer || {};
  const b = Object.assign({ sha: d.sha }, body);
  if (d.writable) {
    const res = await api.post(ROOT + '/designer/save', b);
    toast(what + ' saved in custom_cards.ini' + (res.warnings && res.warnings.length ? ' (' + res.warnings.length + ' note(s))' : ''), 'ok');
    return res;
  }
  const res = await api.post(ROOT + '/designer/zip', b);
  const a = el('a', { href: 'data:application/zip;base64,' + res.zip, download: res.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(what + ': ' + res.name + ' downloaded, send it to the admin (nothing changed on this PC)', 'info', 6000);
  return res;
}

function modal(title, H, data, ...body) {
  const box = el('div', { class: 'cd-modal' });
  const d = data.designer || {};
  box.appendChild(el('div', { class: 'cd-modal-b' },
    el('div', { class: 'cd-row' }, el('h3', { style: { margin: 0 } }, title),
      d.writable ? badge('Saved into designer/custom_cards.ini', 'ok') : badge('Downloaded as a file for the admin', 'warn')), ...body));
  document.body.appendChild(box);
  return box;
}

export async function openEditor(H, row, onDone, duplicate) {
  let data;
  try { data = await H.cards(); } catch (e) { toast(errMessage(e), 'error'); return; }
  const lim = (data.designer && data.designer.limits) || {};
  const isNew = !row || !row.custom || !!duplicate;
  const c = row ? { name: row.name, element: row.element, rarity: row.rarity, sides: row.sides.slice(), skills: (row.skills || []).slice(),
    level: Math.max(1, Math.min(lim.level_max || 120, row.level || 1)), kind: KINDS.includes(row.kind) ? row.kind : 'monster',
    loot: !!(row.custom && row.custom.loot), nodes: (row.custom && row.custom.nodes || []).join(', '),
    balance: (row.custom && row.custom.balance) || 'normal', art: (row.custom && row.custom.art) || '' }
    : { name: '', element: 'Fire', rarity: 0, sides: [4, 4, 4, 3], skills: [], level: 1, kind: 'monster', loot: false, nodes: '', balance: 'normal', art: '' };
  let id = isNew ? data.next_id : row.id;
  if (isNew && row) { c.name = (row.name + (row.custom ? ' II' : '')).slice(0, 40); c.art = duplicate && row.custom ? c.art : ''; }
  const E = { art: null, artUrl: null, check: null, timer: 0 };
  const preview = el('div', {});
  const msgs = el('div', {});
  const field = (label, input, hint) => el('div', { class: 'cd-field', style: { gridTemplateColumns: '150px minmax(0,1fr)' } },
    el('label', {}, label), el('div', {}, input, hint ? el('div', { class: 'cd-small' }, hint) : null));
  const num = (get, set, lo, hi, width) => {
    const i = el('input', { class: 'cd-in', type: 'number', min: String(lo), max: String(hi), step: '1', value: String(get()), style: { width: width || '70px' } });
    i.oninput = () => { set(Number(i.value)); changed(); };
    return i;
  };
  const sel = (get, set, opts) => {
    const s = el('select', { class: 'cd-in' }, opts.map(([v, t]) => el('option', { value: String(v) }, t)));
    s.value = String(get());
    s.onchange = () => { set(s.value); changed(); };
    return s;
  };
  const text = (key, max, width, ph) => {
    const i = el('input', { class: 'cd-in', type: 'text', value: c[key] || '', maxlength: String(max), placeholder: ph || '', style: { width: width || '260px' } });
    i.oninput = () => { c[key] = i.value; changed(); };
    return i;
  };
  const idIn = num(() => id, v => { id = v; }, (lim.card_ids || [4000001])[0], (lim.card_ids || [0, 4099999])[1], '110px');
  if (!isNew) idIn.disabled = true;
  const side = k => el('label', { class: 'cd-small', style: { textAlign: 'center' } }, DIRS[k], el('br'), num(() => c.sides[k], v => { c.sides[k] = v; }, 1, 10, '60px'));
  const sides = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 76px)', gap: '4px', justifyItems: 'center' } },
    el('span'), side(0), el('span'), side(3), el('span', { class: 'cd-small' }, 'A = 10'), side(1), el('span'), side(2), el('span'));
  const skills = el('div', { class: 'cd-skills' }, data.skills.map(s => {
    const i = el('input', { type: 'checkbox' });
    i.checked = c.skills.includes(s);
    i.onchange = () => { c.skills = data.skills.filter(x => (x === s ? i.checked : c.skills.includes(x))); changed(); };
    return el('label', { title: SKILL_HELP[s] }, i, s);
  }));
  const loot = el('input', { type: 'checkbox' });
  loot.checked = c.loot;
  loot.onchange = () => { c.loot = loot.checked; changed(); };
  const drop = el('div', { class: 'cd-drop' }, c.art ? 'Picture ' + c.art + '. Drop or click to replace it.'
    : 'Drop a PNG here or click (any size from 106 x 77, 2 MB at most). It is cropped to the card window (106 x 77), keep the subject in the middle. Without a picture the card shows its element.');
  drop.onclick = () => { const f = el('input', { type: 'file', accept: 'image/png' }); f.onchange = () => f.files[0] && loadArt(f.files[0]); f.click(); };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) loadArt(f); };
  const band = el('div', { class: 'cd-small' });
  const fields = el('div', { class: 'cd-fields' },
    field('Card id', idIn, isNew ? 'Custom cards use ' + (lim.card_ids || []).join(' to ') + '. Never reuse an id: a player who owns the card keeps it.' : 'The id never changes.'),
    field('Name', text('name', lim.name_max || 40), 'Plain English, ' + (lim.name_max || 40) + ' characters at most, no |.'),
    field('Element', sel(() => c.element, v => { c.element = v; }, data.elements.map(k => [k, k + ' (beats ' + ELEMENT_BEATS[k] + ')']))),
    field('Rarity', sel(() => c.rarity, v => { c.rarity = Number(v); }, RARITY.map((r, k) => [k, r])), band),
    field('Sides', sides, 'Each side fights the facing side of the neighbour card: higher captures it.'),
    field('Skills', skills, 'Hover a skill for its effect.'),
    field('Level', num(() => c.level, v => { c.level = v; }, 1, lim.level_max || 120), 'Shown on the card; +1 balance point per 30 levels (3 at most).'),
    field('Type on the card', sel(() => c.kind, v => { c.kind = v; }, KINDS.map(k => [k, k]))),
    field('Random drops', el('div', {}, el('label', { class: 'cd-row' }, loot, 'Can also drop at random on these maps:'), text('nodes', 200, '260px', 'map ids, for example 1, 501')),
      'Off: the card only comes from its card item or a GM (/card give).'),
    field('Balance', sel(() => c.balance, v => { c.balance = v; }, [['normal', 'normal (warn when stronger than its rarity)'], ['free', 'free (no warning)']])),
    field('Picture', drop));

  function fieldsOut() {
    const f = { name: c.name.trim(), element: c.element, rarity: RARITY[c.rarity].toLowerCase(), sides: c.sides, skills: c.skills,
      level: c.level, kind: c.kind, loot: c.loot, balance: c.balance === 'normal' ? '' : c.balance };
    if (c.loot) f.nodes = c.nodes;
    if (c.art && !E.art) f.art = c.art;
    return f;
  }
  function body() {
    const card = { id, create: isNew, fields: fieldsOut() };
    if (E.art) card.art_png = E.art;
    return { cards: [card] };
  }
  function drawPreview() {
    const r = { id, name: c.name || 'New card', element: c.element, rarity: c.rarity, sides: c.sides, skills: c.skills, level: c.level, kind: c.kind,
      art_url: E.artUrl || (c.art && row && row.art_url) || null };
    put(preview, cardNode(r, { width: 260 }));
    const lv = Math.min(3, Math.floor(c.level / 30));
    const top = (lim.budget || [15, 18, 21, 24, 27, 30])[c.rarity] + lv;
    const s = c.sides.reduce((a, x) => a + (Number(x) || 0), 0);
    put(band, 'Balance guide: ' + RARITY[c.rarity] + ' level ' + c.level + ' = ' + top + ' points, '
      + (lim.max_skills || [0, 1, 1, 2, 2, 3])[c.rarity] + ' skill(s). This card: ' + s + ' points, ' + c.skills.length + ' skill(s).');
    band.className = 'cd-small' + (s > top ? ' cd-bad' : '');
  }
  function changed() { drawPreview(); clearTimeout(E.timer); E.timer = setTimeout(validate, 300); }
  async function validate() {
    try { E.check = await api.post(ROOT + '/designer/check', Object.assign({ sha: data.designer.sha }, body())); }
    catch (e) { E.check = { ok: false, errors: [errMessage(e)], warnings: [] }; }
    put(msgs, E.check.errors.length ? E.check.errors.map(x => note('err', x)) : note('ok', 'The card_duel checker accepts this card.'),
      (E.check.warnings || []).map(x => note('warn', x)));
  }
  async function loadArt(file) {
    if (file.size > 2 << 20) { toast('The picture weighs ' + Math.round(file.size / 1024) + ' KB (2048 KB at most)', 'error'); return; }
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    try {
      const info = await api.post(ROOT + '/cards/art-check', { png: b64 });
      E.art = b64;
      E.artUrl = 'data:image/png;base64,' + b64;
      put(drop, 'Picture ' + info.width + ' x ' + info.height + ' accepted' + (info.crop ? ' (its shape differs from the card window: the sides are cut, see the preview)' : '') + '. Click to change it.');
      drawPreview();
    } catch (e) { toast(errMessage(e), 'error'); }
  }
  const box = modal(isNew ? (row ? 'New custom card from ' + row.name : 'New custom card') : 'Edit ' + row.name, H, data,
    el('div', { class: 'cd-grid2', style: { marginTop: '10px' } }, fields, el('div', {}, preview, msgs)),
    el('div', { class: 'cd-row', style: { marginTop: '10px' } }, el('span', { class: 'cd-grow' }),
      btn({ label: 'Cancel', variant: 'ghost', onClick: () => box.remove() }),
      btn({ label: 'Save', icon: 'save', busyLabel: 'Saving…', onClick: async () => {
        await validate();
        if (E.check && !E.check.ok) { toast('Fix the errors first', 'error'); return; }
        try { await saveDesigner(H, data, body(), 'Card ' + c.name); box.remove(); if (onDone) await onDone(); }
        catch (e) { toast('Not saved: ' + errMessage(e), 'error'); }
      } })));
  changed();
}

export async function openItemEditor(H, card, item, onDone) {
  let data;
  try { data = await H.cards(); } catch (e) { toast(errMessage(e), 'error'); return; }
  const lim = (data.designer && data.designer.limits) || {};
  const isNew = !item;
  const qName = code => { const k = ['', '2', '4', '6', '3', '5'].indexOf(String(code || '')); return k > 0 ? RARITY[k].toLowerCase() : (k === 0 && code === '' ? '' : 'common'); };
  const f = item ? { name: item.name, description: item.desc, icon: item.icon, quality: qName(item.quality), template: item.template || '' }
    : { name: 'Card: ' + card.name, description: 'Use it to add the ' + card.name + ' card (' + RARITY[card.rarity] + ', ' + card.element
      + ') to your duel card collection. The item is used up.', icon: '', quality: '', template: '' };
  let id = item ? item.item : data.next_item;
  const msgs = el('div', {});
  const inp = (k, max, w) => { const i = el('input', { class: 'cd-in', type: 'text', value: String(f[k] || ''), maxlength: String(max), style: { width: w || '100%' } }); i.oninput = () => { f[k] = i.value; }; return i; };
  const idIn = el('input', { class: 'cd-in', type: 'number', value: String(id), style: { width: '100px' }, disabled: isNew ? null : true });
  idIn.oninput = () => { id = Number(idIn.value); };
  const q = el('select', { class: 'cd-in' }, [['', 'rarity of the card']].concat(RARITY.map(r => [r.toLowerCase(), r])).map(([v, t]) => el('option', { value: v }, t)));
  q.value = f.quality;
  q.onchange = () => { f.quality = q.value; };
  const row = (l, i, h) => el('div', { class: 'cd-field', style: { gridTemplateColumns: '130px minmax(0,1fr)' } }, el('label', {}, l), el('div', {}, i, h ? el('div', { class: 'cd-small' }, h) : null));
  const body = () => ({ items: [{ id, create: isNew, fields: { card: card.id, name: f.name, description: f.description, icon: f.icon, quality: f.quality, template: f.template } }] });
  const box = modal((isNew ? 'New card item for ' : 'Edit card item of ') + card.name, H, data,
    note('info', 'A card item is an item that, when a player uses it, is used up and adds ' + card.name + ' to the card collection. Players get it like any item (GM, quest reward, shop, drop table).'),
    el('div', { class: 'cd-fields' },
      row('Item id', idIn, 'Card items use ' + (lim.item_ids || []).join(' to ') + '. Never reuse one.'),
      row('Name', inp('name', lim.item_name_max || 60)), row('Description', inp('description', lim.desc_max || 250), 'Tooltip, ' + (lim.desc_max || 250) + ' characters at most.'),
      row('Icon', inp('icon', 16, '120px'), 'Optional icon code of UI\\itemicon; empty = the element badge of the card.'),
      row('Colour', q), row('Template item', inp('template', 6, '120px'), 'Optional usable item copied for the new item (default ' + (lim.template || 34848) + ', Red Star Firework). To change it later, use a new item id.')),
    msgs,
    el('div', { class: 'cd-row' }, el('span', { class: 'cd-grow' }), btn({ label: 'Cancel', variant: 'ghost', onClick: () => box.remove() }),
      btn({ label: 'Save', icon: 'save', busyLabel: 'Saving…', onClick: async () => {
        const chk = await api.post(ROOT + '/designer/check', Object.assign({ sha: data.designer.sha }, body())).catch(e => ({ ok: false, errors: [errMessage(e)] }));
        put(msgs, (chk.errors || []).map(x => note('err', x)), (chk.warnings || []).map(x => note('warn', x)));
        if (!chk.ok) return;
        try { await saveDesigner(H, data, body(), 'Card item ' + f.name); box.remove(); if (onDone) await onDone(); }
        catch (e) { toast('Not saved: ' + errMessage(e), 'error'); }
      } })));
}

export async function removeBlock(H, kind, id, label, onDone) {
  let data;
  try { data = await H.cards(); } catch (e) { toast(errMessage(e), 'error'); return; }
  const msg = kind === 'card' ? 'Delete the custom card ' + label + '? Copies players own become unknown cards (they disappear from collections and decks). '
    + 'To stop new copies while keeping the owned ones playable, use Retire instead. Its card items stop giving it (they are still used up).'
    : 'Delete the card item ' + label + '? Copies players already have are used up without giving the card.';
  if (!await uiConfirm(msg, 'Delete ' + label, 'Delete')) return;
  try { await saveDesigner(H, data, { delete: [{ kind, id }] }, label + ' deleted'); if (onDone) await onDone(); }
  catch (e) { toast('Not deleted: ' + errMessage(e), 'error'); }
}
