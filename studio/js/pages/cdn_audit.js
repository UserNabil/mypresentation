import { $, el, clear, append } from '../core/dom.js';
import { icon, btn, badge, card, dataTable, emptyState, errorState } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { fmtBytes, fmtNum, ago } from '../core/format.js';
import { toast } from '../ui/toast.js';
import { uiConfirm, uiPrompt } from '../ui/dialogs.js';

const ROOT = '/api/deploy/cdn-audit';
const S = { host: null, ctx: null, env: null, res: null, plan: null, filter: 'problems', open: new Set(), timer: null, pubTimer: null };

const TONE = { ok: 'ok', embedded: 'info', missing: 'error', stale: 'warn', unknown: 'neutral', behind: 'warn', ahead: 'info', absent: 'error', 'n/a': 'neutral', differs: 'warn', error: 'error' };
const LABEL = { ok: 'OK', embedded: 'IN DLL', missing: 'MISSING', stale: 'STALE', unknown: 'UNKNOWN', behind: 'BEHIND', ahead: 'AHEAD', absent: 'NOT IN DLL', 'n/a': 'N/A', differs: 'DIFFERS', error: 'ERROR' };

function tag(state, title) {
  const s = state || 'unknown';
  return badge(LABEL[s] || s.toUpperCase(), TONE[s] || 'neutral', { title });
}

function short(h, n) { return h ? String(h).slice(0, n || 12) + '…' : '—'; }

function alive() { return !!$('#cda-wrap'); }

export function initCdnAudit(host) { S.host = host; }

export async function openCdnAudit() {
  const H = S.host;
  if (!H || !H.guardPage('deploy.client', 'CDN Audit')) return;
  H.edenSetView('cdnaudit');
  const c = $('#content');
  if (!c) return;
  clear(c);
  c.appendChild(el('div', { id: 'cda-wrap', class: 'cda-wrap' }, emptyState({ title: 'Loading…', icon: 'network' })));
  try {
    S.ctx = await api.get(ROOT + '/context');
  } catch (e) {
    clear($('#cda-wrap')).appendChild(errorState({ error: e, title: 'CDN Audit unavailable', onRetry: openCdnAudit }));
    return;
  }
  S.env = S.env || S.ctx.active;
  render();
  await loadResult();
  if (S.ctx.job && S.ctx.job.running) pollJob();
  if (S.ctx.publish && S.ctx.publish.running) pollPublish();
}

function envRow(env) { return (S.ctx.envs || []).find(e => e.env === env) || {}; }

