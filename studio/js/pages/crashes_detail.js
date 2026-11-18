import { el, clear } from '../core/dom.js';
import { card, errorState, btn, badge, icon } from '../components.js';
import { fmtBytes } from '../core/format.js';
import { toast } from '../ui/toast.js';
import { CR, CR_STATUSES, crFetch, crPost, crKindBadge, crStatusBadge, crSig, crWhen, crAgo, crUptime, crExcName, crNormCode, crNum, crZipUrl, crFileUrl, crCatalog, crCatMeta, crCatOf, crCatBadge } from './crashes_state.js';
import { renderViewer } from './crashes_viewer.js';

function familyBanner(d) {
  const id = crCatOf(d);
  const m = crCatMeta(id);
  const box = el('div', { class: 'crx-fam-banner' },
    crCatBadge(id, { css: 'font-size:13px;padding:3px 12px' }),
    el('div', {},
      el('b', {}, m.label),
      el('div', { class: 'crx-dim' }, m.text || m.status || '')));
  box.style.cssText = 'display:flex;gap:12px;align-items:center;padding:10px 14px;margin:0 0 12px;'
    + 'border:1px solid ' + m.color + '55;border-left:4px solid ' + m.color + ';border-radius:8px;background:' + m.color + '11;';
  return box;
}

function kv(label, value, title) {
  return el('div', { class: 'crx-kv', title: title || null }, el('small', {}, label), el('div', {}, value == null || value === '' ? '—' : value));
}

function mem(d) {
  const m = (d.session && d.session.mem) || {};
  const parts = [];
  if (m.private_mb != null) parts.push('private ' + m.private_mb + ' MB');
  if (m.virtual_mb != null) parts.push('virtual ' + m.virtual_mb + ' MB');
  const peak = m.peak_virtual_mb != null ? m.peak_virtual_mb : d.mem_peak_mb;
  if (peak != null) parts.push('peak ' + peak + ' MB');
  return parts.join(' · ');
}

function fileOf(d, name) {
  return (d.files || []).find(f => String(f.name || '').split(/[\\/]/).pop().toLowerCase() === name.toLowerCase());
}

const CRT_STOP = { abort: 'abort()', invalid_parameter: 'invalid parameter', stack_buffer_overrun: '/GS stack buffer overrun', exit: 'exit() / _exit()' };

function crtReason(ci) { return ci && (ci.reason === 'crt_abort' || ci.reason === 'crt_exit') ? ci.reason : ''; }

function exitCode(code) {
  const n = parseInt(String(code || ''), 16);
  if (!isFinite(n)) return String(code || '?');
  return String(n >= 0x80000000 ? n - 0x100000000 : n);
}

function summary(d) {
  const ci = d.crash_info || {};
  const s = d.session || {};
  const code = d.exc_code || ci.code;
  const crt = crtReason(ci);
  const mod = d.exc_module || ci.module;
  const off = d.exc_offset || ci.offset;
  const who = el('span', {},
    d.account ? el('a', { class: 'crx-link', title: 'All reports of this account', onclick: () => CR.nav.showList({ account: d.account }) }, d.account) : '—',
    ' / ', d.character_name || d.player_name || s.character || '—', s.level ? ' (Lv ' + s.level + ')' : '',
    ' · server ', d.server_id || (String((d).connect_host || '').split(/[:,]/)[0] || '—'));
  const sig = d.signature ? el('span', { class: 'crx-sigline' }, crSig(d.signature),
    btn({ label: 'Same signature', icon: 'links', variant: 'ghost', class: 'xs', title: 'List every report with this signature', onClick: () => CR.nav.showList({ signature: d.signature }) })) : null;
  const fn = d.symbols && (d.symbols.exc || d.symbols.signature);
  const noExc = isHang(d) ? 'none (main thread frozen' + (ci.stalled_s ? ' for ' + ci.stalled_s + ' s' : '') + ')'
    : (d.crash_kind === 'abnormal_exit' ? 'none (the session ended without exception)' : null);
  const sess = d.session_id ? btn({ label: 'Open session', icon: 'usage_time', variant: 'ghost', class: 'xs', title: 'The session this report belongs to',
    onClick: () => CR.nav.showSessions({ session_id: d.session_id, install_id: d.install_id || '' }) }) : null;
  return card({ title: 'Summary', icon: 'info', actions: sess, body: el('div', { class: 'crx-sum' },
    crt === 'crt_exit' ? kv('Exit code', exitCode(code) + ' (no exception: the game called exit/_exit)')
      : kv('Exception', code ? crNormCode(code) + (crExcName(code) ? ' — ' + crExcName(code) : '') : noExc),
    crt ? kv('Stopped by', 'Game C runtime — ' + (CRT_STOP[ci.abort] || ci.abort || crt), 'crash.json reason=' + crt + ' (reporter 0.3.0+)') : null,
    s.diag_continue ? kv('Swallowed faults', s.diag_continue + ' × [diag] continue before the end', 'Faults crash_guard let the game survive earlier in this session (session.json diag_continue)') : null,
    kv('Module + offset', mod ? mod + '+' + (off || '?') : null),
    kv('Function', fn ? el('code', { class: 'crx-sig' }, fn) : null, 'Resolved from the IDA export of game_.exe'),
    kv('Address', d.exc_addr || ci.addr),
    kv('Access', ci.access),
    el('div', { class: 'crx-kv crx-kv-wide' }, el('small', {}, 'Signature'), el('div', {}, sig || '—')),
    el('div', { class: 'crx-kv crx-kv-wide' }, el('small', {}, 'Account / character / server'), el('div', {}, who)),
    kv('Crashed at (client time)', crWhen(d.crashed_at || ci.time) + ' · ' + crAgo(d.crashed_at || ci.time)),
    kv('Received', crWhen(d.submitted_at)),
    kv('Uptime', crUptime(d.uptime_s != null ? d.uptime_s : s.uptime_s)),
    kv('Memory', mem(d)),
    kv('DLL version', d.dll_version || s.dll_version),
    kv('Client version', d.client_version || d.game_version),
    kv('OS', s.os),
    kv('Server host', d.connect_host || s.connect_host || d.connect_server),
    kv('Session', d.session_id || s.session),
    kv('Install id', d.install_id || s.install_id, 'Persistent per PC (%LOCALAPPDATA%\\EdenReforgedData\\crash\\install_id; eden_crash\\install_id in the game folder before EDEN 0.471)'),
    kv('Source', d.source),
    d.error_category && d.error_category !== 'unknown' ? kv('Category', d.error_category) : null,
    d.source && d.source !== 'auto' && d.context_text ? el('div', { class: 'crx-kv crx-kv-wide' }, el('small', {}, 'Player note'), el('div', {}, d.context_text)) : null)});
}

