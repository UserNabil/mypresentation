import { $, el, clear, append } from '../core/dom.js';
import { icon, btn, badge, emptyState, errorState } from '../components.js';
import { fmtBytes, fmtNum } from '../core/format.js';
import { toast } from '../ui/toast.js';
import { ES, ROOT, call, errText, postForm, previewPair, kwText, catSelect, fmtFrames, lim, pubState, refreshSigning } from './emoji_cdn_view.js';
import { renderGuide } from './emoji_cdn_guide.js';
import { renderAdd } from './emoji_cdn_add.js';
import { renderPublish, renderHistory } from './emoji_cdn_publish.js';
import { renderSounds } from './emoji_cdn_sounds.js';

const TABS = [
  { k: 'catalog', label: 'Catalog', hint: 'Emojis of the live CDN catalog: search, edit, remove' },
  { k: 'add', label: 'Add emojis', hint: 'Drop GIF / PNG / JPG / WEBP (MP4 / WEBM with ffmpeg) to convert them' },
  { k: 'sounds', label: 'Sounds', hint: 'Chat sound effects of the in-game Sounds panel: upload, rename, icon, category, hide, delete' },
  { k: 'publish', label: 'Publish', hint: 'Preview the next catalog, check the diff and publish it under emoji/' },
  { k: 'history', label: 'History', hint: 'Every published catalog, republish an older one in one click' },
];
const FILTERS = [['all', 'All'], ['edited', 'Edited'], ['replaced', 'New image'], ['removed', 'Marked for removal'], ['animated', 'Animated'], ['static', 'Static'], ['embedded', 'Embedded (read-only)']];
const PER_PAGE = 48;

function store(k, v) { try { localStorage.setItem('eden.emc.' + k, v); } catch (e) { } }
function recall(k) { try { return localStorage.getItem('eden.emc.' + k); } catch (e) { return null; } }

export function initEmojiCdn(host) {
  ES.host = host;
  ES.refresh = refresh;
  ES.setTab = setTab;
  ES.render = renderBody;
  ES.renderTabs = renderTabs;
  ES.renderHead = renderHead;
}

export async function openEmojiCdn() {
  const H = ES.host;
  if (!H || !H.guardPage('emoji.cdn', 'Chat Emojis')) return;
  H.edenSetView('emojicdn');
  const c = $('#content');
  if (!c) return;
  clear(c);
  c.appendChild(el('div', { id: 'emc-wrap', class: 'cda-wrap emc-wrap' }, emptyState({ title: 'Loading…', icon: 'image' })));
  try {
    ES.ctx = await call.get('/context');
  } catch (e) {
    const w = $('#emc-wrap');
    if (w) clear(w).appendChild(errorState({ error: e, title: 'Chat Emojis unavailable', onRetry: openEmojiCdn }));
    return;
  }
  const t = recall('tab');
  if (TABS.some(x => x.k === t)) ES.tab = t;
  renderShell();
  if (ES.ctx.tools && ES.ctx.tools.ok && ES.ctx.tenant_ok) await refresh();
}

async function refresh(withCtx) {
  if (withCtx) {
    try { ES.ctx = await call.get('/context?refresh=1'); renderHead(); } catch (e) { toast(errText(e), 'error'); }
  }
  try {
    ES.model = await call.get('/catalog');
  } catch (e) {
    const b = $('#emc-body');
    if (b) clear(b).appendChild(errorState({ error: e, title: 'Cannot read the catalog', onRetry: () => refresh(true) }));
    return;
  }
  renderHead();
  renderTabs();
  renderBody();
  if (ES.tab === 'publish') checkSigning();
}

function setTab(k) { ES.tab = k; store('tab', k); renderTabs(); renderBody(); if (k === 'publish') checkSigning(); }

async function checkSigning() {
  if (!(await refreshSigning(false))) return;
  renderHead();
  if (ES.tab === 'publish') renderBody();
}

function renderShell() {
  const w = $('#emc-wrap');
  if (!w) return;
  clear(w);
  append(w, [el('div', { id: 'emc-head' }), el('div', { id: 'emc-notes', class: 'cda-notes' }), el('div', { id: 'emc-guide' }), el('div', { id: 'emc-tabs', class: 'cdc-tabs' }), el('div', { id: 'emc-body' })]);
  renderHead();
  renderTabs();
  renderBody();
}

