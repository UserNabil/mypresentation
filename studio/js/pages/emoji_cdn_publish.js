import { el, clear, append } from '../core/dom.js';
import { icon, btn, badge, emptyState, errorState } from '../components.js';
import { fmtBytes, fmtNum } from '../core/format.js';
import { toast } from '../ui/toast.js';
import { HANDLED } from '../core/net.js';
import { uiConfirm } from '../ui/dialogs.js';
import { ES, ROOT, call, errText, postForm, previewPair, kwText, canPublish, blockText, pubState, signingText, refreshSigning } from './emoji_cdn_view.js';

const MODE = {
  incremental: ['existing pages kept', 'ok', 'Unchanged pages are reused byte for byte: players only download the new or grown page.'],
  repack: ['all pages rebuilt', 'warn', 'Every page is re-rendered compactly: players download all of them again.'],
  'auto-repack': ['all pages rebuilt (no room left)', 'warn', 'Keeping the existing pages would exceed 4 pages or the texture budget, so everything was repacked.'],
  rollback: ['older version', 'info', 'The pages of that version are still on the CDN (pages are never deleted).'],
};

function pct(a, b) { return b ? Math.round(a * 1000 / b) / 10 : 0; }

function stateCard() {
  const ps = pubState(), d = ES.model.draft;
  const row = (ok, label, hint) => el('div', { class: 'emc-st-row' }, icon(ok ? 'check_green' : 'warning', 20), el('b', {}, label), el('span', { class: 'cda-dim cda-small' }, hint));
  const box = el('div', { class: 'emc-state ' + (ps.can ? 'ok' : 'warn') },
    el('div', { class: 'emc-st-head' }, el('b', {}, ps.can ? 'This PC can publish to the players.' : 'This PC cannot publish yet: the reasons are below. Meanwhile prepare the draft here and export it for the admin.')),
    row(ps.signing, 'Catalog signing key', signingText(ps)),
    row(ps.creds, 'CDN upload credentials', ps.creds ? (ps.creds_source === 'granted' ? "R2 token '" + ps.creds_token + "' granted to your account by the back-office (emoji/ only)" : 'found on this PC') : (ps.creds_reason || 'not on this PC')),
    el('div', { class: 'emc-actions' },
      (ps.signing && ps.creds) || ps.v !== 2 ? null : btn({ label: 'Retry', icon: 'refresh', variant: 'ghost', busyLabel: 'Asking the back-office…', title: 'Ask the back-office again for the catalog key and the R2 token granted to your tool account', onClick: retrySigning }),
      d.empty ? null : btn({ label: 'Export draft for the admin', icon: 'export', variant: ps.can ? 'ghost' : 'primary', busyLabel: 'Packing…', title: 'Save the draft (new emojis, new images, edits, sounds) as a .zip to send to the admin', onClick: exportDraft }),
      btn({ label: 'Import a draft', icon: 'import', variant: 'ghost', title: 'Load a .zip exported from this page on another PC, then preview and publish it', onClick: importDraft }),
      el('span', { class: 'cda-dim cda-small' }, ps.can ? 'Import a .zip sent by a dev, preview it, publish it.' : (d.empty ? 'Add emojis or sounds first, then export the draft.' : 'Send the .zip to the admin (Discord): the admin imports it, checks the preview and publishes.'))));
  return box;
}

async function retrySigning() {
  await refreshSigning(true);
  if (ES.renderHead) ES.renderHead();
  ES.render();
  const ps = pubState();
  toast(ps.signing ? 'Catalog signing key received: ' + signingText(ps) : signingText(ps), ps.signing ? 'ok' : 'warn', 8000);
}