function features(d) {
  const f = d.features || (d.session && d.session.features) || {};
  const names = Object.keys(f).sort();
  const body = names.length ? el('div', { class: 'crx-chips' }, names.map(n => badge(n + (f[n] ? ' ' + f[n] : ''), 'neutral'))) : el('div', { class: 'esub' }, 'No feature list in this report.');
  return card({ title: 'Active features', icon: 'feature', subtitle: names.length ? names.length + ' loaded' : '', body });
}

function isHang(d) { return d.crash_kind === 'hang' || String(d.signature || '').startsWith('hang:'); }

function isEdenFrame(low, legacy) {
  if (/^eden\.dll\+/.test(low)) return true;
  return legacy && /^(d3d9|version)\.dll\+/.test(low);
}

function frames(d) {
  const ci = d.crash_info || {};
  const fr = ci.frames || [];
  if (!fr.length) return null;
  const syms = (d.symbols && d.symbols.frames) || [];
  const named = syms.some(s => s && s.symbol);
  const hang = isHang(d);
  const legacy = !Object.prototype.hasOwnProperty.call(ci, 'dll_base');
  const sub = named ? 'resolved: game_.exe via the IDA export' + (d.symbols && d.symbols.dll ? ', ' + d.symbols.dll + ' via symbols.json' : '')
    : (d.symbols && d.symbols.available === false ? 'no symbol table on the back-office' : '');
  return card({ title: hang ? 'Main thread stack at the freeze' : 'Stack (EBP frames)', icon: 'structure_web',
    subtitle: sub,
    body: el('ol', { class: 'crx-frames' }, fr.map((f, i) => {
      const low = String(f).toLowerCase();
      const eden = isEdenFrame(low, legacy);
      const sys = !legacy && /^(d3d9|version)\.dll\+/.test(low);
      const s = syms[i] && syms[i].symbol;
      const title = eden ? 'Inside the Eden DLL' : sys ? 'System ' + low.split('+')[0] + ' runtime (same file name as our proxy, not our code)'
        : (i ? 'Return address' : (hang ? 'Instruction pointer when frozen' : 'Faulting address'));
      return el('li', { class: eden ? 'crx-eden' : null, title },
        String(f), s ? el('span', { class: 'crx-fsym' }, s) : null);
    })) });
}

function culprits(d) {
  const list = d.culprits || [];
  if (!list.length) return null;
  return card({ title: 'Linked culprits', icon: 'error', body: el('div', { class: 'crx-culprits' }, list.map(c => el('div', {},
    badge(c.severity || 'medium', c.severity === 'high' || c.severity === 'critical' ? 'error' : 'warn'), ' ',
    el('b', {}, c.title || c.culprit_key || '?'), ' ',
    el('span', { class: 'crx-dim' }, (c.culprit_type || '') + (c.report_count ? ' · ' + c.report_count + ' reports' : '') + (c.status ? ' · ' + c.status : ''))))) });
}

