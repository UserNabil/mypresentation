import { lineIcon } from '/studio/js/ui/line_icons.js';

const BASE = new URL('../', import.meta.url);
const TONE_ICON = { info: 'sparkles', ok: 'circle-check', warn: 'hourglass', bad: 'circle-x' };

export function node(tag, cls, attrs) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}

export function ensureCss(href) {
  const url = new URL(href, BASE).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === url)) return Promise.resolve();
  return new Promise(resolve => {
    const link = node('link', '', { rel: 'stylesheet', href: url });
    link.addEventListener('load', resolve);
    link.addEventListener('error', resolve);
    document.head.appendChild(link);
  });
}

export function buildFrame(game) {
  const scrim = node('div', 'mg-scrim');
  const dialog = node('section', 'mg-dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mg-title' });
  dialog.dataset.game = game.id;
  const head = node('div', 'mg-head');
  const ic = node('span', 'li-tile mg-head-ic');
  ic.innerHTML = lineIcon(game.icon || 'sparkles', 22);
  const titles = node('div', 'mg-head-t');
  const h2 = node('h2', 'mg-title', { id: 'mg-title' });
  h2.textContent = game.name;
  const chip = node('span', 'mg-chip');
  titles.append(h2, chip);
  const statsBox = node('div', 'mg-stats');
  const statEls = {};
  for (const st of game.stats || []) {
    const box = node('div', 'mg-stat');
    const v = node('b', 'mg-stat-v');
    const l = node('span', 'mg-stat-l');
    l.textContent = st.label;
    box.append(v, l);
    statEls[st.id] = v;
    statsBox.appendChild(box);
  }
  const timerEl = node('div', 'mg-timer', { role: 'timer', 'aria-label': 'Time' });
  timerEl.innerHTML = lineIcon('hourglass', 16);
  const timerText = node('span', 'mg-timer-t');
  timerEl.appendChild(timerText);
  const pauseBtn = node('button', 'mg-ibtn', { type: 'button', 'aria-label': 'Pause' });
  const closeBtn = node('button', 'mx-x mg-x', { type: 'button', 'aria-label': 'Close' });
  closeBtn.innerHTML = lineIcon('x', 18);
  head.append(ic, titles, statsBox, timerEl, pauseBtn, closeBtn);

  const body = node('div', 'mg-body');
  const board = node('div', 'mg-board', { tabindex: '0', 'aria-label': game.name + ' board' });
  const overlayEl = node('div', 'mg-overlay');
  overlayEl.hidden = true;
  const toast = node('div', 'mg-toast', { role: 'status' });
  const sr = node('div', 'mg-sr', { 'aria-live': 'polite' });
  body.append(board, overlayEl, toast);

  const foot = node('div', 'mg-foot');
  const helpBox = node('div', 'mg-helpers');
  const helperEls = {};
  for (const h of game.helpers || []) {
    const b = node('button', 'sbtn ghost mg-help', { type: 'button' });
    b.dataset.helper = h.id;
    b.innerHTML = lineIcon(h.icon || 'sparkles', 18);
    const label = node('span', 'mg-help-l');
    label.textContent = h.label;
    b.appendChild(label);
    if (h.key) {
      const k = node('kbd');
      k.textContent = h.key.toUpperCase();
      b.appendChild(k);
    }
    const count = node('span', 'mg-count');
    b.appendChild(count);
    helperEls[h.id] = { b, count, label: h.label };
    helpBox.appendChild(b);
  }
  const keys = node('p', 'mg-keys');
  keys.textContent = game.keys || '';
  const restartBtn = node('button', 'sbtn ghost mg-restart', { type: 'button' });
  restartBtn.innerHTML = lineIcon('rotate-ccw', 18) + '<span>Restart</span>';
  foot.append(helpBox, keys, restartBtn);
  dialog.append(head, body, foot, sr);
  scrim.appendChild(dialog);
  return {
    scrim, dialog, chip, statEls, timerEl, timerText, pauseBtn, closeBtn, body, board, overlayEl, toast, sr,
    helperEls, restartBtn
  };
}

export function toastIcon(tone) {
  return lineIcon(TONE_ICON[tone] || 'sparkles', 18);
}
