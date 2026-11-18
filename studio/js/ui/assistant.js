import { modernOn } from './modern_gate.js';
import { lineSvg, navLine } from './line_icons.js';
import { toast } from './toast.js';
import { navigate } from '../nav/rail.js';

const KEY = 'eden_assistant_thread';
const CAP = 50;
const ENT_LINE = { monster: 'creatures', item: 'items', npc: 'npcs', spell: 'game-systems', droptable: 'items', enchant: 'game-systems', scene: 'map' };
const SEND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';

let root = null;
let list = null;
let input = null;
let msgs = null;
let chips = [];
let pending = false;
let opener = null;
let chipsLoad = null;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function load() {
  if (msgs) return msgs;
  msgs = [];
  try {
    const j = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    if (Array.isArray(j)) msgs = j.filter(m => m && (m.r === 'u' || m.r === 'a')).slice(-CAP);
  } catch (e) {}
  return msgs;
}

function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify(load().slice(-CAP))); } catch (e) {}
}

function push(m) {
  load().push(m);
  if (msgs.length > CAP) msgs.splice(0, msgs.length - CAP);
  save();
  render();
}

function currentPage() {
  const on = document.querySelector('.rl-leaf.on[data-k], .rl-leaf.active[data-k], .rl-top.on[data-k], .rl-top.active[data-k]');
  return on ? on.dataset.k : '';
}

function envLabel() {
  const b = document.getElementById('mx-env');
  return ((b && b.textContent) || 'dev').trim().toUpperCase();
}

function envTone(e) { return e === 'PROD' ? 'bad' : e === 'PREPROD' ? 'warn' : 'ok'; }

function iconFor(href) {
  const p = /^#page\/([^?]+)/.exec(href || '');
  if (p) return navLine(p[1], 'file', 18) || lineSvg('file', 18);
  const e = /^#entity\/([^/]+)/.exec(href || '');
  if (e) return lineSvg(ENT_LINE[e[1]] || 'file', 18);
  return lineSvg('file', 18);
}

function sameHref(a, cards) { return (cards || []).some(c => c.href === a); }

function cardsHtml(cards) {
  return '<div class="as-cards">' + cards.map(c => '<button type="button" class="as-card" data-href="' + esc(c.href) + '"' + (c.href ? '' : ' disabled') + '>' +
    '<span class="as-ic" aria-hidden="true">' + iconFor(c.href) + '</span>' +
    '<span class="as-ct"><b>' + esc(c.title) + '</b>' + (c.subtitle ? '<i>' + esc(c.subtitle) + '</i>' : '') + '</span>' +
    (c.href ? '<span class="as-go" aria-hidden="true">' + lineSvg('chevron-right', 16) + '</span>' : '') + '</button>').join('') + '</div>';
}

function confirmHtml(m, i, a) {
  const e = envLabel();
  const busy = m.state === 'busy';
  let foot;
  if (m.state === 'done') foot = '<div class="as-st ok">' + lineSvg('circle-check', 16) + '<span>Done</span></div>';
  else if (m.state === 'cancel') foot = '<div class="as-st">' + lineSvg('x', 16) + '<span>Cancelled</span></div>';
  else if (m.state === 'failed') foot = '<div class="as-st bad">' + lineSvg('circle-x', 16) + '<span>Failed</span></div>';
  else foot = '<div class="as-btns"><button type="button" class="as-b pri" data-ok="' + i + '"' + (busy ? ' disabled' : '') + '>' + esc(busy ? 'Working...' : (a.label || 'Confirm')) + '</button>' +
    '<button type="button" class="as-b" data-no="' + i + '"' + (busy ? ' disabled' : '') + '>Cancel</button></div>';
  return '<div class="as-conf"><div class="as-conf-h"><span>Confirm</span><em class="as-env ' + envTone(e) + '">' + esc(e) + '</em></div>' +
    '<p>' + esc(m.text) + '</p>' + foot + '</div>';
}

