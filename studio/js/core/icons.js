/* ============================================================================
   core/icons.js — THE single entry point for the icon set.

   Why this file exists (AUDIT §2.1 / §5) : the ~200-character <img srcset …>
   markup was retyped 112 times across 53 distinct icons. Three of the nine
   confirmed bugs (B1, B2, B5) are direct consequences: with no component, raw
   markup ended up in TEXT fields and was shown literally to the user.

   Rules enforced here:
     • one function builds the <img>, nobody else;
     • an unknown name NEVER produces a broken image — it produces a visible
       neutral marker AND is recorded in a list you can consult
       (missingIcons() / window.__edenMissingIcons);
     • the returned value is a DOM Node, so it can never be stringified into a
       textContent by accident.

   Disk layout (verified 2026-08-06):
     static/icons/icons/{24,32,48,64,128,256}/<name>.png   84 names × 6 sizes
     static/icons/<other>.png                              role crests, env
                                                           badges, res_*, orb_*
   ============================================================================ */

import { lineSvg } from '../ui/line_icons.js';
import { modernOn } from '../ui/modern_gate.js';

/** Sizes physically present on disk. */
const ICON_SIZES   /* interne : _snap() */ = Object.freeze([24, 32, 48, 64, 128, 256]);

/** The 172 icons present in static/icons/icons/<size>/ — every size has all 172.
    Keep in sync when icons are added; `npm`-free on purpose, this is a literal.

    ⛔ A name missing from THIS list is not merely undrawn: hasIcon() returns false, so
    iconEl() renders the dashed red placeholder even though the PNG sits on disk. Adding
    files without adding their names here shows a broken icon on a working asset. */
const ICON_NAMES   /* interne : _KNOWN */ = Object.freeze([
  'accounts', 'action_journal', 'actions', 'add', 'add_item', 'add_recipe', 'ai_definition',
  'altar', 'altar_requests', 'animations', 'anvil_strike', 'appears_in', 'arcane_box', 'archive',
  'asset_guard', 'attach', 'back', 'badge', 'bag', 'balance', 'barrier',
  'basket', 'both', 'break_point', 'bug', 'cart', 'changelog', 'check_for_updates',
  'check_green', 'chevron_double', 'chevron_silver', 'chevron_triple', 'chip', 'classes', 'clear_cache_restart',
  'client', 'client_deploy', 'color', 'comment', 'compare', 'content', 'cooldown',
  'crafting', 'creatures', 'crown', 'database', 'day_night', 'delete', 'depack',
  'deploy_to_server', 'dice', 'dna', 'document', 'drops', 'duration', 'edit',
  'enchants', 'envelope', 'error', 'exp', 'expand', 'export', 'fab_add',
  'favorite', 'feature', 'female', 'flag', 'fleur', 'forbidden', 'frame',
  'game_servers', 'game_staff', 'generation_3d', 'get_latest_client', 'gm_commands', 'gold', 'guild',
  'guild_hall', 'halt', 'heal', 'home', 'idea', 'image', 'impact_hammer',
  'import', 'info', 'info_active', 'info_hover', 'ini_doctor', 'integrity', 'launch_game',
  'level', 'lifering', 'lifetime', 'links', 'live', 'lock', 'logout',
  'lorebook', 'male', 'map', 'medal', 'megaphone', 'memory_card', 'monster_ai',
  'mountains', 'mouse', 'move_to_category', 'multi_account_ip', 'music', 'network', 'new_category',
  'night_music', 'notifications', 'objectives', 'offline_players', 'operations', 'options', 'pacha_bot',
  'packaging', 'party', 'password', 'pause', 'pin', 'pk', 'potion',
  'preview', 'profile', 'propose_tag', 'pvp', 'rate', 'readiness', 'refresh',
  'relations', 'repack', 'replay_edits', 'restart_server', 'rewards', 'save', 'search',
  'settings', 'sex_race', 'skillbook', 'snapshots', 'sound', 'spawn', 'spellbook',
  'stat_accuracy', 'stat_atk', 'stat_crit', 'stat_def', 'stat_hp', 'stat_mdef', 'stat_movement',
  'stat_mp', 'stat_ranged', 'stat_speed', 'stop', 'structure_web', 'success', 'swap',
  'swoosh', 'thumbs_down', 'thumbs_up', 'transfer', 'treasure_archive', 'tree', 'undo',
  'usage_time', 'vault', 'warning', 'yields',
]);

const _KNOWN = new Set(ICON_NAMES);

/* ---- missing-name registry ------------------------------------------------ */

