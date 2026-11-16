import { LINE_AV } from './line_map.js';
import { hasLine, maskHtml } from './line_icons.js';

const AV_SET = new Set(LINE_AV);

function featureLine(name) {
  const k = String(name || '');
  const n = k.startsWith('_') ? 'f-priv-' + k.slice(1).replace(/_/g, '-') : 'f-' + k.replace(/_/g, '-');
  return hasLine(n) ? n : '';
}

function partLine(key) {
  const n = 'p-' + String(key || '').replace(/_/g, '-');
  return hasLine(n) ? n : '';
}

export function tileHtml(n, size = 40, ratio = 0.55, cls = '') {
  if (!n) return '';
  return '<span class="li-tile' + (cls ? ' ' + cls : '') + '" style="width:' + size + 'px;height:' + size + 'px">' + maskHtml(n, Math.round(size * ratio), '') + '</span>';
}

export function featureFileLine(src) {
  const m = /^(?:\/[\w-]+)?\/icons\/features\/(parts\/)?([^/?#]+)\.png/.exec(String(src || ''));
  if (m) return m[1] ? partLine(decodeURIComponent(m[2])) : featureLine(decodeURIComponent(m[2]));
  const a = /^(?:\/[\w-]+)?\/api\/features\/icon\/([^/?#]+)/.exec(String(src || ''));
  return a ? featureLine(decodeURIComponent(a[1])) : '';
}

function avatarName(crest, role, isBot) {
  if (isBot) return 'av-bot';
  const c = String(crest || '').toLowerCase().replace(/_/g, '-');
  if (c) {
    if (c === 'super-admin') return 'av-super-admin';
    if (AV_SET.has('av-' + c)) return 'av-' + c;
    if (AV_SET.has('av-' + c + '-male')) return 'av-' + c + '-male';
  }
  if (String(role || '').toUpperCase() === 'SA') return 'av-super-admin';
  return 'av-staff';
}

function hashOf(s) {
  let h = 0;
  const t = String(s || '');
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h;
}

function avatarTint(role, account) {
  const r = String(role || '').toUpperCase();
  if (r === 'GM' || r === 'CM' || r === 'GS' || r === 'SA') return r.toLowerCase();
  return 'h' + (hashOf(account) % 6);
}

export function avatarHtml(o) {
  const size = o.size || 32;
  const n = avatarName(o.crest, o.role, o.bot);
  const tint = o.bot ? 'bot' : avatarTint(o.role, o.account);
  const t = o.title ? ' title="' + String(o.title).replace(/"/g, '&quot;') + '"' : '';
  return '<span class="li-av li-av-' + tint + (o.cls ? ' ' + o.cls : '') + '" style="width:' + size + 'px;height:' + size + 'px"' + t + '>' + maskHtml(n, Math.round(size * 0.68), '') + '</span>';
}
