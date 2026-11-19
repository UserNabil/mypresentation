import { lineIcon } from '/studio/js/ui/line_icons.js';

const MAX_CARD = 148;
const RING_PAD = 14;

export function createView(ctx, onFlip) {
  const root = document.createElement('div');
  root.className = 'mg-br-grid';
  root.setAttribute('role', 'grid');
  let buttons = [];
  let board = null;
  let cols = 1;
  let rows = 1;
  let focusIdx = 0;
  let size = 96;

  function name(c) {
    const e = ctx.roster.byKey[c.key];
    return e ? e.name : c.key;
  }

  function label(c, i) {
    const pos = 'row ' + (Math.floor(i / cols) + 1) + ', column ' + ((i % cols) + 1);
    if (c.found) return name(c) + ', found, ' + pos;
    if (c.up) return name(c) + ', ' + pos;
    return 'Hidden card, ' + pos;
  }

  function update(i) {
    const c = board.cards[i];
    const b = buttons[i];
    if (!c || !b) return;
    b.classList.toggle('is-up', c.up && !c.found);
    b.classList.toggle('is-found', c.found);
    b.classList.toggle('is-wrong', board.wrong.includes(i));
    b.setAttribute('aria-label', label(c, i));
    b.setAttribute('aria-disabled', c.found ? 'true' : 'false');
  }

  function updateAll(list) {
    for (const i of list || []) update(i);
  }

  function layout() {
    const { w, h } = ctx.size();
    if (!w || !h) return;
    const gap = Math.max(8, Math.min(14, Math.round(Math.min(w, h) / 48)));
    const room = 2 * RING_PAD;
    size = Math.floor(Math.min((w - room - gap * (cols - 1)) / cols, (h - room - gap * (rows - 1)) / rows, MAX_CARD));
    root.style.setProperty('--mg-br-size', size + 'px');
    root.style.setProperty('--mg-br-gap', gap + 'px');
    root.style.setProperty('--mg-br-cols', String(cols));
    const art = Math.round(size * 0.66);
    for (const el of root.querySelectorAll('.mg-art')) el.style.setProperty('--mg-art', art + 'px');
  }

  function card(c, i) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mg-br-card';
    b.tabIndex = i === focusIdx ? 0 : -1;
    b.dataset.i = String(i);
    b.setAttribute('role', 'gridcell');
    const flip = document.createElement('span');
    flip.className = 'mg-br-flip';
    const back = document.createElement('span');
    back.className = 'mg-br-back';
    back.setAttribute('aria-hidden', 'true');
    back.innerHTML = '<span class="mg-br-mark">' + lineIcon('paw-print', 28) + '</span>';
    const face = document.createElement('span');
    face.className = 'mg-br-face';
    face.setAttribute('aria-hidden', 'true');
    face.appendChild(ctx.iconEl(ctx.roster.byKey[c.key], Math.round(size * 0.66)));
    const check = document.createElement('span');
    check.className = 'mg-br-check';
    check.innerHTML = lineIcon('circle-check', 18);
    face.appendChild(check);
    flip.append(back, face);
    b.appendChild(flip);
    b.addEventListener('click', () => {
      setFocus(i, false);
      onFlip(i);
    });
    return b;
  }

  function build(next) {
    board = next;
    cols = board.spec.cols;
    rows = board.spec.rows;
    focusIdx = 0;
    root.replaceChildren();
    root.classList.remove('is-peek');
    buttons = [];
    for (let r = 0; r < rows; r++) {
      const row = document.createElement('div');
      row.className = 'mg-br-row';
      row.setAttribute('role', 'row');
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const b = card(board.cards[i], i);
        buttons.push(b);
        row.appendChild(b);
      }
      root.appendChild(row);
    }
    if (root.parentNode !== ctx.board) ctx.board.replaceChildren(root);
    layout();
    updateAll(board.cards.map(c => c.i));
  }

  function setFocus(i, move = true) {
    if (!buttons[i]) return;
    if (buttons[focusIdx]) buttons[focusIdx].tabIndex = -1;
    focusIdx = i;
    buttons[i].tabIndex = 0;
    if (move) buttons[i].focus({ preventScroll: true });
  }

  function move(dx, dy) {
    const r = Math.floor(focusIdx / cols);
    const c = focusIdx % cols;
    const nr = Math.min(rows - 1, Math.max(0, r + dy));
    const nc = Math.min(cols - 1, Math.max(0, c + dx));
    setFocus(nr * cols + nc);
  }

  return {
    build,
    layout,
    update,
    updateAll,
    move,
    focusCurrent() { setFocus(focusIdx); },
    focusEdge(end) { setFocus(end ? buttons.length - 1 : 0); },
    focusedIndex() {
      const a = document.activeElement;
      const i = buttons.indexOf(a);
      return i;
    },
    setPeek(on) { root.classList.toggle('is-peek', !!on); },
    pulse(list, cls) {
      for (const i of list) {
        const b = buttons[i];
        if (!b) continue;
        b.classList.remove(cls);
        void b.offsetWidth;
        b.classList.add(cls);
      }
    },
    size: () => size,
    clear() { root.replaceChildren(); buttons = []; }
  };
}
