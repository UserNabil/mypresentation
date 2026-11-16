/* ============================================================================
   UPDATE WINDOW + DOWNLOAD SPEED TEST — la fenetre « Updating Eden Ultimate Tool ».

   Avant 2.209.0 la barre etait FIGEE a 25 % pendant tout le telechargement :
   /api/update/apply-all bloque jusqu'a la fin (zip des pages ~217 Mo + zip du
   moteur ~22 Mo), le front n'avait AUCUNE progression, puis Verify/Install/Done
   etaient trois animations de 0,5-0,9 s. Sur une liaison a ~0,7 Mo/s : 5-6 min
   immobile, puis remplissage « instantane » (retour GM Nunez, 2026-10-19).

   Desormais : pendant que apply-all bloque, on sonde /api/update/progress
   (500 ms) — octets recus/total, debit glissant sur 5 s, temps restant, fichier
   en cours, source (hote + Cloudflare R2), blocage (aucun octet 30 s = reprise
   par Range cote back), Cancel (/api/update/cancel), Retry (reprend le zip
   partiel), et un test de debit (/api/update/speedtest) copiable.

   Contrat : initUpdateWindow({ $, esc, toast }) une fois, puis
     runToolUpdate({ version, onDone, onRestart }) -> resultat d'apply-all ou null
       (Retry relance avec les memes rappels : la suite se fait dans onDone/onRestart).
     mountSpeedTest(el)                    -> bouton + resultat dans el.
   ============================================================================ */

import { lineIcon } from '../ui/line_icons.js';
import { beeLoaderHtml } from '../ui/bee.js';

let H = null;

export function initUpdateWindow(host) { H = host; }

const MB = 1048576;
const fmtMB = b => (b / MB).toFixed(b >= 100 * MB ? 0 : 1) + ' MB';
const fmtSpeed = bps => bps >= MB ? (bps / MB).toFixed(1) + ' MB/s' : Math.max(0, bps / 1024).toFixed(0) + ' KB/s';
function fmtDur(s) {
  if (s == null || !isFinite(s)) return '';
  s = Math.max(0, Math.round(s));
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return m + ' min' + (r ? ' ' + r + ' s' : '');
  return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}
const SLOW_BPS = MB;

function el(id) { return document.getElementById(id); }

const isModern = () => document.documentElement.dataset.ui === 'modern';

const STEPS = [['download', 'Download'], ['verify', 'Verify'], ['install', 'Install'], ['done', 'Done']];

function setLogo(kind) {
  const logo = el('upd-logo'); if (!logo) return;
  logo.dataset.kind = kind;
  if (!isModern()) {
    logo.textContent = kind === 'err' ? '✕' : kind === 'pause' ? '⏸' : '⟳';
    logo.style.animation = kind === 'run' ? '' : 'none';
    logo.style.color = kind === 'err' ? 'var(--crimson)' : '';
    return;
  }
  const ic = { ok: 'check', err: 'x', pause: 'pause' }[kind];
  logo.innerHTML = kind === 'run' ? beeLoaderHtml({ size: 96 }) : '<span class="upd-badge">' + lineIcon(ic, 30) + '</span>';
}

