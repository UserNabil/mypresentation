/* ============================================================================
   PACKAGING — carte Repack (2.133.0) : apercu -> repack de la selection EXACTE
   -> relecture facon jeu -> rapport ; « Verify pkg » ; Fix / Retry.

   Le serveur fait foi : la liste cochee a l'apercu part telle quelle (`include`),
   avec l'archive et le dossier du jeu de travail. Avant 2.133.0 le bouton Repack
   refaisait son propre scan (jamais « deep ») sur la configuration, pas sur le
   jeu de travail : ce que l'ecran montrait n'etait pas ce qui partait.

   host = { pkgSetProg(key,pct,label), pkgBusy(bool), pkgWsArchive(), pkgWsFolder() }
   ============================================================================ */

import { $, esc } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { uiConfirm } from '../ui/dialogs.js';

let H = null;
let _files = [];

const CSS = `
.rpk-sum{display:flex;flex-wrap:wrap;gap:6px 14px;margin:4px 0 8px;font-size:11.5px}
.rpk-sum b{font-size:13px}
.rpk-tbl{width:100%;border-collapse:collapse;font-size:11px;margin:4px 0 8px}
.rpk-tbl th{text-align:right;font-weight:600;color:var(--faint);border-bottom:1px solid var(--line);padding:2px 6px}
.rpk-tbl th:first-child,.rpk-tbl td:first-child{text-align:left}
.rpk-tbl td{text-align:right;padding:2px 6px;border-bottom:1px dotted var(--line);font-variant-numeric:tabular-nums}
.rpk-tbl td.z{color:var(--line)}
.rpk-tbl tr.hot td:first-child{font-weight:600}
.rpk-box{max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:4px 6px;margin-top:4px;font-size:11.5px;background:rgba(255,255,255,.35)}
.rpk-row{display:flex;gap:7px;align-items:baseline;padding:1px 0;word-break:break-all}
.rpk-badge{flex:none;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;border-radius:8px;padding:0 6px;color:#fff;background:var(--faint)}
.rpk-badge.missing,.rpk-badge.failed,.rpk-badge.unreadable{background:var(--crimson)}
.rpk-badge.different,.rpk-badge.refused{background:var(--gold)}
.rpk-badge.stale{background:#6d7f99}
.rpk-badge.ok,.rpk-badge.written{background:var(--jade)}
.rpk-live{font-size:10.5px;color:var(--faint);margin-top:4px;min-height:14px;font-variant-numeric:tabular-nums}
.rpk-acts{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}
.rpk-acts .sbtn{font-size:11px;padding:4px 11px}
.rpk-sec{margin:8px 0 4px;font-weight:600}
.rpk-warnline{color:var(--gold);font-size:11px}
details.rpk-det>summary{cursor:pointer;margin:6px 0 2px}
`;

