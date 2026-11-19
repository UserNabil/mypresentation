import { lineIcon } from '/studio/js/ui/line_icons.js';

export function fmt(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : String(v ?? '');
}

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

export function linesEl(lines, cls = 'mg-lines') {
  const dl = node('dl', cls);
  for (const row of lines || []) {
    const [label, value, tone] = row;
    const item = node('div', tone ? 'is-' + tone : '');
    item.append(node('dt', '', label), node('dd', '', fmt(value)));
    dl.appendChild(item);
  }
  return dl;
}

export function createOverlay(el, onShow) {
  let pending = null;
  let primaryBtn = null;

  function settle(value) {
    const fn = pending;
    pending = null;
    if (fn) fn(value);
  }

  function build(spec) {
    const card = node('div', 'mg-card' + (spec.wide ? ' is-wide' : ''));
    card.setAttribute('role', 'group');
    card.setAttribute('aria-labelledby', 'mg-ov-title');
    const ic = node('span', 'li-tile mg-card-ic' + (spec.tone ? ' is-' + spec.tone : ''));
    ic.innerHTML = lineIcon(spec.icon || 'sparkles', 26);
    const title = node('h3', 'mg-card-title', spec.title || '');
    title.id = 'mg-ov-title';
    card.append(ic, title);
    if (spec.badge) card.appendChild(node('span', 'mg-badge', spec.badge));
    if (spec.sub) card.appendChild(node('p', 'mg-card-sub', spec.sub));
    if (spec.rules && spec.rules.length) {
      const ul = node('ul', 'mg-rules');
      for (const r of spec.rules) ul.appendChild(node('li', '', r));
      card.appendChild(ul);
    }
    if (spec.body) card.appendChild(spec.body);
    if (spec.lines && spec.lines.length) card.appendChild(linesEl(spec.lines));
    if (spec.foot) card.appendChild(node('p', 'mg-card-note', spec.foot));
    const acts = node('div', 'mg-card-actions');
    primaryBtn = null;
    for (const a of spec.actions || []) {
      const b = node('button', 'sbtn' + (a.primary ? '' : ' ghost'));
      b.type = 'button';
      b.dataset.act = a.id;
      if (a.icon) b.insertAdjacentHTML('afterbegin', lineIcon(a.icon, 18));
      b.appendChild(node('span', '', a.label));
      b.addEventListener('click', () => settle(a.id));
      if (a.primary) primaryBtn = b;
      acts.appendChild(b);
    }
    card.appendChild(acts);
    return card;
  }

  return {
    show(spec) {
      settle('replaced');
      el.replaceChildren(build(spec));
      el.dataset.screen = spec.kind || '';
      el.hidden = false;
      if (onShow) onShow(spec);
      const target = primaryBtn || el.querySelector('button');
      if (target) target.focus({ preventScroll: true });
      return new Promise(resolve => { pending = resolve; });
    },
    hide() {
      settle('dismissed');
      el.hidden = true;
      el.dataset.screen = '';
      el.replaceChildren();
      primaryBtn = null;
    },
    visible() { return !el.hidden; },
    screen() { return el.hidden ? '' : el.dataset.screen || ''; },
    primary() { return primaryBtn; },
    cancel(value) { settle(value); }
  };
}
