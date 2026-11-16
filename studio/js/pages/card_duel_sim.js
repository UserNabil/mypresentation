/* ============================================================================
   pages/card_duel_sim.js — Card Duel page, Simulator tab. Every move is played
   by the server rules module itself (cardduel_rules.Game, loaded from the
   card_duel feature by card_duel_engine.py): the page sends the decks and the
   list of moves, the backend replays them and answers the board, HP, captures,
   skills and the stakes. Batch = N matches played by the server auto player,
   with win rates by card, element and rarity.
   ============================================================================ */

import { el, clear } from '../core/dom.js';
import { btn, badge, card, emptyState } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { RARITY, cardNode, chip, boardNode, winBar, pct, note, put } from './card_duel_render.js';

const ROOT = '/api/cardduel';
const M = { host: null, node: null, rows: null, byId: {}, decks: [[], []], first: 0, size: 7, rules: {}, envRules: {}, fromTab: false,
  useDesign: true, filt: { rarities: [], kinds: [], elements: [] }, moves: [], res: null, sel: null, flash: new Set(), batch: null, n: 500, minGames: 5 };

export async function renderSim(node, H) {
  M.host = H;
  M.node = node;
  clear(node).appendChild(emptyState({ title: 'Loading the cards and the rules…', icon: 'launch_game' }));
  try {
    const d = await H.cards();
    M.rows = d.rows;
    M.byId = Object.fromEntries(d.rows.map(r => [r.id, r]));
    const rv = await H.rules().catch(() => null);
    M.envRules = {};
    if (rv) for (const f of rv.fields) {
      if (f.key.startsWith('rules.')) M.envRules[f.key.slice(6)] = f.value;
      if (f.key === 'hand' && !M.decks[0].length) M.size = f.value;
    }
  } catch (e) { clear(node).appendChild(note('err', 'Cannot load: ' + errMessage(e))); return; }
  if (H.simRules) { M.rules = Object.assign({}, H.simRules.rules); M.size = H.simRules.size || M.size; M.fromTab = true; H.simRules = null; }
  else if (!Object.keys(M.rules).length) M.rules = Object.assign({}, M.envRules);
  draw();
}

function name(id) { return (M.byId[id] && M.byId[id].name) || ('#' + id); }

function filtered() {
  const f = M.filt;
  return M.rows.filter(r => !r.retired && (!f.custom_only || r.custom) && (!f.rarities.length || f.rarities.includes(r.rarity))
    && (!f.kinds.length || f.kinds.includes(r.kind)) && (!f.elements.length || f.elements.includes(r.element)));
}

function randomDeck(k) {
  const pool = filtered();
  if (!pool.length) { toast('No card matches the filters', 'warn'); return; }
  M.decks[k] = Array.from({ length: M.size }, () => pool[Math.floor(Math.random() * pool.length)].id);
  draw();
}

function deckBox(k) {
  const dl = 'cd-dl-' + k;
  const inp = el('input', { class: 'cd-in', list: dl, placeholder: 'Add a card: type a name or id', style: { width: '230px' } });
  const add = () => {
    const v = inp.value.trim().toLowerCase();
    const r = M.rows.find(x => String(x.id) === v || x.name.toLowerCase() === v) || M.rows.find(x => x.name.toLowerCase().startsWith(v));
    if (!r) { toast('No card ' + inp.value, 'warn'); return; }
    if (M.decks[k].length >= 10) { toast('10 cards at most', 'warn'); return; }
    M.decks[k].push(r.id);
    draw();
  };
  inp.onkeydown = e => { if (e.key === 'Enter') add(); };
  const opts = el('datalist', { id: dl }, M.rows.filter(r => !r.retired).slice(0, 4000).map(r => el('option', { value: r.name }, String(r.id))));
  return el('div', { class: 'cd-side p' + k },
    el('div', { class: 'cd-row' }, el('b', {}, 'Deck ' + 'AB'[k]), badge(M.decks[k].length + ' card(s)', M.decks[k].length === M.size ? 'ok' : 'warn'),
      el('span', { class: 'cd-grow' }), btn({ label: 'Random', icon: 'dice', variant: 'mini', onClick: () => randomDeck(k) }),
      btn({ label: 'Clear', icon: 'delete', variant: 'mini', onClick: () => { M.decks[k] = []; draw(); } })),
    el('div', { class: 'cd-deck', style: { margin: '6px 0' } }, M.decks[k].map((id, i) => chip(name(id) + ' ×', 'r' + ((M.byId[id] || {}).rarity || 0),
      'Click to remove').cloneNode(true)).map((c, i) => { c.onclick = () => { M.decks[k].splice(i, 1); draw(); }; return c; })),
    el('div', { class: 'cd-row' }, inp, opts, btn({ label: 'Add', icon: 'add', variant: 'mini', onClick: add })));
}

