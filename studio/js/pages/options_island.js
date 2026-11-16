import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

export async function openOptions(opts){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const host = document.getElementById('content');
  if(!host) return false;
  unmountIslandPage(host.querySelector('#options-react'));
  host.innerHTML = '<div id="options-react" style="height:100%"></div>';
  const el = document.getElementById('options-react');
  const ok = await mountIslandPage('options', el, { toast, ...(opts || {}) });
  if(ok) document.body.classList.remove('home-view', 'side-open');
  else if(el.isConnected) el.remove();
  return ok;
}

export async function optionsNavInit(tree){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const admin = tree.find(f => f.k === 'admin');
  if(!admin) return false;
  if(!document.getElementById('btn-options')){
    const b = document.createElement('button');
    b.id = 'btn-options';
    b.hidden = true;
    b.type = 'button';
    b.onclick = () => { openOptions(); };
    document.body.appendChild(b);
  }
  const classic = document.getElementById('btn-settings');
  if(classic && !classic.dataset.optionsIsland){
    classic.dataset.optionsIsland = '1';
    classic.addEventListener('click', ev => {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      openOptions();
    }, true);
  }
  for(const l of admin.kids){
    if(l.k === 'options') l.act = 'btn:btn-options';
  }
  window.dispatchEvent(new CustomEvent('ui-modern', { detail: document.documentElement.dataset.ui === 'modern' }));
  return true;
}
