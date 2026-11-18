import { $, el, clear } from '../core/dom.js';
import { icon, btn, badge } from '../components.js';
import { CR, CR_ENVS, crFetch } from './crashes_state.js';
import { renderOverview } from './crashes_overview.js';
import { renderList } from './crashes_list.js';
import { renderDetail } from './crashes_detail.js';
import { renderSessions } from './crashes_sessions.js';
import { renderAnalytics } from './crashes_analytics.js';
import { renderGuards } from './crashes_guards.js';

const DAYS_KEY = 'eden.crashes.days';
const ENV_KEY = 'eden.crashes.env';

export function initCrashes(host) {
  CR.host = host;
  CR.nav = { go, showList, openReport, showSessions, openSession, useEnv };
}

function useEnv(v) {
  if (!v || !CR_ENVS.some(e => e[0] === v)) return;
  CR.env = v;
  CR.envChosen = true;
  const sel = $('#crx-env');
  if (sel) sel.value = v;
}

function landing(target) {
  if (typeof target !== 'string' || !target.startsWith('crashes')) return () => go('overview');
  const m = /^crashes:(dev|preprod|prod|other):/.exec(target);
  if (m) {
    useEnv(m[1]);
    target = 'crashes:' + target.slice(m[0].length);
  }
  if (target.startsWith('crashes:sig:')) {
    const sig = target.slice(12);
    return () => showList({ signature: sig });
  }
  if (target.startsWith('crashes:regression:')) return () => go('analytics');
  if (target === 'crashes:guards') return () => go('guards');
  return () => go('overview');
}

export async function openCrashes(target) {
  const H = CR.host;
  if (!H || !H.guardPage('crashes.view', 'Crashes')) return;
  H.edenSetView('crashes');
  const c = $('#content');
  if (!c) return;
  try { localStorage.removeItem('eden.crashes.demo'); } catch (_) { void 0; }
  try { CR.days = parseInt(localStorage.getItem(DAYS_KEY) || '30', 10) || 30; } catch (_) { CR.days = 30; }
  let storedEnv = null;
  try { storedEnv = localStorage.getItem(ENV_KEY); } catch (_) { storedEnv = null; }
  CR.envChosen = storedEnv !== null;
  CR.env = CR.envChosen ? storedEnv : '';
  CR.source = null;
  try { CR.source = await crFetch('/source'); } catch (_) { CR.source = null; }
  const ae = CR.source && CR.source.active_env;
  if (!CR.envChosen && ae && CR_ENVS.some(e => e[0] === ae)) CR.env = ae;
  CR.detailId = null;
  CR.total = null;
  CR.sessionId = null;
  CR.sessTotal = null;
  clear(c);
  c.appendChild(shell());
  landing(target)();
}

function shell() {
  const days = el('select', { id: 'crx-days', title: 'Time window of the overview' },
    [7, 14, 30, 90].map(d => el('option', { value: String(d), selected: d === CR.days ? true : null }, d + ' days')));
  days.onchange = () => {
    CR.days = parseInt(days.value, 10) || 30;
    try { localStorage.setItem(DAYS_KEY, String(CR.days)); } catch (_) { CR.days = parseInt(days.value, 10) || 30; }
    if (CR.tab === 'overview' || CR.tab === 'analytics' || CR.tab === 'guards') go(CR.tab);
  };
  const env = el('select', { id: 'crx-env', title: 'Server the crashes were reported from (client connect.ini host)' },
    CR_ENVS.map(([v, label]) => el('option', { value: v, selected: v === CR.env ? true : null }, label)));
  env.onchange = () => {
    CR.env = env.value;
    CR.envChosen = true;
    try { localStorage.setItem(ENV_KEY, CR.env); } catch (_) { CR.envChosen = true; }
    CR.offset = 0;
    CR.sessOffset = 0;
    go(CR.tab);
  };
  return el('div', { class: 'crx-wrap' },
    el('div', { class: 'crx-head' },
      el('h2', {}, icon('bug', 24), 'Crashes'),
      el('span', { id: 'crx-src', class: 'crx-src' }),
      el('div', { class: 'crx-head-r' },
        el('label', { class: 'crx-ctl' }, 'Server', env),
        el('span', { id: 'crx-envwarn' }),
        el('label', { class: 'crx-ctl' }, 'Period', days),
        btn({ label: 'Refresh', icon: 'refresh', variant: 'ghost', class: 'xs', onClick: () => go(CR.tab) }))),
    el('div', { class: 'esub crx-lead' }, 'Client crashes (game_.exe) sent by the crash_reporter DLL feature and stored on the back-office. Abnormal exits are sessions that ended without a clean shutdown and without an exception (kill, power loss); hangs are main-thread freezes of 30 s or more caught by the watchdog. Sessions and Analytics use the session summaries sent by crash_reporter 0.2.0 and later; Guards counts every crash avoided by crash_guard 1.2.0 and later (by guard, site, DLL version and day) against the crashes that happened.'),
    el('nav', { class: 'fx-tabs crx-tabs', id: 'crx-tabs', role: 'tablist' }),
    el('div', { id: 'crx-body' }));
}