function setStats(bits) {
  const st = el('upd-stats'); if (!st) return;
  if (!isModern()) { st.textContent = bits.join(' · '); return; }
  st.classList.toggle('one', bits.length === 1);
  st.innerHTML = [0, 1, 2].map(i => '<span>' + (bits[i] ? esc(bits[i]) : '') + '</span>').join('');
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function openWin(version) {
  let o = el('upd-anim');
  if (!o) { o = document.createElement('div'); o.id = 'upd-anim'; document.body.appendChild(o); }
  const modern = isModern();
  const steps = STEPS.map(([k, t]) => '<span class="upd-s" data-s="' + k + '">'
    + (modern ? '<i class="upd-dot">' + lineIcon('check', 12) + '</i><b>' + t + '</b>' : t) + '</span>').join('');
  o.innerHTML = '<div class="upd-card" data-stage="download">'
    + '<div class="upd-logo" id="upd-logo"></div>'
    + '<div class="upd-title">Updating Eden Ultimate Tool</div>'
    + '<div class="upd-steps">' + steps + '</div>'
    + '<div class="upd-label" id="upd-label"></div>'
    + '<div class="upd-src" id="upd-src"></div>'
    + '<div class="upd-file" id="upd-file"></div>'
    + '<div class="upd-track"><div class="upd-fill" id="upd-fill"></div></div>'
    + '<div class="upd-stats" id="upd-stats"></div>'
    + '<div class="upd-note" id="upd-note"></div>'
    + '<div class="upd-btns" id="upd-btns"></div>'
    + '<div class="upd-speed" id="upd-speed"></div>'
    + '</div>';
  setLogo('run');
  o.style.display = 'flex'; requestAnimationFrame(() => o.classList.add('show'));
  setStage('download', 'Downloading v' + (version || '') + '…');
}

function setStage(stage, label) {
  const order = ['download', 'verify', 'install', 'done'], idx = order.indexOf(stage);
  const card = document.querySelector('#upd-anim .upd-card'); if (card) card.dataset.stage = stage;
  document.querySelectorAll('#upd-anim .upd-s').forEach(s => {
    const i = order.indexOf(s.dataset.s);
    s.classList.toggle('on', i <= idx); s.classList.toggle('cur', i === idx);
  });
  if (label != null) { const L = el('upd-label'); if (L) L.textContent = label; }
}

function setBar(frac, indet) {
  const f = el('upd-fill'); if (!f) return;
  f.classList.toggle('indet', !!indet);
  f.style.width = indet ? '100%' : (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
}

function setNote(text, kind) {
  const n = el('upd-note'); if (!n) return;
  n.textContent = text || ''; n.className = 'upd-note' + (kind ? ' ' + kind : '');
}

function setButtons(list) {
  const b = el('upd-btns'); if (!b) return;
  b.innerHTML = '';
  list.forEach(([label, fn, cls]) => {
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'mini' + (cls ? ' ' + cls : ''); x.textContent = label; x.onclick = fn;
    b.appendChild(x);
  });
}

function closeUpdateWindow() {
  const o = el('upd-anim'); if (o) { o.classList.remove('show'); setTimeout(() => { o.style.display = 'none'; }, 300); }
}

function render(p, version) {
  if (!p || !p.files) return;
  const files = p.files || [], i = Math.min(p.index || 0, Math.max(0, files.length - 1)), f = files[i];
  const src = el('upd-src'); if (src) src.textContent = p.source ? 'from ' + p.source : '';
  const fl = el('upd-file');
  if (fl) fl.textContent = f ? ((files.length > 1 ? 'File ' + (i + 1) + ' of ' + files.length + ': ' : '') + f.label
    + ' (' + f.name + (f.size ? ', ' + fmtMB(f.size) : '') + ')') : '';
  const phase = p.phase || 'download';
  if (phase === 'verify' || phase === 'install') {
    setStage(phase, p.note || (phase === 'verify' ? 'Verifying…' : 'Installing…'));
    setBar(1); setNote('');
    setButtons([]);
    return;
  }
  if (phase !== 'download') return;
  setStage('download', 'Downloading v' + (p.version || version || '') + '…');
  const total = p.total || 0, got = p.got || 0;
  setBar(total ? got / total : 0, !total);
  const bits = [total ? fmtMB(got) + ' of ' + fmtMB(total) : fmtMB(got) + ' received'];
  if (p.speed_bps > 0) bits.push(fmtSpeed(p.speed_bps));
  if (p.eta_s != null) bits.push('about ' + fmtDur(p.eta_s) + ' left');
  setStats(bits);
  if (p.stalled || (p.note && /retry|Cancel/i.test(p.note))) setNote(p.note, 'warn');
  else if ((p.idle_s || 0) >= 10) setNote('No data received for ' + Math.round(p.idle_s) + ' s… (retries automatically after 30 s)', 'warn');
  else if ((p.elapsed_s || 0) > 6 && p.speed_bps > 0 && p.speed_bps < SLOW_BPS)
    setNote('Slow connection (' + fmtSpeed(p.speed_bps) + '): this update is ' + fmtMB(total)
      + (p.eta_s != null ? ', about ' + fmtDur(p.eta_s) + ' left' : '')
      + '. You can leave it running, or run a speed test and send us the result.', 'slow');
  else setNote('');
}

async function fetchProgress() {
  try { return await (await fetch('/api/update/progress', { cache: 'no-store' })).json(); } catch (_) { return null; }
}

export async function runToolUpdate(opts) {
  opts = opts || {};
  const version = opts.version || '';
  openWin(version);
  const speedBox = el('upd-speed');
  setButtons([
    ['Cancel', async () => { setNote('Cancelling…', 'warn'); try { await fetch('/api/update/cancel', { method: 'POST' }); } catch (_) { } }],
    ['Speed test', () => mountSpeedTest(speedBox, true)],
  ]);
  let res = null, err = null;
  const poll = setInterval(async () => { const p = await fetchProgress(); if (p && p.active) render(p, version); }, 500);
  try {
    const r = await fetch('/api/update/apply-all', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || ('HTTP ' + r.status));
    res = j;
  } catch (e) { err = String(e.message || e); }
  clearInterval(poll);
  if (!err && res && !res.applied && /FAILED/.test(res.message || '')) err = res.message;
  if (err) { showError(err, opts); return null; }
  if (!res.applied) { closeUpdateWindow(); H.toast(res.message || 'already up to date', 'info', 4000); return res; }
  const tgt = res.web || res.code || version;
  setBar(1); setNote(''); setButtons([]);
  const p = await fetchProgress();
  if (p && p.total) setStats([fmtMB(p.total) + ' downloaded in ' + fmtDur((p.started ? Date.now() / 1000 - p.started : 0))]);
  setStage('done', 'Updated to v' + tgt + (isModern() ? '' : ' ✓'));
  setLogo('ok');
  await new Promise(r => setTimeout(r, 900));
  if (res.code_restart_required && opts.onRestart) { closeUpdateWindow(); opts.onRestart(res, tgt); return res; }
  if (opts.onDone) opts.onDone(res, tgt);
  return res;
}

function showError(msg, opts) {
  const cancelled = /cancel/i.test(msg);
  setStage('download', cancelled ? 'Update cancelled' : 'Update failed');
  const L = el('upd-label'); if (L) L.style.color = cancelled ? '' : (isModern() ? 'var(--ui-bad)' : 'var(--crimson)');
  setLogo(cancelled ? 'pause' : 'err');
  setNote(cancelled ? 'Nothing was installed. Retry continues from where the download stopped.'
    : msg + ' — Retry continues from where the download stopped.', cancelled ? '' : 'err');
  const speedBox = el('upd-speed');
  setButtons([
    ['Retry', () => runToolUpdate(opts), 'gold'],
    ['Speed test', () => mountSpeedTest(speedBox, true)],
    ['Close', () => closeUpdateWindow()],
  ]);
}

function speedReport(j) {
  const lat = (j.latency_ms || []).slice().sort((a, b) => a - b);
  const med = lat.length ? lat[Math.floor(lat.length / 2)] : null;
  const d = new Date(), tz = -d.getTimezoneOffset() / 60;
  const lines = [
    'Eden Ultimate Tool v' + (j.version || '?') + ' - download speed test',
    'Source: ' + (j.source || '?') + (j.colo ? ', Cloudflare edge ' + j.colo : '') + (j.cache ? ', cache ' + j.cache : ''),
  ];
  if (j.ok) {
    lines.push('Latency: ' + lat.join(' / ') + ' ms (median ' + med + ' ms)');
    lines.push('Speed: ' + fmtSpeed(j.speed_bps) + ' (' + fmtMB(j.bytes) + ' in ' + j.secs + ' s)');
    if (j.pending_bytes) lines.push('Pending update: ' + fmtMB(j.pending_bytes) + ', about ' + fmtDur(j.pending_eta_s) + ' at this speed');
  } else lines.push('Error: ' + (j.error || 'unknown'));
  lines.push('Date: ' + d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC (local UTC' + (tz >= 0 ? '+' : '') + tz + ')');
  return lines.join('\n');
}

export async function mountSpeedTest(box, autostart) {
  if (!box) return;
  box.innerHTML = '<div class="spt-row"><button type="button" class="mini" id="spt-run">Run speed test</button>'
    + '<button type="button" class="mini" id="spt-copy" disabled>Copy result</button></div>'
    + '<pre class="spt-out" id="spt-out">Downloads up to 16 MB from the update source and measures speed and latency.</pre>';
  const run = box.querySelector('#spt-run'), copy = box.querySelector('#spt-copy'), out = box.querySelector('#spt-out');
  let text = '';
  run.onclick = async () => {
    run.disabled = true; copy.disabled = true; out.textContent = 'Testing… (up to 15 s)';
    try {
      const r = await fetch('/api/update/speedtest', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      text = r.ok ? speedReport(j) : 'Speed test refused: ' + (j.detail || ('HTTP ' + r.status));
    } catch (e) { text = 'Speed test failed: ' + String(e.message || e); }
    out.textContent = text; run.disabled = false; copy.disabled = !text;
  };
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(text); H.toast('speed test result copied', 'ok', 2500); }
    catch (_) { H.toast(text, 'info', 8000); }
  };
  if (autostart) run.click();
}
