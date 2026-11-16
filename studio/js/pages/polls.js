/* ============================================================================
   pages/polls.js — Polls: in-game polls of the ACTIVE environment only (each poll
   belongs to one environment, feature polls, docs/studies/polls.md). SA create,
   edit, close and send rewards (polls.manage); GM read the polls and results
   (polls.view). Rewards are mailed by the polls server part of the environment;
   "Send rewards" runs one pass of it now.
   Editor + preview: polls_edit.js. Backend: polls_admin.py (/api/polls/*).
   ============================================================================ */

import { $, el, clear, append } from '../core/dom.js';
import { icon, btn, badge, card, emptyState, errorState, dataTable, filterBar } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { uiConfirm } from '../ui/dialogs.js';
import { renderEditor, blankPoll, fromPoll, fmtLeft, fmtDate, bars } from './polls_edit.js';

const ROOT = '/api/polls';
const TABS = [['open', 'Open'], ['scheduled', 'Scheduled'], ['draft', 'Drafts'], ['closed', 'Closed']];
const STATE_TONE = { open: 'ok', scheduled: 'info', draft: 'neutral', closed: 'warn' };
const GRANT_TONE = { pending: 'neutral', queued: 'info', sent: 'ok', failed: 'error', cancelled: 'warn' };
const S = { host: null, ctx: null, data: null, tab: 'open', view: 'list', res: null, timer: null, skew: 0, busy: false };

export function initPolls(host) { S.host = host; }

const nowS = () => Date.now() / 1000 + S.skew;

export async function openPolls() {
  const H = S.host;
  if (!H || !H.guardPage('polls.view', 'Polls')) return;
  H.edenSetView('polls');
  const c = $('#content');
  if (!c) return;
  clear(c);
  S.view = 'list';
  S.res = null;
  c.appendChild(el('div', { id: 'pl-wrap', class: 'cda-wrap pl-wrap' },
    el('div', { id: 'pl-head' }), el('div', { id: 'pl-notes', class: 'cda-notes' }), el('div', { id: 'pl-body' })));
  renderHead();
  await loadContext();
  if (S.ctx && S.ctx.installed && !S.ctx.db_error) await refresh();
  startTimer();
}

async function loadContext() {
  const b = $('#pl-body');
  if (b) clear(b).appendChild(emptyState({ title: 'Reading the environment…', icon: 'megaphone' }));
  try {
    S.ctx = await api.get(ROOT + '/context');
    S.skew = (S.ctx.now || Date.now() / 1000) - Date.now() / 1000;
  } catch (e) {
    S.ctx = null;
    if (b) clear(b).appendChild(errorState({ error: e, title: 'Cannot read the poll context', onRetry: openPolls }));
    return;
  }
  renderHead();
  renderNotes();
  if (!S.ctx.installed && b) clear(b);
}

async function refresh() {
  const b = $('#pl-body');
  if (!b) return;
  if (!S.data && S.view === 'list') clear(b).appendChild(emptyState({ title: 'Reading the polls…', icon: 'megaphone' }));
  try {
    S.data = await api.get(ROOT + '/list');
    S.skew = S.data.now - Date.now() / 1000;
  } catch (e) {
    if (S.view === 'list') clear(b).appendChild(errorState({ error: e, title: 'Cannot read the polls', onRetry: refresh }));
    return;
  }
  if (S.view === 'list') renderList();
}

function canManage() {
  return !!(S.host && S.host.can && S.host.can('polls.manage'));
}

function canDeliver() {
  const c = S.ctx;
  return !!(c && c.installed && !c.db_error && c.mail_queue && c.mail_queue.ok && canManage());
}

async function write(url, body, what) {
  const b = Object.assign({}, body || {}, { env: S.ctx && S.ctx.env });
  if (S.ctx && S.ctx.prod) {
    if (!await uiConfirm('PRODUCTION: ' + what + '? Players see it right away.', 'Production environment', 'Yes, on production')) return null;
    b.confirm = 'prod';
  }
  return api.post(url, b);
}