async function exportDraft() {
  let r;
  try { r = await fetch(ROOT + '/draft/export', { headers: { [HANDLED]: '1' } }); } catch (e) { toast('The tool did not answer. Is it still running?', 'error', 6000); return; }
  if (!r.ok) {
    let msg = 'Export failed (HTTP ' + r.status + ')';
    try { const j = await r.json(); if (j && typeof j.detail === 'string') msg = errText({ detail: j.detail }); } catch (e) { }
    toast(msg, 'error', 7000);
    return;
  }
  const blob = await r.blob();
  const m = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '');
  const name = m ? m[1] : 'chat_emoji_draft.zip';
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`${name} saved in your Downloads folder. Send it to the admin.`, 'ok', 6000);
}

function importDraft() {
  const input = el('input', { type: 'file', accept: '.zip', style: { display: 'none' } });
  input.onchange = async () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    let replace = false;
    if (!ES.model.draft.empty) {
      if (!(await uiConfirm('Your own draft is not empty. Importing replaces it entirely (your staged emojis, edits and sounds are dropped).', 'Import a draft', 'Replace my draft'))) return;
      replace = true;
    }
    const fd = new FormData();
    fd.append('file', f, f.name);
    fd.append('replace', replace ? '1' : '0');
    try {
      const r = await postForm(ROOT + '/draft/import', fd);
      ES.model = r.model; ES.report = null; ES.dry = null; ES.result = null;
      toast(`Draft imported${r.by ? ' from ' + r.by : ''}${r.base_version != null ? ' (made on live v' + r.base_version + ')' : ''}. Preview it before publishing.`, 'ok', 5000);
    } catch (e) { toast(errText(e), 'error', 8000); return; }
    ES.renderTabs(); ES.render();
  };
  document.body.appendChild(input);
  input.click();
}

export function renderPublish(b) {
  const d = ES.model.draft, lv = ES.model.live;
  b.appendChild(stateCard());
  const parts = [d.staged ? `${d.staged} new` : '', d.replaced ? `${d.replaced} new image${d.replaced > 1 ? 's' : ''}` : '', d.edits ? `${d.edits} edited` : '', d.removed ? `${d.removed} to remove` : '', d.categories ? 'categories changed' : '', d.sounds ? 'sounds changed' : ''].filter(Boolean);
  const rp = el('input', { type: 'checkbox', checked: ES.repack ? true : null });
  rp.onchange = () => { ES.repack = rp.checked; };
  b.appendChild(el('div', { class: 'emc-pubhead' },
    el('div', {}, el('b', {}, 'Draft: '), parts.length ? parts.join(', ') : 'no change', el('span', { class: 'cda-dim' }, ` · on top of live v${lv.version != null ? lv.version : '—'}`)),
    el('label', { class: 'cda-ctl', title: 'Rebuild every page compactly (after many removals). Players then download all the pages again.' }, rp, 'Repack all pages'),
    btn({ label: 'Preview changes', icon: 'preview', busyLabel: 'Building the catalog…', onClick: build }),
    d.empty ? null : btn({ label: 'Discard draft', icon: 'delete', variant: 'ghost', onClick: discard })));
  if (ES.result) b.appendChild(resultBox(ES.result));
  if (ES.report) b.appendChild(renderReport(ES.report));
  else if (!ES.result) b.appendChild(emptyState({ title: 'No preview yet', hint: 'Preview builds the next catalog and its pages locally, validates them with the client rules and shows the diff. Nothing is uploaded.', icon: 'preview' }));
}

async function build() {
  try {
    ES.report = await call.post('/build', { repack: ES.repack });
    ES.dry = null; ES.result = null;
  } catch (e) { toast(errText(e), 'error', 7000); return; }
  ES.render();
}

async function discard() {
  if (!(await uiConfirm('Discard every pending change (staged emojis, edits, removals, categories, sounds)?', 'Discard draft', 'Discard'))) return;
  try { ES.model = await call.post('/draft/reset', { what: 'all' }); ES.report = null; ES.renderTabs(); ES.render(); } catch (e) { toast(errText(e), 'error'); }
}

function kpi(v, label, title) { return el('div', { class: 'cda-kpi', title: title || null }, el('b', {}, v), el('span', {}, label)); }

