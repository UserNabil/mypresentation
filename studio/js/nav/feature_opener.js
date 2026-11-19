import { navigate } from './rail.js';
import { fm } from '../pages/feature_manager_state.js';

const PAGE_ALIAS = { gm: 'gmcmds', server_status: 'dashboard' };

export function resolvePage(k) { return PAGE_ALIAS[k] || k; }

function waitFor(pred, ms) {
  return new Promise(resolve => {
    let v = pred();
    if (v) { resolve(v); return; }
    const done = r => { obs.disconnect(); clearTimeout(t); resolve(r); };
    const obs = new MutationObserver(() => { v = pred(); if (v) done(v); });
    const t = setTimeout(() => done(null), ms);
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

function rowFor(name) {
  return document.querySelector('.fm-row[data-fmsel="' + CSS.escape(name) + '"]');
}

export async function openFeature(name, opts) {
  name = String(name || '').trim();
  if (!name) { navigate('features'); return false; }
  const tests = !!(opts && opts.tests);
  let f = null;
  try { f = fm(); } catch (e) {}
  if (f) {
    f.sel = name;
    f._search = '';
    f._filter = '';
    f._tab = tests ? 'tests' : 'overview';
  }
  window.eutFeatureFocus = tests ? { name, ts: Date.now(), tab: 'tests' } : { name, ts: Date.now() };
  try { localStorage.setItem('fmr.sel', name); } catch (e) {}
  const react = document.getElementById('fm-react-root');
  if (react && react.isConnected) {
    window.dispatchEvent(new CustomEvent('eut-feature-focus', { detail: window.eutFeatureFocus }));
    return true;
  }
  navigate('features');
  const row = await waitFor(() => {
    const r = document.getElementById('fm-react-root');
    return r && r.isConnected ? r : rowFor(name);
  }, 30000);
  if (!row) return false;
  if (row.id === 'fm-react-root') return true;
  document.querySelectorAll('.fm-row').forEach(r => r.classList.toggle('on', r === row));
  try { row.scrollIntoView({ block: 'center' }); } catch (e) {}
  if (tests) {
    const tab = await waitFor(() => {
      const b = document.querySelector('.fx-tab[data-fxtab="tests"]');
      const d = document.querySelector('.fx-detail');
      return b && d ? b : null;
    }, 30000);
    if (tab && !tab.classList.contains('on')) tab.click();
  }
  return true;
}

window.edenOpenFeature = (n, o) => openFeature(n, o);
