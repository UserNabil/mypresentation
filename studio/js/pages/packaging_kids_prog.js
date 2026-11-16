import { esc } from '../core/dom.js';
import { imgLine, lineIcon } from '../ui/line_icons.js';

const IC = '/studio/icons/icons/';
function line(n, s, cls) {
  const m = imgLine(IC + (s > 64 ? 256 : 128) + '/' + n + '.png', '');
  if (!m.n) return '';
  const w = s <= 20 ? 20 : (s <= 48 ? 24 : 32);
  return lineIcon(m.n, w, 'lx-sw' + (m.tone ? ' lx-' + m.tone : '') + (cls ? ' ' + cls : ''));
}
export const img = (n, s, cls) => (document.documentElement.dataset.ui === 'modern' && line(n, s, cls)) || '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + IC + (s > 64 ? 256 : 128) + '/' + n + '.png" width="' + s + '" height="' + s + '" alt="">';

function curProg(S) {
  const f = S.feed && S.run && S.feed.key === S.run ? S.feed : null;
  const pct = f && f.pct >= 0 ? f.pct : S.pct;
  return { f, pct, p: Math.max(0, Math.min(100, pct)), indet: pct < 0 };
}

export function progHtml(S, icon) {
  const pr = curProg(S), p = pr.p;
  const pc = pr.indet ? '' : Math.round(p) + '%';
  const cnt = pr.f && pr.f.total ? pr.f.done.toLocaleString() + ' / ' + pr.f.total.toLocaleString() + ' files' : '';
  return '<div class="g-p"><div class="g-fill' + (pr.indet ? ' g-indet' : '') + '" style="--p:' + (pr.indet ? 40 : p) + '">' + img(icon, 96, 'base') + img(icon, 96, 'top') + '<b>' + esc(pc) + '</b></div>' + (cnt ? '<div class="g-cnt">' + esc(cnt) + '</div>' : '') + '</div>';
}

export function syncAnims(host) {
  const t = Date.now() / 1000;
  host.querySelectorAll('.k-spin').forEach(el => {
    const d = parseFloat(getComputedStyle(el).animationDuration) || 0;
    if (d > 0) el.style.animationDelay = '-' + (t % d).toFixed(3) + 's';
  });
}