function renderHead() {
  const h = $('#pl-head');
  if (!h) return;
  const c = S.ctx || {};
  const ok = c.installed && !c.db_error;
  clear(h).appendChild(el('div', { class: 'cda-head' },
    el('h2', {}, icon('megaphone', 24), 'Polls'),
    el('span', { class: 'cda-src' },
      canManage() ? badge('SA', 'info') : badge('View only', 'neutral'),
      c.env ? badge(c.prod ? 'PRODUCTION' : 'Environment: ' + c.env, c.prod ? 'error' : (c.env === 'dev' ? 'ok' : 'warn')) : null),
    el('div', { class: 'cda-head-r' },
      btn({ label: 'Refresh', icon: 'refresh', variant: 'ghost', busyLabel: 'Reading…', onClick: async () => { await loadContext(); if (S.ctx && S.ctx.installed) { S.view === 'results' && S.res ? await loadResults(S.res.poll.id) : await refresh(); } } }),
      canManage() ? btn({ label: 'Send rewards', icon: 'rewards', variant: 'ghost', disabled: !canDeliver(), busyLabel: 'Sending…',
        title: c.mail_queue && !c.mail_queue.ok ? 'sys_mail_queue is not usable on this environment' : 'Run the reward mailer of ' + (c.env || 'this environment') + ' now', onClick: () => deliver() }) : null,
      canManage() ? btn({ label: 'New poll', icon: 'add', disabled: !ok, onClick: () => openEditor(blankPoll(nowS())) }) : null)));
  h.appendChild(el('div', { class: 'esub cda-lead' }, 'Polls appear in game behind the poll button of the menu bar (a "!" shows when one waits for an answer). '
    + 'Answers work like Discord polls: 1 to 10 answers, one or several choices, the vote can be changed until the end. '
    + 'Every poll belongs to one environment: this page shows and changes only the polls of ' + (c.env || 'the active environment')
    + '. Rewards go out as system mail, once per account, sent by the polls service of that environment.'));
}

function renderNotes() {
  const n = $('#pl-notes');
  if (!n) return;
  clear(n);
  const c = S.ctx;
  if (!c) return;
  const note = (err, ...kids) => n.appendChild(el('div', { class: err ? 'cda-err' : 'cda-warn' }, icon(err ? 'error' : 'warning', 24), el('span', {}, ...kids)));
  if (c.prod) note(true, el('b', {}, 'PRODUCTION. '), 'Polls, votes and rewards here reach real players. Every change asks for a confirmation.');
  if (c.db_error) note(true, 'Database: ' + c.db_error);
  else if (!c.installed) {
    note(false, 'The poll tables are missing or out of date on ' + c.env + ' (' + c.missing.join(', ') + '). ',
      canManage() ? btn({ label: 'Install tables', icon: 'database', variant: 'mini', busyLabel: 'Installing…', disabled: !c.schema_file,
        title: c.schema_file || 'polls_schema.sql not found', onClick: install }) : 'A super admin (SA) must install them.',
      c.schema_file ? null : ' polls_schema.sql was not found: pull the latest features first.');
  }
  if (c.unowned) note(false, c.unowned + ' poll(s) of this database have no environment (made before polls 0.6): they are hidden, never served nor rewarded. ',
    canManage() ? btn({ label: 'Give them to ' + c.env, icon: 'database', variant: 'mini', busyLabel: 'Updating…', onClick: install }) : 'A super admin (SA) can give them to ' + c.env + '.');
  const others = Object.keys(c.other_envs || {});
  if (others.length) note(false, 'This database also holds ' + others.map(k => c.other_envs[k] + ' poll(s) of ' + k).join(', ')
    + ' (copied from another environment): hidden here, never served nor rewarded on ' + c.env + '.');
  if (!c.db_error && c.mail_queue && !c.mail_queue.ok) note(false, 'sys_mail_queue lacks the column(s) ' + c.mail_queue.missing.join(', ') + ': rewards cannot be sent.');
  if (/sql_ascii/i.test(c.server_encoding || '')) note(false, 'The database encoding is SQL_ASCII: its length checks count bytes, so accents and emoji take 2 to 4 of the limit.');
}

async function install() {
  try {
    const r = await write(ROOT + '/install', {}, 'install the poll tables');
    if (!r) return;
    toast(r.message, 'ok');
  } catch (e) { toast(errMessage(e), 'error', { duration: 12000 }); return; }
  await loadContext();
  if (S.ctx && S.ctx.installed) await refresh();
}

