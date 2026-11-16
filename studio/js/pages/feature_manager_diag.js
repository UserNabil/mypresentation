/* ============================================================================
   FEATURE MANAGER — Diagnostics : rapport complet de ce qui est installe sur le
   PC (testeur), resume en haut + detail repliable, Copy / Export .zip / Send to
   admin ; cote admin, liste des rapports recus par testeur (back-office).
   Etude : docs/studies/tester_diagnostics.md
   ============================================================================ */
import { H } from './feature_manager_state.js';
import { fmOpenClientReset } from './feature_manager_reset.js';

const LV = { fail: ['#d1242f', 'rgba(209,36,47,.12)', 'To fix'], warn: ['#b8860b', 'rgba(184,134,11,.14)', 'Warning'],
  info: ['#6b6b6b', 'transparent', 'Info'], ok: ['#2ea043', 'rgba(46,160,67,.14)', 'OK'] };
const COL = { green: '#2ea043', orange: '#c2410c', red: '#d1242f', gold: '#caa24a', grey: '#8a8a8a' };

function wide() { const b = document.querySelector('#intg-dlg > div'); if (b) { b.style.maxWidth = '1040px'; b.style.maxHeight = '88vh'; } }
const e = s => H.esc(s == null ? '' : String(s));
const kv = rows => '<table class="fd-kv">' + rows.filter(r => r).map(([k, v]) => `<tr><th>${e(k)}</th><td>${v == null || v === '' ? '<span class="fd-dim">-</span>' : e(v)}</td></tr>`).join('') + '</table>';

const ACT_BTN = { 'Repack': ['data-fdrepack', 'Repack all pending'], 'Reset client': ['data-fdreset', 'Reset client'] };

function itemHtml(it, live) {
  const [c, bg, lab] = LV[it.level] || LV.info;
  const btn = live && ACT_BTN[it.action] ? `<button class="mini gold" ${ACT_BTN[it.action][0]}>${e(ACT_BTN[it.action][1])}</button>` : '';
  const use = (it.choices || []).map(x => `<div class="fd-use">${live ? `<button class="mini${x.recommended ? ' gold' : ''}" data-fduse="${e(x.which)}">Use this folder</button>` : ''}<b class="fd-mono">${e(x.dir)}</b><span class="fd-dim">${e(x.label)}${x.recommended ? ' (the one you play with)' : ''}</span></div>`).join('');
  const reset = live && it.choices && it.choices.length ? '<div class="fd-use"><button class="mini" data-fdreset>Reset client</button><span class="fd-dim">then put every feature into that game</span></div>' : '';
  return `<div class="fd-it" style="border-left:4px solid ${c};background:${bg}">
    <div class="fd-it-h"><b style="color:${c}">${lab}</b> ${e(it.title)}${it.action && !btn && !use ? `<span class="fd-act">${e(it.action)}</span>` : ''}</div>
    ${it.detail ? `<div class="fd-it-d">${e(it.detail)}</div>` : ''}${it.fix ? `<div class="fd-it-f">→ ${e(it.fix)}</div>` : ''}${use}${reset}${btn ? `<div class="fd-use">${btn}</div>` : ''}</div>`;
}