function render() {
  const w = $('#cda-wrap');
  if (!w) return;
  clear(w);
  const er = envRow(S.env);
  const sel = el('select', { id: 'cda-env', title: 'Environment to audit: its CDN, its feature_ee branch and its promoted feature list' },
    (S.ctx.envs || []).map(e => el('option', { value: e.env, selected: e.env === S.env ? true : null }, e.env.toUpperCase() + (e.env === S.ctx.active ? ' (active)' : ''))));
  sel.onchange = async () => { S.env = sel.value; S.res = null; S.plan = null; render(); await loadResult(); };
  const un = el('input', { id: 'cda-unpacked', type: 'text', placeholder: er.unpacked || 'unpacked client folder (optional)', value: '', title: 'Unpacked client folder to compare with. Empty = the folder configured for this environment.' });
  const probe = el('input', { type: 'checkbox', id: 'cda-probe', checked: true });
  append(w, [
    el('div', { class: 'cda-head' },
      el('h2', {}, icon('network', 24), 'CDN Audit'),
      el('span', { class: 'cda-src' }, badge(er.cdn ? er.cdn.replace(/^https?:\/\//, '') : 'no CDN', 'neutral', { title: 'Public base URL the launcher downloads from' }),
        badge('branch ' + (er.branch || '?'), 'info', { title: 'feature_ee branch that defines what this environment should serve' })),
      el('div', { class: 'cda-head-r' },
        el('label', { class: 'cda-ctl' }, 'Environment', sel),
        el('label', { class: 'cda-ctl', title: 'HEAD every pkg part and root file listed in verify.yml and compare its size with the manifest' }, probe, 'Probe sizes'),
        btn({ label: 'Inspect CDN', icon: 'search', id: 'cda-go', busyLabel: 'Starting…', onClick: () => startInspect() }))),
    el('div', { class: 'esub cda-lead' }, 'Read-only. Downloads the launcher manifests (latest.yml / verify.yml), the served client DLL (version.dll) and pkg/pkg.idx, then checks every client asset of the features this environment should serve against the pkg on the CDN, the unpacked folder and the loose files on the CDN. Nothing is written anywhere.'),
    el('div', { class: 'cda-opts' }, el('label', { class: 'cda-ctl cda-grow' }, 'Unpacked folder', un),
      er.unpacked ? badge(er.unpacked_ok ? 'configured' : 'configured folder missing', er.unpacked_ok ? 'ok' : 'warn', { title: er.unpacked }) : badge('none configured for ' + S.env, 'neutral')),
    el('div', { id: 'cda-job' }),
    el('div', { id: 'cda-body' }),
    el('div', { id: 'cda-sa' })]);
  renderBody();
  renderSa();
}

async function loadResult() {
  try {
    const r = await api.get(ROOT + '/result?env=' + encodeURIComponent(S.env));
    S.res = r && !r.empty ? r : null;
  } catch (e) { S.res = null; }
  renderBody();
  renderSa();
}

async function startInspect() {
  const un = ($('#cda-unpacked') || {}).value || '';
  const probe = !!($('#cda-probe') || {}).checked;
  try {
    await api.post(ROOT + '/inspect', { env: S.env, unpacked: un.trim() || null, probe });
  } catch (e) { toast(errMessage(e), 'error'); return; }
  S.plan = null;
  pollJob();
}

function pollJob() {
  clearInterval(S.timer);
  const tick = async () => {
    if (!alive()) { clearInterval(S.timer); return; }
    let j;
    try { j = await api.get(ROOT + '/status'); } catch (e) { return; }
    renderJob(j);
    if (!j.running) {
      clearInterval(S.timer);
      if (j.error) toast('Inspection failed: ' + j.error, 'error');
      else { toast('CDN inspected', 'ok'); await loadResult(); }
    }
  };
  tick();
  S.timer = setInterval(tick, 1200);
}

function renderJob(j) {
  const box = $('#cda-job');
  if (!box) return;
  clear(box);
  if (!j || (!j.running && !j.error)) return;
  const pct = Math.max(0, Math.min(100, j.pct || 0));
  box.appendChild(el('div', { class: 'cda-job' + (j.error ? ' err' : '') },
    el('div', { class: 'cda-job-h' }, j.running ? el('span', { class: 'spin' }) : icon('error', 24),
      el('b', {}, j.running ? 'Inspecting ' + String(j.env || '').toUpperCase() + '…' : 'Inspection failed'),
      el('span', { class: 'cda-dim' }, j.error || j.phase || '')),
    el('div', { class: 'cda-bar' }, el('i', { style: { width: pct + '%' } })),
    el('pre', { class: 'cda-log' }, (j.log || []).slice(-8).join('\n'))));
}

function kpi(label, value, tone, title) {
  return el('div', { class: 'cda-kpi' + (tone ? ' ' + tone : ''), title }, el('b', {}, value), el('span', {}, label));
}

function renderBody() {
  const b = $('#cda-body');
  if (!b) return;
  clear(b);
  const r = S.res;
  if (!r) {
    b.appendChild(emptyState({ icon: 'network', title: 'No inspection yet for ' + String(S.env).toUpperCase(), hint: 'Press Inspect CDN: about 30 s with a warm cache, longer the first time (the DLL and pkg.idx are downloaded once).' }));
    return;
  }
  const m = r.manifests || {}, d = r.dll || {}, sv = d.served || {}, ex = d.expected || {}, sm = r.summary || {};
  b.appendChild(el('div', { class: 'cda-when cda-dim' }, 'Inspected ' + (r.finished || r.started) + ' · ' + r.base + (r.unpacked ? ' · unpacked: ' + r.unpacked : '')));
  b.appendChild(el('div', { class: 'cda-kpis' },
    kpi('launcher manifest version', (m.latest && m.latest.version) || '—', m.latest && m.verify && m.latest.version === m.verify.version ? '' : 'bad', 'latest.yml ' + ((m.latest || {}).version || '?') + ' / verify.yml ' + ((m.verify || {}).version || '?')),
    kpi((sv.name || 'version.dll') + ' served', sv.eden_version || '—', d.state === 'ok' ? 'good' : (d.state === 'differs' ? 'warn' : ''), sv.build ? 'built ' + sv.build : ''),
    kpi('client DLL on ' + (ex.branch || (r.git || {}).branch || '?'), ex.eden_version || '—', '', ex.version_h ? 'version.h ' + ex.version_h : ''),
    kpi('features OK', fmtNum(sm.ok || 0), 'good'),
    kpi('features missing', fmtNum(sm.missing || 0), sm.missing ? 'bad' : ''),
    kpi('features stale', fmtNum(sm.stale || 0), sm.stale ? 'warn' : ''),
    kpi('manifest guard', (r.guard || {}).ok ? 'OK' : ((r.guard || {}).ok === false ? 'REFUSED' : '—'), (r.guard || {}).ok ? 'good' : 'warn', (r.guard || {}).message || '')));
  if ((r.notes || []).length) b.appendChild(el('div', { class: 'cda-notes' }, r.notes.map(n => el('div', {}, icon('warning', 24), n))));
  b.appendChild(el('div', { class: 'cda-grid' }, servedCard(r), dllCard(r)));
  b.appendChild(featuresCard(r));
  b.appendChild(missingCard(r));
}

function agreeCell(a) {
  if (!a) return '—';
  const out = [];
  for (const w of ['latest', 'verify']) {
    const x = a[w];
    if (!x || !x.listed) { out.push(badge(w + ': not listed', 'neutral')); continue; }
    const ok = x.size_ok && x.sha512_ok;
    out.push(badge(w + (ok ? ': matches' : ': ' + (x.size_ok ? '' : 'size ' + fmtNum(x.size)) + (x.sha512_ok ? '' : ' sha512 ' + short(x.sha512, 8))), ok ? 'ok' : 'error', { title: 'Announced ' + fmtNum(x.size) + ' bytes, sha512 ' + (x.sha512 || '?') }));
  }
  return el('span', { class: 'cda-tags' }, out);
}

function servedCard(r) {
  const m = r.manifests || {}, sv = (r.dll || {}).served || {}, p = r.pkg || {};
  const rows = [];
  for (const w of ['latest', 'verify']) {
    const x = m[w] || {};
    rows.push({ name: w + '.yml', what: x.ok ? 'v' + (x.version || '?') + ' · ' + fmtNum(x.files) + ' entries' : 'unreachable', size: x.bytes, when: x.last_modified,
      extra: x.critical ? badge('critical: ' + x.critical.join(', '), 'info') : badge('no critical list (launcher defaults: pkg038.pkg, game_.exe)', 'neutral'),
      top: (x.top || []).map(t => t[0] + ' ' + t[1]).join(' · ') });
  }
  rows.push({ name: sv.name || 'version.dll', what: sv.eden_version ? 'EDEN ' + sv.eden_version + (sv.build ? ' · ' + sv.build : '') : 'not read', size: sv.size, when: sv.last_modified, extra: agreeCell(sv.manifests), top: sv.sha512 ? 'sha512 ' + short(sv.sha512, 16) : '' });
  rows.push({ name: 'pkg/pkg.idx', what: p.ok ? fmtNum(p.entries) + ' entries · ' + fmtNum(p.parts_referenced) + ' parts (max pkg' + String(p.max_part).padStart(3, '0') + ')' : (p.error || 'not read'), size: p.size, when: p.last_modified, extra: agreeCell(p.manifests), top: p.duplicate_count ? fmtNum(p.duplicate_count) + ' duplicate path(s)' : 'no duplicate path' });
  const table = dataTable({ rows, columns: [
    { key: 'name', label: 'Object', render: x => el('b', { class: 'cda-obj' }, x.name) },
    { key: 'what', label: 'Content', render: x => el('div', {}, x.what, x.top ? el('div', { class: 'cda-dim cda-small' }, x.top) : null) },
    { key: 'size', label: 'Size', align: 'right', render: x => x.size != null ? fmtBytes(x.size) : '—' },
    { key: 'when', label: 'Last modified', render: x => x.when ? el('span', { title: x.when }, ago(x.when)) : '—' },
    { key: 'extra', label: 'Manifests', render: x => x.extra },
  ] });
  const g = r.guard || {};
  const gl = (g.checks || []).map(c => el('li', { class: 'cda-chk ' + c.level }, badge(c.level === 'fail' ? 'FAIL' : 'WARN', c.level === 'fail' ? 'error' : 'warn'), ' ', c.title, c.detail ? el('div', { class: 'cda-dim cda-small' }, c.detail) : null));
  const pr = r.probe;
  const probe = pr ? el('div', { class: 'cda-probe' }, el('b', {}, 'Probe: '), fmtNum(pr.checked) + ' object(s) checked, ', pr.bad_count ? badge(pr.bad_count + ' do not match the manifest', 'error') : badge('all sizes match', 'ok'),
    pr.bad_count ? el('ul', { class: 'cda-list' }, pr.bad.map(x => el('li', { class: 'cda-mono' }, x.path + ' — ' + (x.status === 200 ? 'served ' + fmtNum(x.size) + ' B, announced ' + fmtNum(x.announced) + ' B' : 'HTTP ' + x.status)))) : null) : null;
  return card({ title: 'What the CDN serves', icon: 'network', body: [table,
    el('div', { class: 'cda-sub' }, el('b', {}, 'Manifest guard: '), g.message || '—'), gl.length ? el('ul', { class: 'cda-list' }, gl) : null, probe] });
}

function dllCard(r) {
  const d = r.dll || {}, sv = d.served || {}, ex = d.expected || {}, g = r.git || {};
  const rows = [
    ['EDEN version', sv.eden_version, ex.eden_version],
    ['version.h', '', ex.version_h],
    ['Build', sv.build, ex.build],
    ['Size', sv.size != null ? fmtNum(sv.size) + ' B' : '', ex.size != null ? fmtNum(ex.size) + ' B' : ''],
    ['sha512', short(sv.sha512, 16), short(ex.sha512, 16)],
    ['git blob', short(sv.git_blob, 12), short(ex.git_blob, 12)],
    ['Embeds UI boot files', sv.serves_ui == null ? '?' : (sv.serves_ui ? 'yes' : 'no'), ex.serves_ui == null ? '?' : (ex.serves_ui ? 'yes' : 'no')],
  ].map(x => ({ k: x[0], a: x[1], b: x[2] }));
  const table = dataTable({ rows, columns: [
    { key: 'k', label: '' },
    { key: 'a', label: 'Served by the CDN', render: x => el('span', { class: 'cda-mono' }, x.a || '—') },
    { key: 'b', label: 'Branch ' + (g.branch || '?') + (g.commit ? ' @' + g.commit.slice(0, 8) : ''), render: x => el('span', { class: 'cda-mono' }, x.b || '—') },
  ] });
  const notes = (d.notes || []).map(n => el('li', {}, n));
  const gnote = g.ok ? el('div', { class: 'cda-dim cda-small' }, 'Read via ' + (g.mode === 'github' ? 'the GitHub API' : 'the local clone') + (g.date ? ' · last commit ' + ago(g.date) : '') + (g.message ? ' · ' + g.message : ''))
    : el('div', { class: 'cda-err' }, 'Branch unavailable: ' + (g.error || '?'));
  return card({ title: 'Client DLL (version.dll)' + (d.legacy_served ? ' · old d3d9.dll still served' : ''), icon: 'chip', actions: tag(d.state === 'ok' ? 'ok' : (d.state === 'differs' ? 'differs' : 'unknown'), d.state === 'ok' ? 'The CDN serves the exact binary committed on the branch' : 'The CDN does not serve the binary committed on the branch'),
    body: [table, gnote, notes.length ? el('ul', { class: 'cda-list cda-warnlist' }, notes) : null] });
}

function assetRows(f) {
  return dataTable({ rows: f.assets || [], empty: 'No client asset declared', columns: [
    { key: 'kind', label: 'Kind', render: a => el('span', { class: 'cda-kind' }, a.kind) },
    { key: 'rel', label: 'File', render: a => el('span', { class: 'cda-mono', title: a.src }, a.rel + (a.id ? ' #' + a.id : '')) },
    { key: 'pkg', label: 'CDN pkg', render: a => cell(a.pkg) },
    { key: 'unpacked', label: 'Unpacked', render: a => cell(a.unpacked) },
    { key: 'loose', label: 'CDN loose', render: a => looseCell(a.loose) },
    { key: 'verdict', label: 'Verdict', render: a => el('span', {}, tag(a.verdict, a.embedded ? 'Served from the DLL (pkgfs fallback, authority ' + a.embedded.auth + ')' : ''), a.fix ? el('div', { class: 'cda-dim cda-small' }, a.fix) : null) },
  ] });
}

function cell(c) {
  if (!c) return '—';
  const t = c.state === 'n/a' ? badge('n/a', 'neutral', { title: c.note || '' }) : tag(c.state, c.note || '');
  return el('span', {}, t, c.note && c.state !== 'n/a' ? el('div', { class: 'cda-dim cda-small' }, c.note) : null,
    c.missing && c.missing.length ? el('div', { class: 'cda-dim cda-small cda-mono' }, c.missing.join(', ')) : null);
}

function looseCell(c) {
  if (!c) return '—';
  const map = { absent: ['not on CDN', 'neutral'], 'bucket-only': ['in bucket, no manifest', 'warn'], 'listed-ok': ['listed, matches', 'ok'], 'listed-stale': ['listed, STALE', 'error'], 'listed-missing': ['listed, 404', 'error'], 'n/a': ['n/a', 'neutral'], error: ['error', 'error'] };
  const x = map[c.state] || [c.state, 'neutral'];
  return badge(x[0], x[1], { title: c.note || '' });
}

function featuresCard(r) {
  const feats = (r.features || []).filter(f => S.filter === 'all' || f.verdict !== 'ok');
  const chips = el('div', { class: 'cda-chips' },
    ['problems', 'all'].map(k => { const b = el('button', { class: 'cda-chip' + (S.filter === k ? ' on' : ''), type: 'button' }, k === 'all' ? 'All (' + (r.features || []).length + ')' : 'Problems only'); b.onclick = () => { S.filter = k; renderBody(); }; return b; }));
  const t = el('table', { class: 'cda-ft' });
  t.appendChild(el('thead', {}, el('tr', {}, ['', 'Feature', 'Stage', 'DLL served / expected', 'Assets', 'Verdict'].map(h => el('th', {}, h)))));
  const tb = el('tbody');
  for (const f of feats) {
    const c = f.counts || {};
    const openNow = S.open.has(f.name);
    const tr = el('tr', { class: 'cda-frow ' + (f.verdict || '') },
      el('td', { class: 'cda-caret' }, openNow ? '▾' : '▸'),
      el('td', {}, el('b', {}, f.name), f.note ? el('div', { class: 'cda-dim cda-small' }, f.note) : null),
      el('td', {}, badge(f.status || '?', f.status === 'promoted' || f.status === 'validated' ? 'ok' : 'neutral', { title: f.validated_at ? 'validated ' + f.validated_at + ' by ' + (f.validated_by || '?') : '' })),
      el('td', {}, el('span', { class: 'cda-mono' }, (f.dll && f.dll.served != null ? (f.dll.served || 'present') : '—') + ' / ' + ((f.dll && f.dll.expected) || '—')), ' ', tag(f.dll && f.dll.state, f.in_registry === false ? 'Not a DLL feature on this branch' : '')),
      el('td', { class: 'cda-counts' }, [['ok', 'ok'], ['embedded', 'info'], ['missing', 'error'], ['stale', 'warn'], ['unknown', 'neutral']].filter(x => c[x[0]]).map(x => badge(c[x[0]] + ' ' + x[0], x[1]))),
      el('td', {}, tag(f.verdict)));
    tr.onclick = () => { if (S.open.has(f.name)) S.open.delete(f.name); else S.open.add(f.name); renderBody(); };
    tb.appendChild(tr);
    if (openNow) tb.appendChild(el('tr', { class: 'cda-fdet' }, el('td', { colspan: '6' }, assetRows(f))));
  }
  t.appendChild(tb);
  return card({ title: 'Client features', icon: 'feature', subtitle: r.features_source || '', actions: chips,
    body: feats.length ? t : emptyState({ title: S.filter === 'all' ? 'No client feature for this environment' : 'Every client feature is served correctly', icon: 'success' }) });
}

function missingText(r) {
  const lines = ['CDN audit ' + String(r.env).toUpperCase() + ' — ' + r.base + ' — ' + (r.finished || '')];
  const d = r.dll || {};
  if (d.state === 'differs') lines.push('client DLL: served ' + ((d.served || {}).eden_version || '?') + ', branch ' + ((d.expected || {}).branch || '?') + ' has ' + ((d.expected || {}).eden_version || '?'));
  for (const n of d.notes || []) lines.push('  ! ' + n);
  for (const f of r.features || []) if (f.dll && (f.dll.state === 'absent' || f.dll.state === 'behind')) lines.push('DLL ' + f.name + ': ' + f.dll.state + ' (served ' + (f.dll.served || '-') + ', expected ' + (f.dll.expected || '-') + ')');
  for (const x of r.missing_list || []) lines.push(x.verdict.toUpperCase() + '  ' + x.feature + '  ' + x.rel + (x.id ? '#' + x.id : '') + '  [pkg ' + x.pkg + ', unpacked ' + x.unpacked + ', loose ' + x.loose + ']');
  for (const p of ((r.probe || {}).bad || [])) lines.push('PROBE ' + p.path + ': ' + (p.status === 200 ? 'served ' + p.size + ' B, announced ' + p.announced + ' B' : 'HTTP ' + p.status));
  return lines.join('\n');
}

function missingCard(r) {
  const list = r.missing_list || [];
  const copy = btn({ label: 'Copy as text', icon: 'document', variant: 'ghost', class: 'xs', onClick: async () => {
    try { await navigator.clipboard.writeText(missingText(r)); toast('Copied', 'ok'); } catch (e) { toast('Clipboard unavailable', 'warn'); }
  } });
  const byFeat = {};
  for (const x of list) (byFeat[x.feature] = byFeat[x.feature] || []).push(x);
  const body = list.length ? el('div', { class: 'cda-miss' }, Object.keys(byFeat).sort().map(k => el('div', { class: 'cda-miss-f' },
    el('b', {}, k + ' (' + byFeat[k].length + ')'),
    el('ul', { class: 'cda-list' }, byFeat[k].map(x => el('li', {}, tag(x.verdict), ' ', el('span', { class: 'cda-mono' }, x.rel + (x.id ? ' #' + x.id : '')), el('span', { class: 'cda-dim cda-small' }, ' — ' + (x.fix || '')))))))) :
    emptyState({ title: 'No feature asset is missing on the CDN', icon: 'success' });
  return card({ title: 'Missing on the CDN', icon: 'warning', subtitle: list.length + ' asset(s)', actions: copy, body });
}

function renderSa() {
  const box = $('#cda-sa');
  if (!box) return;
  clear(box);
  const H = S.host;
  if (!H || !H.can('client.publish')) return;
  const er = envRow(S.env);
  const pk = el('input', { id: 'cda-pkgdir', type: 'text', value: (S.plan && S.plan.pkg_dir) || er.packed_pkg || '', placeholder: 'local folder holding pkg.idx + the part(s) your repack wrote', title: 'Only needed when feature assets are missing from the served pkg' });
  const cDll = el('input', { type: 'checkbox', id: 'cda-inc-dll', checked: true });
  const cPkg = el('input', { type: 'checkbox', id: 'cda-inc-pkg', checked: true });
  const prodOnly = S.ctx.active !== 'prod' || S.env !== 'prod';
  const head = el('div', { class: 'cda-sa-lead' },
    el('div', {}, 'Builds the exact list of bytes to upload for the promoted client features (prod DLL and repacked pkg parts), patches latest.yml and verify.yml by replacing only the touched entries, bumps the manifest version so every launcher re-checks, and runs the manifest guard. ', el('b', {}, 'The dry run uploads nothing.')),
    prodOnly ? el('div', { class: 'cda-warn' }, icon('lock', 24), 'Publishing is only possible from the PROD environment, on a plan built for PROD. Here the dry run is informative.') : null);
  const ctl = el('div', { class: 'cda-opts' },
    el('label', { class: 'cda-ctl' }, cDll, 'version.dll'),
    el('label', { class: 'cda-ctl' }, cPkg, 'pkg assets'),
    el('label', { class: 'cda-ctl cda-grow' }, 'Local pkg', pk),
    btn({ label: 'Dry run', icon: 'preview', busyLabel: 'Building the plan…', disabled: !S.res, title: S.res ? '' : 'Inspect the CDN first', onClick: () => buildPlan() }));
  const out = el('div', { id: 'cda-plan' });
  const probl = [...new Set(((S.res || {}).missing_list || []).map(x => x.feature))].sort();
  const pick = probl.length ? el('div', { class: 'cda-opts cda-pick', id: 'cda-feats' }, el('span', { class: 'cda-dim' }, 'Features with missing pkg assets:'),
    probl.map(n => el('label', { class: 'cda-ctl' }, el('input', { type: 'checkbox', value: n, checked: true }), n))) : null;
  box.appendChild(card({ title: 'Deploy what is missing (SA)', icon: 'deploy_to_server', class: 'cda-sa', body: [head, ctl, pick, out] }));
  renderPlan();
}

async function buildPlan() {
  const boxes = [...document.querySelectorAll('#cda-feats input[type=checkbox]')];
  const chosen = boxes.filter(b => b.checked).map(b => b.value);
  const body = { env: S.env, pkg_dir: (($('#cda-pkgdir') || {}).value || '').trim() || null, dll: !!($('#cda-inc-dll') || {}).checked, pkg: !!($('#cda-inc-pkg') || {}).checked,
    features: boxes.length && chosen.length < boxes.length ? chosen : null };
  if (body.pkg && boxes.length && !chosen.length) body.pkg = false;
  try { S.plan = await api.post(ROOT + '/plan', body); }
  catch (e) { toast(errMessage(e), 'error'); return; }
  renderPlan();
}

function renderPlan() {
  const box = $('#cda-plan');
  if (!box) return;
  clear(box);
  const p = S.plan;
  if (!p) return;
  const items = dataTable({ rows: p.items || [], empty: 'Nothing would be uploaded', columns: [
    { key: 'key', label: 'CDN key', render: x => el('b', { class: 'cda-mono' }, x.key) },
    { key: 'size', label: 'Size', align: 'right', render: x => fmtBytes(x.size) },
    { key: 'sha512', label: 'sha512', render: x => el('span', { class: 'cda-mono' }, short(x.sha512, 16)) },
    { key: 'reason', label: 'Why', render: x => x.reason },
    { key: 'path', label: 'Source', render: x => el('span', { class: 'cda-mono cda-small' }, x.path) },
  ] });
  const man = p.manifests || {};
  const manRows = Object.keys(man).map(k => ({ k, ...man[k] }));
  const mt = manRows.length ? dataTable({ rows: manRows, columns: [
    { key: 'k', label: 'Manifest', render: x => el('b', {}, x.k + '.yml') },
    { key: 'touched', label: 'Entries patched', render: x => (x.touched || []).join(', ') || '—' },
    { key: 'added', label: 'Entries added', render: x => (x.added || []).join(', ') || '—' },
    { key: 'lines_changed', label: 'Lines changed', align: 'right' },
  ] }) : null;
  const checks = el('ul', { class: 'cda-list' }, (p.checks || []).map(c => el('li', { class: 'cda-chk' }, tag(c.ok ? 'ok' : 'missing'), ' ', c.title, c.detail ? el('span', { class: 'cda-dim cda-small' }, ' — ' + c.detail) : null)));
  const canPub = p.ok && S.ctx.active === 'prod' && p.env === 'prod';
  append(box, [
    el('div', { class: 'cda-plan-h' }, el('b', {}, 'Plan ' + p.id), ' · ', p.env.toUpperCase(), ' · manifest ', el('b', {}, (p.version_from || '?') + ' → ' + (p.version_to || '?')), ' · built ' + p.created,
      p.ok ? badge('ready', 'ok') : badge(p.items && p.items.length ? 'blocked' : 'nothing to publish', p.items && p.items.length ? 'error' : 'neutral')),
    (p.blocked || []).length ? el('div', { class: 'cda-err' }, el('b', {}, 'Blocked: '), el('ul', { class: 'cda-list' }, p.blocked.map(x => el('li', {}, x)))) : null,
    items, mt,
    (p.repairs || []).length ? el('div', { class: 'cda-sub' }, el('b', {}, 'Manifest repairs: '), p.repairs.join('; ')) : null,
    p.guard_after ? el('div', { class: 'cda-sub' }, el('b', {}, 'Guard after patch: '), p.guard_after) : null,
    el('details', { class: 'cda-det' }, el('summary', {}, 'Checks (' + (p.checks || []).length + ')'), checks),
    el('div', { class: 'cda-order cda-dim cda-small' }, 'Order on publish: re-read the CDN manifests (abort if anyone published since the plan) → back up the served manifests → upload the bytes → download each one back and compare its sha512 → upload verify.yml then latest.yml → read both back.'),
    el('div', { class: 'cda-pub' }, btn({ label: 'Publish to the CDN', icon: 'deploy_to_server', variant: 'danger', disabled: !canPub, title: canPub ? '' : 'Needs a ready plan, built for PROD, with PROD active', busyLabel: 'Publishing…', onClick: () => doPublish(p) })),
    el('div', { id: 'cda-pub-steps' })]);
}

async function doPublish(p) {
  const ok = await uiConfirm('This uploads ' + (p.items || []).length + ' file(s) to ' + p.base + ' and publishes manifest ' + p.version_to + ' to every player. Another developer also publishes on this CDN: the plan is refused if the manifests changed since it was built.', 'Publish to the production CDN', 'Continue');
  if (!ok) return;
  const typed = await uiPrompt('Type exactly: ' + p.confirm, 'Confirm the publication', '');
  if (typed == null) return;
  if (typed.trim() !== p.confirm) { toast('Confirmation text does not match — nothing was published', 'warn'); return; }
  try { await api.post(ROOT + '/publish', { plan_id: p.id, confirm: typed.trim() }); }
  catch (e) { toast(errMessage(e), 'error'); return; }
  pollPublish();
}

function pollPublish() {
  clearInterval(S.pubTimer);
  const tick = async () => {
    if (!alive()) { clearInterval(S.pubTimer); return; }
    let j;
    try { j = await api.get(ROOT + '/publish/status'); } catch (e) { return; }
    const box = $('#cda-pub-steps');
    if (box) {
      clear(box);
      box.appendChild(el('ul', { class: 'cda-list' }, (j.steps || []).map(s => el('li', {}, tag(s.status === 'ok' ? 'ok' : (s.status === 'error' ? 'error' : 'unknown')), ' ', el('b', {}, s.name), ' ', el('span', { class: 'cda-dim cda-small' }, (s.at || '') + ' ' + (s.detail || ''))))));
      if (j.error) box.appendChild(el('div', { class: 'cda-err' }, j.error));
    }
    if (!j.running) {
      clearInterval(S.pubTimer);
      if (j.finished) toast(j.error ? 'Publication stopped: ' + j.error : 'Published — inspect again to confirm', j.error ? 'error' : 'ok', { sticky: !!j.error });
    }
  };
  tick();
  S.pubTimer = setInterval(tick, 1500);
}
