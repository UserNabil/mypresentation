const ROUTE_KEY = 'eden_route';
const LAST_KEY = 'eden_route_last';
const NAV_KEY = 'eden_nav';
const VIEW_KEY = 'eden_view';
const SETUP_KEY = 'eden_setup_shown';

function ss() { try { return globalThis.sessionStorage || null; } catch (e) { return null; } }
function ls() { try { return globalThis.localStorage || null; } catch (e) { return null; } }
function get(store, k) { try { return store ? store.getItem(k) : null; } catch (e) { return null; } }
function put(store, k, v) { try { if (store) store.setItem(k, v); } catch (e) { } }
function del(store, k) { try { if (store) store.removeItem(k); } catch (e) { } }

let armed = false;

function isReload() {
  try {
    const n = globalThis.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    return !!n && n.type === 'reload';
  } catch (e) { return false; }
}

export function readBoot() {
  const s = ss();
  let route = get(s, ROUTE_KEY);
  if (route === null && isReload()) route = get(ls(), LAST_KEY);
  return { route: route || '', nav: get(s, NAV_KEY) || '', view: get(s, VIEW_KEY) || '' };
}

export function resolveBoot(saved, has) {
  const ok = k => typeof k === 'string' && k && k !== 'dashboard' && has(k);
  if (ok(saved.route)) return { type: 'rail', k: saved.route };
  if (saved.route === 'dashboard') return { type: 'home' };
  if (ok(saved.nav)) return { type: 'rail', k: saved.nav };
  if (saved.view) return { type: 'view', v: saved.view };
  return { type: 'home' };
}

export function arm() { armed = true; }

export function saveRoute(k) {
  if (!armed) return;
  const s = ss();
  if (!k) { del(s, ROUTE_KEY); del(ls(), LAST_KEY); return; }
  put(s, ROUTE_KEY, k);
  put(ls(), LAST_KEY, k);
}

export function setupAlreadyShown() { return get(ss(), SETUP_KEY) === '1'; }
export function markSetupShown() { put(ss(), SETUP_KEY, '1'); }
