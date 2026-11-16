import { el, clear, esc } from '../core/dom.js';
import { dataTable, errorState, badge } from '../components.js';
import { fmtBytes } from '../core/format.js';
import { crFetchText, crFileUrl, crNormCode, crExcName } from './crashes_state.js';

const ORDER = ['error.log', 'main.log', 'ui.log', 'CEGUI.log', 'eden_hook.log', 'session.json', 'crash.json', 'game_.xml', 'connect.ini'];
const FALLBACK = { 'error.log': 'error_log', 'main.log': 'main_log', 'ui.log': 'ui_log', 'cegui.log': 'cegui_errors', 'eden_hook.log': 'eden_hook_log', 'session.json': 'session', 'crash.json': 'crash_info' };
const TEXT_EXT = /\.(log|txt|ini|json|xml|cfg)$/i;
const MAX_LINES = 20000;
const HL = [
  [/\[eden-crash\]/, 'h-crash', '[eden-crash]'],
  [/System Crash/i, 'h-sys', 'System Crash'],
  [/\[crash_guard\]/, 'h-guard', '[crash_guard]'],
  [/\[LOST\]/, 'h-lost', '[LOST]'],
  [/\bERROR\b|\(Error\)/, 'h-error', 'ERROR'],
];

function base(n) { return String(n || '').split(/[\\/]/).pop(); }

function sources(d) {
  const byName = new Map();
  for (const f of d.files || []) if (!/\.dmp$/i.test(f.name || '')) byName.set(base(f.name).toLowerCase(), f);
  const out = [];
  for (const n of ORDER) {
    const key = n.toLowerCase();
    const f = byName.get(key);
    const fb = FALLBACK[key];
    const hasFb = !!fb && d[fb] != null && d[fb] !== '' && !(key === 'crash.json' && byName.has('hang.json'));
    if (f || hasFb) out.push({ name: f ? base(f.name) : n, file: f ? f.name : null, size: f ? f.size : null, fb: hasFb ? fb : null });
    byName.delete(key);
  }
  for (const f of byName.values()) if (TEXT_EXT.test(f.name || '')) out.push({ name: base(f.name), file: f.name, size: f.size, fb: null });
  return out;
}

async function load(d, src, cache) {
  if (cache.has(src.name)) return cache.get(src.name);
  let text = null, note = '';
  if (src.file) {
    try { text = await crFetchText('/' + d.id + '/file/' + encodeURIComponent(src.file)); }
    catch (e) {
      if (!src.fb) throw e;
      note = 'Raw file unavailable (' + (e.message || e) + '): showing the copy stored in the database.';
    }
  }
  if (text == null) {
    const v = d[src.fb];
    text = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    if (!src.file) note = 'Not in the zip: showing the copy stored in the database.';
  }
  if (/\.json$/i.test(src.name)) {
    try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (_) { text = String(text); }
  }
  const r = { text: String(text || ''), note };
  cache.set(src.name, r);
  return r;
}

function debounce(fn, ms) {
  let t = null;
  return () => { clearTimeout(t); t = setTimeout(fn, ms); };
}