function featRow(f) {
  const issues = [];
  if (f.files_missing && f.files_missing.length) issues.push(f.files_missing.length + ' file(s) missing');
  if (f.data_missing && f.data_missing.length) issues.push(f.data_missing.length + ' data row(s)');
  const pend = (f.pkg_pending || []).filter(p => p.reason !== 'unpackable' && p.reason !== 'older_copy');
  if (pend.length) issues.push(pend.length + ' to repack');
  if (f.layout_issues && f.layout_issues.length) issues.push(f.layout_issues.length + ' layout issue(s)');
  const off = (f.parts || []).filter(p => !p.state).map(p => p.part);
  if (off.length) issues.push('parts off: ' + off.join(', '));
  if (f.badge_why) issues.push(f.badge_why);
  const det = [].concat((f.files_missing || []).map(x => 'missing ' + x), (f.data_missing || []).map(x => 'data ' + x.file + ' #' + x.id),
    pend.map(x => 'to repack (' + x.reason + ') ' + x.rel), (f.layout_issues || []).map(x => x.level + ': ' + x.title));
  return `<tr title="${e(det.join('\n'))}"><td><span class="fd-c" style="border-color:${COL[f.color] || COL.grey};color:${COL[f.color] || COL.grey}">C</span></td>
    <td><b>${e(f.name)}</b></td><td>${e(f.repo_version || '-')}</td><td>${e(f.dll_version || '-')}</td><td>${e(f.runtime_version || '-')}</td>
    <td>${f.enabled == null ? '-' : (f.enabled ? 'on' : '<b style="color:#d1242f">off</b>')}</td><td class="fd-small">${e(issues.join(' · ') || f.badge_text)}</td></tr>`;
}

function sec(title, body, open) { return `<details class="fd-sec"${open ? ' open' : ''}><summary>${e(title)}</summary><div class="fd-secb">${body}</div></details>`; }

