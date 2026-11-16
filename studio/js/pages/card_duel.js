/* ============================================================================
   pages/card_duel.js — Card Duel: everything about the Eden Duel Cards feature
   (features/card_duel) on the ACTIVE environment of the tool.
   Tabs: Overview (this file), Rules (card_duel_rules.js), Cards
   (card_duel_cards.js + card_duel_card_edit.js), Archive (card_duel_archive.js),
   Simulator (card_duel_sim.js), Help (card_duel_help.js).
   Everyone signed in reads and simulates (cardduel.view, GS); GM edit cards and
   rules (cardduel.cards / cardduel.rules); production also needs SA.
   Backend: card_duel_admin.py (/api/cardduel/*).
   ============================================================================ */

import { $, el, clear } from '../core/dom.js';
import { icon, btn, badge, card, emptyState, errorState } from '../components.js';
import { api } from '../core/api.js';
import { uiPrompt } from '../ui/dialogs.js';
import { RARITY, note } from './card_duel_render.js';
import { renderRules } from './card_duel_rules.js';
import { renderCards } from './card_duel_cards.js';
import { renderArchive } from './card_duel_archive.js';
import { renderSim } from './card_duel_sim.js';
import { renderHelp } from './card_duel_help.js';

const ROOT = '/api/cardduel';
const TABS = [['overview', 'Overview', 'home'], ['rules', 'Rules', 'settings'], ['cards', 'Cards', 'dice'],
  ['archive', 'Archive', 'treasure_archive'], ['sim', 'Simulator', 'launch_game'], ['help', 'Help', 'info']];
const S = { host: null, ctx: null, tab: 'overview', cards: null, rules: null };

export function initCardDuel(host) { S.host = host; }

function can(action) { return !!(S.host && S.host.can && S.host.can(action)); }

const H = {
  get ctx() { return S.ctx; },
  get env() { return (S.ctx && S.ctx.env) || '?'; },
  can,
  canCards: () => can('cardduel.cards') && (!(S.ctx && S.ctx.prod) || can('cardduel.prod')),
  canRules: () => can('cardduel.rules') && (!(S.ctx && S.ctx.prod) || can('cardduel.prod')),
  async cards(force) {
    if (!S.cards || force) S.cards = await api.get(ROOT + '/cards');
    return S.cards;
  },
  dropCards() { S.cards = null; },
  async rules(force) {
    if (!S.rules || force) S.rules = await api.get(ROOT + '/rules');
    return S.rules;
  },
  dropRules() { S.rules = null; },
  /** Typed confirmation outside dev: resolves the token to send, or null when cancelled. */
  async confirmEnv(what) {
    const env = H.env;
    if (env === 'dev') return '';
    const v = await uiPrompt('Type ' + env + ' to confirm: ' + what + ' on ' + env.toUpperCase()
      + (env === 'prod' ? ' (real players).' : '.'), env === 'prod' ? 'PRODUCTION' : 'Confirm on ' + env, '');
    if (v == null) return null;
    if (v.trim() !== env) { alertBox('Not confirmed: you typed "' + v + '"'); return null; }
    return env;
  },
  go(tab) { show(tab); },
};

function alertBox(msg) { try { S.host.toast ? S.host.toast(msg, 'warn') : window.alert(msg); } catch (_) { } }

export async function openCardDuel(tab) {
  const host = S.host;
  if (!host || !host.guardPage('cardduel.view', 'Card Duel')) return;
  host.edenSetView('cardduel');
  const c = $('#content');
  if (!c) return;
  clear(c);
  S.cards = null;
  S.rules = null;
  c.appendChild(el('div', { class: 'cda-wrap cd-wrap' }, el('div', { id: 'cd-head' }), el('div', { id: 'cd-tabs', class: 'cd-tabs' }),
    el('div', { id: 'cd-body' })));
  renderHead();
  renderTabs();
  await loadContext();
  show(tab || S.tab);
}

