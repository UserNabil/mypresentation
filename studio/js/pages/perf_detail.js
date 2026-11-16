import { el, clear } from '../core/dom.js';
import { icon, btn, badge, errorState } from '../components.js';
import { fmtDate, ago } from '../core/format.js';
import { toast } from '../ui/toast.js';
import { pfFetch, pfTone, pfNum, pfCauseBadge } from './perf_state.js';

let current = null;

function close() {
  if (!current) return;
  document.removeEventListener('keydown', current.onKey);
  current.node.remove();
  current = null;
}

function tile(label, value, tone, hint) {
  return el('div', { class: 'prf-tile', title: hint || null }, el('small', {}, label), el('b', { class: tone || null }, value));
}

function kv(label, value) {
  return el('span', { class: 'prf-kv' }, el('small', {}, label), value == null || value === '' ? '—' : value);
}

function mb(v) { return v == null || v === '' ? '—' : pfNum(v, 0) + ' MB'; }

function copyText(text) {
  const fallback = () => {
    const ta = el('textarea', { class: 'prf-offscreen', readonly: true });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    toast(ok ? 'Report copied' : 'Clipboard unavailable: select the text and copy it by hand', ok ? 'ok' : 'warn');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('Report copied', 'ok'), fallback);
  } else fallback();
}

function download(d, text) {
  const safe = s => String(s || 'unknown').replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 40);
  const name = 'perf_' + safe(d.account) + '_' + safe(d.character || d.character_name) + '_' + d.id + '.txt';
  const url = URL.createObjectURL(new Blob([text.replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function causeBox(d) {
  const lvl = Number(d.cause_level) || 0;
  return el('div', { class: 'prf-cause prf-cause-' + lvl },
    pfCauseBadge(d, false),
    d.advice ? el('div', { class: 'prf-advice' }, el('b', {}, 'Advice: '), d.advice) : null);
}

function body(d) {
  const text = String(d.report || '').replace(/\r\n/g, '\n');
  const sysRam = d.sys_ram_used_mb != null && d.sys_ram_total_mb
    ? pfNum(d.sys_ram_used_mb / 1024, 1) + ' / ' + pfNum(d.sys_ram_total_mb / 1024, 1) + ' GB' : '—';
  return el('div', {},
    el('div', { class: 'prf-meta' },
      kv('Env', badge(d.env || 'unknown', { prod: 'error', preprod: 'warn', dev: 'info' }[d.env] || 'neutral')),
      kv('EDEN', d.eden_version), kv('perf_hud', d.perf_hud_version),
      kv('Client time', d.client_time),
      kv('Received', d.received_at ? fmtDate(d.received_at) + ' (' + ago(d.received_at) + ')' : ''),
      kv('Install', d.install_id ? String(d.install_id).slice(0, 12) + '…' : '')),
    causeBox(d),
    el('div', { class: 'prf-tiles' },
      tile('FPS avg', pfNum(d.fps_avg), pfTone('fps', d.fps_avg)),
      tile('1% low', pfNum(d.fps_low1), pfTone('low1', d.fps_low1)),
      tile('FPS now', pfNum(d.fps_now), pfTone('fps', d.fps_now)),
      tile('Frame', pfNum(d.frame_ms) + ' ms', pfTone('frame', d.frame_ms)),
      tile('Worst frame', pfNum(d.worst_ms, 0) + ' ms', pfTone('worst', d.worst_ms)),
      tile('Game logic', pfNum(d.logic_ms) + ' ms', pfTone('part', d.logic_ms), 'Scene + game logic per frame'),
      tile('GPU wait', pfNum(d.gpu_wait_ms) + ' ms', pfTone('part', d.gpu_wait_ms), 'Present / vsync wait per frame'),
      tile('UI', pfNum(d.ui_ms) + ' ms', pfTone('part', d.ui_ms), 'CEGUI draw per frame'),
      tile('Eden', pfNum(d.eden_ms, 2) + ' ms', pfTone('part', d.eden_ms), 'Time spent in the Eden DLL per frame'),
      tile('Game RAM', mb(d.ram_mb), '', 'Working set; peak ' + mb(d.ram_peak_mb)),
      tile('Private', mb(d.private_mb)),
      tile('CPU', d.cpu_pct == null ? '—' : pfNum(d.cpu_pct, 0) + ' %'),
      tile('System RAM', sysRam)),
    el('div', { class: 'prf-meta' }, kv('GPU', d.gpu), kv('Display', d.display), kv('Map', d.map == null ? '' : String(d.map))),
    el('div', { class: 'prf-reporthead' },
      el('b', {}, 'Full report'),
      el('span', { class: 'prf-dim' }, text ? (text.length + ' characters') : ''),
      btn({ label: 'Copy report', icon: 'document', variant: 'ghost', class: 'xs', disabled: !text, onClick: () => copyText(text) }),
      btn({ label: 'Download .txt', icon: 'export', variant: 'ghost', class: 'xs', disabled: !text, onClick: () => download(d, text) })),
    el('pre', { class: 'prf-report' }, text || 'The back-office returned no report text.'));
}

export async function openPerfDetail(id) {
  close();
  const title = el('div', { class: 'prf-mtitle' }, icon('stat_speed', 24), el('b', {}, 'Performance report #' + id));
  const content = el('div', { class: 'prf-mbody' }, el('div', { class: 'empty prf-loading' }, 'Loading report…'));
  const sheet = el('div', { class: 'prf-sheet', role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'prf-mhead' }, title, btn({ label: 'Close', variant: 'ghost', class: 'xs', onClick: close })),
    content);
  const node = el('div', { class: 'prf-modal' }, sheet);
  node.onclick = ev => { if (ev.target === node) close(); };
  const onKey = ev => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(node);
  current = { node, onKey };
  const mine = current;
  let d;
  try { d = await pfFetch('/' + encodeURIComponent(id)); }
  catch (e) {
    if (current !== mine) return;
    clear(content);
    content.appendChild(errorState({ error: e, title: 'Report unavailable', onRetry: () => openPerfDetail(id) }));
    return;
  }
  if (current !== mine) return;
  clear(title);
  title.append(icon('stat_speed', 24), el('b', {}, (d.account || '—') + ' / ' + (d.character || d.character_name || '—')),
    el('span', { class: 'prf-dim' }, ' #' + id));
  clear(content);
  content.appendChild(body(d));
}
