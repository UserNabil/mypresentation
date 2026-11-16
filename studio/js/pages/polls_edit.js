/* ============================================================================
   pages/polls_edit.js — Polls page, second half: the poll editor (question,
   answers with emoji, rules, schedule, rewards) and its live preview "in game"
   and "on Discord". Shared helpers (time formats, result bars) live here too.
   Backend: polls_admin.py (/api/polls/*). Page: polls.js.
   ============================================================================ */

import { el, clear, append } from '../core/dom.js';
import { icon, btn, badge, card } from '../components.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { itemCell, itemSearch } from './shop_currency_items.js';

const ROOT = '/api/polls';
const DEFAULT_TITLE = 'Thank you for voting!';
const SAMPLE = [42, 27, 15, 9, 4, 2, 1, 1, 0, 0];

const clen = s => [...String(s || '')].length;

export function fmtLeft(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return d + 'd ' + h + 'h';
  if (h) return h + 'h ' + m + 'm';
  return Math.max(1, m) + 'm';
}

export function fmtDate(t) {
  if (!t) return '';
  return new Date(t * 1000).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toLocal(t) {
  const d = new Date(t * 1000), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fromLocal(s) {
  const t = new Date(s).getTime();
  return isNaN(t) ? null : Math.floor(t / 1000);
}

export function bars(options, opts = {}) {
  const total = options.reduce((a, o) => a + (o.votes || 0), 0);
  const top = Math.max(0, ...options.map(o => o.votes || 0));
  return el('div', { class: 'pl-bars' + (opts.cls ? ' ' + opts.cls : '') }, options.map(o => {
    const pct = total ? Math.round(1000 * (o.votes || 0) / total) / 10 : 0;
    const win = opts.final && top > 0 && (o.votes || 0) === top;
    return el('div', { class: 'pl-bar' + (win ? ' win' : '') },
      el('div', { class: 'pl-bar-fill', style: { width: pct + '%' } }),
      el('div', { class: 'pl-bar-row' },
        opts.check ? el('span', { class: 'pl-check' + (o.mine ? ' on' : '') }) : null,
        o.emoji ? el('span', { class: 'pl-emoji' }, o.emoji) : null,
        el('span', { class: 'pl-bar-text' }, o.text || '(empty answer)'),
        win ? badge('winner', 'ok') : null,
        el('span', { class: 'pl-bar-n' }, (opts.hideCount ? '' : (o.votes || 0) + ' · ') + pct + '%')));
  }));
}

export function blankPoll(now) {
  const start = Math.ceil(now / 60) * 60;
  return { id: null, question: '', description: '', multiselect: false, results_visibility: 'after_vote', vote_scope: 'account',
    min_level: 1, starts_at: start, ends_at: start + 86400, reward_mode: 'none', reward_title: DEFAULT_TITLE, votes: 0,
    answers: [{ text: '', emoji: '' }, { text: '', emoji: '' }], rewards: [], images: [] };
}

const pow2 = v => { let n = 1; while (n < v) n *= 2; return n; };

function pictureThumb(im, maxW, maxH) {
  const cols = Math.min(im.frames || 1, 4), rows = Math.ceil((im.frames || 1) / 4);
  const tw = pow2(cols * im.width), th = pow2(rows * im.height);
  const sc = Math.min(maxW / im.width, maxH / im.height, 2);
  const d = el('div', { class: 'pl-pic', title: (im.name || 'picture') + ' - ' + im.width + 'x' + im.height
    + (im.frames > 1 ? ', ' + im.frames + ' frames at ' + im.fps + ' fps' : '') });
  d.style.width = Math.round(im.width * sc) + 'px';
  d.style.height = Math.round(im.height * sc) + 'px';
  d.style.backgroundImage = 'url("' + im.url + '")';
  d.style.backgroundSize = Math.round(tw * sc) + 'px ' + Math.round(th * sc) + 'px';
  d.style.backgroundPosition = '0 0';
  if (im.frames > 1) {
    let k = 0;
    const tick = () => {
      if (!d.isConnected) return;
      k = (k + 1) % im.frames;
      d.style.backgroundPosition = -Math.round((k % cols) * im.width * sc) + 'px ' + -Math.round(Math.floor(k / cols) * im.height * sc) + 'px';
      setTimeout(tick, 1000 / Math.max(1, im.fps));
    };
    setTimeout(tick, 1000 / Math.max(1, im.fps));
  }
  return d;
}

function readB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => rej(new Error('cannot read ' + file.name));
    r.readAsDataURL(file);
  });
}

