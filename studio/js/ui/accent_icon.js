const REV = '2';
const ICONS = {
  gold: ['eden_studio', 'favicon-32'],
  red: ['eden_studio_red', 'eden_studio_red'],
  blue: ['eden_studio_blue', 'eden_studio_blue'],
  green: ['eden_studio_green', 'eden_studio_green'],
  purple: ['eden_studio_purple', 'eden_studio_purple'],
  orange: ['eden_studio_orange', 'eden_studio_orange'],
  pink: ['eden_studio_pink', 'eden_studio_pink'],
};
const root = document.documentElement;
let timer = 0;

export function accentIconHrefs(accent){
  const pair = ICONS[accent] || ICONS.gold;
  return { ico: '/studio/img/brand/' + pair[0] + '.ico?v=' + REV, png: '/studio/img/brand/' + pair[1] + '.png?v=' + REV };
}

function currentAccent(){
  return ICONS[root.dataset.accent] ? root.dataset.accent : 'gold';
}

export function applyAccentIcon(accent){
  const h = accentIconHrefs(accent);
  document.querySelectorAll('link[rel="icon"]').forEach(l => {
    const href = l.type === 'image/png' ? h.png : h.ico;
    if(l.getAttribute('href') !== href) l.setAttribute('href', href);
  });
}

function pingWindow(){
  clearTimeout(timer);
  timer = setTimeout(() => {
    try{ fetch('/api/ui/window-icon', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accent: currentAccent() }) }).catch(() => {}); }catch(e){}
    try{ fetch('/api/ui/taskbar-badge', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accent: currentAccent(), theme: root.dataset.theme === 'dark' ? 'dark' : 'light' }) }).catch(() => {}); }catch(e){}
  }, 250);
}

function watchTitle(){
  const t = document.querySelector('title');
  if(!t || !window.MutationObserver) return;
  new MutationObserver(pingWindow).observe(t, { childList: true, characterData: true, subtree: true });
}

window.addEventListener('ui-accent', e => { applyAccentIcon(e.detail); pingWindow(); });
applyAccentIcon(currentAccent());
watchTitle();
if(window.MutationObserver) new MutationObserver(pingWindow).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
pingWindow();
