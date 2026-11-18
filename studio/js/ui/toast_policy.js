export const MAX_VISIBLE = 3;
export const MERGE_MS = 30000;
export const TITLE_MAX = 80;
export const MORE_MS = 20000;
export const DURATIONS = { ok: 3000, info: 4000, warn: 8000, error: 0 };

const ALIAS = {
  ok: 'ok', success: 'ok', done: 'ok',
  warn: 'warn', warning: 'warn',
  error: 'error', err: 'error', fail: 'error', failed: 'error', danger: 'error',
  info: 'info', live: 'info', message: 'info',
};

export function normType(t) {
  return ALIAS[String(t == null ? '' : t).toLowerCase()] || 'info';
}

export function normOpts(opts) {
  if (typeof opts === 'number') return { duration: opts };
  return opts && typeof opts === 'object' ? opts : {};
}

export function duration(type, opts) {
  const o = normOpts(opts);
  if (o.sticky || o.progress) return 0;
  if (o.duration > 0) return o.duration;
  return DURATIONS[normType(type)];
}

export function clean(msg) {
  return String(msg == null ? '' : msg)
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/^\s*[✔✗ℹ⚠]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitMessage(text, details) {
  const t = clean(text);
  const d = details == null || details === '' ? '' : String(details).trim();
  if (t.length <= TITLE_MAX) return { title: t, details: d };
  let cut = t.lastIndexOf(' ', TITLE_MAX - 1);
  if (cut < TITLE_MAX * 0.5) cut = TITLE_MAX - 1;
  return { title: t.slice(0, cut).replace(/[\s,;:.\-]+$/, '') + '…', details: d ? t + '\n' + d : t };
}

export function plan(stack, entry, now) {
  if (!entry.progress) {
    for (let i = 0; i < stack.length; i++) {
      const e = stack[i];
      if (e.closed || e.progress || e.type !== entry.type || e.text !== entry.text) continue;
      if (e.sticky || now - e.last <= MERGE_MS) return { kind: 'merge', index: i };
    }
  }
  if (entry.progress) return { kind: 'add' };
  const live = stack.filter((e) => !e.closed && !e.progress).length;
  return live >= MAX_VISIBLE ? { kind: 'overflow' } : { kind: 'add' };
}

export function moreLabel(n) {
  return '+' + n + ' more in the bell';
}

export function countLabel(n) {
  return '×' + n;
}
