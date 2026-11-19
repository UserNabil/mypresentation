const memory = new Map();
let prefix = '';

const localBackend = {
  read(name) {
    const key = prefix + name;
    if (memory.has(key)) return memory.get(key);
    try {
      const raw = globalThis.localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return memory.has(key) ? memory.get(key) : null;
    }
  },
  write(name, value) {
    const key = prefix + name;
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(value));
      memory.delete(key);
      return true;
    } catch {
      memory.set(key, value);
      return false;
    }
  }
};

let io = localBackend;

export function useBackend(backend) {
  io = backend && typeof backend.read === 'function' && typeof backend.write === 'function' ? backend : localBackend;
}

export function useNamespace(ns) {
  prefix = ns ? 'u.' + encodeURIComponent(String(ns)) + '.' : '';
}

export function write(key, value) {
  return io.write(key, value);
}

export function best(id) {
  const v = io.read('mg.best.' + id);
  return v && typeof v === 'object' ? v : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mergeValue(prev, value, mode) {
  if (prev == null || !Number.isFinite(Number(prev))) return value;
  if (mode === 'min') return Math.min(num(prev), num(value));
  if (mode === 'sum') return num(prev) + num(value);
  if (mode === 'last') return value;
  return Math.max(num(prev), num(value));
}

export function record(id, result = {}) {
  const prev = best(id) || {};
  const score = num(result.score);
  const next = {
    ...prev,
    score: Math.max(num(prev.score), score),
    level: Math.max(num(prev.level), num(result.level)),
    runs: num(prev.runs) + 1,
    clears: num(prev.clears) + num(result.clears),
    at: Date.now()
  };
  const extra = result.extra || {};
  const merge = result.merge || {};
  for (const k of Object.keys(extra)) {
    if (extra[k] == null || k in { score: 1, level: 1, runs: 1, clears: 1, at: 1 }) continue;
    next[k] = mergeValue(prev[k], extra[k], merge[k] || 'max');
  }
  const isBest = score > 0 && score > num(prev.score);
  io.write('mg.best.' + id, next);
  return { best: next, isBest, previous: prev };
}

export function pref(id) {
  const key = 'mg.pref.' + id;
  return {
    get(k, def) {
      const all = io.read(key);
      return all && typeof all === 'object' && k in all ? all[k] : def;
    },
    set(k, v) {
      const all = io.read(key);
      const next = all && typeof all === 'object' ? { ...all } : {};
      next[k] = v;
      return io.write(key, next);
    }
  };
}
