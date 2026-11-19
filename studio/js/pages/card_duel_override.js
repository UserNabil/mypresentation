/* ============================================================================
   pages/card_duel_override.js — Card Duel page: change or retire a GENERATED
   card (monster, boss, NPC, place of server/cards.json) through the designer
   file of card_duel: [override <id>] blocks (only the changed values are
   written) and [retire <id>] blocks (the card can no longer be obtained, owned
   copies stay playable). Needs card_duel server 0.7.0 in the feature tree.
   ============================================================================ */

import { el } from '../core/dom.js';
import { btn, badge } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { uiConfirm, uiPrompt } from '../ui/dialogs.js';
import { RARITY, SKILL_HELP, ELEMENT_BEATS, cardNode, note, put } from './card_duel_render.js';
import { saveDesigner } from './card_duel_card_edit.js';

const ROOT = '/api/cardduel';
const DIRS = ['North', 'East', 'South', 'West'];
const VALUES = ['name', 'element', 'rarity', 'sides', 'skills', 'level'];

async function maxSide(H) {
  try {
    const v = await H.rules();
    const f = (v.fields || []).find(x => x.key === 'rules.max_side');
    return f ? Number(f.value) : 10;
  } catch (_) { return null; }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function openOverride(H, row, onDone) {
  let data;
  try { data = await H.cards(); } catch (e) { toast(errMessage(e), 'error'); return; }
  if (!data.overridable) { toast('This card_duel version cannot change game cards: use Pull latest features (card_duel 0.7.0)', 'warn'); return; }
  const base = row.base || { name: row.name, element: row.element, rarity: row.rarity, sides: row.sides.slice(), skills: (row.skills || []).slice(), level: row.level, nodes: (row.nodes || []).slice() };
  const o = row.override || {};
  const c = { name: row.name, element: row.element, rarity: row.rarity, sides: row.sides.slice(), skills: (row.skills || []).slice(),
    level: row.level, loot: o.loot === true ? 'yes' : o.loot === false ? 'no' : '', nodes: (o.nodes || []).join(', '),
    drop: o.drop === false ? 'no' : '', rate: o.drop_rate != null ? String(o.drop_rate) : '', balance: o.balance || 'normal', art: o.art || '' };
  const E = { art: null, artUrl: null, check: null, timer: 0, cap: null };
  const preview = el('div', {});
  const msgs = el('div', {});
  const capNote = el('div', {});
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
  const side = k => el('label', { class: 'cd-small', style: { textAlign: 'center' } }, DIRS[k], el('br'), num(() => c.sides[k], v => { c.sides[k] = v; }, 1, 10, '60px'));
  const sides = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 76px)', gap: '4px', justifyItems: 'center' } },
    el('span'), side(0), el('span'), side(3), el('span', { class: 'cd-small' }, 'A = 10'), side(1), el('span'), side(2), el('span'));
  const skills = el('div', { class: 'cd-skills' }, data.skills.map(s => {
    const i = el('input', { type: 'checkbox' });
    i.checked = c.skills.includes(s);
    i.onchange = () => { c.skills = data.skills.filter(x => (x === s ? i.checked : c.skills.includes(x))); changed(); };
    return el('label', { title: SKILL_HELP[s] }, i, s);
  }));
  const drop = el('div', { class: 'cd-drop' }, c.art ? 'Picture ' + c.art + '. Drop or click to replace it.'
    : 'Optional: drop a PNG here or click to replace the painted portrait (any size from 106 x 77, cropped to the card window).');
  drop.onclick = () => { const f = el('input', { type: 'file', accept: 'image/png' }); f.onchange = () => f.files[0] && loadArt(f.files[0]); f.click(); };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) loadArt(f); };
  const it = row.item;
  const gen = 'Generated: ';
  const fields = el('div', { class: 'cd-fields' },
    field('Name', text('name', 40), gen + base.name + '. Its item becomes "Card: <name>".'),
    field('Element', sel(() => c.element, v => { c.element = v; }, data.elements.map(k => [k, k + ' (beats ' + ELEMENT_BEATS[k] + ')'])), gen + base.element),
    field('Rarity', sel(() => c.rarity, v => { c.rarity = Number(v); }, RARITY.map((r, k) => [k, r])), gen + RARITY[base.rarity]),
    field('Sides', el('div', {}, sides, capNote), gen + (base.sides || []).join(' ')),
    field('Skills', skills, gen + ((base.skills || []).join(', ') || 'none')),
    field('Level', num(() => c.level, v => { c.level = v; }, 1, 120), gen + base.level),
    field('Random map drops', el('div', {}, sel(() => c.loot, v => { c.loot = v; }, [['', 'as generated'], ['yes', 'yes (bosses included)'], ['no', 'never']]), ' ',
      text('nodes', 200, '220px', 'maps, empty = generated list')), 'Generated maps: ' + ((base.nodes || []).join(', ') || 'none')),
    it ? field('Card item drop', el('div', {}, sel(() => c.drop, v => { c.drop = v; }, [['', 'as generated'], ['no', 'no drop (mailed at the first card)']]), ' ',
      text('rate', 6, '80px', String(it.rate || ''))), 'Item ' + it.id + (base && it.drops && it.drops.length ? ', dropped by its monster' : ', mailed') + '. Rate in percent, empty = generated.') : null,
    field('Balance', sel(() => c.balance, v => { c.balance = v; }, [['normal', 'normal (warn when stronger than its rarity)'], ['free', 'free (no warning)']])),
    field('Picture', drop));

  function fieldsOut() {
    const f = {};
    for (const k of VALUES) if (!same(c[k], base[k])) f[k] = k === 'rarity' ? RARITY[c.rarity].toLowerCase() : (k === 'name' ? c.name.trim() : c[k]);
    if (c.loot) f.loot = c.loot === 'yes';
    if (c.nodes.trim()) f.nodes = c.nodes.trim();
    if (c.drop) f.drop = false;
    if (c.rate.trim()) f.drop_rate = c.rate.trim();
    if (c.art && !E.art) f.art = c.art;
    if (Object.keys(f).length && c.balance === 'free') f.balance = 'free';
    return f;
  }
  function body() {
    const one = { id: row.id, fields: fieldsOut() };
    if (E.art) one.art_png = E.art;
    return { overrides: [one] };
  }
  function drawPreview() {
    put(preview, cardNode({ id: row.id, name: c.name, element: c.element, rarity: c.rarity, sides: c.sides, skills: c.skills, level: c.level, kind: row.kind,
      art_url: E.artUrl || row.art_url || null }, { width: 260 }));
    const over = E.cap != null ? c.sides.filter(x => x > E.cap).length : 0;
    put(capNote, over ? note('warn', 'Rules of ' + H.env + ': sides count at most ' + E.cap + ' in a duel (rules.max_side). '
      + over + ' side(s) above it play as ' + E.cap + '.') : null);
  }
  function changed() { drawPreview(); clearTimeout(E.timer); E.timer = setTimeout(validate, 300); }
  async function validate() {
    const b = body();
    if (!Object.keys(b.overrides[0].fields).length && !b.overrides[0].art_png) {
      E.check = { ok: true, errors: [], warnings: [], empty: true };
      put(msgs, note('info', row.override ? 'Every value is back to the generated one: saving removes the override.' : 'Nothing changed yet.'));
      return;
    }
    try { E.check = await api.post(ROOT + '/designer/check', Object.assign({ sha: data.designer.sha }, b)); }
    catch (e) { E.check = { ok: false, errors: [errMessage(e)], warnings: [] }; }
    put(msgs, E.check.errors.length ? E.check.errors.map(x => note('err', x)) : note('ok', 'The card_duel checker accepts this change.'),
      (E.check.warnings || []).map(x => note('warn', x)));
  }
  async function loadArt(file) {
    if (file.size > 2 << 20) { toast('The picture weighs ' + Math.round(file.size / 1024) + ' KB (2048 KB at most)', 'warn'); return; }
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    try {
      const info = await api.post(ROOT + '/cards/art-check', { png: b64 });
      E.art = b64;
      E.artUrl = 'data:image/png;base64,' + b64;
      put(drop, 'Picture ' + info.width + ' x ' + info.height + ' accepted. Click to change it.');
      changed();
    } catch (e) { toast(errMessage(e), 'error'); }
  }
  const box = el('div', { class: 'cd-modal' });
  box.appendChild(el('div', { class: 'cd-modal-b' },
    el('div', { class: 'cd-row' }, el('h3', { style: { margin: 0 } }, 'Change the game card ' + base.name + ' (' + row.id + ')'),
      data.designer && data.designer.writable ? badge('Saved into designer/custom_cards.ini', 'ok') : badge('Downloaded as a file for the admin', 'warn')),
    note('warn', 'This card comes from the game data and players may already own it: every copy they own changes too (collections, decks, '
      + 'duels). Nobody gains or loses a copy. Only the values you change are written ([override ' + row.id + ']); the type (' + row.kind
      + ') cannot change. Players see it after the card_duel push and Deploy; a new name or picture also needs the client data install and a repack.'),
    el('div', { class: 'cd-grid2', style: { marginTop: '10px' } }, fields, el('div', {}, preview, msgs)),
    el('div', { class: 'cd-row', style: { marginTop: '10px' } }, el('span', { class: 'cd-grow' }),
      btn({ label: 'Cancel', variant: 'ghost', onClick: () => box.remove() }),
      btn({ label: 'Save', icon: 'save', busyLabel: 'Saving…', onClick: async () => {
        await validate();
        if (E.check && !E.check.ok) { toast('Fix the errors first', 'warn'); return; }
        if (E.check && E.check.empty && !row.override) { toast('Nothing to save', 'info'); return; }
        try { await saveDesigner(H, data, body(), 'Card ' + base.name); box.remove(); if (onDone) await onDone(); }
        catch (e) { toast('Not saved: ' + errMessage(e), 'error'); }
      } }))));
  document.body.appendChild(box);
  changed();
  maxSide(H).then(v => { E.cap = v != null && v < 10 ? v : null; drawPreview(); });
}