function multi(label, key, opts) {
  const box = el('div', { class: 'cd-row' }, el('span', { class: 'cd-small' }, label + ':'));
  for (const [v, t] of opts) {
    const i = el('input', { type: 'checkbox' });
    i.checked = M.filt[key].includes(v);
    i.onchange = () => { M.filt[key] = i.checked ? M.filt[key].concat([v]) : M.filt[key].filter(x => x !== v); };
    box.appendChild(el('label', { class: 'cd-small cd-row' }, i, t));
  }
  return box;
}

function customOnly() {
  const i = el('input', { type: 'checkbox' });
  i.checked = !!M.filt.custom_only;
  i.onchange = () => { M.filt.custom_only = i.checked; if (i.checked) M.useDesign = true; };
  return el('label', { class: 'cd-small cd-row' }, i, 'only custom cards');
}

function ruleInputs() {
  const keys = [['hp', 'Duel HP'], ['hp_per_card', 'HP per captured card'], ['drain_extra', 'Extra HP to Drain'], ['element_bonus', 'Element bonus']];
  return el('div', { class: 'cd-row' }, keys.map(([k, l]) => {
    const i = el('input', { class: 'cd-in', type: 'number', min: '0', value: String(M.rules[k] == null ? '' : M.rules[k]), style: { width: '70px' } });
    i.oninput = () => { M.rules[k] = Number(i.value); };
    return el('label', { class: 'cd-small' }, l, el('br'), i);
  }), btn({ label: 'Rules of ' + M.host.env, variant: 'mini', icon: 'undo', onClick: () => { M.rules = Object.assign({}, M.envRules); M.fromTab = false; draw(); } }));
}

function draw() {
  const node = M.node;
  clear(node);
  node.appendChild(note('info', 'Matches here are played by the card_duel server rules module itself (same file as the service), so a result here is the result in game. '
    + 'Pick two decks, then lay cards by clicking a card of the player whose turn it is and a free cell, or let the server auto player move.'));
  if (M.fromTab) node.appendChild(note('warn', 'Rules from the Rules tab, NOT saved yet. "Rules of ' + M.host.env + '" goes back to the saved ones.'));
  const sizeIn = el('input', { class: 'cd-in', type: 'number', min: '5', max: '10', value: String(M.size), style: { width: '60px' } });
  sizeIn.oninput = () => { M.size = Math.max(5, Math.min(10, Number(sizeIn.value) || 7)); };
  const firstSel = el('select', { class: 'cd-in' }, [['0', 'A plays first'], ['1', 'B plays first']].map(([v, t]) => el('option', { value: v }, t)));
  firstSel.value = String(M.first);
  firstSel.onchange = () => { M.first = Number(firstSel.value); };
  const design = el('input', { type: 'checkbox' });
  design.checked = M.useDesign;
  design.onchange = () => { M.useDesign = design.checked; };
  node.appendChild(card({ title: 'Match setup', icon: 'settings', body: el('div', {},
    el('div', { class: 'cd-grid2' }, deckBox(0), deckBox(1)),
    el('div', { class: 'cd-row', style: { marginTop: '8px' } }, el('label', { class: 'cd-small' }, 'Deck size', el('br'), sizeIn), firstSel,
      el('label', { class: 'cd-row cd-small' }, design, 'Include the custom cards of the designer file'), ruleInputs()),
    el('div', { class: 'cd-row', style: { marginTop: '6px' } }, multi('Random decks: rarity', 'rarities', RARITY.map((r, k) => [k, r]))),
    el('div', { class: 'cd-row' }, multi('kind', 'kinds', [['monster', 'monster'], ['boss', 'boss'], ['npc', 'npc'], ['place', 'place']]), customOnly()),
    el('div', { class: 'cd-row', style: { marginTop: '8px' } }, el('span', { class: 'cd-grow' }),
      btn({ label: 'Start the match', icon: 'launch_game', busyLabel: 'Dealing…', onClick: start }))) }));
  node.appendChild(el('div', { id: 'cd-match' }));
  node.appendChild(el('div', { id: 'cd-batch' }));
  drawMatch();
  drawBatch();
}

