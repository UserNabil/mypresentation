import { toggleTheme, setTheme, modernOn, currentTheme } from './modern_gate.js';
import { lineIcon, lineSvg, lineEl, imgLine, lineDataUrl, lineMaskUrl } from './line_icons.js';
import { avatarHtml, featureFileLine, tileHtml } from './line_assets.js';
import { beeHtml, beeLoaderHtml } from './bee.js';
import { initTour } from './tour.js';
import { loadCrests, crestOf } from '../nav/crest.js';

const ROLE = { GS: 'Game Sage', CM: 'Community Manager', GM: 'Game Master', SA: 'Super Admin' };
const SWAP = 'img[src*="/studio/icons/"], img[src^="/api/features/icon/"]';
const KEEP = '.ic, .ph, .awslot, .lootslot, .ricon, .iconportrait, .gameicon, .skillicon, .ibcell, .ac-ic, .cc-icobox, .cdclassicon, .crest-img, [data-iid], [data-openitem], [data-openmon], [data-opennpc]';
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let CTX = null;
let MO = null;
let queue = [];
let raf = 0;

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function inkColor(tone) {
  const cs = getComputedStyle(document.documentElement);
  const v = cs.getPropertyValue(tone ? '--ui-' + (tone === 'off' ? 'faint' : tone) : '--ui-ink').trim();
  return v || (currentTheme() === 'dark' ? '#F4F4F5' : '#111214');
}

function paintIsland(img) {
  if (img.dataset.lxLine) return;
  const url = lineDataUrl(img.dataset.lxName, inkColor(img.dataset.lxTone));
  if (url && img.getAttribute('src') !== url) img.setAttribute('src', url);
}

function islandSwap(img, m) {
  img.dataset.lxSrc = img.getAttribute('src') || '';
  img.dataset.lxSet = img.getAttribute('srcset') || '';
  img.dataset.lxName = m.n;
  img.dataset.lxTone = m.tone || '';
  img.removeAttribute('srcset');
  const mk = lineMaskUrl(m.n);
  if (mk) {
    img.dataset.lxLine = '1';
    img.setAttribute('src', BLANK);
    img.classList.add('li');
    if (m.tone) img.classList.add('lx-' + m.tone);
    img.style.setProperty('--li', mk);
    return;
  }
  paintIsland(img);
}

function restoreIslands() {
  document.querySelectorAll('img[data-lx-src]').forEach(img => {
    if (img.dataset.lxLine) {
      img.classList.remove('li', 'lx-ok', 'lx-bad', 'lx-warn', 'lx-info', 'lx-off');
      img.style.removeProperty('--li');
    }
    img.setAttribute('src', img.dataset.lxSrc);
    if (img.dataset.lxSet) img.setAttribute('srcset', img.dataset.lxSet);
    ['lx', 'lxSrc', 'lxSet', 'lxName', 'lxTone', 'lxLine'].forEach(k => delete img.dataset[k]);
  });
}

function swapFeature(img, ln) {
  if (img.closest('.fmr-root')) return false;
  const px = Math.round(img.getBoundingClientRect().width) || +img.getAttribute('width') || 32;
  const size = Math.max(24, Math.min(96, px));
  const t = el(tileHtml(ln, size, 0.55, 'lx-sw'));
  if (img.className && typeof img.className === 'string') t.className += ' ' + img.className.replace(/ui-icon/g, '');
  img.dataset.lx = '1';
  img.before(t);
  return true;
}

function swapOne(img) {
  if (img.dataset.lx || /^data:/.test(img.getAttribute('src') || '')) return;
  if (img.closest(KEEP)) { img.dataset.lx = '0'; return; }
  const fl = featureFileLine(img.getAttribute('src'));
  if (fl && swapFeature(img, fl)) return;
  const rb = img.closest('.gmv-rb');
  const m = imgLine(img.getAttribute('src'), rb ? rb.getAttribute('title') || rb.textContent.trim() : '');
  const n = m.n;
  if (n && img.closest('.fmr-root')) { islandSwap(img, m); return; }
  img.dataset.lx = n ? '1' : '0';
  if (!n) return;
  const w0 = +img.getAttribute('width') || 20;
  const w = w0 <= 20 ? 20 : (w0 <= 48 ? 24 : 32);
  const svg = lineEl(n, w, 'lx-sw' + (m.tone ? ' lx-' + m.tone : ''));
  if (!svg) return;
  if (img.className && typeof img.className === 'string') svg.setAttribute('class', svg.getAttribute('class') + ' ' + img.className.replace(/ui-icon/g, ''));
  img.before(svg);
}

