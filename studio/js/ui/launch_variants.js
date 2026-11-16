import { fmReactAvailable } from '../pages/feature_manager_react.js';
import { toast } from './toast.js';
import { LV_CSS } from './launch_variants_css.js';
import { SIM, VIEW, simResult } from './launch_variants_views.js';

const MOVED = ['#lm-display', '#lm-warn'];

const $ = s => document.querySelector(s);
const S = { sim: '', state: { checks: [] }, busy: false, token: 0, ctx: null, avail: false };

function ensureCss() {
  if ($('#lv-css')) return;
  const st = document.createElement('style');
  st.id = 'lv-css';
  st.textContent = LV_CSS;
  document.head.appendChild(st);
}

function ensureRoot() {
  let root = $('#lv-root');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'lv-root';
  root.innerHTML = '<div id="lv-bar"></div><div id="lv-view"></div>'
    + '<details id="lv-settings"><summary><img src="/studio/icons/icons/64/settings.png" alt="">Settings</summary><div id="lv-set-body"></div></details>';
  const anchor = document.createElement('span');
  anchor.id = 'lv-anchor';
  anchor.hidden = true;
  const first = $('#lm-display');
  first.before(anchor);
  $('#launchModal .body').prepend(root);
  return root;
}

function moveSettings() {
  const nodes = MOVED.map(s => $(s)).filter(Boolean);
  $('#lv-set-body').append(...nodes);
}

function envList() {
  return [...document.querySelectorAll('#lm-env option')].map(o => o.value);
}

function btn(label, on, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (on) b.className = 'on';
  b.onclick = fn;
  return b;
}

function group(label, buttons) {
  const g = document.createElement('div');
  g.className = 'lv-grp';
  const l = document.createElement('span');
  l.className = 'lv-lbl';
  l.textContent = label;
  g.append(l, ...buttons);
  return g;
}

function renderBar() {
  const bar = $('#lv-bar');
  bar.innerHTML = '';
  bar.classList.toggle('has', S.avail);
  if (!S.avail) return;
  const sims = [btn('Live', !S.sim, () => setSim('')), ...Object.keys(SIM).map(k => btn(SIM[k].label, S.sim === k, () => setSim(k)))];
  bar.appendChild(group('▶ Simulate', sims));
}

function api() {
  const ctx = S.ctx;
  return {
    busy: S.busy, env: S.state.env || ctx.getEnv(), envs: envList(),
    fix: runFix, play: () => play(), setEnv,
  };
}

function render() {
  $('#launchModal .sheet').classList.add('lv-on');
  moveSettings();
  const view = $('#lv-view');
  view.innerHTML = '';
  renderBar();
  view.appendChild(VIEW(S.state, api()));
  if (S.sim) {
    const n = document.createElement('div');
    n.className = 'lv-sim';
    n.textContent = 'Simulation: nothing is launched';
    view.appendChild(n);
  }
}

async function refresh() {
  const tok = ++S.token;
  const env = S.ctx.getEnv();
  if (S.sim) {
    S.state = simResult(S.sim, env);
    S.busy = false;
    render();
    return;
  }
  S.busy = true;
  S.state = { env, checks: S.state.checks || [] };
  render();
  let data = null;
  try {
    const r = await fetch('/api/launch/preflight?env=' + encodeURIComponent(env));
    if (r.ok) data = await r.json();
  } catch (_) { }
  if (tok !== S.token) return;
  if (!data) {
    const off = $('#lm-yes').disabled;
    data = { env, checks: [{ id: 'preflight', state: off ? 'block' : 'warn', label: 'Checks unavailable', detail: '', fix: null }] };
  }
  S.state = data;
  S.busy = false;
  render();
}

function setSim(k) {
  S.sim = k;
  refresh();
}

function setEnv(e) {
  const sel = $('#lm-env');
  sel.value = e;
  sel.dispatchEvent(new Event('change'));
  S.state = { env: e, checks: [] };
  setTimeout(refresh, 0);
}

function play() {
  if (S.sim) { toast('Simulation: nothing was launched', 'info'); return; }
  const body = S.ctx.collect();
  body.env = S.state.env || body.env;
  S.ctx.launch(body);
}

async function runFix(c) {
  if (c.fix.sim) {
    c.state = 'ok';
    c.fix = null;
    S.state = { ...S.state, checks: S.state.checks.slice() };
    render();
    toast('Simulated fix: ' + c.label, 'ok');
    return;
  }
  S.busy = true;
  render();
  try {
    const opt = { method: c.fix.method || 'POST', headers: { 'Content-Type': 'application/json' } };
    if (c.fix.body) opt.body = JSON.stringify(c.fix.body);
    const r = await fetch(c.fix.url, opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(String(j.detail || 'fix failed'), 'error');
    else if (j.needs_close) toast('Close the game first, then try again', 'warn');
    else if (j.needs_confirm) toast('Your DLL is newer: use Copy DLL in Features to downgrade', 'warn');
    else toast('Done', 'ok');
  } catch (e) { toast(String(e && e.message || e), 'error'); }
  S.busy = false;
  refresh();
}

export async function setupVariants(ctx) {
  S.ctx = ctx;
  ensureCss();
  S.avail = await fmReactAvailable();
  S.sim = '';
  S.state = { env: ctx.getEnv(), checks: [] };
  ensureRoot();
  render();
  refresh();
}