function liveLine(lv) {
  if (!lv || lv.missing) return 'No catalog published yet';
  if (lv.version == null) return lv.error || 'Live catalog unknown';
  const bytes = (lv.pages || []).reduce((a, p) => a + (p.bytes || 0), 0);
  return `Live v${lv.version} · ${fmtNum(lv.emojis)} emojis (${fmtNum(lv.animated)} animated) · ${lv.pages.length} page${lv.pages.length > 1 ? 's' : ''} (${fmtBytes(bytes)}) · ${lv.categories} categories`;
}

function renderHead() {
  const h = $('#emc-head'), n = $('#emc-notes');
  if (!h || !n) return;
  const ctx = ES.ctx || {}, lv = (ES.model && ES.model.live) || ctx.live;
  const ps = pubState();
  clear(h).appendChild(el('div', { class: 'cda-head' },
    el('h2', {}, icon('image', 24), 'Chat Emojis'),
    el('span', { class: 'cda-src' }, badge('SA only', 'info', { title: 'Reserved to the owner and Super-Admins' }),
      ctx.tools && ctx.tools.ok ? badge(ps.can ? 'This PC can publish' : 'Draft only on this PC', ps.can ? 'ok' : 'warn', { title: ps.can ? 'Catalog signing key and CDN credentials found' : ps.blocks.join(' ') }) : null),
    el('div', { class: 'cda-head-r' },
      ctx.public ? el('a', { href: ctx.public, target: '_blank', rel: 'noopener', class: 'emc-link' }, 'emoji/catalog.json') : null,
      btn({ label: 'Refresh', icon: 'refresh', variant: 'ghost', busyLabel: 'Reading the CDN…', onClick: () => refresh(true) }))));
  h.appendChild(el('div', { class: 'esub cda-lead' }, liveLine(lv) + '. Every player on the Eden Reforged client reads this catalog from the CDN about every 10 minutes: a publication reaches them without repack, new DLL or relog.'));
  clear(n);
  const note = (tone, text) => n.appendChild(el('div', { class: tone === 'err' ? 'cda-err' : 'cda-warn' }, icon(tone === 'err' ? 'error' : 'warning', 24), text));
  if (ctx.tools && !ctx.tools.ok) note('err', ctx.tools.error);
  if (ctx.tenant_ok === false) note('err', 'The chat emoji CDN belongs to Eden Reforged: this page is disabled on this tenant.');
  if (lv && lv.error) note('err', lv.error);
  if (ctx.tools && ctx.tools.ok && ctx.tenant_ok !== false && !ps.can) note('warn', 'This PC cannot publish: ' + ps.blocks.join(' ') + ' Everything else works here: add, edit, preview, then Publish tab > Export draft for the admin.');
  const d = ES.model && ES.model.draft;
  if (d && d.stale) note('warn', 'The live catalog changed since this draft was started: your changes are applied on top of the new one. Check the preview before publishing.');
  const g = $('#emc-guide');
  if (g && ctx.tools && ctx.tools.ok) clear(g).appendChild(renderGuide());
}

function draftCount() {
  const d = ES.model && ES.model.draft;
  return d ? d.edits + d.removed + d.staged + (d.replaced || 0) + (d.categories ? 1 : 0) + (d.sounds ? 1 : 0) : 0;
}

function renderTabs() {
  const t = $('#emc-tabs');
  if (!t) return;
  clear(t);
  const sub = { catalog: ES.model ? `${ES.model.emojis.length} emojis` : '', add: ES.model ? `${ES.model.staged.length} staged` : '', sounds: ES.model && ES.model.sounds ? `${ES.model.sounds.rows.filter(r => !r.hidden).length} in game${ES.model.sounds.edited ? ' · edited' : ''}` : '', publish: draftCount() ? `${draftCount()} pending change${draftCount() > 1 ? 's' : ''}` : 'nothing pending', history: 'catalogs kept on the CDN' };
  for (const x of TABS) {
    const b = el('button', { type: 'button', class: 'cdc-tab' + (x.k === ES.tab ? ' on' : ''), title: x.hint }, el('span', {}, x.label), el('small', {}, sub[x.k] || ''));
    b.onclick = () => { if (ES.tab !== x.k) setTab(x.k); };
    t.appendChild(b);
  }
}

function renderBody() {
  const b = $('#emc-body');
  if (!b) return;
  clear(b);
  if (!ES.model) { b.appendChild(emptyState({ title: ES.ctx && ES.ctx.tools && !ES.ctx.tools.ok ? 'Tools missing' : 'Loading…', icon: 'image' })); return; }
  if (ES.tab === 'add') renderAdd(b);
  else if (ES.tab === 'sounds') renderSounds(b);
  else if (ES.tab === 'publish') renderPublish(b);
  else if (ES.tab === 'history') renderHistory(b);
  else renderCatalog(b);
}

