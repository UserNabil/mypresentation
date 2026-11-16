/* ============================================================================
   pages/card_duel_rules.js — Card Duel page, Rules tab: every tunable rule of
   /opt/eden_cardduel/config.json of the active environment, with its meaning,
   its range, the default, a preview of the change and a save that backs the
   file up and asks the eden-cardduel service to reload it (card_duel server
   0.7.0+: running duels keep going); an older service is restarted instead.
   ============================================================================ */

import { el, clear } from '../core/dom.js';
import { btn, badge, card, emptyState, errorState } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { RARITY, note } from './card_duel_render.js';

const ROOT = '/api/cardduel';
const R = { view: null, edits: {}, host: null, node: null };

export async function renderRules(node, H) {
  R.host = H;
  R.node = node;
  clear(node).appendChild(emptyState({ title: 'Reading the rules of ' + H.env + '…', icon: 'settings' }));
  try {
    R.view = await H.rules(true);
  } catch (e) {
    clear(node).appendChild(errorState({ error: e, title: 'Cannot read config.json on ' + H.env, onRetry: () => renderRules(node, H) }));
    return;
  }
  R.edits = {};
  draw();
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function current(f) { return Object.prototype.hasOwnProperty.call(R.edits, f.key) ? R.edits[f.key] : f.value; }

function setEdit(f, v) {
  if (same(v, f.value)) delete R.edits[f.key];
  else R.edits[f.key] = v;
  drawBar();
}

function input(f) {
  const ro = !R.host.canRules();
  const v = current(f);
  if (f.type === 'bool') {
    const i = el('input', { type: 'checkbox', disabled: ro ? true : null });
    i.checked = !!v;
    i.onchange = () => setEdit(f, i.checked);
    return el('label', { class: 'cd-row' }, i, v ? 'yes' : 'no');
  }
  if (f.type === 'modes') {
    const box = el('div', { class: 'cd-row' });
    for (const m of R.view.modes_all) {
      const i = el('input', { type: 'checkbox', disabled: ro || m === 'friendly' ? true : null });
      i.checked = (v || []).includes(m) || m === 'friendly';
      i.onchange = () => {
        const sel = R.view.modes_all.filter(x => x === 'friendly' || (x === m ? i.checked : (current(f) || []).includes(x)));
        setEdit(f, sel);
      };
      box.appendChild(el('label', { class: 'cd-row' }, i, m));
    }
    return box;
  }
  if (f.type === 'weights') {
    const box = el('div', { class: 'cd-row' });
    (v || []).forEach((w, k) => {
      const i = el('input', { class: 'cd-in', type: 'number', min: '0', step: '1', value: String(w), style: { width: '70px' },
        title: RARITY[k], disabled: ro ? true : null });
      i.oninput = () => { const arr = (current(f) || []).slice(); arr[k] = Number(i.value); setEdit(f, arr); mark(i, f); };
      box.appendChild(el('label', { class: 'cd-small' }, RARITY[k], el('br'), i));
    });
    return box;
  }
  if (f.type === 'ints') {
    const i = el('input', { class: 'cd-in', type: 'text', value: (v || []).join(', '), style: { width: '200px' }, disabled: ro ? true : null });
    i.oninput = () => { setEdit(f, i.value.split(/[ ,;]+/).filter(Boolean).map(Number)); mark(i, f); };
    return i;
  }
  const i = el('input', { class: 'cd-in', type: f.type === 'text' ? 'text' : 'number', value: String(v == null ? '' : v),
    min: f.min == null ? null : String(f.min), max: f.max == null || f.type === 'text' ? null : String(f.max),
    step: f.type === 'float' ? '0.01' : '1', style: { width: f.type === 'text' ? '200px' : '110px' }, disabled: ro ? true : null });
  i.oninput = () => { setEdit(f, f.type === 'text' ? i.value : (i.value === '' ? null : Number(i.value))); mark(i, f); };
  mark(i, f);
  return i;
}

function mark(i, f) {
  const v = current(f);
  let bad = false;
  if (f.type === 'int' || f.type === 'float') {
    bad = v == null || Number.isNaN(v) || (f.type === 'int' && !Number.isInteger(v)) || v < f.min || v > f.max;
  }
  i.classList.toggle('bad', bad);
  i.classList.toggle('changed', !bad && !same(v, f.value));
}

function fmt(v) { return Array.isArray(v) ? v.join(', ') : (typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)); }