function spec(extra) {
  return Object.assign({ deck_a: M.decks[0], deck_b: M.decks[1], first: M.first, rules: M.rules, use_design: M.useDesign, moves: M.moves }, extra || {});
}

async function call(extra) {
  try {
    const res = await api.post(ROOT + '/sim/play', spec(extra));
    const before = M.res ? M.res.state.board : null;
    M.res = res;
    M.moves = res.steps.filter(s => !s.forfeit).map(s => [s.card, s.cell]);
    M.flash = new Set();
    if (before) res.state.board.forEach((p, k) => { if (p && (!before[k] || before[k].owner !== p.owner)) M.flash.add(k); });
    M.sel = null;
    drawMatch();
  } catch (e) { toast(errMessage(e), 'error'); }
}

async function start() {
  if (M.decks[0].length !== M.decks[1].length || M.decks[0].length < 5) { toast('Both decks need the same number of cards, 5 to 10', 'warn'); return; }
  M.moves = [];
  M.res = null;
  await call();
}

function side(k, st) {
  const turn = !st.over && st.turn === k;
  const hand = el('div', { class: 'cd-hand' + (turn ? '' : ' off') });
  for (const id of st.hands[k]) {
    const r = M.byId[id] || { id, name: '#' + id, rarity: 0, element: 'Steel', sides: [1, 1, 1, 1] };
    const n = cardNode(r, { width: 86, pick: turn && M.sel === id });
    if (turn) n.onclick = () => { M.sel = M.sel === id ? null : id; drawMatch(); };
    hand.appendChild(n);
  }
  const hp = st.hp[k];
  const max = (M.res.rules && M.res.rules.hp) || 100;
  return el('div', { class: 'cd-side p' + k + (turn ? ' turn' : '') },
    el('div', { class: 'cd-row' }, el('b', {}, 'Player ' + 'AB'[k]), badge('score ' + st.score[k], 'neutral'), badge('lays ' + M.res.places[k] + ' cards', 'neutral'),
      turn ? badge('to play', 'warn') : null),
    el('div', { class: 'cd-hp', title: hp + ' / ' + max + ' duel HP', style: { margin: '6px 0' } }, el('div', { style: { width: Math.max(0, 100 * hp / max) + '%' } })),
    el('div', { class: 'cd-small' }, hp + ' / ' + max + ' duel HP'), hand);
}

function logLines() {
  const out = [];
  M.res.steps.forEach((s, n) => {
    const who = 'AB'[s.player];
    if (s.forfeit) { out.push(el('div', {}, el('b', {}, who + ' gives up'))); return; }
    out.push(el('div', {}, el('b', {}, (n + 1) + '. ' + who + (s.auto ? ' (auto)' : '') + ' lays ' + name(s.card) + ' on cell ' + s.cell)));
    for (const e of s.events) {
      if (e.t === 'flip') out.push(el('div', {}, '   captures cell ' + e.cell + (e.why === 'combo' ? ' (Combo chain)' : '') + ': ' + 'AB'[e.from] + ' -> ' + 'AB'[e.to]));
      else if (e.t === 'hp') out.push(el('div', { class: 'cd-small' }, '   ' + 'AB'[e.player] + ' loses ' + (e.before - e.after) + ' HP (' + e.before + ' -> ' + e.after + ')'));
      else if (e.t === 'rally') out.push(el('div', { class: 'cd-small' }, '   Rally: cell ' + e.cell + ' now ' + (e.mod > 0 ? '+' : '') + e.mod));
      else if (e.t === 'terror') out.push(el('div', { class: 'cd-small' }, '   Terror: cell ' + e.cell + ' now ' + e.mod));
      else if (e.t === 'end') out.push(el('div', { class: 'cd-good' }, '   End: ' + (e.winner == null ? 'draw' : 'AB'[e.winner] + ' wins') + ' (' + e.reason + ')'));
    }
  });
  return out;
}