function matches(r, q) {
  if (!q) return true;
  const cat = (ES.model.categories.find(c => c.id === r.cat) || {}).name || '';
  return [r.code, r.name, r.cat, cat, ...(r.keywords || [])].some(s => String(s || '').toLowerCase().includes(q));
}

function visible() {
  const q = ES.q.trim().toLowerCase().replace(/^:+|:+$/g, '');
  return ES.model.emojis.filter(r => (!ES.cat || r.cat === ES.cat) && matches(r, q) && (
    ES.filter === 'all' || (ES.filter === 'edited' && r.state === 'edited') || (ES.filter === 'removed' && r.state === 'removed') || (ES.filter === 'replaced' && r.state === 'replaced')
    || (ES.filter === 'animated' && r.frames > 1) || (ES.filter === 'static' && r.frames <= 1) || (ES.filter === 'embedded' && r.readonly)));
}

function renderCatalog(b) {
  const m = ES.model;
  const rows = visible();
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  ES.page = Math.min(ES.page, pages - 1);
  const q = el('input', { type: 'search', placeholder: 'Search code, name, keyword, category…', value: ES.q });
  q.oninput = () => { ES.q = q.value; ES.page = 0; const pos = q.selectionStart; renderBody(); const nq = $('#emc-body input[type=search]'); if (nq) { nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) { } } };
  const cs = el('select', {}, el('option', { value: '' }, 'All categories'), m.categories.map(c => el('option', { value: c.id, selected: c.id === ES.cat ? true : null }, `${c.name} (${c.count})`)));
  cs.onchange = () => { ES.cat = cs.value; ES.page = 0; renderBody(); };
  const fs = el('select', {}, FILTERS.map(([k, l]) => el('option', { value: k, selected: k === ES.filter ? true : null }, l)));
  fs.onchange = () => { ES.filter = fs.value; ES.page = 0; renderBody(); };
  b.appendChild(el('div', { class: 'cdc-filters emc-bar' }, q, cs, fs, el('span', { class: 'cda-dim cda-small' }, `${fmtNum(rows.length)} / ${fmtNum(m.emojis.length)}`),
    btn({ label: ES.showCats ? 'Hide categories' : 'Categories…', icon: 'new_category', variant: 'ghost', onClick: () => { ES.showCats = !ES.showCats; renderBody(); } })));
  if (ES.showCats) b.appendChild(renderCats());
  const sel = ES.sel && m.emojis.find(r => r.code === ES.sel);
  if (sel) b.appendChild(renderEditor(sel));
  if (!rows.length) { b.appendChild(emptyState({ title: 'No emoji matches', icon: 'search' })); return; }
  b.appendChild(el('div', { class: 'emc-grid' }, rows.slice(ES.page * PER_PAGE, (ES.page + 1) * PER_PAGE).map(card)));
  b.appendChild(pager(pages));
}

function stateBadges(r) {
  return [r.frames > 1 ? badge(fmtFrames(r.frames, r.fps), 'info') : null,
    r.state === 'edited' ? badge('edited', 'warn') : null, r.state === 'removed' ? badge('to remove', 'error') : null,
    r.state === 'replaced' ? badge('new image in the draft', 'warn') : null,
    r.readonly ? badge('embedded · read-only', 'neutral', { title: 'page -1: drawn from the atlas embedded in the DLL' }) : null,
    r.dll && !r.readonly ? badge('also in DLL', 'neutral', { title: 'This code also exists in the atlas embedded in the DLL (chat bubble above the character, players without cdn=1)' }) : null];
}