function injectCss() {
  if (document.getElementById('rpk-css')) return;
  const s = document.createElement('style');
  s.id = 'rpk-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

function fmtSecs(s) {
  if (s == null) return '';
  s = Math.max(0, Math.round(s));
  return s >= 90 ? Math.floor(s / 60) + ' min ' + (s % 60) + ' s' : s + ' s';
}

function liveLabel(lv) {
  if (!lv || !lv.phase) return 'starting…';
  const parts = [lv.phase_label || lv.phase];
  if (lv.files_total) parts.push((lv.files_done || 0).toLocaleString() + '/' + lv.files_total.toLocaleString() + ' files');
  if (lv.bytes_total) parts.push(fmtBytes(lv.bytes_done) + ' / ' + fmtBytes(lv.bytes_total));
  if (lv.rate_bps) parts.push(fmtBytes(lv.rate_bps) + '/s');
  if (lv.folder) parts.push(lv.folder);
  if (lv.eta_s != null && lv.eta_s > 0) parts.push('≈ ' + fmtSecs(lv.eta_s) + ' left');
  return parts.join(' · ');
}

function livePct(lv) {
  if (!lv) return -1;
  if (lv.bytes_total) return 100 * (lv.bytes_done || 0) / lv.bytes_total;
  if (lv.files_total) return 100 * (lv.files_done || 0) / lv.files_total;
  return -1;
}

async function poll(url, key, liveBox, onDone) {
  let j;
  try { j = await (await fetch(url)).json(); }
  catch (e) {
    H.pkgSetProg(key, null); H.pkgBusy(false);
    if (liveBox) liveBox.textContent = '';
    onDone({ error: 'lost connection while polling — the task may still be running; check again in a moment' });
    return;
  }
  window.dispatchEvent(new CustomEvent('pkg-status', { detail: { key, j } }));
  const lv = j.live || {};
  const pct = livePct(lv);
  H.pkgSetProg(key, pct, pct < 0 ? 'working…' : Math.round(pct) + '%');
  if (liveBox) liveBox.textContent = liveLabel(lv);
  if (j.running || (!j.finished && !j.error)) { setTimeout(() => poll(url, key, liveBox, onDone), 600); return; }
  H.pkgSetProg(key, null); H.pkgBusy(false);
  if (liveBox) liveBox.textContent = '';
  onDone(j);
}

function liveBoxFor(key) {
  const res = $('#pkg-' + key + '-res');
  if (!res) return null;
  let b = document.getElementById('rpk-live-' + key);
  if (!b) {
    b = document.createElement('div');
    b.id = 'rpk-live-' + key;
    b.className = 'rpk-live';
    res.parentNode.insertBefore(b, res);
  }
  return b;
}

function folderTable(rows, cols, limit) {
  if (!rows || !rows.length) return '';
  const head = '<tr><th>Folder</th>' + cols.map(c => '<th>' + esc(c[1]) + '</th>').join('') + '</tr>';
  const body = rows.slice(0, limit).map(r => {
    const hot = cols.some(c => c[2] && r[c[0]]);
    return '<tr' + (hot ? ' class="hot"' : '') + '><td>' + esc(r.folder) + '</td>' + cols.map(c => {
      const v = r[c[0]] || 0;
      return '<td' + (v ? '' : ' class="z"') + '>' + (c[0] === 'bytes' ? (v ? fmtBytes(v) : '·') : (v ? v.toLocaleString() : '·')) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<table class="rpk-tbl">' + head + body + '</table>';
}

function listBox(items, render) {
  if (!items || !items.length) return '';
  return '<div class="rpk-box">' + items.map(render).join('') + '</div>';
}

function rowWithBadge(status, path, reason) {
  return '<div class="rpk-row"><span class="rpk-badge ' + esc(status) + '">' + esc(status) + '</span><span>' + esc(path)
    + (reason ? ' <span class="cur">— ' + esc(reason) + '</span>' : '') + '</span></div>';
}

/* ------------------------------------------------------------------ preview */
async function preview() {
  const res = $('#pkg-repack-res');
  const deep = !!window._rpkDeep;
  window._rpkDeep = false;
  res.innerHTML = '<span class="cur">scanning for changed &amp; added files' + (deep ? ' (deep — comparing contents, this takes a while)' : '') + '…</span>';
  $('#pkg-repack-btn').disabled = true; _files = [];
  H.pkgBusy(true); H.pkgSetProg('repack', -1, 'scanning…');
  try {
    const r = await fetch('/api/pkg/repack/preview/start?deep=' + (deep ? '1' : '0') + '&archive=' + encodeURIComponent(H.pkgWsArchive()) + '&folder=' + encodeURIComponent(H.pkgWsFolder()), { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || ('HTTP ' + r.status));
  } catch (e) {
    H.pkgSetProg('repack', null); H.pkgBusy(false);
    res.innerHTML = '<span class="err">✗ ' + esc(e.message || e) + '</span>'; return;
  }
  return new Promise(done => poll('/api/pkg/repack/preview/status', 'repack', liveBoxFor('repack'), j => {
    if (j.error || !j.result) res.innerHTML = '<span class="err">✗ ' + esc(j.error || 'preview failed') + '</span>';
    else renderPreview(j.result);
    done();
  }));
}

function renderPreview(j) {
  const res = $('#pkg-repack-res');
  const nc = j.count || 0, na = j.added_count || 0, ns = j.skipped_count || 0, nst = j.stale_count || 0;
  const sizes = j.sizes || {};
  let h = '<div class="rpk-sum"><span><b>' + nc.toLocaleString() + '</b> modified</span><span><b>' + na.toLocaleString() + '</b> new</span>'
    + '<span><b>' + ns.toLocaleString() + '</b> not packable</span>'
    + (nst ? '<span><b>' + nst.toLocaleString() + '</b> outdated copies</span>' : '')
    + '<span class="cur">to write: ' + fmtBytes((j.bytes_changed || 0) + (j.bytes_added || 0)) + ' · '
    + (j.tree_files || 0).toLocaleString() + ' files in the folder · scanned in ' + (j.elapsed != null ? j.elapsed + ' s' : '?') + '</span></div>';
  h += '<div class="cur" style="margin-bottom:4px">Archive <code>' + esc(j.pkg_dir || '') + '</code> · folder <code>' + esc(j.src || '') + '</code></div>';
  if (j.rfg_note) h += '<div class="note" style="margin-bottom:6px">' + esc(j.rfg_note) + '</div>';
  if (j.auto_deep_note) h += '<div class="warn" style="margin-bottom:6px">' + esc(j.auto_deep_note) + '</div>';
  if (j.stale_note) h += '<div class="warn" style="margin-bottom:6px">⚠ ' + esc(j.stale_note) + '</div>';
  const active = (j.folders || []).filter(f => f.added || f.modified || f.ignored);
  if (active.length) {
    h += '<div class="rpk-sec">By folder</div>' + folderTable(active, [['added', 'New', 1], ['modified', 'Modified', 1], ['unchanged', 'Unchanged'], ['ignored', 'Not packable', 1], ['bytes', 'To write']], 14);
    if (active.length > 14) h += '<details class="rpk-det"><summary class="cur">all ' + active.length + ' folders with activity</summary>'
      + folderTable(active.slice(14), [['added', 'New', 1], ['modified', 'Modified', 1], ['unchanged', 'Unchanged'], ['ignored', 'Not packable', 1], ['bytes', 'To write']], 400) + '</details>';
  }
  const warns = j.warnings || [];
  if (warns.length) {
    h += '<div class="rpk-sec" style="color:var(--gold)">⚠ ' + warns.length + ' file(s) will be packed but the game may not show them</div>'
      + listBox(warns, w => '<div class="rpk-row" style="flex-direction:column;gap:0"><span>' + esc(w.path) + '</span>'
        + w.warnings.map(m => '<span class="rpk-warnline">' + esc(m) + '</span>').join('') + '</div>');
  }
  if (!nc && !na) {
    h += '<div class="warn" style="margin:6px 0">No changed or added files — nothing to repack.' + (j.deep ? ' (contents compared: nothing differs.)' : '') + '</div>';
  } else {
    const changed = j.changed || [], added = j.added || [];
    const rows = (files, kind, label) => {
      if (!files.length) return '';
      let s = '<div style="margin:6px 0"><b>' + files.length + '</b> ' + label + ' '
        + '<a href="#" class="rpk-tog" data-k="' + kind + '" data-v="1">check all</a> · <a href="#" class="rpk-tog" data-k="' + kind + '" data-v="0">uncheck all</a><div class="rpk-box">';
      for (const f of files) {
        const i = _files.length; _files.push({ path: f, kind });
        s += '<label class="rpk-row" style="cursor:pointer"><input type="checkbox" class="rpk-inc" data-i="' + i + '" checked style="flex:none">'
          + '<span>' + esc(f) + (sizes[f] != null ? ' <span class="cur">' + fmtBytes(sizes[f]) + '</span>' : '') + '</span></label>';
      }
      return s + '</div></div>';
    };
    h += '<div class="cur" style="margin:6px 0 2px">Exactly the checked files are written — uncheck any you do <b>not</b> want in this repack:</div>';
    h += rows(changed, 'changed', 'modified file(s)');
    h += rows(added, 'added', 'NEW file(s) to add');
    if (j.listed_capped) h += '<div class="warn">List capped at 5000 per group — the files beyond the cap are not written by this repack; run it again afterwards.</div>';
  }
  const skipped = j.skipped || [];
  if (skipped.length) h += '<details class="rpk-det"' + (skipped.length <= 30 ? ' open' : '') + '><summary><b>' + skipped.length + '</b> file(s) on disk that the pack will <b>not</b> add — with the reason</summary>'
    + listBox(skipped, f => rowWithBadge('ignored', f.path, f.reason)) + '</details>';
  if ((j.stale_sample || []).length) h += '<details class="rpk-det"><summary class="cur">outdated copies (not repacked)</summary>'
    + listBox(j.stale_sample, p => rowWithBadge('stale', p, '')) + '</details>';
  h += '<div class="rpk-acts"><a href="#" id="rpk-deep" class="cur">' + (j.deep ? 'Contents were compared.' : 'Suspect a missed edit? Run a deep check (compares every file’s content)') + '</a></div>';
  h += '<div class="rpk-sel cur"></div>';
  res.innerHTML = h;
  const upd = () => {
    const inc = [...res.querySelectorAll('.rpk-inc')].filter(c => c.checked).length;
    const s = res.querySelector('.rpk-sel'); if (s) s.textContent = _files.length ? inc + '/' + _files.length + ' selected to repack' : '';
    $('#pkg-repack-btn').disabled = !inc;
  };
  res.querySelectorAll('.rpk-tog').forEach(a => a.onclick = e => {
    e.preventDefault(); const k = a.dataset.k, v = a.dataset.v === '1';
    res.querySelectorAll('.rpk-inc').forEach(cb => { if (_files[+cb.dataset.i].kind === k) cb.checked = v; }); upd();
  });
  res.querySelectorAll('.rpk-inc').forEach(cb => cb.onchange = upd);
  const d = res.querySelector('#rpk-deep');
  if (d && !j.deep) d.onclick = e => { e.preventDefault(); window._rpkDeep = true; preview(); };
  upd();
}

/* ------------------------------------------------------------------ repack */
async function startRepack(key, include, confirmMsg) {
  if (confirmMsg && !await uiConfirm(confirmMsg, key === 'pack' ? 'Pack client' : 'Repack (surgical)', key === 'pack' ? 'Pack' : 'Repack')) return;
  const res = $('#pkg-' + key + '-res');
  H.pkgBusy(true); H.pkgSetProg(key, -1, 'starting…');
  try {
    let r;
    if (key === 'pack') {
      r = await fetch('/api/pkg/pack?archive=' + encodeURIComponent(H.pkgWsArchive()) + '&folder=' + encodeURIComponent(H.pkgWsFolder()), { method: 'POST' });
    } else {
      r = await fetch('/api/pkg/repack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include, archive: H.pkgWsArchive(), folder: H.pkgWsFolder() })
      });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || 'failed to start');
  } catch (e) {
    H.pkgSetProg(key, null); H.pkgBusy(false);
    res.innerHTML = '<span class="err">✗ ' + esc(e.message || e) + '</span>'; return;
  }
  res.innerHTML = '';
  poll('/api/pkg/' + key + '/status', key, liveBoxFor(key), j => renderResult(j, key));
}

function verifyBlock(v, key) {
  if (!v) return '';
  const c = v.counts || {};
  const bad = (c.missing || 0) + (c.different || 0) + (c.unreadable || 0);
  const mism = v.index_mismatch_total != null ? v.index_mismatch_total : (v.index_mismatch || []).length;
  let h = '';
  if (!bad && !mism) {
    h += '<div class="ok" style="margin:6px 0">✔ Checked the way the game reads the pkg: all ' + (c.ok || 0).toLocaleString() + ' game files of the folder are in the pkg, identical'
      + ' <span class="cur">(' + (v.content_checked || 0).toLocaleString() + ' compared byte for byte, ' + (v.trusted || 0).toLocaleString() + ' proven unchanged since depack · ' + v.elapsed + ' s)</span></div>';
  } else {
    h += '<div class="err" style="margin:6px 0">✗ ' + bad.toLocaleString() + ' file(s) of the folder are NOT in the pkg as they are on disk'
      + (mism ? ' · ' + mism + ' index entr' + (mism === 1 ? 'y' : 'ies') + ' read differently by the game' : '') + '</div>';
    const rows = (v.folders || []).filter(f => f.missing || f.different || f.unreadable);
    h += folderTable(rows, [['missing', 'Missing', 1], ['different', 'Different', 1], ['unreadable', 'Unreadable', 1], ['ok', 'OK']], 20);
    h += listBox(v.problems, p => rowWithBadge(p.status, p.path, p.reason));
    if ((v.index_mismatch || []).length) h += listBox(v.index_mismatch, p => rowWithBadge('index', p.path, p.why));
    if (v.problems_total > (v.problems || []).length) h += '<div class="cur">… ' + (v.problems_total - v.problems.length) + ' more not listed</div>';
    h += '<div class="rpk-acts"><button class="sbtn rpk-fix" data-key="' + key + '">Fix: re-inject these ' + Math.min(bad, (v.problems || []).length) + ' file(s)</button>'
      + '<button class="sbtn ghost rpk-reverify">Verify again</button></div>';
  }
  if (c.stale) h += '<details class="rpk-det"><summary class="warn">' + c.stale + ' outdated copies: the archive is newer than these untouched files — depack again, do not repack them</summary>'
    + listBox(v.stale, p => rowWithBadge('stale', p.path, '')) + '</details>';
  if (c.ignored) h += '<details class="rpk-det"><summary class="cur">' + c.ignored + ' file(s) in the folder are not game files (never packed) — why</summary>'
    + listBox(v.ignored, p => rowWithBadge('ignored', p.path, p.reason)) + '</details>';
  if (v.absent_from_tree) h += '<div class="cur">' + v.absent_from_tree.toLocaleString() + ' archive file(s) are not in this folder (partial depack) — not a problem for packing.</div>';
  return h;
}

function wireVerifyActions(res, v) {
  res.querySelectorAll('.rpk-fix').forEach(b => b.onclick = () => {
    const paths = (v.problems || []).filter(p => p.status !== 'stale').map(p => p.path);
    startRepack('repack', paths, 'Re-inject ' + paths.length + ' file(s) exactly as they are on disk? Automatic .bak backups are kept and the result is read back the way the game reads it.');
  });
  res.querySelectorAll('.rpk-reverify').forEach(b => b.onclick = () => startVerify(false));
}

function renderResult(j, key) {
  const res = $('#pkg-' + key + '-res');
  if (j.error) { res.innerHTML = '<span class="err">✗ ' + esc(j.error) + '</span>'; toast(key + ' failed', 'error', { sticky: true }); return; }
  const rep = j.report || {};
  const errs = j.errors || [];
  const files = rep.files || [];
  const written = files.filter(f => f.status === 'written');
  const nAdd = written.filter(f => f.kind === 'added').length, nMod = written.length - nAdd;
  const failed = files.filter(f => f.status === 'failed' || f.status === 'refused');
  let h;
  if (rep.rolled_back) {
    h = '<div class="err">✗ Nothing written: the repack was rolled back to protect the client.</div>';
  } else if (!j.changed && !written.length) {
    h = '<div class="warn">Nothing to write — the archive already matches.</div>';
  } else {
    h = '<div class="' + (failed.length ? 'warn' : 'ok') + '">' + (failed.length ? '⚠ ' : '✔ ') + written.length.toLocaleString() + ' file(s) written'
      + ' <span class="cur">(' + nAdd + ' new, ' + nMod + ' modified · ' + fmtBytes(rep.bytes_written || 0) + ' · ' + (rep.elapsed != null ? rep.elapsed + ' s' : '') + ')</span></div>';
  }
  if (rep.rfg && (rep.archives || []).length) h += '<div class="cur" style="margin:4px 0">RFG archives written (decrypted and CRC-checked after writing): '
    + rep.archives.map(a => '<code>' + esc(a.archive) + '</code> ' + esc(a.kind) + ', ' + a.count + ' entries, ' + fmtBytes(a.size)).join(' · ') + '</div>';
  const t = rep.timings || {};
  if (Object.keys(t).length) h += '<div class="cur">' + Object.entries(t).map(([k, v]) => esc(k) + ' ' + v + ' s').join(' · ') + '</div>';
  const rows = (rep.folders || []).filter(f => f.added || f.modified || f.refused || f.failed);
  if (rows.length) h += folderTable(rows, [['added', 'New'], ['modified', 'Modified'], ['refused', 'Refused', 1], ['failed', 'Failed', 1], ['bytes', 'Written']], 30);
  if (failed.length) {
    h += '<div class="rpk-sec">' + failed.length + ' file(s) not written</div>' + listBox(failed, f => rowWithBadge(f.status, f.path, f.reason));
    h += '<div class="rpk-acts"><button class="sbtn ghost rpk-retry">Retry these ' + failed.length + ' file(s)</button></div>';
  }
  if (errs.length) h += '<details class="rpk-det"' + (rep.rolled_back ? ' open' : '') + '><summary class="cur">' + errs.length + ' message(s) from the engine</summary><pre>' + errs.slice(0, 40).map(esc).join('\n') + '</pre></details>';
  h += verifyBlock(rep.verify, key);
  res.innerHTML = h;
  res.querySelectorAll('.rpk-retry').forEach(b => b.onclick = () => startRepack('repack', failed.map(f => f.path), 'Retry ' + failed.length + ' file(s)?'));
  wireVerifyActions(res, rep.verify || {});
  if (key === 'repack') $('#pkg-repack-btn').disabled = true;
  const bad = rep.verify ? ((rep.verify.counts || {}).missing || 0) + ((rep.verify.counts || {}).different || 0) + ((rep.verify.counts || {}).unreadable || 0) : 0;
  toast(rep.rolled_back ? key + ': rolled back' : (failed.length || bad ? key + ': done, ' + (failed.length + bad) + ' file(s) need attention' : '✔ ' + key + ' complete, verified'),
    rep.rolled_back ? 'error' : (failed.length || bad ? 'warn' : 'ok'), { sticky: !!(rep.rolled_back || failed.length || bad) });
}

/* ------------------------------------------------------------------ verify */
async function startVerify(deep) {
  const key = 'verify';
  const res = $('#pkg-verify-res');
  H.pkgBusy(true); H.pkgSetProg(key, -1, 'starting…');
  try {
    const r = await fetch('/api/pkg/verify_tree', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deep: !!deep, archive: H.pkgWsArchive(), folder: H.pkgWsFolder() })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || 'failed to start');
  } catch (e) {
    H.pkgSetProg(key, null); H.pkgBusy(false);
    res.innerHTML = '<span class="err">✗ ' + esc(e.message || e) + '</span>'; return;
  }
  res.innerHTML = '';
  poll('/api/pkg/verify_tree/status', key, liveBoxFor(key), j => {
    if (j.error) { res.innerHTML = '<span class="err">✗ ' + esc(j.error) + '</span>'; return; }
    const v = j.report || {};
    res.innerHTML = '<div class="cur">Mode: ' + esc(v.mode || '') + (v.auto_deep ? ' (no unpack manifest: contents compared)' : '')
      + ' · ' + (v.tree_files || 0).toLocaleString() + ' files in the folder · ' + (v.pkg_records || 0).toLocaleString() + ' archive records</div>' + verifyBlock(v, 'repack');
    wireVerifyActions(res, v);
  });
}

/* ------------------------------------------------------------------ RFG (client 8.x) */
async function rfgPanel() {
  const card = $('#pkgcard-repack');
  if (!card) return;
  let box = document.getElementById('rpk-rfg');
  if (!box) {
    box = document.createElement('div');
    box.id = 'rpk-rfg';
    box.style.cssText = 'font-size:11.5px;margin:2px 0 6px';
    const hd = card.querySelector('.pkghd');
    if (hd && hd.nextSibling) card.insertBefore(box, hd.nextSibling); else card.appendChild(box);
  }
  let s = {};
  try { s = await (await fetch('/api/pkg/rfg/status?src=' + encodeURIComponent(H.pkgWsArchive()))).json(); } catch (e) { s = {}; }
  if (!s.rfg) { box.innerHTML = ''; return; }
  let h = '<div class="note">RFG client (8.x) — <b>' + (s.source_archives || 0) + '</b> source and <b>' + (s.patch_archives || []).length
    + '</b> patch archive(s) in <code>' + esc(s.root || '') + '</code>. Repack writes into <code>rfg\\patch</code> (next new archive: <code>'
    + esc(s.next_patch || '') + '</code>)' + (s.zstd ? '' : '; zstandard missing in this build: files are stored uncompressed') + '.</div>';
  const keyEdit = !!(H.can && H.can('features.manage'));
  h += '<div class="pkgrow" style="flex-wrap:wrap;gap:8px;margin-top:4px">'
    + (s.key_set ? '<span class="ok">✔ RFG key set</span>' + (keyEdit ? '<a href="#" id="rpk-rfg-change" class="cur">replace key</a>' : '')
      : '<span class="err">✗ RFG key missing — Depack, Preview and Repack need it</span>')
    + (!keyEdit ? '</div>' : '<span id="rpk-rfg-form" style="display:' + (s.key_set ? 'none' : 'flex') + ';gap:6px;flex:1;min-width:260px">'
    + '<input id="rpk-rfg-key" type="password" autocomplete="off" placeholder="RFG key: 64 hex characters or the rfg_key_embedded.h text" style="flex:1;font-size:11.5px">'
    + '<button class="sbtn ghost" id="rpk-rfg-save" style="font-size:11px;padding:4px 11px">Save key</button></span></div>');
  box.innerHTML = h;
  const ch = $('#rpk-rfg-change');
  if (ch) ch.onclick = e => { e.preventDefault(); $('#rpk-rfg-form').style.display = 'flex'; };
  if (!$('#rpk-rfg-save')) return;
  $('#rpk-rfg-save').onclick = async () => {
    const inp = $('#rpk-rfg-key');
    const v = (inp.value || '').trim();
    if (!v) { toast('Paste the RFG key first.', 'warn'); return; }
    try {
      const r = await fetch('/api/pkg/rfg/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: v }) });
      const j = await r.json().catch(() => ({}));
      inp.value = '';
      if (!r.ok) throw new Error(j.detail || ('HTTP ' + r.status));
      toast('RFG key saved on this machine');
      rfgPanel();
    } catch (e) { toast('' + (e.message || e), 'error'); }
  };
}

export function initRepack(host) {
  H = host;
  injectCss();
  rfgPanel();
  const wsa = $('#pkg-ws-archive'); if (wsa) wsa.addEventListener('change', () => rfgPanel());
  const wsc = $('#pkg-ws-archive-custom'); if (wsc) wsc.addEventListener('change', () => rfgPanel());
  const p = $('#pkg-preview-btn'); if (p) p.onclick = () => preview();
  const r = $('#pkg-repack-btn');
  if (r) r.onclick = () => {
    const res = $('#pkg-repack-res');
    const include = [...res.querySelectorAll('.rpk-inc')].filter(cb => cb.checked).map(cb => _files[+cb.dataset.i].path);
    if (!include.length) { toast('Nothing selected — run the preview and tick the files to repack.', 'warn'); return; }
    const skipped = _files.length - include.length;
    startRepack('repack', include, 'Write ' + include.length + ' file(s) into the client pkg' + (skipped ? ' (' + skipped + ' unchecked file(s) are left out)' : '')
      + '? Automatic .bak backups are kept, every written file is read back the way the game reads it, then the whole folder is checked.');
  };
  const pk = $('#pkg-pack-btn');
  if (pk) pk.onclick = () => startRepack('pack', null, 'Write every changed and new file of the folder into the client archive? (.bak backups, read-back check and folder check included)');
  const v = $('#pkg-verify-btn');
  if (v) v.onclick = () => startVerify(!!($('#pkg-verify-deep') && $('#pkg-verify-deep').checked));
}
