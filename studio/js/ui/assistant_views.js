import { lineSvg } from './line_icons.js';
import { toast } from './toast.js';

const CHK_ICON = { ok: 'circle-check', warn: 'triangle-alert', fail: 'circle-x', info: 'info' };
const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function checksHtml(m, i, pending) {
  const rows = m.checks.map((c, j) => {
    const st = CHK_ICON[c.state] ? c.state : 'info';
    return '<li class="as-ck ' + st + '"><span class="as-ck-i" aria-hidden="true">' + lineSvg(CHK_ICON[st], 16) + '</span>' +
      '<span class="as-ck-t"><b>' + esc(c.label) + '</b>' + (c.detail ? '<i>' + esc(c.detail) + '</i>' : '') + (c.help ? '<em>' + esc(c.help) + '</em>' : '') + '</span>' +
      (c.fix && c.fix.id ? '<button type="button" class="as-fix" data-fix="' + i + ':' + j + '"' + (pending ? ' disabled' : '') + '>' + esc(c.fix.label || 'Fix') + '</button>' : '') + '</li>';
  }).join('');
  let foot = '';
  if (m.report) foot += '<button type="button" class="as-b" data-report="' + i + '">' + lineSvg('copy', 14) + '<span>Copy report</span></button>';
  if (m.rerun) foot += '<button type="button" class="as-b" data-rerun="' + i + '"' + (pending ? ' disabled' : '') + '>' + lineSvg('refresh-cw', 14) + '<span>Run again</span></button>';
  return '<div class="as-chk"><ul>' + rows + '</ul>' + (foot ? '<div class="as-btns">' + foot + '</div>' : '') + '</div>';
}

export function askHtml(m, i, pending) {
  const a = m.ask;
  let h = '<div class="as-ask"><p>' + esc(a.question) + '</p>';
  if (m.answered != null) return h + '<div class="as-st ok">' + lineSvg('circle-check', 16) + '<span>' + esc(m.answered) + '</span></div></div>';
  const ch = Array.isArray(a.choices) ? a.choices : [];
  if (ch.length) h += '<div class="as-pick">' + ch.map((c, j) => '<button type="button" class="as-opt" data-pick="' + i + ':' + j + '"' + (pending ? ' disabled' : '') + '><b>' + esc(c.label) + '</b>' + (c.hint ? '<i>' + esc(c.hint) + '</i>' : '') + '</button>').join('') + '</div>';
  if (a.input) h += '<div class="as-use"><input type="text" class="as-askin" data-askin="' + i + '" placeholder="' + esc(a.input.placeholder || '') + '" aria-label="' + esc(a.question) + '" spellcheck="false" autocomplete="off">' +
    '<button type="button" class="as-b pri" data-use="' + i + '"' + (pending ? ' disabled' : '') + '>Use</button></div>';
  return h + '</div>';
}

export function watchHtml(m, i, pending) {
  const w = m.watch;
  if (w && !w.done) {
    const lim = Math.max(1, Number(w.limit) || 20);
    const pct = Math.min(100, Math.round(100 * (Number(w.elapsed) || 0) / lim));
    return '<div class="as-chk as-wt"><div class="as-st"><span class="as-wt-i" aria-hidden="true">' + lineSvg('refresh-cw', 16) + '</span><span>' +
      esc(w.title || 'Starting the game') + '</span><em>' + esc((Number(w.elapsed) || 0) + ' s') + '</em></div>' +
      '<div class="as-wt-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div></div>';
  }
  if (m.verdict && m.verdict.state === 'failed') {
    return '<div class="as-btns"><button type="button" class="as-b" data-q="' + esc('check my client on ' + (m.verdict.env || 'dev')) + '"' + (pending ? ' disabled' : '') + '>' +
      lineSvg('stethoscope', 14) + '<span>Check my setup</span></button></div>';
  }
  return '';
}

export function verdictMessage(st) {
  const failed = st.state === 'failed';
  const m = { r: 'a', text: String(st.title || '') + (st.text ? '. ' + st.text : ''), cards: [], actions: [], verdict: { state: st.state, env: st.env || '' } };
  if (failed) m.tone = 'bad';
  if (Array.isArray(st.checks) && st.checks.length) m.checks = st.checks.map(c => Object.assign({}, c, { fix: null }));
  if (failed && st.report) m.report = String(st.report);
  if (/^(dev|preprod|prod)$/.test(st.env || '')) m.env = st.env;
  return m;
}

export const WATCH_CSS = `
html[data-ui="modern"] .as-wt .as-st{gap:8px}
html[data-ui="modern"] .as-wt .as-st em{margin-left:auto;font:500 12px/1 var(--ui-font);font-style:normal;color:var(--ui-muted)}
html[data-ui="modern"] .as-wt-i{display:inline-flex;animation:as-wt-spin 1.2s linear infinite}
html[data-ui="modern"] .as-wt-bar{height:4px;margin-top:10px;border-radius:var(--ui-radius-pill);background:var(--ui-surface-2);overflow:hidden}
html[data-ui="modern"] .as-wt-bar i{display:block;height:100%;background:var(--ui-accent);transition:width .4s linear}
@keyframes as-wt-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){html[data-ui="modern"] .as-wt-i{animation:none}}
`;

export function followWatch(m, onTick, onDone) {
  const w = m.watch;
  const stop = Date.now() + (Math.max(1, Number(w.limit) || 20) + 10) * 1000;
  const step = async () => {
    let st = null;
    try {
      const r = await fetch('/api/launch/watch/' + encodeURIComponent(w.id), { credentials: 'same-origin' });
      st = await r.json().catch(() => null);
      if (!r.ok) st = { state: 'failed', env: w.env, title: 'The launch is not followed anymore', text: (st && st.detail) || ('HTTP ' + r.status), checks: [] };
    } catch (e) { st = null; }
    if (!st && Date.now() > stop) st = { state: 'failed', env: w.env, title: 'The launch is not followed anymore', text: 'The tool did not answer.', checks: [] };
    if (st && st.state && st.state !== 'starting') { w.done = true; onDone(st); return; }
    if (st) { w.elapsed = st.elapsed; w.title = st.title; w.limit = st.limit; onTick(); }
    setTimeout(step, 1000);
  };
  setTimeout(step, 800);
}

export function copyText(t) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok;
  };
  const done = ok => toast(ok ? 'Report copied' : 'Could not copy the report', ok ? 'ok' : 'error');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => done(true), () => done(fallback()));
  else done(fallback());
}
