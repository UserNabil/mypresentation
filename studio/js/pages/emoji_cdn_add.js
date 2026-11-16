import { el, clear, append } from '../core/dom.js';
import { icon, btn, badge, emptyState } from '../components.js';
import { fmtBytes } from '../core/format.js';
import { toast } from '../ui/toast.js';
import { uiConfirm } from '../ui/dialogs.js';
import { ES, ROOT, call, errText, previewPair, postForm, kwText, catSelect, fmtFrames, lim } from './emoji_cdn_view.js';

let LIST = null;
let PROG = null;

function exts() {
  const c = ES.ctx || {};
  return (c.image_ext || []).concat(c.ffmpeg && c.ffmpeg.ok ? (c.video_ext || []) : []);
}

function extOf(name) { const i = name.lastIndexOf('.'); return i >= 0 ? name.slice(i).toLowerCase() : ''; }

export function renderAdd(b) {
  const c = ES.ctx || {}, L = lim();
  const ff = c.ffmpeg || {};
  const input = el('input', { type: 'file', multiple: true, accept: exts().join(','), style: { display: 'none' } });
  input.onchange = () => { const f = [...input.files]; input.value = ''; upload(f); };
  const drop = el('div', { class: 'emc-drop' }, icon('import', 48),
    el('div', { class: 'emc-drop-t' }, `Drop ${ff.ok ? 'GIF, PNG, JPG, WEBP, MP4 or WEBM' : 'GIF, PNG, JPG or WEBP'} files here`),
    btn({ label: 'Choose files', icon: 'add', onClick: () => input.click() }), input,
    el('div', { class: 'cda-dim cda-small' }, `Each file becomes one emoji: cropped to its visible pixels, centred in a ${L.cell || 32} px cell, transparency kept. Animations keep up to the number of images below (contract: ${L.max_frames || 64} max, 1 to ${L.max_fps || 30} fps).`));
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); upload([...(e.dataTransfer && e.dataTransfer.files || [])]); };
  const want = el('input', { type: 'number', class: 'emc-in emc-num', min: 1, max: L.max_frames || 64, value: ES.want });
  want.onchange = () => { ES.want = Math.max(1, Math.min(L.max_frames || 64, parseInt(want.value, 10) || 22)); want.value = ES.want; };
  PROG = el('div', { class: 'emc-prog' });
  append(b, [drop,
    el('div', { class: 'cda-opts' }, el('label', { class: 'cda-ctl' }, 'Images per animation', want),
      ff.ok ? badge('MP4 / WEBM enabled (ffmpeg found)', 'ok', { title: ff.path || '' })
        : badge('MP4 / WEBM disabled: ffmpeg not found', 'warn', { title: 'Install ffmpeg and add it to PATH (or pip install imageio-ffmpeg), then refresh the page' }),
      ff.ok ? el('span', { class: 'cda-dim cda-small' }, `videos: first ${L.video_max_s || 10} s`) : null),
    PROG, uploadReport()]);
  LIST = el('div', { class: 'emc-stglist' });
  b.appendChild(stagedHead());
  b.appendChild(LIST);
  drawList();
}

function uploadReport() {
  const u = ES.upload;
  if (!u || !u.length) return null;
  const bad = u.filter(r => r.error);
  return el('div', { class: 'emc-upres' },
    el('div', {}, el('b', {}, `${u.length - bad.length} added`), bad.length ? `, ${bad.length} skipped` : '',
      btn({ label: 'Dismiss', variant: 'mini', onClick: () => { ES.upload = null; ES.render(); } })),
    bad.map(r => el('div', { class: 'emc-skip' }, icon('warning', 24), el('b', {}, r.file), ' — ', r.error)));
}

