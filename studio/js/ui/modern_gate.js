const MODERN = 'ui.modern';
const THEME = 'ui.theme';
const root = document.documentElement;

function read(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function write(k, v){ try{ if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){} }

export function currentTheme(){
  return root.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(t){
  root.classList.add('ui-theme-fade');
  root.dataset.theme = t === 'dark' ? 'dark' : 'light';
  write(THEME, root.dataset.theme);
  setTimeout(() => root.classList.remove('ui-theme-fade'), 220);
  window.dispatchEvent(new CustomEvent('ui-theme', { detail: root.dataset.theme }));
}

export function toggleTheme(){ setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }

export function modernOn(){ return root.dataset.ui === 'modern'; }

export function setModern(on){
  write(MODERN, on ? '1' : '0');
  if(on) root.dataset.ui = 'modern'; else delete root.dataset.ui;
  window.dispatchEvent(new CustomEvent('ui-modern', { detail: !!on }));
}

function applyTheme(){
  const t = read(THEME);
  if(t === 'dark' || t === 'light') root.dataset.theme = t;
  else root.dataset.theme = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

export async function initModernGate(){
  applyTheme();
  let preview = false;
  try{
    const r = await fetch('/api/app-context', { credentials: 'same-origin' });
    preview = !!(await r.json()).preview_readonly;
  }catch(e){ preview = false; }
  write('ui.modern.preview', preview ? '1' : null);
  write(MODERN, null);
  root.dataset.ui = 'modern';
  return true;
}