function drawMatch() {
  const box = M.node && M.node.querySelector('#cd-match');
  if (!box) return;
  clear(box);
  if (!M.res) return;
  const st = M.res.state;
  const over = st.over;
  const result = over ? (st.winner == null ? 'Draw' : 'Player ' + 'AB'[st.winner] + ' wins') + ' (' + (st.reason === 'knockout' ? 'knock-out' : st.reason === 'board' ? 'most cards' : st.reason) + ', '
    + st.score[0] + ' - ' + st.score[1] + ')' : 'Turn of player ' + 'AB'[st.turn] + (M.sel ? ': click a free cell for ' + name(M.sel) : ': pick a card of his hand');
  const stakes = over && M.res.stakes ? el('div', {},
    note('info', el('b', {}, 'Ante: '), M.res.stakes.ante.take ? 'the winner takes 1 card among ' + M.res.stakes.ante.pool.map(name).join(', ') : 'nothing changes hands'),
    note('info', el('b', {}, 'Hardcore: '), M.res.stakes.hardcore.take ? 'the winner takes ' + M.res.stakes.hardcore.pool.slice(0, M.res.stakes.hardcore.take).map(name).join(', ')
      + (M.res.stakes.hardcore.auto ? ' (no capture: best card picked)' : '') : 'nothing changes hands')) : null;
  box.appendChild(card({ title: 'Match', icon: 'launch_game', actions: [
    btn({ label: 'Auto: one move', variant: 'mini', disabled: over, onClick: () => call({ auto: 'one' }) }),
    btn({ label: 'Auto: to the end', variant: 'mini', disabled: over, onClick: () => call({ auto: 'end' }) }),
    btn({ label: 'Undo', icon: 'undo', variant: 'mini', disabled: !M.moves.length, onClick: () => { M.moves = M.moves.slice(0, -1); M.res = null; return call(); } }),
    btn({ label: 'Give up for ' + 'AB'[st.turn], variant: 'mini', disabled: over, onClick: () => call({ forfeit: st.turn }) }),
    btn({ label: 'Restart', icon: 'refresh', variant: 'mini', onClick: start })], body: el('div', {},
    note(over ? 'ok' : 'info', result),
    el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: '12px', alignItems: 'start' } },
      side(0, st), boardNode(st, M.byId, { armed: !over && M.sel != null, onCell: cell => call({ moves: M.moves.concat([[M.sel, cell]]) }), flash: M.flash }), side(1, st)),
    stakes, el('h4', {}, 'What happened'), el('div', { class: 'cd-log' }, logLines())) }));
}

function drawBatch() {
  const box = M.node && M.node.querySelector('#cd-batch');
  if (!box) return;
  clear(box);
  const nIn = el('input', { class: 'cd-in', type: 'number', min: '1', max: '2000', value: String(M.n), style: { width: '80px' } });
  nIn.oninput = () => { M.n = Number(nIn.value) || 100; };
  const which = el('select', { class: 'cd-in' }, [['decks', 'Deck A against deck B'], ['randomA', 'Deck A against random decks'], ['random', 'Random decks (filters above)']]
    .map(([v, t]) => el('option', { value: v }, t)));
  which.value = M.which || 'random';
  which.onchange = () => { M.which = which.value; };
  const body = el('div', {}, el('div', { class: 'cd-row' }, el('label', { class: 'cd-small' }, 'Matches', el('br'), nIn), which,
    el('span', { class: 'cd-small' }, 'First player alternates. Both sides use the server auto player (captures the most cards it can each move).'),
    el('span', { class: 'cd-grow' }), btn({ label: 'Run', icon: 'launch_game', busyLabel: 'Playing…', onClick: runBatch })), el('div', { id: 'cd-batch-res' }));
  box.appendChild(card({ title: 'Balance: many matches', icon: 'rate', body }));
  if (M.batch) drawBatchRes();
}

