const stack = [];
const subs = new Set();
let off = false;

function prune() {
  for (let i = stack.length - 1; i >= 0; i--) {
    const a = stack[i].alive;
    if (a && !a()) stack.splice(i, 1);
  }
}

function active() {
  prune();
  return off || !stack.length ? null : stack[stack.length - 1];
}

function emit() {
  subs.forEach(fn => { try { fn(active()); } catch (e) {} });
}

function register(spec) {
  const entry = { key: spec.key, label: spec.label, placeholder: spec.placeholder, onQuery: spec.onQuery, onKey: spec.onKey, alive: spec.alive };
  const i = stack.findIndex(s => s.key === entry.key);
  if (i >= 0) stack.splice(i, 1);
  stack.push(entry);
  off = false;
  if (entry.alive) watch();
  emit();
  return () => {
    const j = stack.indexOf(entry);
    if (j >= 0) stack.splice(j, 1);
    off = false;
    emit();
  };
}

function setOff(v) {
  off = !!v;
  emit();
}

function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

let watching = false;

function watch() {
  if (watching) return;
  const host = document.getElementById('content');
  if (!host) return;
  watching = true;
  let t = 0;
  new MutationObserver(() => {
    if (t) return;
    t = requestAnimationFrame(() => {
      t = 0;
      const n = stack.length;
      prune();
      if (stack.length !== n) emit();
    });
  }).observe(host, { childList: true, subtree: true });
}

function bindInput(spec, input) {
  const wrap = input.closest('label, .clsfind') || input;
  wrap.classList.add('sc-owned');
  watch();
  const cur = stack.find(e => e.key === spec.key);
  if (cur && cur.label === spec.label && !off) {
    cur.onQuery = spec.onQuery;
    cur.onKey = spec.onKey;
    cur.alive = () => input.isConnected;
    return () => {};
  }
  const r = register({ ...spec, alive: () => input.isConnected });
  if (document.documentElement.dataset.ui === 'modern' && input.value !== '') {
    input.value = '';
    spec.onQuery('');
  }
  return r;
}

export const searchScope = { register, bindInput, subscribe, active, setOff };
window.edenSearchScope = searchScope;
