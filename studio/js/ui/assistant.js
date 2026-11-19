import { modernOn } from './modern_gate.js';
import { lineSvg, navLine } from './line_icons.js';
import { toast } from './toast.js';
import { navigate } from '../nav/rail.js';
import { openFeature, resolvePage } from '../nav/feature_opener.js';
import { checksHtml, askHtml, copyText, watchHtml, verdictMessage, followWatch, WATCH_CSS, aiLine, loadAiStatus } from './assistant_views.js';

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
  const e = m.env ? m.env.toUpperCase() : envLabel();
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
  const navs = acts.filter(a => (a.kind === 'navigate' && a.href && !sameHref(a.href, m.cards)) || (a.kind === 'copy' && a.text));
  let h = '<div class="as-m a">';
  if (conf) h += confirmHtml(m, i, conf);
  else if (m.text) h += '<div class="as-b-a' + (m.tone ? ' ' + m.tone : '') + '">' + (m.tone === 'bad' ? lineSvg('triangle-alert', 16) : '') + '<span>' + esc(m.text) + '</span></div>';
  if (m.checks && m.checks.length) h += checksHtml(m, i, pending);
  if (m.ask && m.ask.question) h += askHtml(m, i, pending);
  if (m.watch || m.verdict) h += watchHtml(m, i, pending);
  if (m.cards && m.cards.length) h += cardsHtml(m.cards);
  if (navs.length) h += '<div class="as-btns">' + navs.map(a => '<button type="button" class="as-b" ' + (a.kind === 'copy' ? 'data-copy="' + esc(a.text) + '" title="' + esc(a.text) + '"' : 'data-href="' + esc(a.href) + '"') + '>' + esc(a.label) + '</button>').join('') + '</div>';
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
  const m = { r: 'a', text: String(j.text || ''), cards: Array.isArray(j.cards) ? j.cards : [], actions: Array.isArray(j.actions) ? j.actions : [] };
  if (Array.isArray(j.checks) && j.checks.length) m.checks = j.checks;
  if (j.ask && typeof j.ask === 'object' && j.ask.question) m.ask = j.ask;
  if (typeof j.report === 'string' && j.report) m.report = j.report;
  if (typeof j.rerun === 'string' && j.rerun) m.rerun = j.rerun;
  if (typeof j.env === 'string' && /^(dev|preprod|prod)$/.test(j.env)) m.env = j.env;
  if (j.tone === 'bad') m.tone = 'bad';
  if (j.watch && typeof j.watch.id === 'string') m.watch = { id: j.watch.id, env: j.watch.env || m.env || '', limit: j.watch.limit, elapsed: 0 };
  return m;
}

const following = new Set();
function follow() {
  for (const m of load()) {
    if (!m.watch || m.watch.done || following.has(m.watch.id)) continue;
    following.add(m.watch.id);
    followWatch(m, () => { save(); render(); }, st => { save(); push(verdictMessage(st)); });
  }
}

function answerEnv(m) {
  return (m && m.ask && m.ask.env) || (m && m.env) || envLabel().toLowerCase();
}

async function askAssistant(q, answer) {
  q = String(q || '').trim();
  if (!q || pending) return;
  openAssistant();
  const history = load().filter(m => m.text && !m.watch).slice(-6).map(m => ({ r: m.r, text: String(m.text).slice(0, 400) }));
  push({ r: 'u', text: q });
  pending = true;
  render();
  try {
    const j = await post('/api/assistant/ask', answer ? { q, page: currentPage(), answer } : { q, page: currentPage(), history });
    aiLine(root, j.ai); push(asReply(j));
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
    follow();
    toast(String(j.text || 'Done').slice(0, 140), 'ok');
  } catch (e) {
    m.state = 'failed';
    const t = errText(e);
    push({ r: 'a', text: t, tone: 'bad' });
    toast(t, 'error');
  }
  if (input && isOpen()) input.focus();
}

