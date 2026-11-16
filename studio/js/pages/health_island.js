import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

const RANK = { GS: 1, CM: 2, GM: 3, SA: 4 };

export async function openHealth(opts){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const host = document.getElementById('content');
  if(!host) return false;
  unmountIslandPage(host.querySelector('#health-react'));
  host.innerHTML = '<div id="health-react" style="height:100%"></div>';
  const el = document.getElementById('health-react');
  const ok = await mountIslandPage('health', el, { toast, ...(opts || {}) });
  if(ok) document.body.classList.remove('home-view', 'side-open');
  else if(el.isConnected) el.remove();
  return ok;
}

async function canView(){
  try{
    const c = await (await fetch('/api/app-context', { credentials: 'same-origin' })).json();
    const mins = c.action_min || c.actionMin || {};
    const grants = c.grants || [];
    const ok = a => grants.includes(a) || (!!mins[a] && (RANK[c.role] || 0) >= (RANK[mins[a]] || 99));
    return { crashes: ok('crashes.view'), perf: ok('perf.view') };
  }catch(e){ return { crashes: true, perf: true }; }
}

export async function healthNavInit(tree){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const admin = tree.find(f => f.k === 'admin');
  if(!admin) return false;
  if(!document.getElementById('btn-health')){
    const b = document.createElement('button');
    b.id = 'btn-health';
    b.hidden = true;
    b.type = 'button';
    b.onclick = () => { openHealth(); };
    document.body.appendChild(b);
  }
  const v = await canView();
  for(const l of admin.kids){
    if(l.k === 'health'){ l.archived = false; l.perm = v.crashes ? 'crashes.view' : 'perf.view'; }
    if(l.k === 'crashes' || l.k === 'perf') l.archived = true;
  }
  window.dispatchEvent(new CustomEvent('ui-modern', { detail: document.documentElement.dataset.ui === 'modern' }));
  return true;
}