function textView(pane, src, res, d) {
  const lines = res.text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const cls = lines.map(l => { for (const [re, c] of HL) if (re.test(l)) return c; return ''; });
  const counts = {};
  cls.forEach((c, i) => { if (c) { counts[c] = counts[c] || { n: 0, first: i }; counts[c].n++; } });
  const search = el('input', { type: 'search', placeholder: 'Search in ' + src.name + '…  (Enter = next, Shift+Enter = previous)' });
  const only = el('input', { type: 'checkbox' });
  const info = el('span', { class: 'crx-dim' });
  const code = el('div', { class: 'crx-code' });
  let hits = [], cur = -1;
  const scrollTo = i => {
    code.querySelectorAll('.crx-ln.cur').forEach(n => n.classList.remove('cur'));
    const row = code.querySelector('[data-i="' + i + '"]');
    if (!row) return;
    row.classList.add('cur');
    code.scrollTop = Math.max(0, row.offsetTop - code.clientHeight / 2);
  };
  const paint = () => {
    const q = search.value;
    const re = q ? new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi') : null;
    const rows = [];
    hits = [];
    let truncated = false;
    for (let i = 0; i < lines.length; i++) {
      if (only.checked && !cls[i]) continue;
      if (rows.length >= MAX_LINES) { truncated = true; break; }
      const line = lines[i];
      let htm = esc(line);
      if (re && line.toLowerCase().indexOf(q.toLowerCase()) >= 0) {
        hits.push(i);
        htm = line.split(re).map((s, j) => (j % 2 ? '<mark>' + esc(s) + '</mark>' : esc(s))).join('');
      }
      rows.push('<div class="crx-ln ' + cls[i] + '" data-i="' + i + '"><em>' + (i + 1) + '</em><span>' + (htm || ' ') + '</span></div>');
    }
    code.innerHTML = rows.join('') || '<div class="crx-ln"><em></em><span>nothing to show</span></div>';
    info.textContent = (q ? hits.length + ' matching line' + (hits.length === 1 ? '' : 's') + ' · ' : '') + lines.length + ' lines'
      + (truncated ? ' · first ' + MAX_LINES + ' shown, download the file for the rest' : '');
    cur = -1;
  };
  const jump = dir => {
    if (!hits.length) return;
    cur = (cur + dir + hits.length) % hits.length;
    scrollTo(hits[cur]);
    info.textContent = 'match ' + (cur + 1) + ' / ' + hits.length;
  };
  search.oninput = debounce(paint, 160);
  search.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); jump(e.shiftKey ? -1 : 1); } };
  only.onchange = paint;
  const legend = el('div', { class: 'crx-hlegend' }, HL.filter(h => counts[h[1]]).map(([, c, label]) =>
    el('span', { class: 'crx-hl ' + c, title: 'Jump to the first ' + label + ' line', onclick: () => { if (only.checked) { only.checked = false; paint(); } scrollTo(counts[c].first); } },
      label + ' × ' + counts[c].n)));
  const bar = el('div', { class: 'crx-vbar' }, search,
    el('button', { class: 'sbtn ghost xs', type: 'button', title: 'Previous match', onclick: () => jump(-1) }, '▲'),
    el('button', { class: 'sbtn ghost xs', type: 'button', title: 'Next match', onclick: () => jump(1) }, '▼'),
    el('label', { class: 'crx-ctl', title: 'Show only the highlighted lines' }, only, 'Highlights only'),
    info,
    src.file ? el('a', { class: 'sbtn ghost xs crx-dlone', href: crFileUrl(d.id, src.file, true), download: '' }, 'Download') : null);
  pane.appendChild(bar);
  if (res.note) pane.appendChild(el('div', { class: 'esub crx-note' }, res.note));
  if (legend.childNodes.length) pane.appendChild(legend);
  pane.appendChild(code);
  paint();
  const first = ['h-crash', 'h-sys'].map(c => counts[c]).find(Boolean);
  if (first) scrollTo(first.first);
}

function unxml(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function attrsOf(s) {
  const o = {};
  String(s).replace(/([A-Za-z_][\w.-]*)="([^"]*)"/g, (_, k, v) => { o[k] = unxml(v); return ''; });
  return o;
}

function hex(v) { const n = parseInt(String(v || '').replace(/^0x/i, ''), 16); return isFinite(n) ? n : NaN; }

