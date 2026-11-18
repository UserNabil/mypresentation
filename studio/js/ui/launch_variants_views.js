const ICON = { ok: 'check_green', warn: 'warning', block: 'error' };
const ENV_ICON = { dev: 'env_dev', preprod: 'env_preprod', prod: 'env_prod' };

function sums(st) {
  const cs = st.checks || [];
  return { block: cs.some(c => c.state === 'block'), warn: cs.some(c => c.state === 'warn') };
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function img(name, size, cls) {
  return '<img class="' + (cls == null ? 'lv-ic' : cls) + '" src="/studio/icons/icons/' + size + '/' + name + '.png" alt="" draggable="false">';
}

function withText(node, text) {
  const t = el('span');
  t.textContent = text;
  node.appendChild(t);
  return node;
}

function fixBtn(c, api) {
  if (!c.fix) return null;
  const b = el('button', 'lv-fix');
  b.type = 'button';
  b.textContent = c.fix.label || 'Fix';
  b.disabled = api.busy;
  b.onclick = () => api.fix(c);
  return b;
}

function playBtn(st, api) {
  const b = el('button', 'lv-play', img('launch_game', 64, '') + '<span>Play</span>');
  b.type = 'button';
  b.disabled = sums(st).block || api.busy;
  b.onclick = () => api.play();
  return b;
}

function noteLine(st, api) {
  const s = sums(st);
  const n = el('div', 'lv-note ' + (s.block ? 'block' : s.warn ? 'warn' : 'ok'));
  n.textContent = api.busy ? 'Checking…' : s.block ? 'Fix the red item to play' : s.warn ? 'Something is not perfect, you can still play' : '';
  return n;
}

function envChips(api, big) {
  const w = el('div', 'lv-env' + (big ? ' big' : ''));
  for (const e of api.envs) {
    const b = el('button', e === api.env ? 'on' : '', img(ENV_ICON[e] || 'env_dev', big ? 128 : 48, ''));
    withText(b, e);
    b.type = 'button';
    b.setAttribute('aria-pressed', e === api.env ? 'true' : 'false');
    b.onclick = () => api.setEnv(e);
    w.appendChild(b);
  }
  return w;
}

function stepper(api) {
  const w = el('div', 'lv-count');
  w.title = 'Clients to open';
  const val = el('span', 'lv-cn');
  const sel = () => document.querySelector('#lm-count');
  const cur = () => Number(sel().value) || 1;
  const set = n => { sel().value = String(Math.min(6, Math.max(1, n))); val.textContent = sel().value; };
  const mk = (t, d, label) => {
    const b = el('button', '', t);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.onclick = () => set(cur() + d);
    return b;
  };
  val.textContent = String(cur());
  w.append(el('span', 'lv-cl', 'Clients'), mk('−', -1, 'Fewer clients'), val, mk('+', 1, 'More clients'));
  return w;
}

function playRow(st, api) {
  const r = el('div', 'lv-playrow');
  r.append(stepper(api), playBtn(st, api));
  return r;
}

function view3(st, api) {
  const w = el('div', 'lv-s3');
  w.appendChild(envChips(api, true));
  const bad = st.checks.filter(c => c.state !== 'ok');
  const line = el('div', 'lv-line');
  if (!bad.length) withText(line, 'Ready').insertAdjacentHTML('afterbegin', img('check_green', 64));
  for (const c of bad) {
    const part = withText(el('span', 'lv-part', img(ICON[c.state], 64)), c.label);
    const f = fixBtn(c, api);
    if (f) part.appendChild(f);
    line.appendChild(part);
  }
  w.append(line, playRow(st, api), noteLine(st, api));
  return w;
}

export const VIEW = view3;
