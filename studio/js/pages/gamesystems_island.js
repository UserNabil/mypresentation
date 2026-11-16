import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

export async function openGameSystems(opts){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const host = document.getElementById('content');
  if(!host) return false;
  unmountIslandPage(host.querySelector('#gamesystems-react'));
  host.innerHTML = '<div id="gamesystems-react" style="height:100%"></div>';
  const el = document.getElementById('gamesystems-react');
  const ok = await mountIslandPage('gamesystems', el, { toast, ...(opts || {}) });
  if(ok) document.body.classList.remove('home-view', 'side-open');
  else if(el.isConnected) el.remove();
  return ok;
}

export async function gamesystemsNavInit(tree){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const fam = tree.find(f => f.k === 'gameplay');
  if(!fam) return false;
  if(!document.getElementById('btn-gamesystems')){
    const b = document.createElement('button');
    b.id = 'btn-gamesystems';
    b.hidden = true;
    b.type = 'button';
    b.onclick = () => { openGameSystems(); };
    document.body.appendChild(b);
  }
  for(const l of fam.kids){
    if(l.k === 'gamesys') l.archived = false;
    if(l.k === 'classes' || l.k === 'shopcurrency' || l.k === 'cardduel') l.archived = true;
  }
  window.dispatchEvent(new CustomEvent('ui-modern', { detail: document.documentElement.dataset.ui === 'modern' }));
  return true;
}