export function fromPoll(p) {
  const locked = (p.votes || 0) > 0;
  return { id: p.id, question: p.question, description: p.description, multiselect: !!p.multiselect,
    results_visibility: p.results_visibility, vote_scope: p.vote_scope, min_level: p.min_level, starts_at: p.starts_at,
    ends_at: p.ends_at, reward_mode: p.reward_mode, reward_title: p.reward_title, votes: p.votes || 0, voters: p.voters || 0,
    state: p.state,
    answers: (p.options || []).map(o => ({ answer_id: o.answer_id, text: o.text, emoji: o.emoji, votes: o.votes || 0, locked })),
    rewards: (p.rewards || []).map(r => ({ item_id: r.item_id, quantity: r.quantity, ref: { id: r.item_id, name: r.name, icon: r.icon, stack: r.stack, in_client: r.known ? true : false } })),
    images: (p.images || []).map(i => ({ sha256: i.sha256, url: i.url, width: i.width, height: i.height, frames: i.frames, fps: i.fps, bytes: i.bytes, name: i.name })) };
}

function input(attrs, onInput) {
  const i = el('input', Object.assign({ class: 'pl-in' }, attrs));
  if (onInput) i.addEventListener('input', () => onInput(i.value));
  return i;
}

function select(options, value, onChange, disabled) {
  const s = el('select', { class: 'pl-in', disabled: disabled ? true : null },
    options.map(([v, l]) => el('option', { value: v, selected: v === value ? true : null }, l)));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function field(label, node, hint) {
  return el('div', { class: 'pl-field' }, el('label', {}, label), node, hint ? el('div', { class: 'esub pl-hint' }, hint) : null);
}

function counter(value, max) {
  const n = clen(value);
  return el('span', { class: 'pl-count' + (n > max ? ' bad' : '') }, n + ' / ' + max);
}

function mailCount(rewards) {
  let n = 0;
  for (const r of rewards) {
    const st = Math.max(1, (r.ref && r.ref.stack) || 1);
    n += Math.ceil((parseInt(r.quantity, 10) || 0) / st);
  }
  return n;
}

export function renderEditor(box, D, cx) {
  const L = cx.ctx.limits || {};
  const locked = D.votes > 0;
  const pv = el('div', { class: 'pl-preview' });
  const durNote = el('div', { class: 'esub pl-hint' });
  const answersBox = el('div', { class: 'pl-answers' });
  const rewardsBox = el('div');
  const picturesBox = el('div', { class: 'pl-pics' });
  const counters = {};
  D.images = D.images || [];

  const refresh = () => { renderPreview(pv, D, cx); renderDuration(); };
  const renderDuration = () => {
    const d = D.ends_at - D.starts_at;
    durNote.className = 'esub pl-hint' + (d <= 0 || d > (L.days || 32) * 86400 ? ' pl-bad' : '');
    durNote.textContent = d <= 0 ? 'The end must be after the start.'
      : 'Duration ' + fmtLeft(d) + (d > (L.days || 32) * 86400 ? ' - more than ' + (L.days || 32) + ' days (Discord limit)' : '')
        + '. Times are in your local time.';
  };
  const text = (key, max, attrs, multiline) => {
    const n = multiline ? el('textarea', Object.assign({ class: 'pl-in', rows: 3 }, attrs)) : input(attrs);
    n.value = D[key] || '';
    const c = el('span');
    counters[key] = c;
    const upd = () => { D[key] = n.value; clear(c).appendChild(counter(n.value, max)); refresh(); };
    n.addEventListener('input', upd);
    clear(c).appendChild(counter(n.value, max));
    return el('div', { class: 'pl-with-count' }, n, c);
  };

  const renderAnswers = () => {
    clear(answersBox);
    D.answers.forEach((a, i) => {
      const em = input({ value: a.emoji || '', placeholder: 'emoji', maxlength: String(L.emoji || 32), class: 'pl-in pl-em', title: 'Optional emoji: a chat emoji code like :drink: (drawn as the chat picture in game) or a Unicode emoji' },
        v => { a.emoji = v; refresh(); });
      const cnt = el('span');
      const tx = input({ value: a.text || '', placeholder: 'Answer ' + (i + 1), class: 'pl-in pl-ans' }, v => { a.text = v; clear(cnt).appendChild(counter(v, L.answer || 55)); refresh(); });
      cnt.appendChild(counter(a.text, L.answer || 55));
      const up = btn({ label: '', icon: 'back', variant: 'mini', title: 'Move up', disabled: i === 0,
        onClick: () => { D.answers.splice(i - 1, 0, D.answers.splice(i, 1)[0]); renderAnswers(); refresh(); } });
      up.style.transform = 'rotate(90deg)';
      const rm = btn({ label: '', icon: 'delete', variant: 'mini', disabled: a.locked || D.answers.length <= 1,
        title: a.locked ? 'Players voted: this answer can be renamed, not removed' : 'Remove this answer',
        onClick: () => { D.answers.splice(i, 1); renderAnswers(); refresh(); } });
      answersBox.appendChild(el('div', { class: 'pl-ans-row' }, el('span', { class: 'pl-ans-n' }, String(i + 1)), em, tx, cnt,
        a.locked ? badge((a.votes || 0) + ' vote(s)', 'info') : null, up, rm));
    });
    answersBox.appendChild(btn({ label: 'Add answer', icon: 'add', variant: 'mini', disabled: D.answers.length >= (L.answers || 10),
      onClick: () => { D.answers.push({ text: '', emoji: '' }); renderAnswers(); refresh(); } }));
  };

  const renderPictures = () => {
    clear(picturesBox);
    D.images.forEach((im, i) => {
      const up = btn({ label: '', icon: 'back', variant: 'mini', title: 'Move up', disabled: i === 0,
        onClick: () => { D.images.splice(i - 1, 0, D.images.splice(i, 1)[0]); renderPictures(); refresh(); } });
      up.style.transform = 'rotate(90deg)';
      const down = btn({ label: '', icon: 'back', variant: 'mini', title: 'Move down', disabled: i === D.images.length - 1,
        onClick: () => { D.images.splice(i + 1, 0, D.images.splice(i, 1)[0]); renderPictures(); refresh(); } });
      down.style.transform = 'rotate(-90deg)';
      const rm = btn({ label: '', icon: 'delete', variant: 'mini', title: 'Remove this picture',
        onClick: () => { D.images.splice(i, 1); renderPictures(); refresh(); } });
      picturesBox.appendChild(el('div', { class: 'pl-pic-row' }, el('span', { class: 'pl-ans-n' }, String(i + 1)),
        pictureThumb(im, 120, 60),
        el('span', { class: 'cda-dim cda-small' }, (im.name || 'picture') + ' · ' + im.width + 'x' + im.height
          + (im.frames > 1 ? ' · ' + im.frames + ' frames, ' + im.fps + ' fps' : '') + ' · ' + Math.ceil((im.bytes || 0) / 1024) + ' KB'),
        up, down, rm));
    });
    const max = L.images || 8;
    const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple: true, style: { display: 'none' } });
    const add = btn({ label: 'Add pictures', icon: 'add', variant: 'mini', busyLabel: 'Uploading…', disabled: D.images.length >= max,
      onClick: () => file.click() });
    file.addEventListener('change', async () => {
      const files = [...file.files].slice(0, Math.max(0, max - D.images.length));
      file.value = '';
      for (const f of files) {
        if (f.size > 8 * 1024 * 1024) { toast(f.name + ': larger than 8 MB', 'error'); continue; }
        try {
          add.disabled = true;
          const r = await cx.upload({ name: f.name, data: await readB64(f) });
          if (!r) break;
          if (D.images.some(x => x.sha256 === r.sha256)) { toast(f.name + ' is already in this poll', 'warn'); continue; }
          D.images.push({ sha256: r.sha256, url: r.url, width: r.width, height: r.height, frames: r.frames, fps: r.fps, bytes: r.bytes, name: r.name });
          toast(f.name + ': ' + r.width + 'x' + r.height + (r.frames > 1 ? ', ' + r.frames + ' frames' : '') + (r.verified ? ', on the CDN' : ', uploaded (CDN check pending)'), 'ok');
        } catch (e) { toast(f.name + ': ' + errMessage(e), 'error', { duration: 10000 }); }
      }
      renderPictures();
      refresh();
    });
    append(picturesBox, [el('div', { class: 'pl-inline' }, add, file,
      el('span', { class: 'esub pl-hint' }, 'PNG, JPG, GIF or WEBP, 8 MB at most, ' + max + ' pictures at most. Resized for the game '
        + '(512x256 at most; animated GIF: 16 frames, 256x160). Stored on the Reforged CDN under polls/.'))]);
  };

  const addReward = (id, ref) => {
    if (D.rewards.length >= (L.rewards || 5)) { toast('5 reward lines at most', 'warn'); return; }
    D.rewards.push({ item_id: id, quantity: 1, ref: ref || { id } });
    renderRewards();
  };
  const renderRewards = () => {
    clear(rewardsBox);
    const mode = select([['none', 'No reward'], ['on_vote', 'On vote (after the first vote)'], ['on_close', 'When the poll closes (every voter)']],
      D.reward_mode, v => { D.reward_mode = v; renderRewards(); refresh(); });
    append(rewardsBox, [field('Rewards', mode, 'Sent by in-game mail from "Eden Reforged" (system mail, 30 days), once per vote key: '
      + 'one per account by default. The page sends them when it is open (every minute) or with Send rewards.')]);
    if (D.reward_mode === 'none') return;
    append(rewardsBox, [field('Mail title', text('reward_title', L.title || 60, { maxlength: String(L.title || 60), placeholder: DEFAULT_TITLE }),
      'Plain ASCII: the game mail cannot show accents or emoji.')]);
    const rows = el('div', { class: 'pl-rewards' });
    D.rewards.forEach((r, i) => {
      const q = input({ type: 'number', min: '1', max: String(L.quantity || 999), value: String(r.quantity), class: 'pl-in pl-qty' },
        v => { r.quantity = parseInt(v, 10) || 1; renderMails(); });
      rows.appendChild(el('div', { class: 'pl-rw-row' }, itemCell(r.ref || { id: r.item_id }),
        el('span', { class: 'cda-dim cda-small' }, 'max stack ' + ((r.ref && r.ref.stack) || '?')), 'x', q,
        btn({ label: '', icon: 'delete', variant: 'mini', title: 'Remove', onClick: () => { D.rewards.splice(i, 1); renderRewards(); } })));
    });
    const mails = el('div', { class: 'esub pl-hint' });
    const renderMails = () => {
      const n = mailCount(D.rewards);
      mails.className = 'esub pl-hint' + (n > (L.mails || 10) ? ' pl-bad' : '');
      mails.textContent = D.rewards.length ? n + ' mail(s) per voter (' + (L.mails || 10) + ' at most; a mail holds one stack)' : 'Add 1 to 5 items.';
    };
    renderMails();
    const idIn = input({ type: 'number', min: '1', placeholder: 'item id', class: 'pl-in pl-qty' });
    const byId = btn({ label: 'Add by id', variant: 'mini', icon: 'add', onClick: async () => {
      const id = parseInt(idIn.value, 10);
      if (!id) return;
      try { addReward(id, await api.get(ROOT + '/item/' + id)); } catch (e) { toast(errMessage(e), 'error'); }
    } });
    append(rewardsBox, [rows, mails, D.rewards.length < (L.rewards || 5)
      ? el('div', {}, itemSearch(ROOT, (id, it) => addReward(id, it)), el('div', { class: 'pl-inline' }, idIn, byId)) : null]);
  };

  const startIn = input({ type: 'datetime-local', value: toLocal(D.starts_at) }, v => { const t = fromLocal(v); if (t) { D.starts_at = t; refresh(); } });
  const endIn = input({ type: 'datetime-local', value: toLocal(D.ends_at) }, v => { const t = fromLocal(v); if (t) { D.ends_at = t; refresh(); } });
  const setEnd = s => { D.ends_at = D.starts_at + s; endIn.value = toLocal(D.ends_at); refresh(); };
  const nowBtn = btn({ label: 'Now', variant: 'mini', onClick: () => { D.starts_at = Math.ceil(cx.nowS() / 60) * 60; startIn.value = toLocal(D.starts_at); refresh(); } });
  const quick = [['1 h', 3600], ['1 d', 86400], ['3 d', 3 * 86400], ['7 d', 7 * 86400]].map(([l, s]) => btn({ label: l, variant: 'mini', onClick: () => setEnd(s) }));

  const multi = el('input', { type: 'checkbox', disabled: locked ? true : null });
  multi.checked = !!D.multiselect;
  multi.addEventListener('change', () => { D.multiselect = multi.checked; refresh(); });

  const level = input({ type: 'number', min: '1', max: String(L.level || 200), value: String(D.min_level || 1), class: 'pl-in pl-qty' },
    v => { D.min_level = parseInt(v, 10) || 1; });

  renderAnswers();
  renderRewards();
  renderPictures();

  const save = btn({ label: D.id ? 'Save' : 'Create draft', icon: 'save', busyLabel: 'Saving…', onClick: () => cx.save(body(D)) });
  const cancel = btn({ label: 'Cancel', variant: 'ghost', onClick: () => cx.cancel() });

  const form = el('div', { class: 'pl-form' },
    locked ? el('div', { class: 'cda-warn' }, icon('lock', 24), D.voters + ' player(s) voted: existing answers can be renamed, not removed. '
      + 'Single or multiple choice and the vote scope are locked.') : null,
    field('Question', text('question', L.question || 300, { maxlength: String(L.question || 300), placeholder: 'What should we add next?' })),
    field('Description (optional)', text('description', L.description || 1000, { maxlength: String(L.description || 1000) }, true)),
    field('Pictures (optional)', picturesBox, 'Shown in the poll window with < and > to browse them, like a small gallery.'),
    field('Answers', answersBox, '1 to ' + (L.answers || 10) + ' answers, ' + (L.answer || 55) + ' characters each, optional emoji: '
      + 'a chat emoji code like :drink: or :g_v3: (animated ones move in game) or a Unicode emoji.'),
    el('div', { class: 'pl-row2' },
      field('Choice', el('label', { class: 'pl-inline' }, multi, 'Players may pick several answers')),
      field('Results visible', select([['after_vote', 'After voting (like Discord)'], ['always', 'Always'], ['after_close', 'Only when the poll ends']],
        D.results_visibility, v => { D.results_visibility = v; refresh(); }))),
    el('div', { class: 'pl-row2' },
      field('Who votes', select([['account', 'One vote per account (default)'], ['character', 'One vote per character']], D.vote_scope,
        v => { D.vote_scope = v; refresh(); }, locked),
      'One vote per account (default): alts don\'t multiply votes, the reward goes once per account.'),
      field('Minimum level', level, 'Characters below this level cannot vote.')),
    el('div', { class: 'pl-row2' },
      field('Start', el('div', { class: 'pl-inline' }, startIn, nowBtn)),
      field('End', el('div', { class: 'pl-inline' }, endIn, ...quick))),
    durNote,
    rewardsBox,
    el('div', { class: 'pl-inline', style: { marginTop: '10px' } }, save, cancel));

  clear(box).appendChild(el('div', { class: 'pl-grid' },
    card({ title: D.id ? 'Edit poll #' + D.id : 'New poll', icon: 'edit', body: form }),
    card({ title: 'Preview', icon: 'preview', body: pv })));
  refresh();
}