function dirOf(p) { const s = String(p || ''); const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/')); return i > 0 ? s.slice(0, i).toLowerCase() : ''; }

function parseXml(text) {
  const er = /<ExceptionRecord\s([^>]*)>/.exec(text);
  const exc = er ? attrsOf(er[1]) : {};
  const raw = [];
  for (const m of text.matchAll(/<Module\s([^>]*)>/g)) raw.push(attrsOf(m[1]));
  const exe = raw.find(m => /\\game_\.exe$/i.test(m.FullPath || ''));
  const gameDir = dirOf(exc.ModuleName || (exe && exe.FullPath));
  const addr = hex(exc.ExceptionAddress);
  const mods = raw.map((m, i) => {
    const path = m.FullPath || '';
    const name = base(path);
    const low = path.toLowerCase();
    const b = hex(m.BaseAddress), sz = hex(m.Size);
    const inGame = !!gameDir && low.startsWith(gameDir + '\\');
    const sys = /\\windows\\/i.test(path);
    const isMod = inGame && /\\mods\\/i.test(path);
    const eden = inGame && !isMod && /^(d3d9|version)\.dll$/i.test(name);
    const site = isFinite(addr) && isFinite(b) && isFinite(sz) && addr >= b && addr < b + sz;
    const loc = sys ? (/\\driverstore\\/i.test(path) ? 'Driver' : 'Windows') : inGame ? (isMod ? 'Mod' : 'Game dir') : 'Other';
    return { i, path, name, base: m.BaseAddress || '', size: sz, ver: m.FileVersion || '', ts: m.TimeStamp || '', loc, eden, isMod, site, off: site ? '0x' + (addr - b).toString(16) : '' };
  });
  return { exc, addr, mods };
}

function xmlView(pane, src, res, d) {
  const x = parseXml(res.text);
  const site = x.mods.find(m => m.site);
  const eden = x.mods.filter(m => m.eden);
  const code = x.exc.ExceptionCode ? crNormCode(x.exc.ExceptionCode) : '';
  const head = el('div', { class: 'crx-xhead' },
    el('div', {}, el('b', {}, 'Exception '), code || '?', ' ', el('span', { class: 'crx-dim' }, x.exc.ExceptionDescription || crExcName(code) || ''),
      ' at ', el('code', {}, x.exc.ExceptionAddress || '?'), ' → ',
      site ? el('b', { class: site.eden ? 'crx-eden' : null }, site.name + '+' + site.off) : el('span', { class: 'crx-dim' }, 'outside every loaded module'),
      site && site.eden ? badge('inside the Eden DLL', 'error') : null, site && site.isMod ? badge('inside a third-party mod', 'warn') : null),
    el('div', {}, el('b', {}, 'Eden DLL: '), eden.length ? eden.map(m => el('span', { class: 'crx-edenpill' }, m.name + ' @' + m.base)) : el('span', { class: 'crx-dim' }, 'not loaded from the game folder (no d3d9.dll / version.dll there)')),
    el('div', { class: 'crx-dim' }, x.mods.length + ' modules · ' + x.mods.filter(m => m.loc === 'Game dir').length + ' from the game folder · '
      + x.mods.filter(m => m.isMod).length + ' mods · ' + x.mods.filter(m => m.loc === 'Driver').length + ' driver'));
  let mode = 'flag';
  const table = el('div', {});
  const draw = () => {
    clear(table);
    const rows = mode === 'all' ? x.mods : mode === 'flag' ? x.mods.filter(m => m.site || m.eden || m.isMod || m.loc === 'Game dir' || m.loc === 'Driver') : x.mods.filter(m => m.loc !== 'Windows');
    table.appendChild(dataTable({
      rows, empty: 'No module listed',
      rowClass: m => (m.site ? 'crx-mod-site' : '') + (m.eden ? ' crx-mod-eden' : ''),
      columns: [
        { key: 'name', label: 'Module', render: m => el('span', { class: 'crx-modname' }, el('b', {}, m.name), m.site ? badge('crash site', 'error') : null, m.eden ? badge('Eden DLL', 'info') : null, m.isMod ? badge('mod', 'warn') : null) },
        { key: 'base', label: 'Base', class: 'crx-mono', render: m => m.base },
        { key: 'size', label: 'Size', align: 'right', class: 'crx-nowrap', render: m => (isFinite(m.size) ? fmtBytes(m.size) : '?') },
        { key: 'ver', label: 'Version', class: 'crx-mono', render: m => m.ver },
        { key: 'loc', label: 'Where', class: 'crx-nowrap', render: m => m.loc },
        { key: 'path', label: 'Path', render: m => el('small', { class: 'crx-dim crx-path', title: m.ts ? 'timestamp ' + m.ts : null }, m.path) },
      ],
    }));
  };
  const chips = el('div', { class: 'crx-ftabs' }, [['flag', 'Flagged + game folder'], ['nonsys', 'Not Windows'], ['all', 'All modules'], ['raw', 'Raw XML']].map(([k, l]) => {
    const b = el('button', { type: 'button', class: 'crx-ftab' + (k === mode ? ' on' : '') }, l);
    b.onclick = () => {
      chips.querySelectorAll('.crx-ftab').forEach(n => n.classList.toggle('on', n === b));
      clear(body);
      if (k === 'raw') { textView(body, src, res, d); return; }
      mode = k;
      body.appendChild(head);
      body.appendChild(table);
      draw();
    };
    return b;
  }));
  const body = el('div', {});
  pane.appendChild(chips);
  pane.appendChild(body);
  body.appendChild(head);
  body.appendChild(table);
  draw();
}

export function renderViewer(host, d) {
  const list = sources(d);
  clear(host);
  if (!list.length) { host.appendChild(el('div', { class: 'esub' }, 'No readable file in this report.')); return; }
  const cache = new Map();
  const tabs = el('div', { class: 'crx-ftabs crx-ftabs-main' });
  const pane = el('div', { class: 'crx-fpane' });
  const show = async src => {
    tabs.querySelectorAll('.crx-ftab').forEach(n => n.classList.toggle('on', n.dataset.n === src.name));
    clear(pane);
    pane.appendChild(el('div', { class: 'empty crx-loading' }, 'Loading ' + src.name + '…'));
    let res;
    try { res = await load(d, src, cache); }
    catch (e) { clear(pane); pane.appendChild(errorState({ error: e, title: src.name + ' unavailable', onRetry: () => show(src) })); return; }
    clear(pane);
    if (/\.xml$/i.test(src.name)) xmlView(pane, src, res, d);
    else textView(pane, src, res, d);
  };
  for (const src of list) {
    const b = el('button', { type: 'button', class: 'crx-ftab', dataset: { n: src.name }, title: src.file ? 'From the report zip' : 'Copy stored in the database' },
      src.name, src.size != null ? el('small', {}, ' ' + fmtBytes(src.size)) : null);
    b.onclick = () => show(src);
    tabs.appendChild(b);
  }
  host.appendChild(tabs);
  host.appendChild(pane);
  show(list[0]);
}
