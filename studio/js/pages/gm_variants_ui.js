import { esc } from '../core/dom.js';

export const S = { data: null, q: '', cat: '', sel: null, vals: [], raw: '', copied: false, more: false, fav: [], recent: [] };

const LABEL = { number: 'Number', word: 'Name', rest_input: 'Text' };
const CAT_ICON = {
  'Admin & System': 'settings', 'Appearance': 'color', 'Character & Progress': 'level', 'Chat & Broadcast': 'megaphone',
  'Combat & Cheats': 'stat_atk', 'Guild & Town': 'guild', 'Housing & Farm': 'home', 'Items & Economy': 'bag',
  'Misc': 'options', 'Monsters & NPCs': 'creatures', 'PvP & Battles': 'pvp', 'Quests & Events': 'objectives',
  'Teleport & Position': 'map', 'World & Nodes': 'mountains',
};

const snap = n => [48, 64, 128, 256].find(x => x >= n) || 256;

export const ic = (name, px) => `<img class="gi" src="/studio/icons/icons/${snap(px * 2)}/${name}.png" srcset="/studio/icons/icons/${snap(px * 2)}/${name}.png 1x, /studio/icons/icons/${snap(px * 4)}/${name}.png 2x" width="${px}" height="${px}" alt="">`;
export const catIcon = (c, px) => ic(CAT_ICON[c] || 'gm_commands', px);
export const short = c => c.split(/[ &]/)[0];
export const key = c => c.src + ':' + c.name;
export const full = c => c.prefix + c.template;
export const byKey = k => (S.data.commands || []).find(c => key(c) === k);
export const cmdsOf = () => S.data.commands || [];

export function filtered() {
  const q = S.q.toLowerCase().trim();
  const pool = S.cat === '__fav' ? S.fav : S.cat === '__recent' ? S.recent : null;
  if (pool) return pool.map(byKey).filter(Boolean).filter(c => !q || c.template.toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q));
  return cmdsOf().filter(c => (!S.cat || c.cat === S.cat) && (!q || c.template.toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q)));
}

const fieldsOf = c => [...c.template.matchAll(/<([^>]*)>/g)].map(m => m[1]);

export function compose() {
  if (!S.sel) return '';
  let i = 0;
  return full(S.sel).replace(/<([^>]*)>/g, m => (S.vals[i++] || '').trim() || m);
}

const badge = c => c.src === 'gmtool' ? '<span class="gmv-bdg">GMTool</span>' : c.src === 'st' ? '<span class="gmv-bdg">st</span>' : '';

export function searchBox(huge) {
  return `<div class="gmv-search${huge ? ' huge' : ''}">${ic('search', huge ? 40 : 24)}<input id="gmv-q" placeholder="Search a command, an arg, a note…" aria-label="Search GM commands" value="${esc(S.q)}" autocomplete="off"></div>`;
}

export function card() {
  const c = S.sel;
  if (!c) return `<div class="gmv-card empty">${ic('gm_commands', 64)}<div style="font-family:Cinzel">Pick a command</div></div>`;
  const fav = S.fav.includes(key(c));
  const types = fieldsOf(c), seen = {}, tot = {};
  types.forEach(t => { tot[t] = (tot[t] || 0) + 1; });
  const fs = types.map((t, i) => {
    seen[t] = (seen[t] || 0) + 1;
    const lab = (LABEL[t] || t) + (tot[t] > 1 ? ' ' + seen[t] : '');
    return `<label class="gmv-f">${esc(lab)}<input id="gmv-f${i}" data-i="${i}" value="${esc(S.vals[i] || '')}" autocomplete="off"${t === 'number' ? ' inputmode="numeric"' : ''}></label>`;
  }).join('');
  return `<div class="gmv-card"><div class="gmv-ct"><code>${esc(c.prefix + c.name)}</code>${badge(c)}`
    + `<button class="gmv-ib" data-act="fav" style="${fav ? '' : 'opacity:.35'}">${ic('favorite', 32)}</button></div>`
    + (c.note ? `<div class="gmv-note">${esc(c.note)}</div>` : '')
    + (fs ? `<div class="gmv-fields">${fs}</div>` : '')
    + `<div class="gmv-prev" id="gmv-prev">${esc(S.raw)}</div>`
    + `<button class="sbtn gmv-copy${S.copied ? ' ok' : ''}" data-act="copy">${S.copied ? ic('check_green', 28) + ' Copied' : ic('copy', 28) + ' Copy'}</button></div>`;
}

export function rows(list, o = {}) {
  const cap = o.cap || 200;
  let h = '<div class="gmv-rows">';
  for (const c of list.slice(0, cap)) {
    const on = S.sel && key(S.sel) === key(c);
    h += `<div class="gmv-row${on ? ' on' : ''}" data-act="pick" data-k="${esc(key(c))}">`
      + `<span class="nm">${esc(c.prefix + c.name)}</span>${badge(c)}<span class="nt">${esc(c.note || '')}</span>`
      + `<span class="rc"><button class="gmv-ib" data-act="rowcopy" data-k="${esc(key(c))}">${ic('copy', 24)}</button></span></div>`;
  }
  h += '</div>';
  if (list.length > cap) h += `<div class="gmv-sec">${ic('filter', 24)} +${list.length - cap}</div>`;
  if (!list.length) h = `<div class="gmv-sec">${ic('missing', 32)}</div>`;
  return h;
}

export function more(total, shown) {
  return `<div class="gmv-more${S.more ? ' open' : ''}"><button class="mb" data-act="more">${ic('options', 24)} More</button>`
    + `<div class="mp"><input id="gmv-raw" value="${esc(S.raw)}" autocomplete="off">`
    + `<div class="note">${shown} / ${total} commands</div>`
    + `<div class="note"><span class="gmv-bdg">GMTool</span> channel command &nbsp; <span class="gmv-bdg">st</span> special table</div></div></div>`;
}