function body(D) {
  return { id: D.id, question: D.question, description: D.description, multiselect: D.multiselect,
    results_visibility: D.results_visibility, vote_scope: D.vote_scope, min_level: D.min_level,
    starts_at: D.starts_at, ends_at: D.ends_at, reward_mode: D.reward_mode, reward_title: D.reward_title,
    answers: D.answers.map(a => ({ answer_id: a.answer_id || null, text: a.text, emoji: a.emoji })),
    rewards: D.reward_mode === 'none' ? [] : D.rewards.map(r => ({ item_id: r.item_id, quantity: r.quantity })),
    images: (D.images || []).map(i => ({ sha256: i.sha256, url: i.url, width: i.width, height: i.height, frames: i.frames, fps: i.fps, bytes: i.bytes, name: i.name })) };
}

const bmp = s => [...String(s || '')].filter(ch => ch.codePointAt(0) <= 0xFFFF).join('');

function renderPreview(box, D, cx) {
  const real = D.answers.some(a => a.votes);
  const opts = D.answers.map((a, i) => ({ text: a.text, emoji: a.emoji, votes: real ? (a.votes || 0) : SAMPLE[i] || 0, mine: i === 0 }));
  const now = cx.nowS();
  const left = D.ends_at > now ? 'Ends in ' + fmtLeft(D.ends_at - Math.max(now, D.starts_at)) : 'Final results';
  const hidden = D.answers.some(a => bmp(a.emoji) !== (a.emoji || ''));
  const total = opts.reduce((a, o) => a + o.votes, 0);
  const pics = D.images || [];
  let picIdx = 0;
  const picBox = el('div', { class: 'pl-game-pics' });
  const showPic = () => {
    clear(picBox);
    if (!pics.length) return;
    const prev = el('span', { class: 'pl-game-btn' + (picIdx > 0 ? '' : ' off') }, '<');
    const next = el('span', { class: 'pl-game-btn' + (picIdx < pics.length - 1 ? '' : ' off') }, '>');
    prev.addEventListener('click', () => { if (picIdx > 0) { picIdx--; showPic(); } });
    next.addEventListener('click', () => { if (picIdx < pics.length - 1) { picIdx++; showPic(); } });
    append(picBox, [pics.length > 1 ? prev : null, el('div', { class: 'pl-game-pic' }, pictureThumb(pics[picIdx], 218, 80)),
      pics.length > 1 ? next : null, pics.length > 1 ? el('div', { class: 'pl-game-n' }, (picIdx + 1) + '/' + pics.length) : null]);
  };
  showPic();
  const game = el('div', { class: 'pl-game' },
    el('div', { class: 'pl-game-q' }, D.question || 'Your question'),
    D.description ? el('div', { class: 'pl-game-d' }, D.description) : null,
    pics.length ? picBox : null,
    bars(opts.map(o => Object.assign({}, o, { emoji: bmp(o.emoji) })), { check: true, hideCount: false, cls: 'pl-bars-game' }),
    el('div', { class: 'pl-game-f' }, el('span', { class: 'pl-game-btn' }, 'Vote'), el('span', { class: 'pl-game-btn' }, 'Remove vote'),
      el('span', {}, left)),
    D.reward_mode !== 'none' ? el('div', { class: 'pl-game-r' }, 'Vote to receive a reward') : null);
  const discord = el('div', { class: 'pl-discord' },
    el('div', { class: 'pl-dc-q' }, D.question || 'Your question'),
    el('div', { class: 'pl-dc-s' }, D.multiselect ? 'Select one or more answers' : 'Select one answer'),
    bars(opts, { cls: 'pl-bars-dc', hideCount: true }),
    el('div', { class: 'pl-dc-f' }, total + ' votes · ' + (D.ends_at > now ? fmtLeft(D.ends_at - Math.max(now, D.starts_at)) + ' left' : 'Poll closed')));
  clear(box);
  append(box, [
    el('div', { class: 'esub pl-hint' }, real ? 'Current votes.' : 'Sample numbers: the bars show how results will look. '
      + ({ after_vote: 'Players see them after voting or when the poll ends.', always: 'Players always see them.', after_close: 'Players see them when the poll ends.' }[D.results_visibility] || '')),
    el('div', { class: 'pl-pv-h' }, icon('launch_game', 24), 'In game'), game,
    hidden ? el('div', { class: 'esub pl-hint' }, 'Emoji outside the basic plane cannot be drawn by the game fonts: hidden in game, kept for Discord.') : null,
    el('div', { class: 'pl-pv-h' }, icon('comment', 24), 'On Discord'), discord]);
}