function mini(x, extra) {
  return el('div', { class: 'emc-mini' }, previewPair(x.img), el('div', { class: 'emc-info' }, el('div', { class: 'emc-code' }, `:${x.code}:`), el('div', { class: 'emc-name' }, x.name || ''), extra || null));
}

function val(f, v) {
  if (v == null) return '—';
  if (f === 'keywords') return kwText(v) || '(none)';
  return String(v);
}

function section(title, n, body) {
  if (!n) return null;
  return el('details', { class: 'emc-sec', open: n <= 60 ? true : null }, el('summary', {}, `${title} (${n})`), body);
}

function renderReport(r) {
  const df = r.diff, imp = r.impact, m = MODE[r.mode] || MODE.incremental;
  const box = el('div', { class: 'emc-report' });
  append(box, [el('div', { class: 'emc-rhead' },
    el('h3', {}, `Preview of v${r.version}`), badge(r.kind === 'rollback' ? `rollback to v${r.rollback_of}` : 'draft', r.kind === 'rollback' ? 'info' : 'neutral'),
    badge(m[0], m[1], { title: m[2] }), r.changed ? null : badge('identical to the live catalog', 'neutral'),
    el('span', { class: 'cda-dim cda-small' }, `replaces v${r.base_version != null ? r.base_version : '—'}`))]);
  if (r.errors.length) box.appendChild(el('div', { class: 'cda-err' }, el('b', {}, `${r.errors.length} error${r.errors.length > 1 ? 's' : ''}: the client would refuse this catalog`), el('ul', {}, r.errors.slice(0, 40).map(e => el('li', {}, e)))));
  if (r.warnings.length) box.appendChild(el('details', { class: 'emc-warns' }, el('summary', {}, `${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''}`), el('ul', {}, r.warnings.slice(0, 200).map(w => el('li', {}, w)))));
  const delta = `+${df.added.length} −${df.removed.length} ~${df.modified.length}`;
  box.appendChild(el('div', { class: 'cda-kpis' },
    kpi(fmtNum(r.summary.emojis), `emojis (${delta})`),
    kpi(`${imp.pages} / ${imp.max_pages}`, 'pages', 'Pages of the new catalog (client limit 4)'),
    kpi(pct(imp.pixels, imp.max_pixels) + ' %', 'texture budget', `${fmtNum(imp.pixels)} of ${fmtNum(imp.max_pixels)} pixels (4 × 2048²)`),
    kpi(fmtBytes(imp.download), 'to download per player', imp.new_pages.length ? imp.new_pages.join(', ') : 'no new page'),
    kpi(fmtBytes(r.catalog_bytes), 'catalog.json (max ' + fmtBytes(r.catalog_max) + ')')));
  box.appendChild(el('div', { class: imp.live_switch ? 'emc-ok' : 'cda-warn' }, icon(imp.live_switch ? 'check_green' : 'warning', 24),
    imp.live_switch ? 'Players in game switch to it at the next refresh (~10 min), without relogging.'
      : `During a session the old and new pages would need ${imp.session_slots} slots / ${pct(imp.session_pixels, imp.max_pixels)} % of the texture budget: players already in game get it at their next relog.`));
  box.appendChild(el('div', { class: 'cda-dim cda-small' }, MODE[r.mode] ? MODE[r.mode][2] : ''));
  const sec = [
    section('Added', df.added.length, el('div', { class: 'emc-minigrid' }, df.added.map(x => mini(x, el('div', { class: 'cda-dim cda-small' }, x.cat))))),
    section('Modified', df.modified.length, el('div', { class: 'emc-modlist' }, df.modified.map(x => el('div', { class: 'emc-mod' },
      x.image ? el('div', { class: 'emc-imgchg' }, previewPair(x.img_old), '→', previewPair(x.img)) : previewPair(x.img),
      el('div', { class: 'emc-info' }, el('div', { class: 'emc-code' }, `:${x.code}:`, x.image ? badge('image replaced', 'warn') : null),
        Object.entries(x.changes).map(([f, [a, b2]]) => el('div', { class: 'emc-chg' }, el('b', {}, f + ': '), el('s', {}, val(f, a)), ' → ', val(f, b2)))))))),
    section('Removed', df.removed.length, el('div', { class: 'emc-minigrid' }, df.removed.map(x => mini(x, el('div', { class: 'cda-dim cda-small' }, x.cat))))),
  ].filter(Boolean);
  const cd = df.categories, cl = [];
  if (cd.added.length) cl.push('added: ' + cd.added.join(', '));
  if (cd.removed.length) cl.push('removed: ' + cd.removed.join(', '));
  for (const [id, a, b2] of cd.renamed) cl.push(`${id}: ${a} → ${b2}`);
  if (cd.reordered) cl.push('tab order changed');
  if (cl.length) sec.push(el('div', { class: 'emc-sec' }, el('b', {}, 'Categories: '), cl.join(' · ')));
  if (df.moved) sec.push(el('div', { class: 'cda-dim cda-small' }, `${df.moved} emoji${df.moved > 1 ? 's' : ''} moved inside the pages (same image, no visible change).`));
  if (df.reordered) sec.push(el('div', { class: 'cda-dim cda-small' }, 'The palette order changed.'));
  const ss = soundSection(r.sounds);
  if (ss) sec.push(ss);
  append(box, sec);
  box.appendChild(el('div', { class: 'cdc-scroll emc-pages' }, el('table', { class: 'cdc-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Page'), el('th', {}, 'Size'), el('th', {}, 'Bytes'), el('th', {}, 'Status'))),
    el('tbody', {}, r.pages.map((p, i) => el('tr', {}, el('td', { class: 'cdc-path' }, `${i} · ${p.file}`), el('td', {}, `${p.w}×${p.h}`), el('td', { class: 'cdc-num' }, fmtBytes(p.bytes)),
      el('td', {}, badge(p.status === 'new' ? 'new: uploaded' : 'kept: already on the CDN', p.status === 'new' ? 'info' : 'ok')))),
    r.dropped.map(p => el('tr', { class: 'emc-dropped' }, el('td', { class: 'cdc-path' }, p.file), el('td', {}, `${p.w}×${p.h}`), el('td', { class: 'cdc-num' }, fmtBytes(p.bytes)),
      el('td', {}, badge('no longer used, stays on the CDN', 'neutral', { title: 'Pages are never deleted: older versions in the history still reference them' }))))))));
  const can = canPublish() && r.changed && !r.errors.length;
  const why = !r.changed ? 'Nothing changed.' : r.errors.length ? 'Fix the errors first.' : !canPublish() ? (blockText() || 'This PC cannot publish: see the state above.') : '';
  box.appendChild(el('div', { class: 'emc-actions emc-pubbar' },
    btn({ label: 'Dry run', icon: 'search', variant: 'ghost', busyLabel: 'Planning…', disabled: !r.changed || r.errors.length > 0, title: 'List what would be uploaded, without uploading', onClick: () => dryRun(r) }),
    btn({ label: `Publish v${r.version}`, icon: 'deploy_to_server', busyLabel: 'Publishing…', disabled: !can, title: why, onClick: () => publish(r) }),
    why ? el('span', { class: 'cda-dim cda-small' }, why) : null));
  if (ES.dry && ES.dry.id === r.id) box.appendChild(planBox(ES.dry.res));
  return box;
}