function fixCheck(ref) {
  const [i, j] = ref.split(':').map(Number);
  const m = load()[i];
  const c = m && m.checks && m.checks[j];
  if (!c || !c.fix || !c.fix.id || pending) return;
  askAssistant(c.fix.label || 'Fix', { slot: 'fix', value: String(c.fix.id), env: answerEnv(m) });
}

function pickAsk(ref) {
  const [i, j] = ref.split(':').map(Number);
  const m = load()[i];
  const c = m && m.ask && m.ask.choices && m.ask.choices[j];
  if (!c || m.answered != null || pending) return;
  m.answered = c.label;
  save();
  askAssistant(c.label, { slot: m.ask.slot, value: String(c.value), env: answerEnv(m) });
}

function useAsk(i) {
  const m = load()[i];
  const f = list.querySelector('[data-askin="' + i + '"]');
  const v = f ? f.value.trim() : '';
  if (!m || !m.ask || m.answered != null || pending || !v) { if (f) f.focus(); return; }
  m.answered = v;
  save();
  askAssistant(v, { slot: m.ask.slot, value: v, env: answerEnv(m) });
}

function cancelConfirm(i) {
  const m = load()[i];
  if (!m || m.state) return;
  m.state = 'cancel';
  save();
  render();
}

async function go(href) {
  if (href === '#assistant/help') { askAssistant('help'); return; }
  if (href === '#minigames') { closeAssistant(true); window.dispatchEvent(new CustomEvent('minigames-open')); return; }
  const p = /^#page\/([^?]+)(?:\?(.*))?$/.exec(href || '');
  const e = /^#entity\/([^/]+)\/(.+)$/.exec(href || '');
  if (!p && !e) return;
  closeAssistant(true);
  if (p) {
    const q = new URLSearchParams(p[2] || '');
    const page = resolvePage(decodeURIComponent(p[1]));
    if (page === 'features' && q.get('feature')) openFeature(q.get('feature'), { tests: q.get('tests') === '1' });
    else navigate(page);
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
    '<div class="as-ai" role="status" hidden></div><div class="as-list" aria-live="polite"></div>' +
    '<form class="as-f"><textarea class="as-in" rows="1" placeholder="Ask the assistant..." aria-label="Message the assistant" spellcheck="false"></textarea>' +
    '<button type="submit" class="as-send" aria-label="Send">' + SEND + '</button></form>';
  return el;
}

function ensure() {
  if (root) return;
  root = build();
  document.body.appendChild(root);
  const css = document.createElement('style');
  css.textContent = WATCH_CSS;
  document.head.appendChild(css);
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
  list.addEventListener('keydown', ev => {
    const t = ev.target.closest && ev.target.closest('[data-askin]');
    if (t && ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); useAsk(Number(t.dataset.askin)); }
  });
  list.addEventListener('click', ev => {
    const t = ev.target.closest('[data-href],[data-q],[data-ok],[data-no],[data-fix],[data-pick],[data-use],[data-report],[data-rerun],[data-copy]');
    if (!t || t.disabled) return;
    if (t.dataset.fix) fixCheck(t.dataset.fix);
    else if (t.dataset.pick) pickAsk(t.dataset.pick);
    else if (t.dataset.use) useAsk(Number(t.dataset.use));
    else if (t.dataset.copy) copyText(t.dataset.copy, 'GM command');
    else if (t.dataset.report) { const m = load()[Number(t.dataset.report)]; if (m && m.report) copyText(m.report); }
    else if (t.dataset.rerun) { const m = load()[Number(t.dataset.rerun)]; if (m && m.rerun) askAssistant(m.rerun); }
    else if (t.dataset.href) go(t.dataset.href);
    else if (t.dataset.q) askAssistant(t.dataset.q);
    else if (t.dataset.ok) runConfirm(Number(t.dataset.ok));
    else cancelConfirm(Number(t.dataset.no));
  });
  render();
  follow();
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
    loadChips(); loadAiStatus(root);
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