function stagedHead() {
  const st = ES.model.staged;
  if (!st.length) return el('div', {});
  const cs = catSelect('', false, 'Category for all…');
  cs.onchange = async () => {
    if (!cs.value) return;
    try { ES.model = await call.post('/stage/bulk', { cat: cs.value }); ES.render(); } catch (e) { toast(errText(e), 'error'); }
  };
  const bad = st.filter(s => s.errors.length).length;
  return el('div', { class: 'emc-stghead' },
    el('h3', {}, `${st.length} staged emoji${st.length > 1 ? 's' : ''}`), bad ? badge(`${bad} to fix`, 'error') : badge('ready', 'ok'),
    el('span', { class: 'cda-dim cda-small' }, 'Saved in the draft as you type. Players see nothing until the Publish tab.'),
    el('span', { class: 'emc-grow' }), cs,
    btn({ label: 'Publish…', icon: 'deploy_to_server', variant: 'ghost', onClick: () => ES.setTab('publish') }),
    btn({ label: 'Clear all', icon: 'delete', variant: 'ghost', onClick: async () => {
      if (!(await uiConfirm(`Remove the ${st.length} staged emojis from the draft?`, 'Clear staged emojis', 'Clear'))) return;
      try { ES.model = await call.post('/draft/reset', { what: 'staged' }); ES.renderTabs(); ES.render(); } catch (e) { toast(errText(e), 'error'); }
    } }));
}

function drawList() {
  if (!LIST) return;
  clear(LIST);
  const st = ES.model.staged;
  if (!st.length) { LIST.appendChild(emptyState({ title: 'Nothing staged yet', hint: 'Drop files above: they are converted here, then published from the Publish tab.', icon: 'image' })); return; }
  for (const s of [...st].reverse()) LIST.appendChild(stagedCard(s));
}

async function upload(files) {
  if (!files.length || ES.busy) return;
  const L = lim(), ok = exts();
  const res = [];
  const todo = [];
  for (const f of files) {
    if (!ok.includes(extOf(f.name))) res.push({ file: f.name, error: (ES.ctx.video_ext || []).includes(extOf(f.name)) ? 'MP4/WEBM need ffmpeg, which is not installed on this machine' : 'unsupported type (accepted: ' + ok.join(' ') + ')' });
    else if (f.size > (L.upload_max || 64 << 20)) res.push({ file: f.name, error: 'larger than ' + fmtBytes(L.upload_max || 64 << 20) });
    else todo.push(f);
  }
  ES.busy = true;
  try {
    for (let i = 0; i < todo.length; i++) {
      if (PROG && PROG.isConnected) PROG.textContent = `Converting ${i + 1} / ${todo.length}: ${todo[i].name}…`;
      const fd = new FormData();
      fd.append('files', todo[i], todo[i].name);
      fd.append('frames', String(ES.want));
      try {
        const r = await postForm(ROOT + '/stage', fd);
        res.push(...(r.results || []));
        ES.model = r.model || ES.model;
        if (LIST && LIST.isConnected) drawList();
      } catch (e) { res.push({ file: todo[i].name, error: errText(e) }); }
    }
  } finally {
    ES.busy = false;
  }
  ES.upload = res;
  const n = res.filter(r => !r.error).length;
  toast(`${n} emoji${n > 1 ? 's' : ''} staged${res.length - n ? `, ${res.length - n} skipped` : ''}`, res.length - n ? 'warn' : 'ok', 3500);
  ES.renderTabs();
  if (ES.tab === 'add') ES.render();
}

function problems(s) {
  return el('div', { class: 'emc-problems' },
    s.errors.map(e => el('div', { class: 'emc-perr' }, icon('error', 24), e)),
    s.warnings.map(w => el('div', { class: 'emc-pwarn' }, icon('warning', 24), w)));
}

function info(s) {
  const src = s.video ? 'video' : (s.src_frames > 1 ? `${s.src_frames} source images` : 'still image');
  return `${s.file} · ${fmtBytes(s.bytes)} · ${src} → ${fmtFrames(s.frames, s.fps)}`;
}

