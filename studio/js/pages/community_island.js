import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

const RANK = { GS: 1, CM: 2, GM: 3, SA: 4 };

export const SECTIONS = [
  { sec: 'emojis', k: 'emojicdn', label: 'Emojis', icon: 'image' },
  { sec: 'sounds', k: 'sounds', label: 'Sounds', icon: 'sound' },
  { sec: 'polls', k: 'polls', label: 'Polls', icon: 'megaphone' },
  { sec: 'altar', k: 'requests', label: 'Altar', icon: 'altar_requests' },
  { sec: 'events', k: 'event', label: 'Event', icon: 'trophy' },
];

export async function openCommunity(opts){
  const section = opts && typeof opts.section === 'string' ? opts.section : '';
  const host = document.getElementById('content');
  if(!host) return false;
  const cur = host.querySelector(':scope > #community-react');
  if(cur && cur.dataset.mounted === '1' && section){
    cur.dataset.section = section;
    window.dispatchEvent(new CustomEvent('community-section', { detail: section }));
    document.body.classList.remove('home-view', 'side-open');
    return true;
  }
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  unmountIslandPage(host.querySelector('#community-react'));
  host.innerHTML = '<div id="community-react" style="height:100%"></div>';
  const el = document.getElementById('community-react');
  el.dataset.section = section;
  const ok = await mountIslandPage('community', el, { toast, ...(opts || {}), section });
  if(ok){
    el.dataset.mounted = '1';
    document.body.classList.remove('home-view', 'side-open');
  }
  else if(el.isConnected) el.remove();
  return ok;
}

async function canView(){
  try{
    const c = await (await fetch('/api/app-context', { credentials: 'same-origin' })).json();
    const mins = c.action_min || c.actionMin || {};
    const grants = c.grants || [];
    const ok = a => grants.includes(a) || (!!mins[a] && (RANK[c.role] || 0) >= (RANK[mins[a]] || 99));
    return { emoji: ok('emoji.cdn'), polls: ok('polls.view'), altar: ok('altar.review'),
             eventsManage: ok('events.manage'), events: ok('events.manage') || ok('events.view') };
  }catch(e){ return { emoji: true, polls: true, altar: true, eventsManage: false, events: true }; }
}

function badge(k, text, warn){
  window.dispatchEvent(new CustomEvent('rail-badge', { detail: { k, text, warn: !!warn } }));
}

async function firstBadges(v){
  if(v.events){
    try{
      const m = await (await fetch('/api/events/mine', { credentials: 'same-origin' })).json();
      badge('event', m && m.active && m.status === 'live' ? 'live' : '');
    }catch(e){}
  }
  if(v.altar){
    try{
      const r = await (await fetch('/api/altar_requests', { credentials: 'same-origin' })).json();
      const n = (r.requests || []).filter(x => x.state === 'submitted').length;
      badge('requests', n ? n + ' new' : '', true);
    }catch(e){}
  }
}

function hiddenButton(id, run){
  if(document.getElementById(id)) return;
  const b = document.createElement('button');
  b.id = id;
  b.hidden = true;
  b.type = 'button';
  b.onclick = run;
  document.body.appendChild(b);
}

export async function communityNavInit(tree){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const prod = tree.find(f => f.k === 'production');
  if(!prod) return false;
  hiddenButton('btn-community', () => { openCommunity(); });
  for(const s of SECTIONS) hiddenButton('btn-community-' + s.sec, () => { openCommunity({ section: s.sec }); });
  const v = await canView();
  for(const l of prod.kids){
    if(l.k === 'community'){ l.archived = true; continue; }
    const s = SECTIONS.find(x => x.k === l.k);
    if(!s) continue;
    l.archived = false;
    l.label = s.label;
    l.icon = s.icon;
    l.act = 'btn:btn-community-' + s.sec;
    if(s.sec === 'events') l.perm = v.eventsManage ? 'events.manage' : 'events.view';
  }
  window.dispatchEvent(new CustomEvent('ui-modern', { detail: document.documentElement.dataset.ui === 'modern' }));
  firstBadges(v);
  return true;
}
