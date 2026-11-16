/* ============================================================================
   FEATURE MANAGER — Reset client : remet le jeu du testeur sur le client du CDN
   Reforged, reconstruit game_unpacked, reinstalle les features allumees, repacke
   une fois, recopie le DLL et relance les Diagnostics. Etude : docs/studies/client_reset.md
   ============================================================================ */
import { H } from './feature_manager_state.js';
import { fmOpenDiagnostics } from './feature_manager_diag.js';

const e = s => H.esc(s == null ? '' : String(s));
const gb = n => (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + ' GB';
const ICON = { done: '✔', running: '⟳', failed: '✖', cancelled: '■', todo: '·' };
const COLOR = { done: '#2ea043', running: '#8a6d2e', failed: '#d1242f', cancelled: '#b8860b', todo: '#9a8f78' };
let _poll = null;

function body() { return document.getElementById('intg-dlg-b'); }
function wide() { const b = document.querySelector('#intg-dlg > div'); if (b) { b.style.maxWidth = '820px'; b.style.maxHeight = '88vh'; } }

function choiceHtml(c, sel) {
  return `<label class="fr-choice${c.key === sel ? ' on' : ''}"><input type="radio" name="fr-target" value="${e(c.key)}"${c.key === sel ? ' checked' : ''}>
    <span><b class="fd-mono">${e(c.dir)}</b><br><span class="fd-dim">${e(c.label)}</span><br>
    <span class="fd-dim">DLL ${c.eden ? 'EDEN ' + e(c.eden) : 'none'} · pkg ${c.pkg_at ? 'written ' + e(String(c.pkg_at).replace('T', ' ')) : 'missing'} · game_unpacked <span class="fd-mono">${e(c.unpacked)}</span></span></span></label>`;
}

export async function fmOpenClientReset() {
  H.showThemedDialog('Reset client', '<div class="fd-load"><span class="fmspin"></span> Looking at your game folders and the Reforged CDN…</div>');
  wide();
  let p;
  try { p = await H.fmGet('/api/features/client-reset/preflight'); }
  catch (err) { if (body()) body().innerHTML = `<div class="fd-it" style="border-left:4px solid #d1242f">${e(H.errMessage(err))}</div>`; return; }
  if (p.busy) return showProgress();
  const ch = p.choices || [];
  if (!ch.length) { body().innerHTML = '<div class="fd-it" style="border-left:4px solid #d1242f">No game folder found on this PC (a folder with game_.exe). Install the game with the Eden Reforged launcher first.</div>'; return; }
  const cdn = p.cdn ? `latest client on the Reforged CDN: <b>${e(p.cdn.version)}</b> (${e(p.cdn.files)} files, ${gb(p.cdn.bytes || 0)}; only what differs from your game is downloaded)` : `<b style="color:#d1242f">${e(p.cdn_error || 'CDN unreachable')}</b>`;
  const run = (p.running || []).length ? `<div class="fd-it" style="border-left:4px solid #d1242f"><b>Close the game first:</b> ${e(p.running.map(r => r.name).join(', '))} is running.</div>` : '';
  const res = p.resume ? `<div class="fd-it" style="border-left:4px solid #b8860b"><b>A reset was interrupted</b> (${e(p.resume.status)}${p.resume.error ? ': ' + e(p.resume.error) : ''}) on <span class="fd-mono">${e(p.resume.target)}</span>. Steps already done: ${e((p.resume.done || []).join(', ') || 'none')}.
      <div class="fd-bar"><button class="mini gold" id="fr-resume">Resume</button><span class="fd-dim">or choose a folder below and start over</span></div></div>` : '';
  body().innerHTML = `<div class="fd-it" style="border-left:4px solid #8a6d2e">Reset client puts your game back on the official Eden Reforged client, then installs every feature that is on, in one go:
      <ol class="fr-ol">${(p.steps || []).map(s => `<li>${e(s[1])}</li>`).join('')}</ol>
      Everything replaced is kept in a backup first (<span class="fd-mono">_eden_reset_backup</span> in the game folder, and the old game_unpacked next to the new one). Your settings stay: ${e((p.keeps || []).join(', '))} and the launcher settings. The game must stay closed until the end. If the PC stops in the middle, open Reset client again and click Resume.</div>
    ${run}${res}
    <div class="fr-h">${ch.length > 1 ? 'Which game do you play with? These folders are different:' : 'Your game folder:'}</div>
    <div class="fr-choices">${ch.map(c => choiceHtml(c, p.recommended)).join('')}</div>
    <div class="fd-dim" style="margin:6px 0">${cdn}</div>
    <div class="fd-bar"><button class="mini gold" id="fr-go"${p.cdn ? '' : ' disabled'}>Reset this game</button><span class="fd-dim" id="fr-msg"></span></div>`;
  body().querySelectorAll('input[name="fr-target"]').forEach(r => r.onchange = () => body().querySelectorAll('.fr-choice').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
  const go = async (resume) => {
    const sel = body().querySelector('input[name="fr-target"]:checked');
    const c = ch.find(x => x.key === (sel && sel.value));
    if (!resume && !await H.fmConfirm('Reset this game?',
      `<div style="line-height:1.55"><div class="fd-dim" style="margin-bottom:8px">Game folder</div>
       <div style="font-family:monospace;padding:6px 10px;border-radius:8px;background:rgba(0,0,0,.06);margin-bottom:12px">${e(c ? c.dir : '?')}</div>
       <ol style="margin:0 0 10px 18px;padding:0">
         <li>The game is brought back to the latest Reforged client (only changed files are downloaded).</li>
         <li>Every feature that is on is installed again, then one repack.</li>
         <li>The current DLL is copied and Diagnostics run.</li></ol>
       <div class="fd-dim">Your settings (eden_user.ini, eden_patch.ini) are kept and every replaced file is backed up first. Keep the game closed until it is done.</div></div>`,
      'Reset')) return;
    try { await H.fmPost('/api/features/client-reset/start', { which: sel ? sel.value : '', resume: !!resume }); showProgress(); }
    catch (err) { const m = document.getElementById('fr-msg'); if (m) m.textContent = H.errMessage(err); H.toast(H.errMessage(err), 'error'); }
  };
  document.getElementById('fr-go').onclick = () => go(false);
  const rb = document.getElementById('fr-resume'); if (rb) rb.onclick = () => go(true);
}

function stepsHtml(st) {
  return '<div class="fr-steps">' + (st.steps || []).map(s => `<div class="fr-step" style="color:${COLOR[s.status] || COLOR.todo}"><b>${ICON[s.status] || '·'}</b> ${e(s.label)}</div>`).join('') + '</div>';
}

function barHtml(st) {
  const lv = st.live || {};
  let part = null, txt = '';
  if (st.bytes_total) { part = st.bytes_done / st.bytes_total; txt = gb(st.bytes_done || 0) + ' / ' + gb(st.bytes_total) + ' · file ' + (st.files_done || 0) + '/' + (st.files_total || 0); }
  else if (st.files_total) { part = st.files_done / st.files_total; txt = (st.files_done || 0) + ' / ' + st.files_total + ' files'; }
  else if (lv.files_total) { part = (lv.files_done || 0) / lv.files_total; txt = (lv.files_done || 0) + ' / ' + lv.files_total + ' files'; }
  const w = part == null ? 0 : Math.max(0, Math.min(1, part)) * 100;
  return `<div class="fr-phase">${e(st.phase || st.step_label || '')}</div>
    <div class="fmloadbar${part == null ? ' indet' : ''}" style="margin:6px 0"><i style="width:${w.toFixed(1)}%"></i></div>
    <div class="fd-dim">${e(txt)} ${st.cur ? '· <span class="fd-mono">' + e(st.cur) + '</span>' : ''}</div>`;
}

function resultHtml(st) {
  const r = st.result || {}, d = r.diag || {};
  const dl = r.download || {}, fe = r.features || {}, rp = r.repack || {}, dll = r.dll || {};
  const vc = d.verdict === 'ok' ? '#2ea043' : (d.verdict === 'warn' ? '#b8860b' : '#d1242f');
  return `<div class="fd-head" style="border-color:${vc}"><div class="fd-verdict" style="color:${vc}">Reset finished${d.verdict ? ': ' + (d.verdict === 'ok' ? 'everything is installed' : (d.fail ? d.fail + ' thing(s) to fix' : '') + (d.fail && d.warn ? ', ' : '') + (d.warn ? d.warn + ' warning(s)' : '')) : ''}</div>
      <div class="fd-sub">client ${e(dl.version || '?')} · ${e(dl.downloaded || 0)} file(s) downloaded (${gb(dl.bytes || 0)}), ${e(dl.up_to_date || 0)} already up to date · ${e(fe.features || 0)} feature(s) installed · ${e(rp.applied || 0)} file(s) repacked · DLL: ${e(dll.note || '-')}</div>
      ${(d.items || []).map(i => `<div class="fd-small" style="color:${i.level === 'fail' ? '#d1242f' : '#b8860b'}">• ${e(i.title)}</div>`).join('')}
      <div class="fd-bar"><button class="mini gold" id="fr-diag">Open the Diagnostics report</button><span class="fd-dim">You can start the game now.</span></div></div>`;
}

function showProgress() {
  if (_poll) clearInterval(_poll);
  const tick = async () => {
    let st;
    try { st = await H.fmGet('/api/features/client-reset/status'); } catch (_) { return; }
    const b = body();
    if (!b) { clearInterval(_poll); _poll = null; return; }
    const t = document.getElementById('intg-dlg-t'); if (t) t.textContent = 'Reset client: ' + (st.target || '');
    const done = !st.running;
    const logOpen = !!(b.querySelector('.fd-sec') || {}).open;
    b.innerHTML = stepsHtml(st)
      + (done ? '' : barHtml(st))
      + (st.error ? `<div class="fd-it" style="border-left:4px solid #d1242f"><b>Stopped:</b> ${e(st.error)}<div class="fd-bar"><button class="mini gold" id="fr-again">Resume</button></div></div>` : '')
      + (done && !st.error && st.result ? resultHtml(st) : '')
      + (done ? '' : '<div class="fd-bar"><button class="mini" id="fr-cancel">Stop (resume later)</button><span class="fd-dim">Keep the game closed. You can close this window: the reset goes on, Reset client shows it again.</span></div>')
      + `<details class="fd-sec"${logOpen ? ' open' : ''}><summary>Log</summary><div class="fd-secb"><pre class="fd-pre">${e((st.log || []).join('\n'))}</pre></div></details>`;
    const c = document.getElementById('fr-cancel');
    if (c) c.onclick = () => H.fmPost('/api/features/client-reset/cancel', {}).then(() => H.toast('stopping after the current file…', 'info')).catch(err => H.toast(H.errMessage(err), 'error'));
    const a = document.getElementById('fr-again');
    if (a) a.onclick = async () => { try { await H.fmPost('/api/features/client-reset/start', { resume: true }); showProgress(); } catch (err) { H.toast(H.errMessage(err), 'error'); } };
    const dg = document.getElementById('fr-diag');
    if (dg) dg.onclick = () => fmOpenDiagnostics(((st.result || {}).diag || {}).id);
    if (done) { clearInterval(_poll); _poll = null; if (!st.error) H.toast('Reset client finished', 'ok'); }
  };
  tick();
  _poll = setInterval(tick, 900);
}
