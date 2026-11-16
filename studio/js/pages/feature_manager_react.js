import { toast } from '../ui/toast.js';

const KEY = 'fm.react';
const CSS_ID = 'fmr-css';

let fmReactAvail = null;

export async function fmReactAvailable(){
  fmReactAvail = true;
  return fmReactAvail;
}

export function fmReactKnown(){ return fmReactAvail === true; }

export function fmReactOn(){
  if(document.documentElement.dataset.ui === 'modern') return true;
  try{ return localStorage.getItem(KEY) !== '0'; }catch(e){ return true; }
}

export function fmReactSet(on){
  try{ localStorage.setItem(KEY, on ? '1' : '0'); }catch(e){}
}

function fmReactCss(){
  if(document.getElementById(CSS_ID)) return;
  const l = document.createElement('link');
  l.id = CSS_ID; l.rel = 'stylesheet'; l.href = '/studio/app/island/features-island.css';
  document.head.appendChild(l);
}

export async function fmMountReact(content, onClassic){
  if(!content) return false;
  fmReactCss();
  content.innerHTML = '<div id="fm-react-root" style="height:100%;width:100%;flex:1 1 auto;min-width:0"></div>';
  const el = content.querySelector('#fm-react-root');
  try{
    const m = await import('/studio/app/island/features-island.js');
    if(el.isConnected) m.mount(el, { onClassic, toast });
    return true;
  }catch(e){
    console.error('[features] new page failed to load', e);
    fmReactSet(false);
    content.innerHTML = '';
    return false;
  }
}