function soundSection(sd) {
  if (!sd || !sd.changed) return null;
  const items = [];
  if (sd.first) items.push(el('li', {}, 'First sound list published: until now the Sounds panel showed the 12 sounds built into the DLL. From this version it shows this list (the 12 built-in sounds stay in it unless you hid them).'));
  for (const x of sd.added) items.push(el('li', {}, el('b', {}, 'added '), `${x.name} (sfx:${x.id})`));
  for (const x of sd.removed) items.push(el('li', {}, el('b', {}, 'removed '), `${x.name} (sfx:${x.id})`));
  for (const x of sd.modified) items.push(el('li', {}, el('b', {}, `${x.name} (sfx:${x.id}): `), Object.entries(x.changes).map(([f, [a, b2]]) => `${f} ${a === '' ? '—' : a} → ${b2 === '' ? '—' : b2}`).join(' · ')));
  const c = sd.categories;
  if (c.added.length || c.removed.length || c.renamed.length || c.reordered)
    items.push(el('li', {}, el('b', {}, 'categories: '), [c.added.length ? 'added ' + c.added.join(', ') : '', c.removed.length ? 'removed ' + c.removed.join(', ') : '',
      ...c.renamed.map(([id, a, b2]) => `${id}: ${a} → ${b2}`), c.reordered ? 'order changed' : ''].filter(Boolean).join(' · ')));
  if (sd.reordered) items.push(el('li', {}, 'Panel order changed.'));
  return el('details', { class: 'emc-sec', open: true }, el('summary', {}, `Sounds: ${sd.visible} shown of ${sd.count} listed, ${sd.files} audio file${sd.files > 1 ? 's' : ''}${sd.download ? `, ${fmtBytes(sd.download)} new to download per player` : ''}`), el('ul', {}, items));
}

