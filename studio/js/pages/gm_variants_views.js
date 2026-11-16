import { S, ic, catIcon, short, filtered, searchBox, card, rows } from './gm_variants_ui.js';
import { esc } from '../core/dom.js';

const RAIL = [['', 'All', 'gm_commands'], ['__fav', 'Favourites', 'favorite'], ['__recent', 'Recent', 'history']];

function view3() {
  const pseudo = RAIL.map(r => `<div class="gmv-rb${S.cat === r[0] ? ' on' : ''}" data-act="cat" data-c="${r[0]}" title="${r[1]}">${ic(r[2], 32)}<span>${r[1]}</span></div>`).join('');
  const cats = (S.data.categories || []).map(c => `<div class="gmv-rb${S.cat === c ? ' on' : ''}" data-act="cat" data-c="${esc(c)}" title="${esc(c)}">${catIcon(c, 32)}<span>${esc(short(c))}</span></div>`).join('');
  return `<div class="gmv-split"><div class="gmv-rail">${pseudo}${cats}</div><div>${searchBox(false)}<div class="gmv-scroll" style="margin-top:10px">${rows(filtered())}</div></div><div class="gmv-side gmv-sticky">${card()}</div></div>`;
}

export const VIEW = view3;