function closeTop() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function addClose(root) {
  const sheets = root.matches('.modal > .sheet') ? [root] : [...root.querySelectorAll('.modal > .sheet')];
  sheets.forEach(s => {
    if (s.querySelector(':scope > .mx-x') || !s.querySelector(':scope > h2')) return;
    const b = el('<button type="button" class="mx-x mx-only" title="Close" aria-label="Close">' + lineIcon('close', 18) + '</button>');
    b.onclick = closeTop;
    s.prepend(b);
  });
}

function addLoader(root) {
  const hosts = root.matches('.fmloadhero') ? [root] : [...root.querySelectorAll('.fmloadhero')];
  hosts.forEach(h => {
    if (h.querySelector(':scope > .mx-loader')) return;
    h.prepend(el('<div class="mx-loader mx-only">' + beeLoaderHtml({ size: 120 }) + '</div>'));
  });
}

function brand() {
  const sig = document.querySelector('header .crest .sigil');
  if (sig && !sig.querySelector('.mx-bee')) {
    sig.appendChild(el('<span class="mx-bee mx-only">' + beeHtml({ size: 40, flying: false }) + '</span>'));
    const crest = sig.closest('.crest');
    const fly = on => { const b = sig.querySelector('.mx-bee .bee'); if (b) b.classList.toggle('is-flying', on); };
    crest.addEventListener('mouseenter', () => fly(true));
    crest.addEventListener('mouseleave', () => fly(false));
  }
  document.querySelectorAll('.eden-splash').forEach(sp => {
    if (sp.querySelector(':scope > .mx-loader')) return;
    sp.prepend(el('<div class="mx-loader mx-only">' + beeLoaderHtml({ size: 120 }) + '</div>'));
  });
}

function swapIn(root) {
  if (!root || root.nodeType !== 1) return;
  addLoader(root);
  if (root.matches(SWAP)) swapOne(root);
  root.querySelectorAll(SWAP).forEach(swapOne);
  addClose(root);
}

function flush() {
  raf = 0;
  const q = queue;
  queue = [];
  q.forEach(swapIn);
}

function watch(on) {
  if (!on) { if (MO) MO.disconnect(); MO = null; restoreIslands(); return; }
  swapIn(document.body);
  if (MO || !window.MutationObserver) return;
  MO = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'attributes') {
        const t = m.target;
        if (t.tagName !== 'IMG' || /^data:/.test(t.getAttribute('src') || '')) continue;
        const prev = t.previousElementSibling;
        if (prev && prev.classList.contains('lx-sw')) prev.remove();
        ['lx', 'lxSrc', 'lxSet', 'lxName', 'lxTone', 'lxLine'].forEach(k => delete t.dataset[k]);
        queue.push(t);
        continue;
      }
      for (const n of m.addedNodes) if (n.nodeType === 1) queue.push(n);
    }
    if (queue.length && !raf) raf = requestAnimationFrame(flush);
  });
  MO.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
}

function can(p) {
  try { return !CTX || !CTX.can || !!CTX.can(p); } catch (e) { return false; }
}

function paintTheme() {
  const b = document.getElementById('mx-theme');
  if (!b) return;
  const dark = currentTheme() === 'dark';
  b.innerHTML = lineSvg(dark ? 'sun' : 'moon', 20);
  b.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  b.setAttribute('aria-label', b.title);
}

function paintModern() {
  const on = modernOn();
  const sw = document.getElementById('mx-modern');
  if (sw) sw.checked = on;
  const mi = document.getElementById('mx-modern-mi');
  if (mi) mi.innerHTML = (on ? lineSvg('check', 18) : '<span class="mx-mi-pad"></span>') + ' Modern UI (preview)';
}

