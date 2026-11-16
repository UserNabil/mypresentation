import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

const HIST_KEY = 'reforged_search_history';
const PLAIN = new Set(['scene', 'quest', '']);

let armed = false;
let active = null;

function rememberQuery() {
  const q = (document.getElementById('q')?.value || '').trim();
  if (q.length < 2) return;
  try {
    const old = JSON.parse(localStorage.getItem(HIST_KEY) || '[]').filter(x => String(x).toLowerCase() !== q.toLowerCase());
    old.unshift(q);
    localStorage.setItem(HIST_KEY, JSON.stringify(old.slice(0, 12)));
  } catch (e) {}
}

function targetOf(ev) {
  const t = ev.target instanceof Element ? ev.target : null;
  if (!t) return null;
  const row = t.closest('#rows .row[data-e], #q-history .ac-row[data-e]');
  if (!row || row.classList.contains('row-feature')) return null;
  const etype = row.dataset.e;
  const id = Number(row.dataset.id);
  if (PLAIN.has(etype) || !Number.isFinite(id)) return null;
  return { etype, id };
}

export function closeRecordModal() {
  if (!active) return;
  const { el, back } = active;
  active = null;
  unmountIslandPage(el);
  el.remove();
  try { if (back && back.isConnected && back !== document.body) back.focus({ preventScroll: true }); } catch (e) {}
}

async function openClassic(etype, id) {
  closeRecordModal();
  const m = await import('/studio/js/pages/entity.js');
  m.openEntity(etype, id, true);
}

export async function openRecordModal(etype, id) {
  closeRecordModal();
  const el = document.createElement('div');
  el.className = 'rm-host';
  document.body.appendChild(el);
  active = { el, back: document.activeElement };
  const ok = await mountIslandPage('record', el, {
    etype,
    id,
    toast,
    onClose: closeRecordModal,
    onOpenFull: openClassic,
    onOpenHistory: () => {
      closeRecordModal();
      document.getElementById('btn-changes')?.click();
    },
  });
  if (!ok && active && active.el === el) {
    closeRecordModal();
    openClassic(etype, id);
  }
}

function onClick(ev) {
  if (ev.defaultPrevented || ev.button !== 0) return;
  const hit = targetOf(ev);
  if (!hit) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  rememberQuery();
  document.getElementById('q-history')?.classList.remove('open');
  openRecordModal(hit.etype, hit.id);
}

export async function initRecordModal() {
  if (armed) return;
  let on = false;
  try { on = await islandPagesAvailable(); } catch (e) {}
  if (!on || armed) return;
  armed = true;
  document.addEventListener('click', onClick, true);
  document.getElementById('q')?.addEventListener('focus', () => {
    import('/studio/app/island/features-island.js').catch(() => {});
  }, { once: true });
}