function msgHtml(m, i) {
  if (m.r === 'u') return '<div class="as-m u"><div class="as-b-u">' + esc(m.text) + '</div></div>';
  const acts = m.actions || [];
  const conf = acts.find(a => a.kind === 'confirm' && a.token);
  const navs = acts.filter(a => a.kind === 'navigate' && a.href && !sameHref(a.href, m.cards));
  let h = '<div class="as-m a">';
  if (conf) h += confirmHtml(m, i, conf);
  else if (m.text) h += '<div class="as-b-a' + (m.tone ? ' ' + m.tone : '') + '">' + (m.tone === 'bad' ? lineSvg('triangle-alert', 16) : '') + '<span>' + esc(m.text) + '</span></div>';
  if (m.cards && m.cards.length) h += cardsHtml(m.cards);
  if (navs.length) h += '<div class="as-btns">' + navs.map(a => '<button type="button" class="as-b" data-href="' + esc(a.href) + '">' + esc(a.label) + '</button>').join('') + '</div>';
  return h + '</div>';
}

function emptyHtml() {
  return '<div class="as-empty"><span class="as-spark" aria-hidden="true">' + lineSvg('sparkles', 28) + '</span><b>How can I help?</b>' +
    '<div class="as-chips">' + chips.map(c => '<button type="button" class="as-chip" data-q="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div></div>';
}

function render() {
  if (!list) return;
  const m = load();
  let h = m.length ? m.map(msgHtml).join('') : emptyHtml();
  if (pending) h += '<div class="as-m a"><div class="as-b-a as-dots" aria-label="Thinking"><i></i><i></i><i></i></div></div>';
  list.innerHTML = h;
  list.scrollTop = list.scrollHeight;
  if (root) root.querySelector('.as-clear').disabled = !m.length;
}

function loadChips() {
  if (chips.length || chipsLoad) return;
  chipsLoad = fetch('/api/assistant/help', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(j => {
    const out = [];
    for (const it of (j && j.intents) || []) {
      if (it.kind !== 'read' || it.id === 'help' || it.id === 'thanks' || !(it.examples || []).length) continue;
      const ex = String(it.examples[0]);
      if (ex.length <= 32) out.push(ex);
      if (out.length >= 6) break;
    }
    chips = out;
    if (!load().length) render();
  }).catch(() => {}).finally(() => { chipsLoad = null; });
}

async function post(url, body) {
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
  } catch (e) { throw { status: 0 }; }
  let j = null;
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw { status: r.status, body: j };
  return j || {};
}

function errText(e) {
  const b = e && e.body;
  if (b && typeof b.text === 'string' && b.text) return b.text;
  const s = e && e.status;
  if (s === 401) return 'Your session expired. Sign in again.';
  if (s === 403) return 'Your role does not allow this.';
  if (s === 409) return 'The environment changed. Ask again.';
  if (s === 410) return 'This confirmation expired. Ask again.';
  if (s === 429) return 'Too many questions. Wait a moment.';
  if (!s) return 'Cannot reach the tool server.';
  return 'The assistant could not answer (HTTP ' + s + ').';
}

function asReply(j) {
  return { r: 'a', text: String(j.text || ''), cards: Array.isArray(j.cards) ? j.cards : [], actions: Array.isArray(j.actions) ? j.actions : [] };
}

async function askAssistant(q) {
  q = String(q || '').trim();
  if (!q || pending) return;
  openAssistant();
  push({ r: 'u', text: q });
  pending = true;
  render();
  try {
    push(asReply(await post('/api/assistant/ask', { q, page: currentPage() })));
  } catch (e) {
    push({ r: 'a', text: errText(e), tone: 'bad' });
  }
  pending = false;
  render();
  if (input && isOpen()) input.focus();
}

async function runConfirm(i) {
  const m = load()[i];
  const a = m && (m.actions || []).find(x => x.kind === 'confirm');
  if (!a || m.state || pending) return;
  m.state = 'busy';
  render();
  try {
    const j = await post('/api/assistant/confirm', { token: a.token });
    m.state = 'done';
    push(asReply(j));
    toast(String(j.text || 'Done').slice(0, 140), 'ok');
  } catch (e) {
    m.state = 'failed';
    const t = errText(e);
    push({ r: 'a', text: t, tone: 'bad' });
    toast(t, 'error');
  }
  if (input && isOpen()) input.focus();
}

function cancelConfirm(i) {
  const m = load()[i];
  if (!m || m.state) return;
  m.state = 'cancel';
  save();
  render();
}

async function go(href) {
  const p = /^#page\/([^?]+)(?:\?(.*))?$/.exec(href || '');
  const e = /^#entity\/([^/]+)\/(.+)$/.exec(href || '');
  if (!p && !e) return;
  closeAssistant(true);
  if (p) {
    navigate(p[1]);
    const q = new URLSearchParams(p[2] || '');
    if (q.get('feature') && typeof window.edenOpenFeature === 'function') window.edenOpenFeature(q.get('feature'));
    return;
  }
  const id = decodeURIComponent(e[2]);
  try {
    const m = await import('/studio/js/pages/record_modal.js');
    await m.openRecordModal(e[1], id);
  } catch (err) {
    try { (await import('/studio/js/pages/entity.js')).openEntity(e[1], id, true); } catch (e2) {}
  }
}

function grow() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

function submit() {
  const v = input.value;
  if (!v.trim() || pending) return;
  input.value = '';
  grow();
  askAssistant(v);
}

function build() {
  const el = document.createElement('aside');
  el.className = 'as-dr';
  el.setAttribute('role', 'complementary');
  el.setAttribute('aria-label', 'Assistant');
  el.innerHTML = '<div class="as-h"><span class="as-hi" aria-hidden="true">' + lineSvg('sparkles', 20) + '</span><h2>Assistant</h2>' +
    '<button type="button" class="as-ib as-clear" aria-label="Clear conversation" title="Clear conversation">' + lineSvg('trash-2', 18) + '</button>' +
    '<button type="button" class="as-ib as-x" aria-label="Close assistant" title="Close (Esc)">' + lineSvg('x', 18) + '</button></div>' +
    '<div class="as-list" aria-live="polite"></div>' +
    '<form class="as-f"><textarea class="as-in" rows="1" placeholder="Ask the assistant..." aria-label="Message the assistant" spellcheck="false"></textarea>' +
    '<button type="submit" class="as-send" aria-label="Send">' + SEND + '</button></form>';
  return el;
}

function ensure() {
  if (root) return;
  root = build();
  document.body.appendChild(root);
  list = root.querySelector('.as-list');
  input = root.querySelector('.as-in');
  root.querySelector('.as-x').addEventListener('click', () => closeAssistant());
  root.querySelector('.as-clear').addEventListener('click', () => { msgs = []; save(); render(); input.focus(); });
  root.querySelector('.as-f').addEventListener('submit', ev => { ev.preventDefault(); submit(); });
  input.addEventListener('input', grow);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); submit(); }
  });
  root.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeAssistant(); }
  });
  list.addEventListener('click', ev => {
    const t = ev.target.closest('[data-href],[data-q],[data-ok],[data-no]');
    if (!t || t.disabled) return;
    if (t.dataset.href) go(t.dataset.href);
    else if (t.dataset.q) askAssistant(t.dataset.q);
    else if (t.dataset.ok) runConfirm(Number(t.dataset.ok));
    else cancelConfirm(Number(t.dataset.no));
  });
  render();
}