function reportHtml(rep, text, opts) {
  const s = rep.summary || {}, t = rep.tool || {}, c = rep.client || {}, d = rep.dll || {}, p = rep.pkg || {}, lg = rep.log || {}, cr = rep.crashes || {}, sy = rep.system || {};
  const [vc] = LV[s.verdict] || LV.info;
  const todo = (s.items || []).filter(x => x.level === 'fail' || x.level === 'warn');
  const infos = (s.items || []).filter(x => x.level === 'info');
  const head = `<div class="fd-head" style="border-color:${vc}">
    <div class="fd-verdict" style="color:${vc}">${s.verdict === 'ok' ? 'Everything is installed' : (s.fail ? s.fail + ' thing(s) to fix' : '') + (s.fail && s.warn ? ', ' : '') + (s.warn ? s.warn + ' warning(s)' : '')}</div>
    <div class="fd-sub">${e(s.features_ok)}/${e(s.features_total)} features fully installed · tool ${e(t.version)} (${e(t.tenant)}, ${e(t.env)}) · ${e(t.account || '?')} · ${e(rep.generated_at)} · ${e(rep.elapsed_ms)} ms</div>
    ${(s.actions || []).length ? `<div class="fd-acts">Fix with: ${(s.actions || []).map(a => `<span class="fd-act">${e(a)}</span>`).join(' ')}</div>` : ''}
    ${opts.toolbar || ''}</div>`;
  const feats = (rep.features || []).slice().sort((a, b) => {
    const r = x => ({ red: 0, orange: 1, gold: 2, green: 4, grey: 5 }[x.color] ?? 3); return r(a) - r(b) || a.name.localeCompare(b.name); });
  const dllFiles = (d.files || []).map(f => `<tr><td>${e(f.name)}</td><td>${e(f.client)}</td><td>${f.present ? 'EDEN ' + e(f.eden || '?') : '<b style="color:#d1242f">absent</b>'}</td><td>${e(f.built || '')}</td><td>${e(f.size || '')}</td><td class="fd-mono">${e(f.sha256 || '')}</td></tr>`).join('');
  const ini = Object.entries(rep.ini || {}).map(([fn, r]) => `<div><b>${e(fn)}</b> ${r.present ? '' : '<span class="fd-dim">absent</span>'}${Object.entries(r.sections || {}).map(([sn, v]) => `<div class="fd-mono">[${e(sn)}] ${Object.entries(v).map(([k, x]) => e(k) + '=' + e(x)).join('  ')}</div>`).join('')}${(r.other_sections || []).length ? `<div class="fd-dim">other sections: ${e(r.other_sections.join(', '))}</div>` : ''}</div>`).join('');
  const crashes = (cr.recent || []).map(r => `<tr><td class="fd-mono">${e(r.session)}</td><td>${r.end_kind === 'clean' ? 'clean' : `<b style="color:#d1242f">${e(r.end_kind)}</b>`}</td><td>${e(r.dll_version)}</td><td>${e(r.uptime_s)} s</td><td>${r.dump ? 'dump' : ''}</td></tr>`).join('');
  const lr = p.last_repack || {};
  return head
    + (todo.length ? todo.map(x => itemHtml(x, opts.live)).join('') : '<div class="fd-it" style="border-left:4px solid #2ea043">Nothing to fix.</div>')
    + sec('Features (' + feats.length + ')', `<table class="fd-tab"><tr><th></th><th>feature</th><th>repo</th><th>in DLL</th><th>last run</th><th>on</th><th>state</th></tr>${feats.map(featRow).join('')}</table>`, true)
    + sec('Client', kv([['tool client', c.tool_client_dir], ['launcher gamePath', (c.launcher || {}).game_path], ['client used for this report', c.real_client_dir],
      ['config packed client', c.config_client_packed], ['config client root', c.config_client_root], ['game_unpacked', c.game_unpacked],
      ['runtime client', ((c.runtime_client || {}).dir || '') + ' (' + ((c.runtime_client || {}).source || '?') + ')'],
      ['works unpacked', c.works_unpacked ? 'yes' : 'no'], ['last game started (any client of this PC)', c.last_run_client_dir], ['log of the tool client', c.tool_client_log], ['wrong client', c.wrong_client ? 'YES - ' + c.wrong_reason : 'no'], ['game_.exe', c.game_exe ? 'present' : 'absent']]))
    + sec('DLL', `<table class="fd-tab"><tr><th>file</th><th>client</th><th>version</th><th>built</th><th>size</th><th>sha256</th></tr>${dllFiles}</table>`
      + kv([['loaded', d.loaded_file ? d.loaded_file + ' EDEN ' + (d.loaded_eden || '?') : null], ['last run', d.runtime_eden ? 'EDEN ' + d.runtime_eden + ' (' + (d.runtime_built || '') + ')' : null],
        ['repo', d.repo_eden], ['feature_ee main', d.feature_ee_main_eden], ['Copy DLL would install', (d.copy_dll_would_install || {}).eden], ['runtime log', d.runtime_log]]))
    + sec('Package', kv([['format', p.format === 'rfg' ? 'RFG archives (client 8.x), RFG key ' + (p.key_set ? 'set' : 'MISSING') : 'pkg'], ['pkg', p.pkg_dir], [p.format === 'rfg' ? 'newest rPatch written' : 'pkg.idx written', p.idx_mtime], [p.format === 'rfg' ? 'archives size' : 'pkg.idx size', p.idx_size], ['chunks', p.chunks],
      ['last repack by the tool', lr.at ? lr.at + ' · ' + (lr.mode || '') + ' · applied ' + lr.applied + (lr.rolled_back ? ' · ROLLED BACK' : '') + (lr.other_client ? ' · other client' : '') : 'none recorded']]))
    + sec('INI files', ini || '<span class="fd-dim">none</span>')
    + sec('eden_hook log (' + (lg.errors || 0) + ' errors, ' + (lg.warnings || 0) + ' warnings, ' + (lg.benign || 0) + ' known-benign)', kv([['file', lg.path], ['written', lg.mtime], ['game dir', lg.game_dir], ['DLL build', lg.dll_build_line]])
      + ((lg.error_lines || []).length ? `<div class="fd-dim">error lines</div><pre class="fd-pre">${e(lg.error_lines.join('\n'))}</pre>` : '')
      + `<pre class="fd-pre">${e((lg.lines || []).join('\n'))}</pre>`)
    + sec('Crash sessions (' + (cr.sessions || 0) + ')', `<div class="fd-dim">${e(JSON.stringify(cr.by_end || {}))}</div><table class="fd-tab">${crashes}</table>`)
    + sec('System', kv([['Windows', sy.windows + ' (build ' + (sy.build || '?') + ')'], ['CPUs', sy.cpus]].concat((sy.disks || []).map(k => ['disk ' + k.drive + ' (' + k.used_by + ')', k.free_gb + ' GB free of ' + k.total_gb + ' GB']))))
    + (infos.length ? sec('Notes (' + infos.length + ')', infos.map(x => itemHtml(x, opts.live)).join('')) : '')
    + sec('Full text report', `<pre class="fd-pre">${e(text || '')}</pre>`);
}