function renderTabs() {
  const nav = $('#crx-tabs');
  if (!nav) return;
  clear(nav);
  const tabs = [['overview', 'rate', 'Overview', null], ['list', 'document', 'Reports', CR.total],
    ['sessions', 'usage_time', 'Sessions', CR.sessTotal], ['analytics', 'compare', 'Analytics', null],
    ['guards', 'barrier', 'Guards', null]];
  if (CR.detailId != null) tabs.push(['detail', 'search', 'Report #' + CR.detailId, null]);
  for (const [k, ic, label, count] of tabs) {
    const b = el('button', { class: 'fx-tab' + (CR.tab === k ? ' on' : ''), role: 'tab', type: 'button' },
      icon(ic, 24), label, count != null ? el('span', { class: 'crx-count' }, String(count)) : null);
    b.onclick = () => go(k);
    nav.appendChild(b);
  }
}

function renderSource() {
  const s = $('#crx-src');
  if (!s) return;
  clear(s);
  const paint = j => {
    clear(s);
    s.appendChild(j.configured
      ? badge('BO · ' + String(j.base_url || '').replace(/^https?:\/\//, ''), 'neutral', { title: 'Back-office API key read from: ' + j.key_source })
      : badge('BO API key missing', 'error', { title: 'Set bo_crash_api_key in the tool config, or CRASH_BOT_API_KEY in the environment or discord_bot/.env' }));
  };
  if (CR.source) { paint(CR.source); return; }
  crFetch('/source').then(j => { CR.source = j; paint(j); }).catch(() => clear(s));
}

function go(tab) {
  const body = $('#crx-body');
  if (!body) return;
  CR.tab = tab === 'detail' && CR.detailId == null ? 'list' : tab;
  renderTabs();
  renderSource();
  clear(body);
  if (CR.tab === 'overview') renderOverview(body);
  else if (CR.tab === 'list') renderList(body).then(renderTabs);
  else if (CR.tab === 'sessions') renderSessions(body).then(renderTabs);
  else if (CR.tab === 'analytics') renderAnalytics(body);
  else if (CR.tab === 'guards') renderGuards(body);
  else renderDetail(body, CR.detailId);
  const c = $('#content');
  if (c) c.scrollTop = 0;
}

function showList(filters) {
  for (const k of Object.keys(CR.filters)) CR.filters[k] = '';
  Object.assign(CR.filters, filters || {});
  CR.offset = 0;
  go('list');
}

function openReport(id) {
  CR.detailId = id;
  go('detail');
}

function showSessions(filters) {
  for (const k of Object.keys(CR.sessFilters)) CR.sessFilters[k] = '';
  Object.assign(CR.sessFilters, filters || {});
  CR.sessOffset = 0;
  CR.sessionId = null;
  go('sessions');
}

function openSession(id) {
  CR.sessionId = id;
  go('sessions');
}