function planBox(res) {
  return el('div', { class: 'emc-plan' }, el('b', {}, `Dry run: ${res.items.length} objects for v${res.version}, in this order (nothing was uploaded)`),
    el('div', { class: 'cdc-scroll' }, el('table', { class: 'cdc-table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Key'), el('th', {}, 'Bytes'), el('th', {}, 'Cache-Control'), el('th', {}, 'Note'))),
      el('tbody', {}, res.items.map(x => el('tr', {}, el('td', { class: 'cdc-path' }, x.key), el('td', { class: 'cdc-num' }, fmtBytes(x.bytes)), el('td', { class: 'cda-small' }, x.cache),
        el('td', { class: 'cda-small' }, x.role === 'page' ? 'skipped if already on R2' : x.role === 'catalog' ? 'goes live' : x.role === 'index' ? 'history index' : 'history copy')))))));
}

async function dryRun(r) {
  try { ES.dry = { id: r.id, res: await call.post('/publish', { id: r.id, dry_run: true }) }; } catch (e) { toast(errText(e), 'error', 7000); return; }
  ES.render();
}

async function publish(r, skipConfirm) {
  const df = r.diff;
  if (!skipConfirm) {
    const msg = `Publish catalog v${r.version} to every player on the Eden Reforged client?\n+${df.added.length} added, −${df.removed.length} removed, ~${df.modified.length} modified, ${fmtBytes(r.impact.download)} to download per player.\nThey get it at their next check, about every 10 minutes, without relogging.`;
    if (!(await uiConfirm(msg, 'Publish chat emojis', 'Publish'))) return;
  }
  try {
    const res = await call.post('/publish', { id: r.id });
    ES.result = res; ES.report = null; ES.dry = null; ES.history = null;
    toast(`Catalog v${res.version} published` + (res.verified === false ? ' (the public URL still serves the previous one: edge cache)' : ''), res.verified === false ? 'warn' : 'ok', 6000);
  } catch (e) { toast(errText(e), 'error', 9000); return; }
  await ES.refresh(true);
}

function resultBox(res) {
  return el('div', { class: res.verified === false ? 'cda-warn emc-result' : 'emc-ok emc-result' },
    el('div', {}, icon(res.verified === false ? 'warning' : 'check_green', 24), el('b', {}, `v${res.version} published in ${res.seconds} s. `),
      res.verified ? 'The public catalog.json is identical to the one uploaded.' : res.verified === false ? 'The public URL still answers the previous catalog (edge cache): check again in a minute.' : 'Public check skipped.',
      res.index_ok ? '' : ' The history index was not updated.', btn({ label: 'Dismiss', variant: 'mini', onClick: () => { ES.result = null; ES.render(); } })),
    el('pre', { class: 'cda-log' }, (res.log || []).join('\n')));
}