function counts() {
  const out = { open: 0, scheduled: 0, draft: 0, closed: 0 };
  for (const p of (S.data && S.data.polls) || []) out[p.state] = (out[p.state] || 0) + 1;
  return out;
}

function timeCell(p) {
  const now = nowS();
  if (p.state === 'draft') return el('span', { class: 'cda-dim' }, 'Runs ' + fmtLeft(p.ends_at - p.starts_at) + (p.ends_at <= now ? ' (end date passed)' : ''));
  if (p.state === 'scheduled') return el('span', { title: fmtDate(p.starts_at) }, 'Starts in ' + fmtLeft(p.starts_at - now));
  if (p.state === 'open') return el('span', { title: fmtDate(p.ends_at) }, 'Ends in ' + fmtLeft(p.ends_at - now));
  const end = p.closed_at && p.closed_at < p.ends_at ? p.closed_at : p.ends_at;
  return el('span', { title: p.closed_at ? 'Closed by hand' : 'Reached its end date' }, 'Ended ' + fmtDate(end));
}

function rewardCell(p) {
  if (p.reward_mode === 'none') return el('span', { class: 'cda-dim' }, 'none');
  const g = p.grants || {};
  const parts = Object.keys(g).map(k => g[k] + ' ' + k);
  return el('span', { title: (p.rewards || []).map(r => '#' + r.item_id + ' ' + (r.name || '') + ' x' + r.quantity).join('\n') },
    (p.reward_mode === 'on_vote' ? 'on vote' : 'on close') + ' · ' + (p.rewards || []).length + ' item(s)',
    parts.length ? el('div', { class: 'cda-dim cda-small' }, parts.join(', ')) : null);
}

function actions(p) {
  const a = [], now = nowS(), votes = p.votes || 0;
  if (!canManage()) return el('span', { class: 'pl-acts' }, p.state !== 'draft' ? btn({ label: 'Results', icon: 'readiness', variant: 'mini', onClick: () => loadResults(p.id) }) : null);
  const act = (label, ic, action, what, variant) => btn({ label, icon: ic, variant: variant || 'mini', busyLabel: '…', onClick: () => doAction(p, action, what) });
  a.push(btn({ label: 'Edit', icon: 'edit', variant: 'mini', onClick: () => openEditor(fromPoll(p)) }));
  if (p.state !== 'draft') a.push(btn({ label: 'Results', icon: 'readiness', variant: 'mini', onClick: () => loadResults(p.id) }));
  if (p.state === 'draft') a.push(act('Publish', 'megaphone', 'publish', 'publish poll #' + p.id));
  if ((p.state === 'open' || p.state === 'scheduled')) a.push(act('Close', 'stop', 'close', 'close poll #' + p.id + ' now'));
  if ((p.state === 'open' || p.state === 'scheduled') && !votes) a.push(act('Unpublish', 'undo', 'unpublish', 'take poll #' + p.id + ' back to draft'));
  if (p.state === 'closed' && p.closed_at && p.ends_at > now) a.push(act('Reopen', 'refresh', 'reopen', 'reopen poll #' + p.id));
  a.push(act('Duplicate', 'export', 'duplicate', 'duplicate poll #' + p.id));
  if (p.state === 'draft' && !votes) a.push(act('Delete', 'delete', 'delete', 'delete poll #' + p.id));
  return el('span', { class: 'pl-acts' }, a);
}

async function doAction(p, action, what) {
  if (action === 'delete' && !(S.ctx && S.ctx.prod) && !await uiConfirm('Delete draft #' + p.id + ' "' + p.question + '"?', 'Delete a poll', 'Delete')) return;
  if (action === 'close' && !(S.ctx && S.ctx.prod) && !await uiConfirm('Close poll #' + p.id + ' now? Players can no longer vote.'
    + (p.reward_mode === 'on_close' ? ' Every voter gets the reward.' : ''), 'Close a poll', 'Close')) return;
  try {
    const r = await write(ROOT + '/' + p.id + '/' + action, {}, what);
    if (!r) return;
    toast(r.message, 'ok');
  } catch (e) { toast(errMessage(e), 'error', { duration: 10000 }); }
  await refresh();
}