async function runBatch() {
  const w = M.which || 'random';
  const body = { matches: M.n, rules: M.rules, size: M.size, use_design: M.useDesign, first: 'alternate', random: M.filt, seed: Math.floor(Math.random() * 1e9) };
  if (w === 'decks' || w === 'randomA') {
    if (!M.decks[0].length) { toast('Deck A is empty', 'warn'); return; }
    body.deck_a = M.decks[0];
  }
  if (w === 'decks') {
    if (M.decks[1].length !== M.decks[0].length) { toast('Deck B needs as many cards as deck A', 'warn'); return; }
    body.deck_b = M.decks[1];
  }
  try { M.batch = await api.post(ROOT + '/sim/batch', body); drawBatchRes(); } catch (e) { toast(errMessage(e), 'error'); }
}

function rateRows(list, label) {
  return list.map(x => el('tr', {}, el('td', {}, label(x)), el('td', {}, String(x.games)), el('td', {}, pct(x.wins, x.games)),
    el('td', {}, winBar(x.wins, x.draws, x.losses))));
}

function drawBatchRes() {
  const box = M.node.querySelector('#cd-batch-res');
  if (!box || !M.batch) return;
  const b = M.batch;
  const head = () => el('tr', {}, el('th', {}, ''), el('th', {}, 'Games'), el('th', {}, 'Win rate'), el('th', {}, 'Won / draw / lost'));
  const cards = b.by_card.filter(x => x.games >= M.minGames).map(x => Object.assign({ rate: x.wins / x.games }, x)).sort((a, c) => c.rate - a.rate);
  const minIn = el('input', { class: 'cd-in', type: 'number', min: '1', value: String(M.minGames), style: { width: '60px' } });
  minIn.onchange = () => { M.minGames = Number(minIn.value) || 1; drawBatchRes(); };
  put(box, 
    b.stopped_early ? note('warn', 'Stopped after ' + b.matches + ' matches (time limit): run fewer at a time.') : null,
    el('div', { class: 'cd-grid3', style: { margin: '8px 0' } },
      el('div', { class: 'cd-kpi' }, el('b', {}, pct(b.wins[0], b.matches)), el('span', {}, 'A wins (' + b.wins[0] + ')')),
      el('div', { class: 'cd-kpi' }, el('b', {}, pct(b.wins[1], b.matches)), el('span', {}, 'B wins (' + b.wins[1] + ')')),
      el('div', { class: 'cd-kpi' }, el('b', {}, pct(b.draws, b.matches)), el('span', {}, 'draws (' + b.draws + ')')),
      el('div', { class: 'cd-kpi' }, el('b', {}, pct(b.first_player[0], b.matches - b.first_player[2])), el('span', {}, 'first player wins (decided matches)')),
      el('div', { class: 'cd-kpi' }, el('b', {}, Object.entries(b.reasons).map(([k, v]) => k + ' ' + v).join(', ')), el('span', {}, 'how matches end')),
      el('div', { class: 'cd-kpi' }, el('b', {}, b.avg_flips + ' / ' + b.avg_winner_hp), el('span', {}, 'captures per match / HP left to the winner'))),
    el('div', { class: 'cd-grid2' },
      el('div', {}, el('h4', {}, 'By element (decks holding the element)'), el('table', { class: 'cd-table' }, head(), rateRows(b.by_element, x => x.element)),
        el('h4', {}, 'By rarity'), el('table', { class: 'cd-table' }, head(), rateRows(b.by_rarity, x => RARITY[x.rarity]))),
      el('div', {}, el('div', { class: 'cd-row' }, el('h4', { style: { margin: '8px 0' } }, 'By card'), el('span', { class: 'cd-small' }, 'cards seen in at least'), minIn,
        el('span', { class: 'cd-small' }, 'matches')),
      cards.length ? el('div', { class: 'cd-scroll', style: { maxHeight: '420px' } }, el('table', { class: 'cd-table' }, head(), rateRows(cards, x => x.name + ' (' + x.id + ')')))
        : note('info', 'No card reached ' + M.minGames + ' matches: lower the minimum or run more matches.'))),
    el('div', { class: 'cd-small' }, b.matches + ' matches in ' + b.seconds + ' s, deck size ' + b.size + ', rules ' + JSON.stringify(b.rules) + ', seed ' + b.seed));
}