function stagedCard(s) {
  const L = lim();
  const f = {};
  const node = el('div', { class: 'emc-stg' + (s.errors.length ? ' bad' : '') });
  const save = async patch => {
    try { ES.model = await call.post('/stage/update', Object.assign({ id: s.id }, patch)); } catch (e) { toast(errText(e), 'error', 6000); return; }
    const ns = ES.model.staged.find(x => x.id === s.id);
    if (ns) fill(node, f, ns);
    ES.renderTabs();
  };
  f.code = el('input', { type: 'text', class: 'emc-in emc-codein', value: s.code, maxlength: 15, spellcheck: 'false', disabled: s.replaces ? true : null, title: s.replaces ? 'New image of an existing emoji: the code stays the same' : null });
  f.code.onchange = () => save({ code: f.code.value });
  f.name = el('input', { type: 'text', class: 'emc-in', value: s.name, maxlength: L.name_max || 39 });
  f.name.onchange = () => save({ name: f.name.value });
  f.kw = el('input', { type: 'text', class: 'emc-in', value: kwText(s.keywords) });
  f.kw.onchange = () => save({ keywords: f.kw.value });
  f.cat = catSelect(s.cat, false);
  f.cat.onchange = () => save({ cat: f.cat.value });
  const anim = s.frames > 1 || s.src_frames > 1 || s.video;
  f.want = el('input', { type: 'number', class: 'emc-in emc-num', min: 1, max: L.max_frames || 64, value: s.want, title: 'Images kept from the animation (re-converts the source)' });
  f.want.onchange = () => save({ want: f.want.value });
  f.fps = el('input', { type: 'number', class: 'emc-in emc-num', min: 1, max: L.max_fps || 30, value: s.fps || 16, title: 'Playback speed in game' });
  f.fps.onchange = () => save({ fps: f.fps.value });
  f.pv = el('div', {}, previewPair(s.img));
  f.info = el('div', { class: 'cda-dim cda-small' }, info(s));
  f.pb = el('div', {}, problems(s));
  append(node, [
    el('div', { class: 'emc-big' }, f.pv),
    el('div', { class: 'emc-stgform' },
      el('div', { class: 'emc-form' },
        el('label', { class: 'emc-lbl' }, 'Code'), el('div', { class: 'emc-codewrap' }, ':', f.code, ':'),
        el('label', { class: 'emc-lbl' }, 'English name'), f.name,
        el('label', { class: 'emc-lbl' }, 'Keywords'), f.kw,
        el('label', { class: 'emc-lbl' }, 'Category'), f.cat,
        anim ? el('label', { class: 'emc-lbl' }, 'Animation') : null,
        anim ? el('div', { class: 'emc-anim' }, f.want, el('span', { class: 'cda-small' }, 'images at'), f.fps, el('span', { class: 'cda-small' }, 'fps')) : null),
      s.replaces ? el('div', { class: 'cda-small' }, badge('new image', 'warn'), ` replaces the current image of :${s.replaces}: (same code, name and place in the palette)`) : null,
      f.info, f.pb),
    el('div', { class: 'emc-stgact' }, btn({ label: '', icon: 'delete', variant: 'mini', title: 'Remove from the draft', onClick: async () => {
      try { ES.model = await call.post('/stage/delete', { id: s.id }); node.remove(); ES.renderTabs(); if (!ES.model.staged.length) ES.render(); } catch (e) { toast(errText(e), 'error'); }
    } }))]);
  return node;
}

function fill(node, f, s) {
  const set = (inp, v) => { if (document.activeElement !== inp) inp.value = v; };
  set(f.code, s.code); set(f.name, s.name); set(f.kw, kwText(s.keywords)); set(f.want, s.want); set(f.fps, s.fps || 16);
  if (document.activeElement !== f.cat) f.cat.value = s.cat;
  clear(f.pv).appendChild(previewPair(s.img));
  f.info.textContent = info(s);
  clear(f.pb).appendChild(problems(s));
  node.classList.toggle('bad', s.errors.length > 0);
}
