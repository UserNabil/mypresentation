import { $, esc } from '../core/dom.js';

const IC = '/studio/icons/icons/';
const ico = (n, s, cls) => '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + IC + (s > 64 ? 256 : 128) + '/' + n + '.png" width="' + s + '" height="' + s + '" alt="">';
const STEPS = ['Create the folders', 'Download the client', 'Unpack the files', 'Add the launcher', 'Save the settings'];
const FILL = ['archive', 'treasure_archive', 'folder_open', 'packaging', 'install'];

let timer = 0;
let mode = '';
let work = '';

export function clientSetupHtml() {
  return '<div class="cs-block" id="cs-files"><div class="cs-t">' + ico('packaging', 32) + '<span>Game files</span></div>'
    + '<div class="cs-row cs-seg" role="radiogroup" aria-label="Game files">'
    + '<label class="cs-chk" title="The tool reads the game files straight from the RFG archives of the game folder. A small work folder keeps the data tables and the files you edit until Repack."><input type="radio" name="cs-mode" value="archives"><span>RFG archives</span></label>'
    + '<label class="cs-chk" title="The tool reads and edits a full unpacked copy of the game (game_unpacked, about 23 GB)."><input type="radio" name="cs-mode" value="unpacked"><span>Unpacked folder (legacy)</span></label></div>'
    + '<div id="cs-work" class="cs-note"></div>'
    + '<div class="cs-row" id="cs-work-act" style="display:none"><button class="sbtn" id="cs-prepare" type="button" title="Copy the data tables (data/db, data/db_locale, data/scene) from the RFG archives into the work folder. Files you edited are kept.">' + ico('folder_open', 24) + '<span>Prepare work folder</span></button>'
    + '<button class="sbtn ghost" id="cs-clean" type="button" title="Remove untouched copies of archive files left by an old depack. Data tables, edited and installed files are kept.">Clean work folder</button></div></div>'
    + '<div class="cs-block" id="cs-block"><div class="cs-t">' + ico('install', 32) + '<span>New tester</span></div>'
    + '<div class="cs-row"><input id="cs-root" placeholder="D:\\Test" autocomplete="off" spellcheck="false"><button class="sbtn gold cs-go" id="cs-go" type="button">Install</button></div>'
    + '<div class="cs-note" id="cs-installs"></div>'
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
  const label = i === 2 && mode === 'archives' ? 'Prepare the work folder' : STEPS[i];
  return '<div class="cs-step ' + st + '">' + mark + '<span class="cs-lbl">' + esc(label) + '</span>' + right + '</div>';
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

function say(msg, ok) {
  const w = $('#cs-work');
  if (!w) return;
  w.innerHTML = esc(workLine()) + (msg ? '<div class="' + (ok ? 'cs-ok' : 'cs-err') + '">' + esc(msg) + '</div>' : '');
}

function workLine() {
  if (mode === 'archives') return 'The game reads the RFG archives. Work folder: ' + work + ' (data tables and the files you edit or install, until Repack).';
  return 'The tool uses the unpacked folder below (Client root).';
}

function qcRow(key) {
  const i = document.querySelector('#qc-fields input[data-k="' + key + '"]');
  if (!i) return [];
  const f = i.closest('.qc-f');
  const a = f && f.nextElementSibling && f.nextElementSibling.classList.contains('qc-a') ? f.nextElementSibling : null;
  return [f, a].filter(Boolean);
}

function applyMode(s) {
  mode = s.mode || 'unpacked';
  work = s.overlay || '';
  document.querySelectorAll('input[name="cs-mode"]').forEach(r => { r.checked = r.value === mode; });
  qcRow('client_root').forEach(el => { el.style.display = mode === 'archives' ? 'none' : ''; });
  const act = $('#cs-work-act');
  if (act) act.style.display = mode === 'archives' ? '' : 'none';
  const ins = $('#cs-installs');
  if (ins) ins.textContent = mode === 'archives' ? 'Install downloads the RFG archives only: nothing is unpacked (Game files: RFG archives).' : 'Install downloads the client and unpacks it into an unpacked folder (Game files: Unpacked folder).';
  let note = '';
  if (mode === 'archives' && s.has_key === false) note = 'RFG key missing: sign out of the tool and sign in again with your game account.';
  else if (mode === 'archives' && s.error) note = s.error;
  else if (mode === 'archives' && (s.other_work || []).length) note = 'Other environments using this game keep their own work folder: ' + s.other_work.map(o => o.env).join(', ') + '. Repack from the environment where you installed.';
  say(note, false);
}

async function loadMode() {
  try { applyMode(await (await fetch('/api/assets/status')).json()); } catch (e) { say('Could not read the Game files setting', false); }
}

async function setMode(m) {
  document.querySelectorAll('input[name="cs-mode"]').forEach(r => { r.disabled = true; });
  try {
    const env = (document.getElementById('qc-env') || {}).dataset ? (document.getElementById('qc-env').dataset.env || '') : '';
    const r = await fetch('/api/assets/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: m, env, hydrate: m === 'archives' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { say(j.detail || ('Error ' + r.status), false); await loadMode(); }
    else { applyMode(j); if (m === 'archives' && j.ready === false) say('RFG archives mode is on, but the work folder could not be prepared' + (j.error ? ': ' + j.error : ''), false); }
  } catch (e) { say('Could not reach the tool', false); await loadMode(); }
  document.querySelectorAll('input[name="cs-mode"]').forEach(r => { r.disabled = false; });
}

async function prepare() {
  const b = $('#cs-prepare');
  if (b) b.disabled = true;
  say('Preparing the work folder…', true);
  try {
    const r = await fetch('/api/pkg/unpack?only=' + encodeURIComponent('data/db'), { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { say(j.detail || ('Error ' + r.status), false); if (b) b.disabled = false; return; }
    let st = {};
    for (;;) {
      await new Promise(res => setTimeout(res, 600));
      st = await (await fetch('/api/pkg/unpack/status')).json().catch(() => ({}));
      if (!st.running) break;
      if (st.total) say('Preparing the work folder… ' + (st.done || 0) + '/' + st.total, true);
    }
    if (st.error) say(st.error, false); else say('Work folder ready: ' + (st.extracted || 0) + ' file(s) copied, ' + (st.skipped || 0) + ' already there', true);
  } catch (e) { say('Could not reach the tool', false); }
  if (b) b.disabled = false;
}

async function clean() {
  const b = $('#cs-clean');
  if (b) b.disabled = true;
  try {
    const pv = await (await fetch('/api/assets/clean', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: false }) })).json();
    if (!pv.files) { say('Nothing to clean: the work folder only holds data tables and your files.', true); if (b) b.disabled = false; return; }
    const gb = (pv.bytes / 1073741824).toFixed(2);
    if (!confirm('Remove ' + pv.files + ' untouched archive copies (' + gb + ' GB) from the work folder? Data tables, edited and installed files are kept.')) { if (b) b.disabled = false; return; }
    const r = await fetch('/api/assets/clean', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: true }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) say(j.detail || ('Error ' + r.status), false); else say('Removed ' + j.removed + ' file(s), ' + ((j.freed || 0) / 1073741824).toFixed(2) + ' GB freed', true);
  } catch (e) { say('Could not reach the tool', false); }
  if (b) b.disabled = false;
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
  if (!st.error) { fillFields(st.saved); loadMode(); }
}

async function start(confirmed) {
  const root = ($('#cs-root').value || '').trim();
  const go = $('#cs-go');
  let r, j = {};
  try {
    r = await fetch('/api/client/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root, confirm: !!confirmed, archives_only: mode === 'archives' }) });
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
  document.querySelectorAll('input[name="cs-mode"]').forEach(r => { r.onchange = () => { if (r.checked) setMode(r.value); }; });
  const pb = $('#cs-prepare');
  if (pb) pb.onclick = prepare;
  const cb = $('#cs-clean');
  if (cb) cb.onclick = clean;
  loadMode();
  fetch('/api/client/setup/status').then(r => r.json()).then(st => { if (st && st.steps && st.steps.length && (st.running || st.finished)) poll(); }).catch(() => {});
}