export function renderHistory(b) {
  if (!ES.history) {
    b.appendChild(emptyState({ title: 'Reading the history…', icon: 'changelog' }));
    call.get('/history').then(h => { ES.history = h; if (ES.tab === 'history') ES.render(); })
      .catch(e => { clear(b).appendChild(errorState({ error: e, title: 'History unavailable', onRetry: () => { ES.history = null; ES.render(); } })); });
    return;
  }
  const h = ES.history;
  b.appendChild(el('div', { class: 'esub cda-lead' }, 'Every publication copies its catalog to ', el('code', {}, 'emoji/history/'), ' and records it in ', el('code', {}, 'index.json'),
    '. Pages are content-addressed and never deleted, so any version below can be republished as a new version number.'));
  if (!h.live_archived) b.appendChild(el('div', { class: 'cda-warn' }, icon('info', 24), `The live v${h.live_version} is not archived yet: it is copied to the history automatically before the next publication.`));
  b.appendChild(el('div', { class: 'emc-actions' }, btn({ label: 'Reload', icon: 'refresh', variant: 'ghost', onClick: () => { ES.history = null; ES.render(); } })));
  if (!h.versions.length) { b.appendChild(emptyState({ title: 'No version recorded yet', icon: 'changelog' })); return; }
  b.appendChild(el('div', { class: 'cdc-scroll' }, el('table', { class: 'cdc-table' },
    el('thead', {}, el('tr', {}, ['Version', 'Date (UTC)', 'By', 'Emojis', 'Pages', 'Note', ''].map(t => el('th', {}, t)))),
    el('tbody', {}, h.versions.map(v => el('tr', { class: v.live ? 'emc-liverow' : '' },
      el('td', {}, el('b', {}, `v${v.version}`), v.live ? badge('LIVE', 'ok') : null),
      el('td', { class: 'cda-small' }, (v.published || v.archived || v.generated || '').replace('T', ' ').replace('Z', '')),
      el('td', { class: 'cda-small' }, v.by || '—'),
      el('td', { class: 'cdc-num' }, `${fmtNum(v.emojis)} (${fmtNum(v.animated || 0)} anim.)`),
      el('td', { class: 'cda-small' }, `${(v.pages || []).length}`),
      el('td', { class: 'cda-small' }, v.note || ''),
      el('td', {}, v.live ? null : el('div', { class: 'cdc-act' },
        btn({ label: 'Preview', icon: 'preview', variant: 'mini', busyLabel: '…', onClick: () => rollback(v.version, false) }),
        btn({ label: 'Republish', icon: 'undo', variant: 'mini', busyLabel: '…', disabled: !canPublish(), title: canPublish() ? `Publish the content of v${v.version} as a new version` : blockText(), onClick: () => rollback(v.version, true) })))))))));
}

async function rollback(version, oneClick) {
  let r;
  try { r = await call.post('/rollback', { version }); } catch (e) { toast(errText(e), 'error', 7000); return; }
  ES.report = r; ES.dry = null; ES.result = null;
  if (!oneClick || r.errors.length || !r.changed) { ES.setTab('publish'); return; }
  const df = r.diff;
  const msg = `Republish the content of v${version} as v${r.version}?\nCompared with the live catalog: +${df.added.length} added, −${df.removed.length} removed, ~${df.modified.length} modified, ${fmtBytes(r.impact.download)} to download per player.`;
  if (!(await uiConfirm(msg, 'Republish an older catalog', 'Republish'))) { ES.setTab('publish'); return; }
  await publish(r, true);
  ES.setTab('publish');
}