function isOpen() { return !!root && root.classList.contains('on'); }

export function openAssistant(q) {
  ensure();
  if (!isOpen()) {
    const a = document.activeElement;
    opener = a && a !== document.body ? a : document.getElementById('mx-ai');
    root.classList.add('on');
    const b = document.getElementById('mx-ai');
    if (b) b.setAttribute('aria-expanded', 'true');
    loadChips();
    render();
  }
  if (q) { askAssistant(q); return; }
  setTimeout(() => { if (input && isOpen()) input.focus(); }, 40);
}

function closeAssistant(keepFocus) {
  if (!isOpen()) return;
  root.classList.remove('on');
  const b = document.getElementById('mx-ai');
  if (b) b.setAttribute('aria-expanded', 'false');
  if (!keepFocus) {
    const t = opener && opener.isConnected ? opener : b;
    try { if (t) t.focus({ preventScroll: true }); } catch (e) {}
  }
  opener = null;
}

function toggleAssistant() { if (isOpen()) closeAssistant(); else openAssistant(); }

export function initAssistant() {
  const b = document.getElementById('mx-ai');
  if (b && !b.dataset.bound) {
    b.dataset.bound = '1';
    b.addEventListener('click', ev => { ev.stopPropagation(); toggleAssistant(); });
  }
  if (document.documentElement.dataset.asKeys) return;
  document.documentElement.dataset.asKeys = '1';
  document.addEventListener('keydown', ev => {
    if (!modernOn() || !(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey || String(ev.key).toLowerCase() !== 'j') return;
    ev.preventDefault();
    toggleAssistant();
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || !isOpen()) return;
    if (document.querySelector('.qs-ov, .modal.open')) return;
    ev.preventDefault();
    closeAssistant();
  });
}