function card(r) {
  const cat = (ES.model.categories.find(c => c.id === r.cat) || {}).name || r.cat;
  const n = el('div', { class: `emc-card ${r.state}${ES.sel === r.code ? ' sel' : ''}`, title: `:${r.code}:` },
    previewPair(r.img),
    el('div', { class: 'emc-info' }, el('div', { class: 'emc-code' }, `:${r.code}:`), el('div', { class: 'emc-name' }, r.name || '—'),
      el('div', { class: 'emc-kw' }, `${cat} · ${kwText(r.keywords) || 'no keyword'}`), el('div', { class: 'emc-tags' }, stateBadges(r))));
  n.onclick = () => { ES.sel = ES.sel === r.code ? null : r.code; renderBody(); if (ES.sel) { const e = $('#emc-editor'); if (e) e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
  return n;
}

function pager(pages) {
  const p = el('div', { class: 'cdc-pager emc-pager' });
  if (pages <= 1) return p;
  const go = i => { ES.page = i; renderBody(); };
  const nums = new Set([0, pages - 1, ES.page - 1, ES.page, ES.page + 1, ES.page - 2, ES.page + 2].filter(i => i >= 0 && i < pages));
  p.appendChild(btn({ label: '‹', variant: 'mini', disabled: ES.page === 0, onClick: () => go(ES.page - 1) }));
  let last = -1;
  for (const i of [...nums].sort((a, b) => a - b)) {
    if (i - last > 1) p.appendChild(el('span', { class: 'cda-dim' }, '…'));
    p.appendChild(btn({ label: String(i + 1), variant: i === ES.page ? 'gold' : 'mini', onClick: () => go(i) }));
    last = i;
  }
  p.appendChild(btn({ label: '›', variant: 'mini', disabled: ES.page >= pages - 1, onClick: () => go(ES.page + 1) }));
  return p;
}

async function post(path, body, okMsg) {
  try {
    ES.model = await call.post(path, body);
    if (okMsg) toast(okMsg, 'ok', 1800);
    renderHead(); renderTabs(); renderBody();
    return true;
  } catch (e) { toast(errText(e), 'error', 6000); return false; }
}

function pickImage(code) {
  const c = ES.ctx || {};
  const accept = (c.image_ext || ['.png', '.gif', '.jpg', '.jpeg', '.webp']).concat(c.ffmpeg && c.ffmpeg.ok ? (c.video_ext || []) : []);
  const input = el('input', { type: 'file', accept: accept.join(','), style: { display: 'none' } });
  input.onchange = async () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    const fd = new FormData();
    fd.append('files', f, f.name);
    fd.append('frames', String(ES.want));
    fd.append('replace', code);
    try {
      const r = await postForm(ROOT + '/stage', fd);
      if (r.model) ES.model = r.model;
      const res = (r.results || [])[0] || {};
      if (res.error) toast(`:${code}: keeps its image. ${errText(res.error)}`, 'warn', 7000);
      else toast(`New image of :${code}: added to the draft. Preview and publish it from the Publish tab.`, 'ok', 4000);
    } catch (e) { toast(errText(e), 'error', 7000); }
    renderHead(); renderTabs(); renderBody();
  };
  document.body.appendChild(input);
  input.click();
}

function field(label, input, hint) {
  return [el('label', { class: 'emc-lbl' }, label), el('div', {}, input, hint ? el('div', { class: 'cda-dim cda-small' }, hint) : null)];
}

function renderEditor(r) {
  const L = lim(), ro = r.readonly;
  const name = el('input', { type: 'text', class: 'emc-in', value: r.name, maxlength: L.name_max || 39, disabled: ro ? true : null });
  const kw = el('input', { type: 'text', class: 'emc-in', value: kwText(r.keywords), disabled: ro ? true : null });
  const cat = catSelect(r.cat, ro);
  const o = r.orig;
  const rep = r.replaced_by ? ES.model.staged.find(s => s.id === r.replaced_by) : null;
  return el('div', { id: 'emc-editor', class: 'emc-editor' },
    el('div', { class: 'emc-big' }, previewPair(r.img), el('div', { class: 'emc-code' }, `:${r.code}:`), el('div', { class: 'cda-dim cda-small' }, fmtFrames(r.frames, r.fps)),
      el('div', { class: 'cda-dim cda-small' }, r.page >= 0 ? `page ${r.page}, cell ${r.cell}` : 'embedded atlas (page -1)')),
    el('div', {},
      el('div', { class: 'emc-form' }, field('English name', name, `Tooltip in game, ${L.name_max || 39} characters max`),
        field('Keywords', kw, `Comma separated, lowercase, ${L.kw_one || 31} characters each, ${L.kw_total || 95} in total`), field('Category', cat)),
      o ? el('div', { class: 'emc-orig cda-small' }, 'Live: ', el('b', {}, o.name), ` · ${kwText(o.keywords) || 'no keyword'} · ${o.cat}`) : null,
      ro ? el('div', { class: 'cda-warn' }, icon('lock', 24), 'Embedded emojis (page -1) are drawn by the DLL: they stay read-only here.') : null,
      !ro && r.dll ? el('div', { class: 'cda-dim cda-small' }, 'This code also exists in the atlas embedded in the DLL: a new image shows in the chat and the palette, the speech bubble above characters keeps the DLL drawing.') : null,
      rep ? el('div', { class: 'cda-warn emc-repl' }, icon('swap', 24), 'New image waiting in the draft:', previewPair(rep.img), 'it replaces the current one at the next publication.') : null,
      el('div', { class: 'emc-actions' },
        ro ? null : btn({ label: 'Save in draft', icon: 'save', onClick: () => post('/edit', { code: r.code, name: name.value, keywords: kw.value, cat: cat.value }, 'Saved in the draft') }),
        ro || rep ? null : btn({ label: 'Replace image', icon: 'swap', variant: 'ghost', title: 'Pick a new picture or GIF for this emoji: code, name and place in the palette stay the same', onClick: () => pickImage(r.code) }),
        rep ? btn({ label: 'Keep the current image', icon: 'undo', variant: 'ghost', onClick: () => post('/stage/delete', { id: rep.id }, 'New image dropped') }) : null,
        ro || rep ? null : btn({ label: r.state === 'removed' ? 'Restore' : 'Remove from CDN', icon: r.state === 'removed' ? 'undo' : 'delete', variant: r.state === 'removed' ? 'ghost' : 'danger', onClick: () => post('/remove', { code: r.code, removed: r.state !== 'removed' }, r.state === 'removed' ? 'Restored' : 'Marked for removal') }),
        r.state !== 'live' ? btn({ label: 'Revert', icon: 'undo', variant: 'ghost', onClick: () => post('/revert', { code: r.code }, 'Reverted') }) : null,
        btn({ label: 'Close', variant: 'ghost', onClick: () => { ES.sel = null; renderBody(); } }))));
}

function renderCats() {
  const L = lim(), m = ES.model;
  let rows = m.categories.map(c => ({ id: c.id, name: c.name, count: c.count, isNew: !m.live_categories.some(x => x.id === c.id) }));
  const box = el('div', { class: 'emc-cats' });
  const draw = () => {
    clear(box);
    box.appendChild(el('div', { class: 'cda-dim cda-small' }, `Tabs of the in-game palette, in this order (${L.max_categories || 8} max). A category can be deleted once it is empty.`));
    rows.forEach((r, i) => {
      const nm = el('input', { type: 'text', class: 'emc-in', value: r.name, maxlength: L.cat_name_max || 15 });
      nm.oninput = () => { r.name = nm.value; };
      box.appendChild(el('div', { class: 'emc-catrow' }, el('code', {}, r.id), nm, el('span', { class: 'cda-dim cda-small' }, `${r.count} emojis`),
        btn({ label: '↑', variant: 'mini', disabled: i === 0, onClick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); } }),
        btn({ label: '↓', variant: 'mini', disabled: i === rows.length - 1, onClick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(); } }),
        btn({ label: 'Delete', variant: 'mini', disabled: r.count > 0, title: r.count ? 'Move its emojis first' : '', onClick: () => { rows = rows.filter(x => x !== r); draw(); } })));
    });
    const id = el('input', { type: 'text', class: 'emc-in', placeholder: 'id (a-z 0-9 _)', maxlength: 15 });
    const nm = el('input', { type: 'text', class: 'emc-in', placeholder: 'Name', maxlength: L.cat_name_max || 15 });
    box.appendChild(el('div', { class: 'emc-catrow' }, id, nm, btn({ label: 'Add', icon: 'add', variant: 'mini', disabled: rows.length >= (L.max_categories || 8), onClick: () => {
      const v = id.value.trim().toLowerCase();
      if (!/^[a-z0-9_]{1,15}$/.test(v) || rows.some(x => x.id === v)) { toast('Category id: 1 to 15 characters among a-z, 0-9 and _, unique', 'warn'); return; }
      rows.push({ id: v, name: nm.value.trim() || v, count: 0, isNew: true }); draw();
    } })));
    box.appendChild(el('div', { class: 'emc-actions' },
      btn({ label: 'Save categories', icon: 'save', onClick: () => post('/categories', { categories: rows.map(r => ({ id: r.id, name: r.name })) }, 'Categories saved in the draft') }),
      m.categories_edited ? btn({ label: 'Back to the live categories', icon: 'undo', variant: 'ghost', onClick: () => post('/categories', { categories: null }, 'Live categories restored') }) : null));
  };
  draw();
  return box;
}