/** name -> {name, size, count, first} — every icon asked for but absent from disk. */
const _missing = new Map();

/** Consultable list of the icon names that were requested and do not exist.
    Also mirrored on `window.__edenMissingIcons` so it can be read from the
    console without importing anything. */
export function missingIcons() { return Array.from(_missing.values()); }

function _recordMissing(name, size) {
  const k = String(name);
  const e = _missing.get(k) || { name: k, size, count: 0, first: new Date().toISOString() };
  e.count++;
  _missing.set(k, e);
  try { window.__edenMissingIcons = missingIcons(); } catch (_) { }
  // one console line per distinct name, never a flood
  if (e.count === 1) console.warn('[icons] unknown icon name: ' + k + ' (rendered as a placeholder)');
}

/** True when `name` exists in the icon set. */
export function hasIcon(name) { return _KNOWN.has(String(name)); }

/** Nearest available size >= wanted (falls back to the largest). */
function _snap(size) {
  const n = +size || 24;
  return ICON_SIZES.find(s => s >= n) || ICON_SIZES[ICON_SIZES.length - 1];
}

/** 1x -> 2x pairing. Mirrors what the 112 hand-written <img> already do
    (index.html:1568 uses 32 -> 128, index.html:2563 uses 24 -> 64), so a
    migrated call site keeps requesting the very same two files. */
const RETINA = { 24: 64, 32: 128, 48: 128, 64: 256, 128: 256, 256: 256 };

/** Path of an icon file, without any existence check. */
function iconPath   /* interne : iconEl() */(name, size) { return '/studio/icons/icons/' + _snap(size) + '/' + name + '.png'; }

/**
 * Builds the icon as a DOM node — the ONLY sanctioned way to render an icon.
 *
 * @param {string} name  one of ICON_NAMES
 * @param {number} size  24 (default) | 32 | 48 | 64 | 128 | 256
 * @param {object} [opts]
 *        opts.title  -> tooltip (also used as alt when opts.alt is not given)
 *        opts.alt    -> accessible name; '' (default) marks it decorative
 *        opts.class  -> extra classes
 * @returns {HTMLElement} <img class="ui-icon ui-icon-N"> or, for an unknown
 *          name, a VISIBLE neutral marker <span class="ui-icon ui-icon-missing">.
 */
export function iconEl(name, size = 24, opts = {}) {
  const s = _snap(size);
  const extra = opts.class ? ' ' + opts.class : '';
  if (!hasIcon(name)) {
    _recordMissing(name, s);
    const ph = document.createElement('span');
    ph.className = 'ui-icon ui-icon-' + s + ' ui-icon-missing' + extra;
    ph.textContent = '?';
    ph.title = opts.title || ('missing icon: ' + name);
    // Inline style on purpose: no new CSS rule is added to index.html by this
    // wave, and the marker MUST be visible wherever it lands.
    ph.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;'
      + 'width:' + s + 'px;height:' + s + 'px;border:1px dashed #bf3a3a;border-radius:4px;'
      + 'color:#bf3a3a;font:700 ' + Math.max(9, Math.round(s * 0.5)) + 'px/1 "Open Sans",sans-serif;'
      + 'background:rgba(191,58,58,.08);vertical-align:middle;box-sizing:border-box';
    return ph;
  }
  const hi = RETINA[s] || s;                        // same 1x/2x pairing the hand-written markup used
  const img = document.createElement('img');
  img.src = iconPath(name, s);
  img.srcset = iconPath(name, s) + ' 1x, ' + iconPath(name, hi) + ' 2x';
  img.className = 'ui-icon ui-icon-' + s + extra;
  img.width = s; img.height = s;
  img.alt = opts.alt || '';
  if (!opts.alt) img.setAttribute('aria-hidden', 'true');
  if (opts.title) img.title = opts.title;
  return img;
}

/**
 * ⚠ LEGACY BRIDGE — returns the icon as an HTML STRING.
 *
 * Only for the existing code that assembles a big HTML string and hands it to
 * innerHTML. NEVER pass the result to textContent, to toast(), or to a dialog
 * TITLE: that is exactly bugs B1/B2/B5 (markup shown literally to the user).
 * New code must use iconEl() / icon() and get a Node.
 */
export function iconMarkup(name, size = 24) {
  if (modernOn()) { const svg = lineSvg(name, size); if (svg) return svg; }
  const n = iconEl(name, size);
  const d = document.createElement('div');
  d.appendChild(n);
  return d.innerHTML;
}
