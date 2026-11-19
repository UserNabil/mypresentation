import { lineIcon } from '/studio/js/ui/line_icons.js';
import { openGame, ensureCss, currentGame } from './shell/modal.js';
import { loadGames } from './shell/games.js';
import { loadRoster } from './shell/roster.js';
import { linesEl } from './shell/overlay.js';
import * as store from './shell/store.js';

const CSS = '/studio/css/modern/minigames.css';
const ART = {
  recall: ['chick', 'ghost', 'chick'],
  parade: ['tiny_drake', 'mushling', 'leaf_sprite'],
  link: ['puckbird', 'tiny_bug', 'puckbird']
};
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
let open = null;
let busy = false;
let who = null;
let wired = false;

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

async function signIn() {
  if (who !== null) return who;
  try {
    const r = await fetch('/api/app-context', { credentials: 'same-origin' });
    const me = r.ok ? await r.json() : null;
    who = (me && me.username) || '';
  } catch (e) {
    who = '';
  }
  store.useNamespace(who || 'guest');
  return who;
}

function bestOf(game) {
  const best = store.best(game.id);
  if (!best || !best.runs) return node('p', 'empty mg-pcard-none', 'No runs yet');
  const lines = (game.bestLines ? game.bestLines(best) : [['Best score', best.score]]).slice(0, 2);
  return linesEl(lines, 'mg-lines mg-pcard-best');
}

function card(game, roster, onPlay) {
  const box = node('article', 'mg-pcard');
  box.dataset.game = game.id;
  const art = node('div', 'mg-pcard-art');
  art.setAttribute('aria-hidden', 'true');
  for (const key of ART[game.id] || []) art.appendChild(roster.iconEl(roster.byKey[key], 52));
  const top = node('div', 'mg-pcard-top');
  const ic = node('span', 'li-tile mg-pcard-ic');
  ic.innerHTML = lineIcon(game.icon || 'minigames', 20);
  const h = node('h3', '', game.name);
  h.id = 'mg-pick-' + game.id;
  top.append(ic, h);
  const play = node('button', 'sbtn mg-pcard-play');
  play.type = 'button';
  play.dataset.play = game.id;
  play.innerHTML = lineIcon('play', 18);
  play.appendChild(node('span', '', 'Play'));
  play.setAttribute('aria-label', 'Play ' + game.name);
  play.addEventListener('click', () => onPlay(game));
  box.setAttribute('aria-labelledby', h.id);
  box.append(art, top, node('p', 'mg-pcard-rule', game.pitch || ''), bestOf(game), play);
  return box;
}

function trap(e, dialog) {
  const list = [...dialog.querySelectorAll(FOCUSABLE)].filter(x => !x.disabled && x.getClientRects().length);
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  const a = document.activeElement;
  if (!dialog.contains(a)) { e.preventDefault(); first.focus(); return; }
  if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
}

function closeMiniGames(refocus = true) {
  if (!open) return;
  const o = open;
  open = null;
  window.removeEventListener('keydown', o.onKey, true);
  o.inerted.forEach(el => { el.inert = false; });
  o.scrim.remove();
  if (refocus && o.opener && o.opener.isConnected) o.opener.focus({ preventScroll: true });
}

async function openMiniGames(opener) {
  if (open || busy || currentGame()) return;
  busy = true;
  const from = opener || document.getElementById('mx-games') || document.activeElement;
  let games = [];
  let roster = null;
  try {
    [games, roster] = await Promise.all([loadGames(), loadRoster(), ensureCss(CSS), signIn()]);
  } finally {
    busy = false;
  }
  const scrim = node('div', 'mg-scrim mg-pick-scrim');
  const dialog = node('section', 'mg-pick');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'mg-pick-t');
  const head = node('div', 'mg-pick-head');
  const ic = node('span', 'li-tile mg-pick-ic');
  ic.innerHTML = lineIcon('minigames', 22);
  const titles = node('div', 'mg-pick-titles');
  const h2 = node('h2', '', 'Mini-games');
  h2.id = 'mg-pick-t';
  titles.append(h2, node('p', 'mg-pick-sub', 'Quick games with the beasts of Eden. Your best scores stay on this PC.'));
  const x = node('button', 'mx-x mg-x');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.title = 'Close';
  x.innerHTML = lineIcon('close', 18);
  x.addEventListener('click', () => closeMiniGames());
  head.append(ic, titles, x);
  const list = node('div', 'mg-pick-list');
  const play = game => {
    closeMiniGames(false);
    openGame(game, { opener: from });
  };
  for (const { game } of games) if (game) list.appendChild(card(game, roster, play));
  if (!list.children.length) list.appendChild(node('p', 'empty', 'The games could not be loaded.'));
  dialog.append(head, list);
  scrim.appendChild(dialog);
  scrim.addEventListener('mousedown', e => { if (e.target === scrim) closeMiniGames(); });
  const onKey = e => {
    if (e.key === 'Tab') { trap(e, dialog); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeMiniGames(); }
  };
  const inerted = [];
  open = { scrim, onKey, inerted, opener: from };
  try {
    for (const c of document.body.children) if (!c.inert) { c.inert = true; inerted.push(c); }
    document.body.appendChild(scrim);
    window.addEventListener('keydown', onKey, true);
    const first = dialog.querySelector('.mg-pcard-play') || x;
    first.focus({ preventScroll: true });
  } catch (err) {
    closeMiniGames();
    throw err;
  }
}

export function initMiniGames() {
  const b = document.getElementById('mx-games');
  if (b && !b.dataset.bound) {
    b.dataset.bound = '1';
    b.addEventListener('click', ev => { ev.stopPropagation(); openMiniGames(b); });
  }
  if (wired) return;
  wired = true;
  window.addEventListener('minigames-open', () => openMiniGames());
}