async function loadContext() {
  try {
    S.ctx = await api.get(ROOT + '/context');
  } catch (e) {
    S.ctx = null;
    const b = $('#cd-body');
    if (b) clear(b).appendChild(errorState({ error: e, title: 'Cannot read the card duel context', onRetry: () => openCardDuel(S.tab) }));
  }
  renderHead();
}

function renderHead() {
  const h = $('#cd-head');
  if (!h) return;
  const c = S.ctx || {};
  const role = H.canRules() || H.canCards() ? badge('You can edit', 'ok') : badge('View only', 'neutral');
  clear(h).appendChild(el('div', { class: 'cda-head' },
    el('h2', {}, icon('dice', 24), 'Card Duel'),
    el('span', { class: 'cda-src' }, role,
      c.env ? badge(c.prod ? 'PRODUCTION' : 'Environment: ' + c.env, c.prod ? 'error' : (c.env === 'dev' ? 'ok' : 'warn')) : null),
    el('div', { class: 'cda-head-r' },
      btn({ label: 'Refresh', icon: 'refresh', variant: 'ghost', busyLabel: 'Reading…', onClick: async () => {
        S.cards = null; S.rules = null; await loadContext(); show(S.tab);
      } }))));
  h.appendChild(el('div', { class: 'esub cda-lead' }, 'Eden Duel Cards: players collect monster, boss, NPC and place cards and duel '
    + 'on a 3x3 board. This page shows the feature on ' + (c.env || 'the active environment') + ', its rules, every card and what the '
    + 'Treasure Archive needs for it, and plays matches with the server rules. Open Help for a walk-through.'));
}

function renderTabs() {
  const t = $('#cd-tabs');
  if (!t) return;
  clear(t);
  for (const [k, label, ic] of TABS) {
    t.appendChild(el('button', { class: 'cd-tab' + (S.tab === k ? ' on' : ''), type: 'button', onclick: () => show(k) },
      icon(ic, 24), ' ', label));
  }
}

function show(tab) {
  S.tab = tab;
  renderTabs();
  const b = $('#cd-body');
  if (!b) return;
  clear(b);
  if (tab === 'help') return renderHelp(b, H);
  if (!S.ctx) return;
  if (tab === 'overview') return renderOverview(b);
  if (tab === 'rules') return renderRules(b, H);
  if (tab === 'cards') return renderCards(b, H);
  if (tab === 'archive') return renderArchive(b, H);
  if (tab === 'sim') return renderSim(b, H);
}

function kpi(value, label) { return el('div', { class: 'cd-kpi' }, el('b', {}, value == null ? '-' : String(value)), el('span', {}, label)); }

