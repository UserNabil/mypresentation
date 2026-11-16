import { el, clear, append } from '../core/dom.js';
import { icon, btn, badge, emptyState } from '../components.js';
import { fmtBytes } from '../core/format.js';
import { toast } from '../ui/toast.js';
import { uiConfirm } from '../ui/dialogs.js';
import { ES, ROOT, call, errText, previewPair, postForm } from './emoji_cdn_view.js';
import { decodeToWav, wavName } from './emoji_cdn_audio.js';

let PLAYER = null;
let SHOW_CATS = false;
let UPLOAD = null;
let PICK = null;
let PICK_Q = '';

function levelOn() { try { return localStorage.getItem('eden.emc.level') !== '0'; } catch (e) { return true; } }
function setLevel(v) { try { localStorage.setItem('eden.emc.level', v ? '1' : '0'); } catch (e) { } }

function S() { return ES.model.sounds; }
function L() { return S().limits || {}; }

function play(url) {
  try {
    if (PLAYER) PLAYER.pause();
    PLAYER = new Audio(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
    PLAYER.play().catch(e => toast('Cannot play: ' + (e && e.message || e), 'warn'));
  } catch (e) { toast('Cannot play: ' + (e && e.message || e), 'warn'); }
}

async function post(path, body, okMsg) {
  const a = document.activeElement, keep = a && a.dataset ? a.dataset.f : null;
  try {
    ES.model = await call.post(path, body);
    if (okMsg) toast(okMsg, 'ok', 1800);
    ES.renderTabs(); ES.render();
    if (keep) { const n = document.querySelector(`[data-f="${keep}"]`); if (n) n.focus(); }
    return true;
  } catch (e) { toast(errText(e), 'error', 6000); ES.render(); return false; }
}

async function upload(files) {
  if (!files.length) return;
  const fd = new FormData();
  const local = [];
  UPLOAD = { busy: true, results: [] };
  ES.render();
  for (const f of files) {
    try {
      const r = await decodeToWav(await f.arrayBuffer(), { level: levelOn() });
      fd.append('files', new Blob([r.wav], { type: 'audio/wav' }), wavName(f.name));
    } catch (e) { local.push({ file: f.name, error: (e && e.message) || String(e) }); }
  }
  if (!fd.has('files')) {
    UPLOAD = { busy: false, results: local };
    toast('0 sounds added to the draft', 'warn', 2500);
    ES.render();
    return;
  }
  try {
    const r = await postForm(ROOT + '/sounds/upload', fd);
    ES.model = r.model;
    UPLOAD = { busy: false, results: local.concat(r.results || []) };
    const ok = UPLOAD.results.filter(x => !x.error).length;
    toast(`${ok} sound${ok > 1 ? 's' : ''} added to the draft`, ok ? 'ok' : 'warn', 2500);
  } catch (e) {
    UPLOAD = null;
    toast(errText(e), 'error', 7000);
  }
  ES.renderTabs(); ES.render();
}

async function uploadIcon(r, file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('id', r.id);
  fd.append('file', file, file.name || 'icon.png');
  try {
    ES.model = await postForm(ROOT + '/sounds/icon', fd);
    toast(`Own icon of "${r.name}" saved in the draft (${L().icon_px || 37} px, transparent PNG)`, 'ok', 2500);
  } catch (e) { toast(errText(e), 'error', 7000); }
  ES.renderTabs(); ES.render();
}

function iconOf(r) { return r.icon_img || r.img; }

function fmtMs(ms) { return ms == null ? '' : (ms / 1000).toFixed(2) + ' s'; }

function shortLabel(n) {
  const k = L().label_show || 13;
  return n.length > k ? n.slice(0, k - 2) + '..' : n;
}

function catOptions(value) {
  const cats = S().categories;
  return [el('option', { value: '', selected: value ? null : true }, 'None ("All" tab only)'),
    ...cats.map(c => el('option', { value: c.id, selected: c.id === value ? true : null, title: 'id: ' + c.id }, c.name))];
}

function picker(r) {
  const q = PICK_Q.trim().toLowerCase().replace(/^:+|:+$/g, '');
  const list = (ES.model.emojis || []).filter(e => e.state !== 'removed' && (!q || e.code.includes(q) || (e.name || '').toLowerCase().includes(q) || (e.keywords || []).some(k => k.includes(q))));
  const search = el('input', { type: 'search', class: 'emc-in', placeholder: 'Search an emoji…', value: PICK_Q, 'data-f': 'pick:' + r.id });
  search.oninput = () => { PICK_Q = search.value; const pos = search.selectionStart; ES.render(); const n = document.querySelector(`[data-f="pick:${r.id}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } } };
  const choose = code => { PICK = null; PICK_Q = ''; post('/sounds/edit', { id: r.id, icon: code }, r.icon_img ? `Own image removed, icon of "${r.name}" set to :${code}:` : `Icon of "${r.name}" set to :${code}:`); };
  return el('div', { class: 'emc-snd-pick' },
    el('div', { class: 'emc-actions' }, el('b', {}, `Icon of "${r.name}"`), search, el('span', { class: 'cda-dim cda-small' }, `${list.length} emojis`),
      btn({ label: 'Cancel', variant: 'mini', onClick: () => { PICK = null; ES.render(); } })),
    el('div', { class: 'emc-snd-pick-grid' }, list.slice(0, 160).map(e => {
      const c = el('button', { type: 'button', class: 'emc-snd-pick-c' + (!r.icon_img && e.code === (r.icon || 'music') ? ' on' : ''), title: `:${e.code}: ${e.name || ''}` }, previewPair(e.img), el('span', {}, e.code));
      c.onclick = () => choose(e.code);
      return c;
    })),
    list.length > 160 ? el('div', { class: 'cda-dim cda-small' }, 'Type to narrow the list (160 shown).') : null);
}

function fld(label, input, hint) {
  return el('label', { class: 'emc-snd-f' }, el('span', { class: 'emc-lbl' }, label), input, hint ? el('span', { class: 'cda-dim cda-small' }, hint) : null);
}

function row(r, i, n) {
  const k = L().label_show || 13;
  const save = body => post('/sounds/edit', Object.assign({ id: r.id }, body), 'Saved in the draft');
  const nm = el('input', { type: 'text', class: 'emc-in', value: r.name, maxlength: L().name_max || 24, 'data-f': r.id + ':name' });
  nm.onchange = () => { if (nm.value !== r.name) save({ name: nm.value }); };
  const sid = el('input', { type: 'text', class: 'emc-in emc-mono', value: r.id, maxlength: 16, disabled: r.staged ? null : true, 'data-f': r.id + ':id' });
  sid.onchange = () => { const v = sid.value.trim().toLowerCase(); if (v && v !== r.id) save({ new_id: v }); };
  const cs = el('select', { class: 'emc-in', 'data-f': r.id + ':cat' }, catOptions(r.cat));
  cs.onchange = () => save({ cat: cs.value });
  const hid = el('input', { type: 'checkbox', checked: r.hidden ? true : null });
  hid.onchange = () => save({ hidden: hid.checked });
  const px = L().icon_px || 37;
  const ic = el('button', { type: 'button', class: 'emc-snd-icbtn', title: r.icon_img ? `Own image (${px} px in the panel). Click to pick an emoji instead` : 'Change the icon: pick any emoji of the catalog' },
    previewPair(iconOf(r), r.icon_img ? `Own image, ${px} px in game (shown at 32 px and x2)` : null),
    el('span', { class: 'emc-mono' }, r.icon_img ? 'own image' : `:${r.icon || 'music'}:`), el('span', { class: 'cda-small' }, 'Emoji…'));
  ic.onclick = () => { PICK = PICK === r.id ? null : r.id; PICK_Q = ''; ES.render(); };
  const file = el('input', { type: 'file', accept: (L().icon_ext || ['.png', '.jpg', '.gif', '.webp']).join(','), style: { display: 'none' } });
  file.onchange = () => { const f = file.files && file.files[0]; file.value = ''; uploadIcon(r, f); };
  const icAct = el('div', { class: 'emc-snd-icact' },
    btn({ label: r.icon_img ? 'New image' : 'Image…', icon: 'import', variant: 'mini', title: `Upload your own icon (PNG, JPG, GIF, WEBP): it is trimmed and resized to ${px}x${px} px, transparent background kept. Older game clients keep showing :${r.icon || 'music'}:`, onClick: () => file.click() }),
    r.icon_img ? btn({ label: 'Remove', variant: 'mini', title: `Back to the emoji :${r.icon || 'music'}:`, onClick: () => post('/sounds/edit', { id: r.id, icon_png: '' }, `"${r.name}" uses :${r.icon || 'music'}: again`) }) : null, file);
  ic.ondragover = e => { e.preventDefault(); ic.classList.add('over'); };
  ic.ondragleave = () => ic.classList.remove('over');
  ic.ondrop = e => { e.preventDefault(); ic.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) uploadIcon(r, f); };
  const st = r.state === 'new' ? badge('new', 'info') : r.state === 'edited' ? badge('edited', 'warn') : null;
  return el('div', { class: `emc-snd-row ${r.state}${r.hidden ? ' hidden' : ''}` },
    el('div', { class: 'emc-snd-ic' }, el('span', { class: 'emc-lbl' }, 'Icon'), ic, icAct),
    el('div', { class: 'emc-snd-main' },
      el('div', { class: 'emc-snd-grid' },
        fld('Name', nm, r.name.length > k ? `the panel shows "${shortLabel(r.name)}"` : 'shown under the icon in the panel'),
        fld('Chat token', el('div', { class: 'emc-snd-tok' }, el('span', { class: 'emc-mono' }, 'sfx:'), sid), r.staged ? 'what players send in chat, fixed once published' : 'published: players use it, it cannot change'),
        fld('Category', cs, 'tab of the Sounds panel'),
        el('label', { class: 'emc-snd-f emc-snd-hid', title: 'Hidden sounds stay in the list for later but are not in the players\' panel' }, el('span', { class: 'emc-lbl' }, 'Visibility'), el('span', { class: 'cda-ctl' }, hid, 'Hidden from players'))),
      el('div', { class: 'emc-snd-line cda-small cda-dim' },
        r.builtin ? badge('built into the DLL', 'neutral', { title: 'The audio ships in the client DLL: name, icon, category and visibility can change, not the audio. Hidden, it is left out of the published list and frees its slot' }) : null,
        st, r.hidden ? badge('hidden', 'neutral') : null, r.icon_img ? badge('own icon', 'info', { title: `Own image, older game clients show :${r.icon || 'music'}:` }) : null,
        r.ms != null ? el('span', {}, fmtMs(r.ms)) : null, r.bytes ? el('span', {}, fmtBytes(r.bytes)) : null,
        ...(r.notes || []).map(x => el('span', {}, x)))),
    el('div', { class: 'emc-snd-act' },
      btn({ label: 'Play', icon: 'sound', variant: 'mini', onClick: () => play(r.audio) }),
      btn({ label: '↑', variant: 'mini', disabled: i === 0, onClick: () => post('/sounds/move', { id: r.id, dir: -1 }) }),
      btn({ label: '↓', variant: 'mini', disabled: i === n - 1, onClick: () => post('/sounds/move', { id: r.id, dir: 1 }) }),
      r.builtin
        ? btn({ label: r.hidden ? 'Show' : 'Hide', icon: r.hidden ? 'preview' : 'delete', variant: 'mini',
            title: r.hidden ? 'Back in the panel of the players (takes one of the slots again)' : 'Built into the DLL, so it cannot be deleted: hiding it removes it from the panel of the players and frees its slot for an uploaded sound',
            onClick: () => post('/sounds/edit', { id: r.id, hidden: !r.hidden }, r.hidden ? `"${r.name}" shown again` : `"${r.name}" hidden: its slot is free`) })
        : btn({ label: 'Delete', icon: 'delete', variant: 'mini', title: 'Remove from the list',
            onClick: async () => { if (await uiConfirm(`Delete the sound "${r.name}" (sfx:${r.id})?`, 'Delete sound', 'Delete')) post('/sounds/delete', { id: r.id }, 'Deleted from the draft'); } })));
}

function cats() {
  const lim = L(), s = S();
  let rows = s.categories.map(c => ({ id: c.id, name: c.name, count: c.count }));
  const box = el('div', { class: 'emc-cats' });
  const draw = () => {
    clear(box);
    box.appendChild(el('div', { class: 'cda-dim cda-small' }, `Tabs of the in-game Sounds panel after "All", in this order (${lim.max_categories || 5} max, ${lim.cat_name_max || 15} characters). A category can be deleted once it is empty.`));
    rows.forEach((r, i) => {
      const nm = el('input', { type: 'text', class: 'emc-in', value: r.name, maxlength: lim.cat_name_max || 15 });
      nm.oninput = () => { r.name = nm.value; };
      box.appendChild(el('div', { class: 'emc-catrow' }, el('code', {}, r.id), nm, el('span', { class: 'cda-dim cda-small' }, `${r.count || 0} sounds`),
        btn({ label: '↑', variant: 'mini', disabled: i === 0, onClick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); } }),
        btn({ label: '↓', variant: 'mini', disabled: i === rows.length - 1, onClick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(); } }),
        btn({ label: 'Delete', variant: 'mini', disabled: r.count > 0, title: r.count ? 'Move its sounds first' : '', onClick: () => { rows = rows.filter(x => x !== r); draw(); } })));
    });
    const id = el('input', { type: 'text', class: 'emc-in', placeholder: 'id (a-z 0-9 _)', maxlength: 15 });
    const nm = el('input', { type: 'text', class: 'emc-in', placeholder: 'Name', maxlength: lim.cat_name_max || 15 });
    box.appendChild(el('div', { class: 'emc-catrow' }, id, nm, btn({ label: 'Add', icon: 'add', variant: 'mini', disabled: rows.length >= (lim.max_categories || 5), onClick: () => {
      const v = id.value.trim().toLowerCase();
      if (!/^[a-z0-9_]{1,15}$/.test(v) || rows.some(x => x.id === v)) { toast('Category id: 1 to 15 characters among a-z, 0-9 and _, unique', 'warn'); return; }
      rows.push({ id: v, name: nm.value.trim() || v, count: 0 }); draw();
    } })));
    box.appendChild(el('div', { class: 'emc-actions' },
      btn({ label: 'Save categories', icon: 'save', onClick: () => post('/sounds/categories', { categories: rows.map(r => ({ id: r.id, name: r.name })) }, 'Categories saved in the draft') })));
  };
  draw();
  return box;
}

function panelPreview() {
  const rows = S().rows.filter(r => !r.hidden).slice(0, 16);
  return el('div', { class: 'emc-snd-pv' },
    el('div', { class: 'emc-snd-pv-t' }, 'Sounds'),
    el('div', { class: 'emc-snd-pv-tabs' }, ['All', ...S().categories.filter(c => c.count).map(c => c.name)].slice(0, 6).map(t => el('span', {}, t))),
    el('div', { class: 'emc-snd-pv-grid' }, rows.map(r => el('div', { class: 'emc-snd-pv-cell', title: `${r.name} (sfx:${r.id})` }, previewPair(iconOf(r)), el('div', {}, shortLabel(r.name))))),
    el('div', { class: 'cda-dim cda-small' }, 'In-game panel, page 1 (16 per page). Tooltip = full name.'));
}

export function renderSounds(b) {
  const s = S(), lim = L();
  const visible = s.rows.filter(r => !r.hidden).length;
  const input = el('input', { type: 'file', multiple: true, accept: (lim.ext || ['.wav']).join(','), style: { display: 'none' } });
  input.onchange = () => { const f = [...input.files]; input.value = ''; upload(f); };
  const drop = el('div', { class: 'emc-drop' }, icon('import', 48),
    el('div', { class: 'emc-drop-t' }, 'Drop WAV, MP3, OGG, FLAC or M4A files here'),
    btn({ label: UPLOAD && UPLOAD.busy ? 'Converting…' : 'Choose files', icon: 'add', disabled: UPLOAD && UPLOAD.busy, onClick: () => input.click() }), input,
    el('div', { class: 'cda-dim cda-small' }, `Up to ${(lim.max_ms || 3000) / 1000} s and ${Math.round((lim.max_data || 262144) / 1024)} KB per sound. Every file is converted on this PC to mono 22 kHz 16-bit WAV (silence at both ends removed), nothing to install. ${s.slots_used != null ? s.slots_used : s.rows.length} of ${lim.max_sounds || 24} slots used: uploaded sounds (hidden or not) and the visible sounds built into the DLL. A hidden built-in sound frees its slot.`));
  const lv = el('input', { type: 'checkbox', checked: levelOn() ? true : null });
  lv.onchange = () => setLevel(lv.checked);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); upload([...(e.dataTransfer && e.dataTransfer.files || [])]); };
  append(b, [
    el('div', { class: 'esub cda-lead' }, `In-game Sounds panel: ${visible} sound${visible > 1 ? 's' : ''} shown (${s.rows.length} listed), ${s.categories.length} categor${s.categories.length > 1 ? 'ies' : 'y'}. `,
      s.listed ? 'The players see the list published on the CDN.' : 'Nothing published yet: the players see the 12 sounds built into the DLL.',
      ' Changes here stay in the draft until the Publish tab: then every player on the Eden Reforged client gets them within about 10 minutes, no repack.'),
    el('div', { class: 'emc-actions' },
      btn({ label: SHOW_CATS ? 'Hide categories' : 'Categories…', icon: 'new_category', variant: 'ghost', onClick: () => { SHOW_CATS = !SHOW_CATS; ES.render(); } }),
      s.edited ? btn({ label: 'Discard sound changes', icon: 'undo', variant: 'ghost', onClick: async () => {
        if (!(await uiConfirm('Discard every pending sound change (uploads, edits, categories)?', 'Discard sound changes', 'Discard'))) return;
        post('/draft/reset', { what: 'sounds' }, 'Sound changes discarded');
      } }) : null,
      s.edited ? badge('draft: publish it from the Publish tab', 'warn') : null),
    SHOW_CATS ? cats() : null, drop,
    el('label', { class: 'cda-ctl emc-level', title: 'Raise quiet sounds and lower loud ones to about the same loudness (peaks kept under -1 dB). Applies to the files you drop from now on.' }, lv, 'Level the volume of new sounds')]);
  if (UPLOAD && UPLOAD.results.length) {
    const bad = UPLOAD.results.filter(r => r.error);
    b.appendChild(el('div', { class: 'emc-upres' },
      el('div', {}, el('b', {}, `${UPLOAD.results.length - bad.length} added`), bad.length ? `, ${bad.length} skipped` : '',
        btn({ label: 'Dismiss', variant: 'mini', onClick: () => { UPLOAD = null; ES.render(); } })),
      bad.map(r => el('div', { class: 'emc-skip' }, icon('warning', 24), el('b', {}, r.file), ' — ', r.error))));
  }
  if (s.removed.length) b.appendChild(el('div', { class: 'cda-warn' }, icon('warning', 24), 'Removed at the next publication: ' + s.removed.map(r => `${r.name} (sfx:${r.id})`).join(', ')));
  const wrap = el('div', { class: 'emc-snd-wrap' });
  const list = el('div', { class: 'emc-snd-list' });
  if (!s.rows.length) list.appendChild(emptyState({ title: 'No sound', icon: 'music' }));
  s.rows.forEach((r, i) => { list.appendChild(row(r, i, s.rows.length)); if (PICK === r.id) list.appendChild(picker(r)); });
  append(wrap, [list, panelPreview()]);
  b.appendChild(wrap);
}
