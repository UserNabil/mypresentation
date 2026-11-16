import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

async function openClassic(etype, id) {
  const m = await import('/studio/js/pages/entity.js');
  m.openEntity(etype, id, true);
}

export async function openContentIsland(etype) {
  let on = false;
  try { on = await islandPagesAvailable(); } catch (e) {}
  if (!on) return false;
  const host = document.getElementById('content');
  if (!host) return false;
  unmountIslandPage(host.querySelector('#content-react'));
  host.innerHTML = '<div id="content-react" style="height:100%"></div>';
  const el = document.getElementById('content-react');
  const ok = await mountIslandPage('content', el, {
    etype,
    toast,
    onOpenFull: openClassic,
    onOpenHistory: () => document.getElementById('btn-changes')?.click(),
  });
  if (!ok && el.isConnected) el.remove();
  return ok;
}
