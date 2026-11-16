import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

export async function openAltarIsland(kind, hooks){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const host = document.getElementById('content');
  if(!host) return false;
  unmountIslandPage(host.querySelector('#altar-react'));
  host.innerHTML = '<div id="altar-react" style="height:100%"></div>';
  const el = document.getElementById('altar-react');
  const ok = await mountIslandPage('altar', el, { toast, kind, ...(hooks || {}) });
  if(ok) document.body.classList.remove('home-view', 'side-open');
  else if(el.isConnected) el.remove();
  return ok;
}
