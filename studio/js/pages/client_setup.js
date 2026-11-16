import { $, esc } from '../core/dom.js';

const IC = '/studio/icons/icons/';
const ico = (n, s, cls) => '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + IC + (s > 64 ? 256 : 128) + '/' + n + '.png" width="' + s + '" height="' + s + '" alt="">';
const STEPS = ['Create the folders', 'Download the client', 'Unpack the files', 'Add the launcher', 'Save the settings'];
const FILL = ['archive', 'treasure_archive', 'folder_open', 'packaging', 'install'];

let timer = 0;

export function clientSetupHtml() {
  return '<div class="cs-block" id="cs-block"><div class="cs-t">' + ico('install', 32) + '<span>New tester</span></div>'
    + '<div class="cs-row"><input id="cs-root" placeholder="D:\\Test" autocomplete="off" spellcheck="false"><button class="sbtn gold cs-go" id="cs-go" type="button">Install</button></div>'
    + '<div id="cs-out"></div></div>';
}

function stepRow(s, i) {
  const st = s ? s.state : 'todo';
  let mark = '<span class="cs-dot"></span>';
  if (st === 'ok' || st === 'skip') mark = ico('success', 26);
  else if (st === 'err') mark = ico('error', 26);
  let right = '';
  if (st === 'run') {
    const pct = s.total ? Math.round(100 * (s.done || 0) / s.total) : -1;
    right = '<span class="cs-fill' + (pct < 0 ? ' ind' : '') + '" style="--p:' + (pct < 0 ? 40 : pct) + '">' + ico(FILL[i], 40, 'base') + ico(FILL[i], 40, 'top') + '</span><span class="cs-pct">' + (pct < 0 ? '' : pct + '%') + '</span>';
  } else if (st === 'skip') right = '<span class="cs-note">up to date</span>';
  return '<div class="cs-step ' + st + '">' + mark + '<span class="cs-lbl">' + esc(STEPS[i]) + '</span>' + right + '</div>';
}

function render(st, extra) {
  const out = $('#cs-out');
  if (!out) return;
  let h = '';
  if (st && st.steps && st.steps.length) h = '<div class="cs-steps">' + st.steps.map(stepRow).join('') + '</div>';
  if (st && st.error) h += '<div class="cs-err">' + esc(st.error) + '</div>';
  if (st && st.finished && !st.error) h += '<div class="cs-ok">' + ico('success', 26) + 'Ready</div>';
  if (extra) h += '<div class="cs-err">' + esc(extra) + '</div>';
  out.innerHTML = h;
}

function fillFields(saved) {
  if (!saved || !saved.written) return;
  Object.keys(saved.fields || {}).forEach(k => {
    const i = document.querySelector('#qc-fields input[data-k="' + k + '"]');
    if (i) { i.value = saved.fields[k]; i.title = saved.fields[k]; i.scrollLeft = i.scrollWidth; }
  });
}

async function poll() {
  let st;
  try { st = await (await fetch('/api/client/setup/status')).json(); } catch (e) { timer = setTimeout(poll, 1000); return; }
  render(st);
  const go = $('#cs-go');
  if (st.running) { if (go) go.disabled = true; timer = setTimeout(poll, 700); return; }
  timer = 0;
  if (go) { go.disabled = false; go.textContent = st.error ? 'Try again' : 'Install'; }
  if (!st.error) fillFields(st.saved);
}

async function start(confirm) {
  const root = ($('#cs-root').value || '').trim();
  const go = $('#cs-go');
  let r, j = {};
  try {
    r = await fetch('/api/client/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root, confirm: !!confirm }) });
    j = await r.json().catch(() => ({}));
  } catch (e) { render(null, 'Could not reach the tool'); return; }
  if (!r.ok) { render(null, j.detail || ('Error ' + r.status)); return; }
  if (j.needs_confirm) { render(null, j.message); go.textContent = 'Install anyway'; go.dataset.confirm = '1'; return; }
  go.dataset.confirm = '';
  go.disabled = true;
  if (timer) clearTimeout(timer);
  poll();
}

export function wireClientSetup() {
  const go = $('#cs-go');
  if (!go) return;
  go.onclick = () => start(go.dataset.confirm === '1');
  $('#cs-root').oninput = () => { go.dataset.confirm = ''; if (go.textContent === 'Install anyway') go.textContent = 'Install'; };
  fetch('/api/client/setup/status').then(r => r.json()).then(st => { if (st && st.steps && st.steps.length && (st.running || st.finished)) poll(); }).catch(() => {});
}
