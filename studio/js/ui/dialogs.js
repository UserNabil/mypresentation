/* ============================================================================
   ui/dialogs.js — the in-app confirm / prompt / conflict dialogs, plus the
   Escape and Enter keyboard behaviour that belongs to them.

   MOVED from static/index.html:2576-2661 (module block), minus two blocks that
   stayed behind because they are NOT dialog code:
     • serverStaleNow()          (index.html:2591-2595) — server fingerprint
     • the anti-inspection guard (index.html:2617-2628) — contextmenu / F12

   Behaviour is unchanged. The three dialogs drive markup that lives in
   index.html and is NOT created here:
     #confirmModal  #cm-title #cm-msg #cm-yes #cm-no
     #promptModal   #pm-title #pm-label #pm-input #pm-yes #pm-no
     #conflictModal #cf-msg #cf-reload #cf-save #cf-cancel

   ⚠ SINGLE INSTANCE. This module holds the pending-promise resolvers. Import it
   through ONE and the same URL everywhere ('./js/ui/dialogs.js', no query
   string): two different URLs would create two module instances and a dialog
   opened by one would never be resolved by the other.
   ============================================================================ */

import { $ } from '../core/dom.js';

let _cmResolve = null;
let _cfResolve = null;
let _pmResolve = null;

/** Custom in-app confirm (no native browser dialog). Resolves true/false. */
export function uiConfirm(msg, title = 'Confirm', okLabel = 'OK') {
  $('#cm-title').textContent = title; $('#cm-msg').textContent = msg; $('#cm-yes').textContent = okLabel;
  $('#confirmModal').classList.add('open');
  setTimeout(() => { try { $('#cm-yes').focus(); } catch (_) { } }, 60);   // Enter = confirm (OK focused)
  return new Promise(res => { _cmResolve = res; });
}

/** 3-way conflict dialog. Resolves 'reload' | 'save' | 'cancel'. */
export function uiConflict(msg) {
  $('#cf-msg').textContent = msg;
  $('#conflictModal').classList.add('open');
  return new Promise(r => { _cfResolve = r; });
}

function _cfDone(v) { $('#conflictModal').classList.remove('open'); if (_cfResolve) { _cfResolve(v); _cfResolve = null; } }

/** Single-line text prompt. Resolves the trimmed value, or null on cancel. */
export function uiPrompt(label, title = 'Input', def = '') {
  $('#pm-title').textContent = title; $('#pm-label').textContent = label; $('#pm-input').value = def;
  $('#promptModal').classList.add('open'); setTimeout(() => $('#pm-input').focus(), 50);
  return new Promise(res => { _pmResolve = res; });
}

// ── Escape closes the TOP-most open modal (a prompt closes before its parent), ──
//    resolving any pending dialog promise cleanly so callers don't hang.
function _closeTopModal() {
  const open = [...document.querySelectorAll('.modal.open')];
  if (!open.length) return false;
  // top-most = highest effective z-index, then last in DOM order
  open.sort((a, b) => { const za = +getComputedStyle(a).zIndex || 0, zb = +getComputedStyle(b).zIndex || 0; return za - zb; });
  const top = open[open.length - 1];
  top.classList.remove('open');
  // settle any pending dialog promise as a cancel
  if (top.id === 'promptModal' && _pmResolve) { _pmResolve(null); _pmResolve = null; }
  else if (top.id === 'confirmModal' && _cmResolve) { _cmResolve(false); _cmResolve = null; }
  else if (top.id === 'conflictModal' && _cfResolve) { _cfResolve('cancel'); _cfResolve = null; }
  return true;
}

// ── Enter VALIDATES the top-most modal/alert = clicks its PRIMARY (non-ghost) button. ──
//    It does NOT steal Enter from an input/textarea/select/button/link (they handle
//    their own -> no double click).
function _validateTopModal() {
  const open = [...document.querySelectorAll('.modal.open')];
  if (!open.length) return false;
  open.sort((a, b) => { const za = +getComputedStyle(a).zIndex || 0, zb = +getComputedStyle(b).zIndex || 0; return za - zb; });
  const top = open[open.length - 1];
  if (top.id === 'conflictModal') return false;                 // 3 distinct choices -> the user decides
  let btn = null;
  if (top.id === 'confirmModal') btn = $('#cm-yes');
  else if (top.id === 'promptModal') btn = $('#pm-yes');
  else {
    const foot = top.querySelector('.foot') || top.querySelector('.sheet') || top;
    const c = [...foot.querySelectorAll('.sbtn:not(.ghost)')].filter(b => b.offsetParent !== null && !b.disabled);
    btn = c[c.length - 1] || null;
  }
  if (btn && btn.offsetParent !== null && !btn.disabled) { btn.click(); return true; }
  return false;
}

let _installed = false;

/**
 * Wires the dialog buttons and installs the Escape / Enter handlers.
 * Called ONCE from index.html, at the exact place the inline code used to run,
 * so the capture-phase listener order is preserved.
 */
export function initDialogs() {
  if (_installed) return;
  _installed = true;

  $('#cm-yes').onclick = () => { $('#confirmModal').classList.remove('open'); if (_cmResolve) _cmResolve(true); };
  $('#cm-no').onclick = () => { $('#confirmModal').classList.remove('open'); if (_cmResolve) _cmResolve(false); };
  $('#cf-reload').onclick = () => _cfDone('reload');
  $('#cf-save').onclick = () => _cfDone('save');
  $('#cf-cancel').onclick = () => _cfDone('cancel');

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // let an open searchable dropdown handle its own Escape first
    if ($('#maplist') && $('#maplist').classList.contains('open')) return;
    if (_closeTopModal()) e.preventDefault();
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = (document.activeElement && document.activeElement.tagName) || '';
    if (t === 'TEXTAREA' || t === 'INPUT' || t === 'SELECT' || t === 'BUTTON' || t === 'A') return;   // these handle their own Enter
    if (!document.querySelector('.modal.open')) return;          // only while a modal/alert is open
    if (_validateTopModal()) e.preventDefault();
  }, true);

  $('#pm-yes').onclick = () => { $('#promptModal').classList.remove('open'); if (_pmResolve) _pmResolve($('#pm-input').value.trim()); };
  $('#pm-no').onclick = () => { $('#promptModal').classList.remove('open'); if (_pmResolve) _pmResolve(null); };
  $('#pm-input') && $('#pm-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#pm-yes').click(); });
}