async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch (_) {}
  const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} ta.remove(); return ok;
}

function wireFixes(root) {
  root.querySelectorAll('[data-fduse]').forEach(b => b.onclick = () => H.runBusy(b, async () => {
    try { const r = await H.fmPost('/api/features/diagnostics/use-client', { which: b.dataset.fduse });
      H.toast('The tool now installs into ' + r.client_packed, 'ok'); fmOpenDiagnostics(); }
    catch (err) { H.toast(H.errMessage(err), 'error'); }
  }));
  root.querySelectorAll('[data-fdreset]').forEach(b => b.onclick = () => fmOpenClientReset());
  root.querySelectorAll('[data-fdrepack]').forEach(b => b.onclick = async () => {
    if (H.isRepacking && H.isRepacking()) { H.toast('repack already running…', 'info'); return; }
    if (typeof H.barRepack !== 'function') { H.toast('repack unavailable', 'error'); return; }
    b.disabled = true; try { await H.barRepack(); } finally { fmOpenDiagnostics(); }
  });
}

export async function fmOpenDiagnostics(id) {
  H.showThemedDialog('Diagnostics', '<div class="fd-load"><span class="fmspin"></span> Checking this PC: client, DLL, pkg, logs, crashes… (local only, a few seconds)</div>');
  wide();
  let j, src = {};
  try { [j, src] = await Promise.all([H.fmGet('/api/features/diagnostics' + (id ? '?id=' + encodeURIComponent(id) : '')), H.fmGet('/api/features/diagnostics/source').catch(() => ({}))]); }
  catch (err) { const b = document.getElementById('intg-dlg-b'); if (b) b.innerHTML = `<div class="fd-it" style="border-left:4px solid #d1242f">${e(H.errMessage(err))}</div>`; return; }
  const rep = j.report, text = j.text;
  const sendTip = src.can_send ? 'upload this report to the back-office as ' + (src.send_as || '?') + ' (' + (src.send_env || '') + ')' : 'sign in to the tool through the access broker to send; use Export .zip otherwise';
  const toolbar = `<div class="fd-bar"><button class="mini" id="fd-copy">Copy report</button>
    <a class="mini sbtn" id="fd-zip" href="/api/features/diagnostics/export?id=${encodeURIComponent(rep.id)}" download>Export .zip</a>
    <button class="mini gold" id="fd-send" title="${e(sendTip)}"${src.can_send ? '' : ' disabled'}>Send to admin</button>
    <button class="mini" id="fd-again">Run again</button>
    ${src.can_receive ? '<button class="mini" id="fd-recv">Received from testers</button>' : ''}<span id="fd-msg" class="fd-dim"></span></div>`;
  const b = document.getElementById('intg-dlg-b'); if (!b) return;
  const t = document.getElementById('intg-dlg-t'); if (t) t.textContent = 'Diagnostics: what is installed on this PC';
  b.innerHTML = reportHtml(rep, text, { toolbar, live: true });
  wireFixes(b);
  const msg = m => { const x = document.getElementById('fd-msg'); if (x) x.textContent = m; };
  document.getElementById('fd-copy').onclick = async () => msg(await copyText(text) ? 'copied' : 'copy failed');
  document.getElementById('fd-again').onclick = () => fmOpenDiagnostics();
  const sb = document.getElementById('fd-send');
  if (sb) sb.onclick = () => H.runBusy(sb, async () => {
    try { const r = await H.fmPost('/api/features/diagnostics/send', { id: rep.id });
      msg((r.dup ? 'already sent' : 'sent') + ' #' + r.id + ' as ' + r.account); H.toast('Diagnostics sent to the admin (#' + r.id + ')', 'ok'); }
    catch (err) { msg(H.errMessage(err)); H.toast(H.errMessage(err), 'error'); }
  });
  const rb = document.getElementById('fd-recv'); if (rb) rb.onclick = () => fmOpenReceivedDiagnostics();
}

