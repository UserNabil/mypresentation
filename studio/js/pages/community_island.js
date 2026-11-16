import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

const RANK = { GS: 1, CM: 2, GM: 3, SA: 4 };

export async function openCommunity(opts){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const host = document.getElementById('content');
  if(!host) return false;
  unmountIslandPage(host.querySelector('#community-react'));
  host.innerHTML = '<div id="community-react" style="height:100%"></div>';
  const el = document.getElementById('community-react');
  const ok = await mountIslandPage('community', el, { toast, ...(opts || {}) });
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
    return { emoji: ok('emoji.cdn'), polls: ok('polls.view'), altar: ok('altar.review') };
  }catch(e){ return { emoji: true, polls: true, altar: true }; }
}

export async function communityNavInit(tree){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const prod = tree.find(f => f.k === 'production');
  if(!prod) return false;
  if(!document.getElementById('btn-community')){
    const b = document.createElement('button');
    b.id = 'btn-community';
    b.hidden = true;
    b.type = 'button';
    b.onclick = () => { openCommunity(); };
    document.body.appendChild(b);
  }
  const v = await canView();
  for(const l of prod.kids){
    if(l.k === 'community'){ l.archived = false; l.perm = v.emoji ? 'emoji.cdn' : v.polls ? 'polls.view' : 'altar.review'; }
    if(l.k === 'emojicdn' || l.k === 'polls' || l.k === 'requests') l.archived = true;
  }
  window.dispatchEvent(new CustomEvent('ui-modern', { detail: document.documentElement.dataset.ui === 'modern' }));
  return true;
}