export async function resetOverride(H, row, onDone) {
  let data;
  try { data = await H.cards(); } catch (e) { toast(errMessage(e), 'error'); return; }
  if (!await uiConfirm('Give ' + row.name + ' back its generated values (' + (row.base ? row.base.name : row.name) + ')? Every copy players own changes back after the next Deploy.',
    'Reset ' + row.name, 'Reset')) return;
  try { await saveDesigner(H, data, { delete: [{ kind: 'override', id: row.id }] }, row.name + ' reset'); if (onDone) await onDone(); }
  catch (e) { toast('Not saved: ' + errMessage(e), 'error'); }
}

export async function retireCard(H, row, onDone) {
  let data;
  try { data = await H.cards(); } catch (e) { toast(errMessage(e), 'error'); return; }
  if (!data.overridable) { toast('This card_duel version cannot retire cards: use Pull latest features (card_duel 0.7.0)', 'warn'); return; }
  if ((row.card_items || []).length) {
    toast('Delete its card items first (' + row.card_items.map(x => x.item).join(', ') + '): a used item of a retired card would give nothing', 'warn');
    return;
  }
  const reason = await uiPrompt('Retire ' + row.name + ' (' + row.id + ')? From the next Deploy nobody can get it any more: no loot, no item drop or pickup, '
    + 'no activity reward, no GM give, no starter. Copies players already own STAY in their collection and stay playable (decks, duels; '
    + 'staked duels only move existing copies). Its "Card:" item leaves the monster drop tables but the item rows stay. Reason (optional, for the logs):',
  'Retire ' + row.name, '');
  if (reason == null) return;
  try { await saveDesigner(H, data, { retire: [{ id: row.id, reason: reason.trim() }] }, row.name + ' retired'); if (onDone) await onDone(); }
  catch (e) { toast('Not retired: ' + errMessage(e), 'error'); }
}

export async function unretireCard(H, row, onDone) {
  let data;
  try { data = await H.cards(); } catch (e) { toast(errMessage(e), 'error'); return; }
  if (!await uiConfirm('Make ' + row.name + ' obtainable again (its [retire] block is removed)? After the next Deploy it drops and can be given like before.',
    'Un-retire ' + row.name, 'Un-retire')) return;
  try { await saveDesigner(H, data, { delete: [{ kind: 'retire', id: row.id }] }, row.name + ' obtainable again'); if (onDone) await onDone(); }
  catch (e) { toast('Not saved: ' + errMessage(e), 'error'); }
}