function renderOverview(b) {
  const c = S.ctx;
  const srv = c.server || {};
  const cat = c.catalogue || {};
  const db = c.db || {};
  const eng = c.engine || {};
  const notes = el('div', {});
  if (c.prod) notes.appendChild(note('err', el('b', {}, 'PRODUCTION. '), 'Changes reach real players. Saving rules or cards here needs SA and a typed confirmation.'));
  if (c.server_error) notes.appendChild(note('err', 'Server not readable: ' + c.server_error));
  else if (srv.active !== 'active') notes.appendChild(note('warn', 'The eden-cardduel service is ' + (srv.active || 'unknown') + ' on ' + c.env + ': deploy card_duel from the Features page.'));
  if (srv.config_error) notes.appendChild(note('err', srv.config_error));
  if (c.catalogue_error) notes.appendChild(note('err', c.catalogue_error));
  const par = c.parity || {};
  if (par['cardduel_rules.py'] === false) notes.appendChild(note('warn', 'The rules code of ' + c.env + ' differs from the one of this tool (server ' + (srv.version || '?')
    + ', tool ' + (eng.service_version || '?') + '): the simulator plays the tool version. Deploy card_duel or Pull latest features.'));
  else if (par['cardduel_rules.py'] === true) notes.appendChild(note('ok', 'Simulator = server: the rules file of ' + c.env + ' is byte for byte the one this page plays with.'));
  if (par['cards.json'] === false) notes.appendChild(note('warn', 'The card catalogue of ' + c.env + ' differs from the one of this tool: the next card_duel deploy brings it in line.'));
  if (c.db_error) notes.appendChild(note('warn', 'Database not readable: ' + c.db_error));
  const dz = c.designer || {};
  if (dz.error) notes.appendChild(note('warn', dz.error));
  else if (dz.errors) notes.appendChild(note('err', 'The designer file (custom_cards.ini) has ' + dz.errors + ' error(s): the card_duel Deploy refuses it. Open the Cards tab.'));
  else if (dz.deployed === false) notes.appendChild(note('warn', 'The designer file of this PC (custom cards and card items) differs from the one deployed on ' + c.env + ': push card_duel and deploy it to publish the changes.'));
  else if (dz.deployed === true) notes.appendChild(note('ok', 'The custom cards and card items of this PC are the ones deployed on ' + c.env + '.'));
  else if (dz.on_server === false && dz.cards) notes.appendChild(note('warn', 'No designer file deployed on ' + c.env + ' yet (card_duel 0.6.0 or later deploys it).'));

  const st = srv.state || {};
  const fs = c.feature_state || null;
  const service = card({ title: 'Service on ' + c.env, icon: 'game_servers', body: el('div', { class: 'cd-grid3' },
    kpi(srv.active || '?', 'eden-cardduel service'),
    kpi(srv.version || '?', 'server version (tool has ' + (eng.service_version || '?') + ')'),
    kpi(st.duels == null ? '-' : st.duels, 'duels in progress'),
    kpi(fs ? (fs.status + (fs.version ? ' ' + fs.version : '')) : '-', 'feature state (Features page)'),
    kpi((srv.config && (srv.config.modes || ['friendly', 'ante']).join(', ')) || 'friendly, ante (default)', 'open modes'),
    kpi(c.designer && !c.designer.error ? c.designer.cards + ' cards, ' + c.designer.items + ' items' : '-', 'designer file (custom_cards.ini)')) });
  const players = card({ title: 'Players on ' + c.env, icon: 'game_staff', body: db.installed ? el('div', { class: 'cd-grid3' },
    kpi(db.owners, 'characters with cards'), kpi(db.owned, 'cards owned'), kpi(db.distinct, 'different cards owned'),
    kpi(db.decks, 'decks saved'), kpi(db.duels, 'duels played'), kpi(db.duels7, 'duels in the last 7 days'))
    : emptyState({ title: 'No card table in the database yet', hint: 'The service creates them at its first start.' }) });
  const by = (o, names) => el('div', { class: 'cd-row' }, Object.keys(o || {}).sort().map(k => badge((names ? names[k] : k) + ': ' + o[k], 'neutral')));
  const catalogue = card({ title: 'Card catalogue (this tool)', icon: 'treasure_archive', body: el('div', {},
    el('div', { class: 'cd-grid3' }, kpi(cat.live, 'cards players can get'), kpi(cat.retired, 'retired cards (owners keep them)'),
      kpi(cat.items, 'archive items (Card: name)'), kpi(cat.rewards, 'cards given by activities')),
    el('p', { class: 'cd-small' }, 'By kind'), by(cat.by_kind),
    el('p', { class: 'cd-small' }, 'By rarity'), by(cat.by_rarity, Object.fromEntries(RARITY.map((r, k) => [String(k), r]))),
    el('p', { class: 'cd-small' }, 'By element'), by(cat.by_element),
    el('p', { class: 'cd-small' }, 'Source: ' + (cat.feature || '?'))) });
  b.appendChild(notes);
  b.appendChild(el('div', { class: 'cd-grid2' }, el('div', {}, service, players), el('div', {}, catalogue)));
  b.appendChild(note('info', 'Only the active environment is read. To look at another one, switch environment in the top bar '
    + '(preprod and production are read-only until you save, and saving there asks for a typed confirmation).'));
}
