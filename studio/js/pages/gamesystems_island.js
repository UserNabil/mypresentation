import { islandPagesAvailable, mountIslandPage, unmountIslandPage } from './island_pages.js';
import { toast } from '../ui/toast.js';

export const SECTIONS = [
  { tab: 'currencies', k: 'shopcurrency', label: 'Currencies', icon: 'gold' },
  { tab: 'cardduel', k: 'cardduel', label: 'Card Duel', icon: 'dice' },
  { tab: 'classes', k: 'classes', label: 'Classes', icon: 'classes' },
];

export async function openGameSystems(opts){
  const tab = opts && typeof opts.tab === 'string' ? opts.tab : '';
  const host = document.getElementById('content');
  if(!host) return false;
  const cur = host.querySelector(':scope > #gamesystems-react');
  if(cur && cur.dataset.mounted === '1' && tab){
    cur.dataset.section = tab;
    window.dispatchEvent(new CustomEvent('gamesystems-section', { detail: tab }));
    document.body.classList.remove('home-view', 'side-open');
    return true;
  }
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  unmountIslandPage(host.querySelector('#gamesystems-react'));
  host.innerHTML = '<div id="gamesystems-react" style="height:100%"></div>';
  const el = document.getElementById('gamesystems-react');
  el.dataset.section = tab;
  const ok = await mountIslandPage('gamesystems', el, { toast, ...(opts || {}), tab });
  if(ok){
    el.dataset.mounted = '1';
    document.body.classList.remove('home-view', 'side-open');
  }
  else if(el.isConnected) el.remove();
  return ok;
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

export async function gamesystemsNavInit(tree){
  let on = false;
  try{ on = await islandPagesAvailable(); }catch(e){}
  if(!on) return false;
  const fam = tree.find(f => f.k === 'gameplay');
  if(!fam) return false;
  hiddenButton('btn-gamesystems', () => { openGameSystems(); });
  for(const s of SECTIONS) hiddenButton('btn-gamesystems-' + s.tab, () => { openGameSystems({ tab: s.tab }); });
  for(const l of fam.kids){
    if(l.k === 'gamesys'){ l.archived = true; continue; }
    const s = SECTIONS.find(x => x.k === l.k);
    if(!s) continue;
    l.archived = false;
    l.label = s.label;
    l.icon = s.icon;
    l.act = 'btn:btn-gamesystems-' + s.tab;
  }
  window.dispatchEvent(new CustomEvent('ui-modern', { detail: document.documentElement.dataset.ui === 'modern' }));
  return true;
}
