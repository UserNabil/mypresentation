import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

export async function openPeople(){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const host = document.getElementById('content');
  if(!host) return false;
  unmountIslandPage(host.querySelector('#people-react'));
  host.innerHTML = '<div id="people-react" style="height:100%"></div>';
  const el = document.getElementById('people-react');
  const ok = await mountIslandPage('people', el, { toast });
  if(ok) document.body.classList.remove('home-view', 'side-open');
  else if(el.isConnected) el.remove();
  return ok;
}

export async function peopleNavInit(tree){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  if(!document.getElementById('btn-people')){
    const b = document.createElement('button');
    b.id = 'btn-people';
    b.hidden = true;
    b.type = 'button';
    b.onclick = () => { openPeople(); };
    document.body.appendChild(b);
  }
  const admin = tree.find(f => f.k === 'admin');
  if(!admin) return false;
  for(const l of admin.kids){
    if(l.k === 'people') l.archived = false;
    if(l.k === 'accounts' || l.k === 'pageaccess') l.archived = true;
  }
  window.dispatchEvent(new CustomEvent('ui-modern', { detail: document.documentElement.dataset.ui === 'modern' }));
  return true;
}
