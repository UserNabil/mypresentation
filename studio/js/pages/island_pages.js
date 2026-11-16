import { toast } from '../ui/toast.js';
import { fmReactAvailable } from './feature_manager_react.js';

const CSS_ID = 'fmr-css';

function islandCss(){
  if(document.getElementById(CSS_ID)) return;
  const l = document.createElement('link');
  l.id = CSS_ID; l.rel = 'stylesheet'; l.href = '/studio/app/island/features-island.css';
  document.head.appendChild(l);
}

export async function islandPagesAvailable(){
  return fmReactAvailable();
}

export async function mountIslandPage(name, el, host = {}){
  if(!el) return false;
  islandCss();
  try{
    const m = await import('/studio/app/island/features-island.js');
    return el.isConnected ? !!m.mountPage(name, el, { toast, ...host }) : false;
  }catch(e){
    console.error('[island] page ' + name + ' failed to load', e);
    return false;
  }
}

export async function unmountIslandPage(el){
  if(!el) return;
  try{
    const m = await import('/studio/app/island/features-island.js');
    m.unmountPage(el);
  }catch(e){}
}