export async function fmOpenReceivedDiagnostics(account) {
  H.showThemedDialog('Diagnostics received', '<div class="fd-load"><span class="fmspin"></span> Asking the back-office…</div>');
  wide();
  const b = () => document.getElementById('intg-dlg-b');
  let j;
  try { j = await H.fmGet('/api/features/diagnostics/received' + (account ? '?account=' + encodeURIComponent(account) : '')); }
  catch (err) { if (b()) b().innerHTML = `<div class="fd-it" style="border-left:4px solid #d1242f">${e(H.errMessage(err))}</div>`; return; }
  const testers = (j.testers || []).map(x => `<button class="mini${x.account === account ? ' gold' : ''}" data-fdacct="${e(x.account)}" title="last ${e(x.last)}">${e(x.account)} (${e(x.n)})</button>`).join(' ');
  const rows = (j.items || []).map(x => `<tr data-fdid="${e(x.id)}" class="fd-click"><td>#${e(x.id)}</td><td>${e(String(x.received_at || '').replace('T', ' ').slice(0, 16))}</td><td><b>${e(x.account)}</b></td><td>${e(x.broker_env)}</td><td>${e(x.tool_version)}</td><td>${e(x.eden_version)}</td>
    <td style="color:${x.n_fail ? '#d1242f' : (x.n_warn ? '#b8860b' : '#2ea043')}">${x.n_fail ? x.n_fail + ' to fix' : (x.n_warn ? x.n_warn + ' warn' : 'OK')}</td><td class="fd-small">${e(x.headline)}</td></tr>`).join('');
  if (!b()) return;
  b().innerHTML = `<div class="fd-bar">Testers: ${testers || '<span class="fd-dim">none yet</span>'} ${account ? '<button class="mini" data-fdacct="">all</button>' : ''}</div>
    <table class="fd-tab"><tr><th>#</th><th>received</th><th>tester</th><th>env</th><th>tool</th><th>EDEN</th><th>result</th><th>main problems</th></tr>${rows || '<tr><td colspan="8" class="fd-dim">no report received</td></tr>'}</table>`;
  b().querySelectorAll('[data-fdacct]').forEach(x => x.onclick = () => fmOpenReceivedDiagnostics(x.dataset.fdacct || ''));
  b().querySelectorAll('[data-fdid]').forEach(x => x.onclick = async () => {
    const id = x.dataset.fdid;
    b().innerHTML = '<div class="fd-load"><span class="fmspin"></span> Loading report #' + e(id) + '…</div>';
    try {
      const r = await H.fmGet('/api/features/diagnostics/received/' + encodeURIComponent(id));
      const t = document.getElementById('intg-dlg-t'); if (t) t.textContent = 'Diagnostics #' + id + ' from ' + (r.account || '?');
      const tb = `<div class="fd-bar"><button class="mini" id="fd-back">← all reports</button><button class="mini" id="fd-copy">Copy report</button><span class="fd-dim">received ${e(r.received_at)} · signed in as ${e(r.account)} (${e(r.broker_env)})</span></div>`;
      b().innerHTML = reportHtml(r.report || {}, r.report_text || '', { toolbar: tb });
      document.getElementById('fd-back').onclick = () => fmOpenReceivedDiagnostics(account);
      document.getElementById('fd-copy').onclick = () => copyText(r.report_text || '');
    } catch (err) { b().innerHTML = `<div class="fd-it" style="border-left:4px solid #d1242f">${e(H.errMessage(err))}</div>`; }
  });
}