function draw() {
  const node = R.node;
  const v = R.view;
  clear(node);
  node.appendChild(el('div', { id: 'cd-rules-bar' }));
  if (!v.exists) node.appendChild(note('warn', 'No config.json on ' + v.env + ' yet: the service runs on its defaults. Saving creates the file.'));
  if (v.service !== 'active') node.appendChild(note('warn', 'The eden-cardduel service is ' + (v.service || 'unknown') + ': a save writes the file, the service reads it when it starts.'));
  const groups = [];
  for (const f of v.fields) if (!groups.includes(f.group)) groups.push(f.group);
  for (const g of groups) {
    const rows = el('div', { class: 'cd-fields' });
    for (const f of v.fields.filter(x => x.group === g)) {
      const range = f.type === 'int' || f.type === 'float' ? ' (' + f.min + ' to ' + f.max + ')' : '';
      rows.appendChild(el('div', { class: 'cd-field' },
        el('div', {}, el('label', {}, f.label), el('div', { class: 'cd-small' }, f.key + range)),
        input(f),
        el('div', { class: 'cd-small' }, f.help, el('br'), 'Default: ' + fmt(f.default) + (f.set ? '' : ' (not set in config.json, default used)'))));
    }
    node.appendChild(card({ title: g, icon: 'settings', body: rows }));
  }
  node.appendChild(card({ title: 'Fixed values (changed by the card_duel developers only)', icon: 'lock', body: el('div', { class: 'cd-row' },
    v.read_only.map(r => badge(r.key + ' = ' + fmt(r.value), 'neutral'))) }));
  node.appendChild(card({ title: 'Backups of config.json on ' + v.env, icon: 'snapshots', body: v.backups && v.backups.length
    ? el('div', { class: 'cd-small' }, 'Each save keeps the previous file in /var/lib/eden_cardduel/config_backups/ (last 30): ', v.backups.join(', '))
    : el('div', { class: 'cd-small' }, 'No save from this page yet.') }));
  drawBar();
}

function drawBar() {
  const bar = R.node.querySelector('#cd-rules-bar');
  if (!bar) return;
  clear(bar);
  const n = Object.keys(R.edits).length;
  bar.appendChild(el('div', { class: 'cd-row', style: { margin: '0 0 10px' } },
    badge(n ? n + ' change(s) not saved' : 'No change', n ? 'warn' : 'neutral'),
    R.view.duels ? badge(R.view.duels + ' duel(s) in progress: they keep their rules, new duels use the saved ones', 'info') : null,
    el('span', { class: 'cd-grow' }),
    btn({ label: 'Undo changes', icon: 'undo', variant: 'ghost', disabled: !n, onClick: () => { R.edits = {}; draw(); } }),
    btn({ label: 'Try in the simulator', icon: 'launch_game', variant: 'ghost', title: 'Play matches with these values before saving',
      onClick: () => { R.host.simRules = simRules(); R.host.go('sim'); } }),
    R.host.canRules() ? btn({ label: 'Review and save', icon: 'save', disabled: !n, busyLabel: 'Checking…', onClick: review }) : null));
}

function simRules() {
  const out = {};
  for (const f of R.view.fields) if (f.key.startsWith('rules.')) out[f.key.slice(6)] = current(f);
  const hand = R.view.fields.find(f => f.key === 'hand');
  return { rules: out, size: hand ? current(hand) : 7 };
}

async function review() {
  let d;
  try {
    d = await api.post(ROOT + '/rules/preview', { changes: R.edits });
  } catch (e) {
    toast('Not valid: ' + errMessage(e), 'error');
    return;
  }
  if (!d.diff.length) { toast('Nothing to save: the values are the ones of the server', 'info'); return; }
  const box = el('div', { class: 'cd-modal' });
  const table = el('table', { class: 'cd-diff' }, el('tr', {}, el('th', {}, 'Rule'), el('th', {}, 'Now on ' + d.env), el('th', {}, 'After'), el('th', {}, 'Default')),
    d.diff.map(x => el('tr', {}, el('td', {}, x.label), el('td', {}, fmt(x.before)), el('td', { class: 'cd-good' }, fmt(x.after)), el('td', { class: 'cd-small' }, fmt(x.default)))));
  const close = () => box.remove();
  box.appendChild(el('div', { class: 'cd-modal-b' },
    el('h3', {}, 'Save the rules on ' + d.env.toUpperCase()), table,
    d.warnings.map(w => note('warn', w)),
    note('info', 'The tool keeps a copy of the current config.json, writes the new one and asks the eden-cardduel service of ' + d.env
      + ' to reload it without stopping: the ' + (d.duels || 0) + ' duel(s) in progress finish with their rules, the next duels use the new ones. '
      + 'A service older than card_duel 0.7.0, or one that does not confirm the reload, is restarted instead (running duels are then cancelled).'),
    d.env !== 'dev' ? note('warn', 'You are not on dev: you will be asked to type ' + d.env + '.') : null,
    el('div', { class: 'cd-row' }, el('span', { class: 'cd-grow' }),
      btn({ label: 'Cancel', variant: 'ghost', onClick: close }),
      btn({ label: 'Save on ' + d.env, icon: 'save', busyLabel: 'Saving and applying…', onClick: async () => {
        const confirm = await R.host.confirmEnv('save ' + d.diff.length + ' rule change(s)');
        if (confirm == null) return;
        try {
          const res = await api.post(ROOT + '/rules/save', { env: R.host.env, changes: R.edits, sha: R.view.sha, confirm });
          close();
          const how = res.reloaded ? ', applied without restart (running duels kept)'
            : res.restarted ? ', service restarted (' + res.active + ')' + (res.why ? ': ' + res.why : '') : ', service ' + res.active;
          toast('Rules saved on ' + d.env + how, res.reloaded || (res.active === 'active' && res.restarted !== false) || res.restarted === null ? 'ok' : 'warn');
          R.host.dropRules();
          await renderRules(R.node, R.host);
          if (res.log) R.node.prepend(note('info', el('pre', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, 'Service log after the save:\n' + res.log)));
        } catch (e) {
          toast('Not saved: ' + errMessage(e), 'error');
        }
      } }))));
  document.body.appendChild(box);
}