async function paintUser() {
  let me = (CTX && CTX.ME) || null;
  try {
    const r = await fetch('/api/app-context', { credentials: 'same-origin' });
    if (r.ok) me = await r.json();
  } catch (e) { me = me || null; }
  const name = (me && me.username) || '';
  const box = document.getElementById('mx-user');
  if (!box) return;
  const av = box.querySelector('.mx-av');
  const paintAv = () => {
    const c = crestOf(name);
    av.innerHTML = avatarHtml({ size: 40, crest: c && c.crest, role: me && me.role, account: name, title: c && c.character ? name + ' — ' + c.character : name });
  };
  const sm = document.getElementById('settings-me');
  const paintMe = () => {
    if (!sm || !name || !modernOn()) return;
    const c = crestOf(name);
    sm.innerHTML = avatarHtml({ size: 42, crest: c && c.crest, role: me && me.role, account: name, title: name });
    sm.append(' ' + name);
  };
  paintAv();
  paintMe();
  if (name) loadCrests([name]).then(() => { paintAv(); paintMe(); }).catch(() => {});
  box.querySelector('.mx-un').textContent = name || 'Signed out';
  box.querySelector('.mx-ur').textContent = (me && ROLE[me.role]) || (me && me.role) || '';
  const env = document.getElementById('env-name');
  const pill = document.getElementById('mx-env');
  if (pill) pill.textContent = ((me && me.active_env) || (env && env.textContent) || 'dev').toUpperCase();
}

function buildTop() {
  const bar = document.querySelector('header .hactions');
  if (!bar || document.getElementById('mx-top')) return;
  const box = el(`<div class="mx-top mx-only" id="mx-top">
    <span class="mx-sep"></span>
    <button type="button" class="mx-ibtn" id="mx-theme"></button>
    <span class="mx-sep"></span>
    <button type="button" class="mx-user" id="mx-user" title="Account and settings"><span class="mx-av"></span><span class="mx-ut"><b class="mx-un"></b><i class="mx-ur"></i></span>${lineSvg('chevron-down', 16)}</button>
    <button type="button" class="mx-launch" id="mx-launch">${lineSvg('play', 18)}<span>Launch game</span></button>
  </div>`);
  bar.appendChild(box);
  const search = document.querySelector('header .searchbox');
  if (search && !search.querySelector('.mx-kbd')) search.appendChild(el('<kbd class="mx-kbd mx-only" title="Ctrl+K or ⌘K">⌘K</kbd>'));
  const status = document.getElementById('status');
  if (status && !document.getElementById('mx-env')) status.prepend(el('<button type="button" class="mx-env mx-only" id="mx-env" title="Environment">DEV</button>'));
  document.getElementById('mx-env').onclick = ev => {
    ev.stopPropagation();
    const b = document.getElementById('env-badge');
    if (b) b.click();
  };
  document.getElementById('mx-theme').onclick = smoothToggle;
  document.getElementById('mx-user').onclick = ev => {
    ev.stopPropagation();
    const t = document.querySelector('#dd-settings .hdrop-t');
    if (t) t.click();
  };
  const launch = document.getElementById('mx-launch');
  launch.hidden = !can('launch');
  launch.onclick = () => {
    const b = document.getElementById('btn-launch');
    if (b) b.click();
  };
}

function smoothToggle() {
  const root = document.documentElement;
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || !document.startViewTransition) { toggleTheme(); return; }
  root.classList.add('mx-vt');
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  const vt = document.startViewTransition(() => setTheme(next));
  vt.finished.finally(() => root.classList.remove('mx-vt'));
}

function onKey(e) {
  if (!modernOn() || !(e.ctrlKey || e.metaKey) || e.altKey || String(e.key).toLowerCase() !== 'k') return;
  const q = document.getElementById('q');
  if (!q) return;
  e.preventDefault();
  q.focus();
  q.select();
}

export function initModernShell(ctx, preview) {
  CTX = ctx || null;
  if (!preview) return;
  buildTop();
  brand();
  paintTheme();
  paintModern();
  paintUser();
  watch(modernOn());
  initTour(CTX);
  if (modernOn()) window.dispatchEvent(new CustomEvent('ui-modern', { detail: true }));
  window.addEventListener('ui-theme', () => { paintTheme(); document.querySelectorAll('img[data-lx-name]').forEach(paintIsland); });
  window.addEventListener('ui-modern', () => { paintModern(); watch(modernOn()); if (modernOn()) paintUser(); });
  document.addEventListener('keydown', onKey);
}