function sorted(rows) {
  const k = { open: p => p.ends_at, scheduled: p => p.starts_at, draft: p => -p.updated_at, closed: p => -(p.closed_at || p.ends_at) }[S.tab];
  return rows.slice().sort((a, b) => k(a) - k(b));
}

function renderList() {
  const b = $('#pl-body');
  if (!b || !S.data) return;
  const cnt = counts();
  const rows = sorted((S.data.polls || []).filter(p => p.state === S.tab));
  const bar = filterBar({ chips: TABS.map(([k, l]) => ({ key: k, label: l, count: cnt[k] })), active: S.tab, onPick: k => { S.tab = k; renderList(); } });
  const table = dataTable({
    rows,
    empty: emptyState({ title: 'No ' + (TABS.find(t => t[0] === S.tab) || [0, ''])[1].toLowerCase() + ' poll', icon: 'megaphone',
      hint: S.tab === 'draft' ? 'New poll creates a draft; publish it when it is ready.' : '' }),
    columns: [
      { key: 'id', label: '#', width: '40px', render: p => el('b', {}, String(p.id)) },
      { key: 'q', label: 'Question', render: p => el('div', {}, el('div', { class: 'pl-q' }, p.question),
        el('div', { class: 'cda-dim cda-small' }, (p.options || []).map(o => (o.emoji ? o.emoji + ' ' : '') + o.text).join(' · ')),
        el('div', { class: 'cda-dim cda-small' }, (p.multiselect ? 'several choices' : 'one choice') + ' · '
          + (p.vote_scope === 'account' ? 'one vote per account' : 'one vote per character') + (p.min_level > 1 ? ' · level ' + p.min_level + '+' : ''))) },
      { key: 'state', label: 'State', render: p => badge(p.state, STATE_TONE[p.state]) },
      { key: 'time', label: 'When', render: timeCell },
      { key: 'votes', label: 'Votes', render: p => el('span', { title: (p.votes || 0) + ' answer(s) picked' }, (p.voters || 0) + ' voter(s)') },
      { key: 'rw', label: 'Rewards', render: rewardCell },
      { key: 'act', label: '', render: actions },
    ],
  });
  clear(b).appendChild(card({ title: 'Polls', icon: 'megaphone', subtitle: (S.data.polls || []).length + ' in total', body: [bar.node, table] }));
}

function openEditor(D) {
  S.view = 'edit';
  const b = $('#pl-body');
  if (!b) return;
  renderEditor(b, D, {
    ctx: S.ctx, nowS,
    upload: b => write(ROOT + '/image', b, 'upload a poll picture to the CDN'),
    cancel: () => { S.view = 'list'; renderList(); },
    save: async body => {
      let r;
      try {
        r = await write(ROOT + '/save', body, (body.id ? 'save poll #' + body.id : 'create a poll draft'));
        if (!r) return;
      } catch (e) { toast(errMessage(e), 'error', { duration: 12000 }); return; }
      toast(r.message + ((r.warnings || []).length ? ' - ' + r.warnings.join(' - ') : ''), (r.warnings || []).length ? 'warn' : 'ok', { duration: 8000 });
      S.view = 'list';
      if (r.poll) S.tab = r.poll.state;
      await refresh();
    },
  });
}

async function loadResults(id) {
  S.view = 'results';
  const b = $('#pl-body');
  if (!b) return;
  if (!S.res || S.res.poll.id !== id) clear(b).appendChild(emptyState({ title: 'Reading the results…', icon: 'readiness' }));
  try {
    S.res = await api.get(ROOT + '/' + id + '/results');
  } catch (e) {
    clear(b).appendChild(errorState({ error: e, title: 'Cannot read the results', onRetry: () => loadResults(id) }));
    return;
  }
  renderResults();
}