function diagnosis(d) {
  const list = (d.diagnosis && d.diagnosis.crash_causes) || [];
  if (!list.length) return null;
  const tone = s => (s === 'critical' || s === 'high' ? 'error' : s === 'warning' || s === 'medium' ? 'warn' : 'neutral');
  return card({ title: 'Diagnosis', icon: 'idea', subtitle: 'computed by the back-office from the logs', body: el('div', { class: 'crx-diag' }, list.map(c => el('div', { class: 'crx-cause' },
    el('div', {}, badge(c.severity || 'info', tone(c.severity)), ' ', el('b', {}, c.title || '')),
    c.detail ? el('div', {}, c.detail) : null,
    c.fix ? el('div', { class: 'crx-fix' }, el('b', {}, 'Fix: '), c.fix) : null,
    c.source ? el('small', { class: 'crx-dim' }, c.source) : null))) });
}

function triage(d, onSaved) {
  const can = CR.host && CR.host.can('crashes.triage');
  const cur = d.status || 'new';
  const opts = CR_STATUSES.includes(cur) ? CR_STATUSES : CR_STATUSES.concat([cur]);
  const st = el('select', { disabled: can ? null : true }, opts.map(s => el('option', { value: s, selected: cur === s ? true : null }, s)));
  const notes = el('textarea', { rows: 4, placeholder: 'Findings, suspected cause, fix version…', disabled: can ? null : true });
  notes.value = d.admin_notes || '';
  const save = btn({ label: 'Save', icon: 'save', disabled: !can, onClick: async () => {
    try {
      await crPost('/' + d.id, { status: st.value, admin_notes: notes.value });
      d.status = st.value;
      d.admin_notes = notes.value;
      toast('Report #' + d.id + ' saved as ' + st.value, 'ok', 3000);
      onSaved();
    } catch (e) { toast('Could not save: ' + (e.message || e), 'error', 7000); }
  } });
  return card({ title: 'Triage', icon: 'edit', body: el('div', { class: 'crx-triage' },
    el('label', {}, 'Status', st), el('label', {}, 'Notes', notes),
    el('div', { class: 'crx-fbtns' }, save, can ? null : el('span', { class: 'crx-dim' }, 'Read-only: triage needs GM or above.'))) });
}

function downloads(d) {
  const dmp = fileOf(d, 'game_.dmp');
  const link = (href, label, ic, title) => el('a', { class: 'sbtn ghost xs', href, download: '', title }, icon(ic, 24), label);
  return el('div', { class: 'crx-dl' },
    link(crZipUrl(d.id), 'Download zip', 'export', 'The whole report as received by the back-office'),
    dmp ? link(crFileUrl(d.id, dmp.name, true), 'Download .dmp (' + fmtBytes(dmp.size) + ')', 'memory_card', 'Minidump written by the game (open it in WinDbg / Visual Studio)')
      : el('span', { class: 'crx-dim' }, d.crash_kind === 'crash' ? 'No minidump in this report.' : isHang(d) ? 'No minidump for a hang (the stack is in hang.json).' : 'No minidump for an abnormal exit.'));
}

export async function renderDetail(body, id) {
  body.appendChild(el('div', { class: 'empty crx-loading' }, 'Loading report #' + id + '…'));
  let d;
  try { d = await crFetch('/' + id); }
  catch (e) {
    clear(body);
    body.appendChild(errorState({ error: e, title: 'Report #' + id + ' unavailable', onRetry: () => CR.nav.go('detail') }));
    return;
  }
  if (CR.tab !== 'detail' || CR.detailId !== id) return;
  await crCatalog();
  clear(body);
  const statusSlot = el('span', {}, crStatusBadge(d.status));
  const head = el('div', { class: 'crx-dhead' },
    btn({ label: 'Back to reports', icon: 'back', variant: 'ghost', class: 'xs', onClick: () => CR.nav.go('list') }),
    el('h3', {}, 'Report #' + d.id), crKindBadge(d.crash_kind), statusSlot,
    el('span', { class: 'crx-dim' }, (d.files || []).length + ' file' + (crNum((d.files || []).length) === 1 ? '' : 's')));
  const onSaved = () => { clear(statusSlot); statusSlot.appendChild(crStatusBadge(d.status)); };
  const viewer = el('div', {});
  body.appendChild(head);
  body.appendChild(familyBanner(d));
  body.appendChild(el('div', { class: 'crx-dgrid' },
    el('div', { class: 'crx-dmain' }, summary(d), diagnosis(d), frames(d),
      card({ title: 'Files', icon: 'document', actions: downloads(d), body: viewer })),
    el('div', { class: 'crx-dside' }, triage(d, onSaved), features(d), culprits(d))));
  renderViewer(viewer, d);
}
