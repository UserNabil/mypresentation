/* ============================================================================
   pages/gm_commands.js — the "GM commands" modal.

   MOVED from static/index.html:7914-7959 (module block). Picked as the first
   page to extract because it is the most isolated one in the audit's map:
   46 lines, no shared state, no cross-page call. Its only dependencies are
   $ , esc , toast and the #gmmodal markup that stays in index.html
   (#gm-cats #gm-q #gm-list #gm-count #gm-compose #gm-cmdline #gm-copy #gm-close,
   opened from the navbar button #btn-gmcmds).

   The code below is the original, unchanged, except that:
     • the three event wirings that sat between the two functions are grouped in
       initGmCommands(), called once from index.html at the same place;
     • `esc` and `toast` now come from imports instead of module-level globals.
   It still builds its rows with innerHTML and still uses the 📋 emoji rather
   than icon('export'); rewriting it on components.js is a later wave — this one
   only proves the extraction path, it changes nothing on screen.
   ============================================================================ */

import { $, esc } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { gmvOpen } from './gm_variants.js';

let _gmData = null, _gmCat = '';

function openGmCmds()   /* interne : appele par initGmCommands */ {
  $('#gmmodal').classList.add('open');
  if (_gmData) { gmRender(); gmvOpen(_gmData); return; }
  fetch('/api/gm/commands').then(r => r.json()).then(j => {
    _gmData = j;
    const cats = [''].concat(j.categories || []);
    $('#gm-cats').innerHTML = cats.map(c => `<span class="fchip${c === _gmCat ? ' on' : ''}" data-c="${esc(c)}" style="cursor:pointer">${esc(c || 'All')}</span>`).join('');
    $('#gm-cats').querySelectorAll('.fchip').forEach(ch => ch.onclick = () => {
      _gmCat = ch.dataset.c;
      $('#gm-cats').querySelectorAll('.fchip').forEach(x => x.classList.toggle('on', x === ch)); gmRender();
    });
    gmRender();
    gmvOpen(_gmData);
  }).catch(e => { $('#gm-list').innerHTML = '<span class="err">✗ ' + esc('' + e) + '</span>'; });
}

function gmRender()     /* interne : appele par openGmCmds */ {
  if (!_gmData) return;
  const q = ($('#gm-q').value || '').toLowerCase().trim();
  const list = (_gmData.commands || []).filter(c => (!_gmCat || c.cat === _gmCat)
    && (!q || c.template.toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q)));
  const SRC = { slash: '', gmtool: ' <span style="font-size:10px;padding:1px 5px;border-radius:6px;background:rgba(150,110,40,.25);color:#e2b93d" title="GMTool-channel command (not a / slash command)">GMTool</span>', st: ' <span style="font-size:10px;padding:1px 5px;border-radius:6px;background:rgba(90,90,150,.3)" title="special table RootCmds_st">st</span>' };
  let cur = '', h = '';
  for (const c of list.slice(0, 400)) {
    if (!_gmCat && c.cat !== cur) { cur = c.cat; h += `<div style="margin:10px 0 3px;font-weight:700;color:var(--gold2,#c9a227)">${esc(cur)}</div>`; }
    h += `<div class="gm-row" data-t="${esc(c.prefix + c.template)}" style="display:flex;gap:8px;align-items:baseline;padding:2px 4px;border-radius:5px;cursor:pointer">`
      + `<code style="font-family:ui-monospace,monospace;white-space:nowrap">${esc(c.prefix + c.template)}</code>${SRC[c.src] || ''}`
      + (c.note ? `<span class="cur" style="font-size:11px">${esc(c.note)}</span>` : '')
      + `<a href="#" class="gm-cp" data-t="${esc(c.prefix + c.template)}" style="margin-left:auto;text-decoration:none" title="copy"><img src="/studio/icons/icons/24/action_journal.png" srcset="/studio/icons/icons/24/action_journal.png 1x, /icons/icons/48/action_journal.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></a></div>`;
  }
  if (list.length > 400) h += `<div class="warn">… ${list.length - 400} more — refine the search.</div>`;
  if (!list.length) h = '<div class="cur">No command matches.</div>';
  $('#gm-list').innerHTML = h;
  $('#gm-count').textContent = list.length + ' / ' + (_gmData.commands || []).length + ' commands';
  const compose = t => { const c = $('#gm-compose'); c.style.display = 'flex'; $('#gm-cmdline').value = t; $('#gm-cmdline').focus(); };
  $('#gm-list').querySelectorAll('.gm-row').forEach(r => r.onclick = e => { if (e.target.closest('.gm-cp')) return; compose(r.dataset.t); });
  $('#gm-list').querySelectorAll('.gm-cp').forEach(a => a.onclick = async e => {
    e.preventDefault(); e.stopPropagation();
    try { await navigator.clipboard.writeText(a.dataset.t); toast('copied — paste it in the game chat'); }
    catch (_) { compose(a.dataset.t); }
  });
}

/** Wires the navbar button, the close button, the search box and the Copy
    button. Called once from index.html where the inline wiring used to be. */
export function initGmCommands() {
  $('#btn-gmcmds').onclick = () => openGmCmds();
  $('#gm-close').onclick = () => $('#gmmodal').classList.remove('open');
  $('#gm-q').oninput = () => gmRender();
  $('#gm-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#gm-cmdline').value); toast('copied — paste it in the game chat'); }
    catch (e) { toast('clipboard blocked — select the text and Ctrl+C', 'warn'); }
  };
}