function renderResults() {
  const b = $('#pl-body');
  const R = S.res;
  if (!b || !R) return;
  const p = R.poll;
  const name = id => { const o = (p.options || []).find(x => x.answer_id === id); return o ? (o.emoji ? o.emoji + ' ' : '') + o.text : '#' + id; };
  const back = btn({ label: 'Back to the list', icon: 'back', variant: 'mini', onClick: () => { S.view = 'list'; S.res = null; refresh(); } });
  const reload = btn({ label: 'Refresh', icon: 'refresh', variant: 'mini', onClick: () => loadResults(p.id) });
  const head = el('div', {},
    el('div', { class: 'pl-q pl-big' }, p.question),
    p.description ? el('div', { class: 'esub' }, p.description) : null,
    el('div', { class: 'pl-inline', style: { margin: '6px 0' } }, badge(p.state, STATE_TONE[p.state]), timeCell(p),
      el('span', { class: 'cda-dim' }, R.voters.length + ' voter(s), ' + R.total_votes + ' answer(s) picked')),
    bars(p.options || [], { final: p.state === 'closed' }));
  const voters = dataTable({
    rows: R.voters, max: 500,
    empty: emptyState({ title: 'No vote yet', icon: 'megaphone' }),
    columns: [
      { key: 'c', label: 'Character', render: v => el('span', {}, v.char_name || '?', el('span', { class: 'cda-dim cda-small' }, v.char_id ? ' #' + v.char_id : '')) },
      { key: 'a', label: 'Account', render: v => v.account_id == null ? '' : String(v.account_id) },
      { key: 'ans', label: 'Answers', render: v => (v.answers || []).map(name).join(', ') },
      { key: 't', label: 'Voted', render: v => fmtDate(v.voted_at) },
      { key: 's', label: 'Source', render: v => badge(v.source || 'game', v.source === 'discord' ? 'info' : 'neutral') },
    ],
  });
  const grants = dataTable({
    rows: R.grants, max: 500,
    empty: p.reward_mode === 'none' ? 'This poll gives no reward' : (p.reward_mode === 'on_close' && p.state !== 'closed' ? 'Rewards are created when the poll closes' : 'No reward yet'),
    columns: [
      { key: 'c', label: 'Character', render: g => el('span', {}, g.char_name || '?', el('span', { class: 'cda-dim cda-small' }, ' #' + g.char_id)) },
      { key: 'k', label: 'Vote key', render: g => el('span', { class: 'cda-dim cda-small' }, g.grant_key) },
      { key: 's', label: 'Status', render: g => badge(g.status, GRANT_TONE[g.status]) },
      { key: 'm', label: 'Mails', render: g => el('span', { class: 'cda-small' }, g.mail_ids || '') },
      { key: 'd', label: 'Detail', render: g => el('span', { class: 'cda-small' }, g.detail || '') },
      { key: 'u', label: 'Updated', render: g => fmtDate(g.updated_at) },
    ],
  });
  clear(b);
  append(b, [
    card({ title: 'Results of poll #' + p.id, icon: 'readiness', actions: [reload, back], body: head }),
    card({ title: 'Voters', icon: 'party', subtitle: String(R.voters.length), body: voters }),
    card({ title: 'Rewards', icon: 'rewards', subtitle: p.reward_mode === 'none' ? 'none'
      : (p.reward_mode === 'on_vote' ? 'on vote' : 'on close') + ' · ' + (p.rewards || []).map(r => (r.name || '#' + r.item_id) + ' x' + r.quantity).join(', '),
    actions: canManage() ? [btn({ label: 'Send rewards', icon: 'rewards', variant: 'mini', disabled: !canDeliver(), onClick: () => deliver() })] : [], body: grants }),
  ]);
}

async function deliver() {
  if (!canDeliver() || S.busy) return;
  S.busy = true;
  try {
    const r = await api.post(ROOT + '/rewards/deliver', { env: S.ctx.env });
    toast('Rewards (' + (r.env || S.ctx.env) + '): ' + r.message, r.failed || r.cgi_failed ? 'warn' : 'ok', { duration: 9000 });
    if (S.view === 'results' && S.res) await loadResults(S.res.poll.id);
    else if (S.view === 'list') await refresh();
  } catch (e) {
    toast(errMessage(e), 'error', { duration: 10000 });
  } finally {
    S.busy = false;
  }
}

function stopTimer() {
  if (S.timer) clearInterval(S.timer);
  S.timer = null;
}

function startTimer() {
  stopTimer();
  S.timer = setInterval(() => {
    if (!document.getElementById('pl-wrap')) { stopTimer(); return; }
    if (S.view === 'list' && !S.busy) refresh();
  }, 60000);
}
