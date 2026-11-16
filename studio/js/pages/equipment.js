/* ============================================================================
   EQUIPMENT — the item at the centre, its satellites around it.

   Why this page exists: `Sets & Equip`, `Grow Equipment`, `Colors` and `Prefixes`
   were four independent tables of numbered columns. They are not independent —
   they are all SATELLITES OF AN ITEM, and none of them links to another. Shown
   apart, with no centre, they read as noise.

   Everything displayed here comes from the ZoneServer binary, not from guesswork:
   docs/studies/equipment_relations_re_2026-08-14.md

     · a set = fields 3..7 (five pieces) + fields 14..17 (bonus at 2/3/4/5 pieces)
     · fields 8..13 ARE PARSED AND NEVER READ AGAIN — the page says so out loud,
       because 109 of 446 sets put pieces there and they trigger nothing
     · a growable item = ONE item id with N stage rows (key = id + stage)
     · a prefix applies by item TYPE (c_item field 8), never by item id
     · a colour is applied at runtime; no item declares one — so no fake link

   ⛔ NO GLOBALS. Everything from the app arrives through `host`, posed once by
   initEquipment(). Same contract as crafting.js / classes.js.
   ============================================================================ */

import { initEquipEdit, isEditing, setEditing, renderSetEdit,
         wireSetActions, setHeaderActions, moveButton } from './equipment_edit.js';

let H = null;

const $          = s => H.$(s);
const esc        = s => H.esc(s);
const enc        = s => H.enc(s);
const toast      = (...a) => H.toast(...a);
const errMessage = e => H.errMessage(e);
const iconImg    = (...a) => H.iconImg(...a);
const iconMarkup = (...a) => H.iconMarkup(...a);
const navBack    = () => H.navBack();
const navTo      = t => H.navTo(t);          /* {etype,id} — JAMAIS une chaine */
const pushCurrent = () => { if (H.pushCurrent) H.pushCurrent(); };
const navLen     = () => H.navLen();
let EQIX  = null;         // index (sets + growables + palette), fetched once
let EQTAB = 'sets';       // 'sets' | 'grow' | 'colors'
let EQQ   = '';           // left-pane filter
let EQSEL = null;         // {kind:'set'|'item', id}

export function initEquipment(host){
  H = host;
  /* Le module d'edition ne connait pas `host` : on lui passe le strict necessaire. Il ne
     touche jamais au DOM en dehors du volet qu'on lui donne. */
  initEquipEdit({ esc: host.esc, toast: host.toast, errMessage: host.errMessage,
                  canEditData: host.canEditData, uiConfirm: host.uiConfirm });
}

/* ------------------------------------------------------------------ entry */
export function openEquipment(sel){
  document.body.classList.remove('home-view');
  /* ⛔ C'ETAIT `navTo('equipment')`. `navTo` attend un OBJET {etype,id} et redirige
     VERS une entite (voir crafting.js : `navTo({etype:'item',id:N})`). Avec une chaine,
     `t.etype` et `t.id` valent `undefined` : l'ouverture de cette page declenchait donc
     `GET /api/entity/undefined/undefined` -> 422, suivi d'un « not found » qui accusait
     l'entite alors que c'est la REQUETE qui etait malformee. Trois bandeaux d'erreur a
     chaque visite, dont deux qui designaient le mauvais coupable.
     L'intention etait d'empiler la vue courante pour le bouton « ← Back » : c'est
     `pushCurrent()`, la moitie de `navTo` qui ne redirige pas.
     ⚠️ Seulement si la page n'est PAS deja a l'ecran : `equipmentSnapshot().restore()`
     rappelle openEquipment(), et empiler la vue equipement sur elle-meme rendrait le
     bouton retour incapable de sortir de cette page. */
  if(!document.getElementById('eq-right')) pushCurrent();
  if(sel) EQSEL = sel;
  render();
}

/* Lets the app's «← Back» remember an equipment selection, like craftingSnapshot(). */
export function equipmentSnapshot(){
  if(!(EQSEL && document.getElementById('eq-right'))) return null;
  const s = EQSEL, tab = EQTAB;
  return { label: s.kind === 'set' ? ('Set #' + s.id) : ('Item #' + s.id),
           restore: () => { EQTAB = tab; openEquipment(s); } };
}

async function render(){
  $('#content').innerHTML = '<div class="empty">⟡ loading equipment… ⟡</div>';
  if(!EQIX){
    try { EQIX = await (await fetch('/api/equipment')).json(); }
    catch(e){
      $('#content').innerHTML = '<div class="esub" style="padding:20px;color:var(--crimson)">'
        + 'could not load equipment — ' + esc(errMessage(e)) + '</div>';
      return;
    }
  }
  const tab = (k, label, n) =>
    `<button class="clsrace${EQTAB===k?' on':''}" data-eqtab="${k}"><span>${esc(label)} <b>${n}</b></span></button>`;

  $('#content').innerHTML = `<div class="clspage">
    <div class="clstoolbar">
      <div class="clstitle">${navLen()?'<span class="backbtn" id="eq-navback">← Back</span> ':''}${iconMarkup('links',24)} Equipment</div>
      <div class="clsraces">
        ${tab('sets','Sets',EQIX.sets.length)}
        ${tab('grow','Growable',EQIX.grow_items)}
        ${tab('colors','Colours',(EQIX.colors||[]).length)}
      </div>
      <span class="grow"></span>
      <div class="clsfind"><span>${iconMarkup('search',24)}</span><input id="eq-q" placeholder="Filter…" value="${esc(EQQ)}"></div>
    </div>
    <div class="clsbody">
      <div class="clsleft" id="eq-left">${renderLeft()}</div>
      <div class="clsright" id="eq-right"><div class="empty">${EQSEL?'⟡ loading… ⟡':'⟡ pick a set or an item ⟡'}</div></div>
    </div></div>`;

  const b = $('#eq-navback'); if(b) b.onclick = () => navBack();
  const q = $('#eq-q');
  if(q) q.oninput = () => { EQQ = q.value; const L = $('#eq-left'); if(L){ L.innerHTML = renderLeft(); wireLeft(); } };
  $('#content').querySelectorAll('[data-eqtab]').forEach(t => {
    t.onclick = () => { EQTAB = t.dataset.eqtab; EQQ = ''; render(); };
  });
  wireLeft();
  if(EQSEL) openSelection(EQSEL);
}

/* ------------------------------------------------------------- left pane */
function renderLeft(){
  const q = EQQ.trim().toLowerCase();
  const hit = (name, id) => !q || String(id).includes(q) || (name||'').toLowerCase().includes(q);

  if(EQTAB === 'colors'){
    const cols = (EQIX.colors||[]).filter(c => hit(c.name, c.id));
    if(!cols.length) return empty('no colour matches');
    /* The swatch IS the preview: three numbers become a colour you can see. */
    return `<div class="eqswatches">` + cols.map(c =>
      `<div class="eqsw" title="${esc(c.name)} — rgb(${c.rgb.join(', ')}) · packed ${c.packed}">
         <span class="eqswc" style="background:${c.hex}"></span>
         <span class="eqswid">#${c.id}</span></div>`).join('') + `</div>`;
  }

  if(EQTAB === 'grow'){
    const gs = EQIX.grow.filter(g => hit(g.name, g.id));
    if(!gs.length) return empty('no growable item matches');
    return gs.map(g => `<div class="clsrow${sel('item',g.id)?' on':''}" data-eqitem="${g.id}">
      <div class="clsrowtx"><div class="clsrowname">${esc(g.name)}</div>
        <div class="clsrowsub">${g.stages} stages</div></div>
      <span class="clsrowid">#${g.id}</span></div>`).join('');
  }

  const ss = EQIX.sets.filter(s => hit(s.name, s.id));
  if(!ss.length) return empty('no set matches');
  return ss.map(s => {
    const flags = [];
    if(s.broken) flags.push('<span class="eqflag bad" title="Fewer than 2 pieces in the fields the server reads (3-7): this set can never trigger.">inert</span>');
    if(s.dead)   flags.push(`<span class="eqflag warn" title="${s.dead} piece(s) declared in fields 8-13, which the ZoneServer never reads.">${s.dead} ignored</span>`);
    return `<div class="clsrow${sel('set',s.id)?' on':''}" data-eqset="${s.id}">
      <div class="clsrowtx"><div class="clsrowname">${esc(s.name||('#'+s.id))} ${flags.join(' ')}</div>
        <div class="clsrowsub">${s.pieces} piece${s.pieces===1?'':'s'} · ${s.bonuses} bonus tier${s.bonuses===1?'':'s'}</div></div>
      <span class="clsrowid">#${s.id}</span></div>`;
  }).join('');
}

const empty = m => `<div class="esub" style="padding:14px;color:var(--faint)">${esc(m)}</div>`;
const sel = (k, id) => EQSEL && EQSEL.kind === k && EQSEL.id === id;

function wireLeft(){
  $('#content').querySelectorAll('[data-eqset]').forEach(r =>
    r.onclick = () => openSelection({kind:'set',  id:+r.dataset.eqset}));
  $('#content').querySelectorAll('[data-eqitem]').forEach(r =>
    r.onclick = () => openSelection({kind:'item', id:+r.dataset.eqitem}));
}

/* ------------------------------------------------------------ right pane */
async function openSelection(s){
  // changer de selection quitte l'edition : garder le mode actif sur un AUTRE set
  // ferait croire qu'on edite celui qu'on regarde.
  if(EQSEL && !(EQSEL.kind === s.kind && EQSEL.id === s.id)) setEditing(false);
  EQSEL = s;
  $('#content').querySelectorAll('.clsrow').forEach(r => r.classList.remove('on'));
  const cur = $('#content').querySelector(s.kind === 'set' ? `[data-eqset="${s.id}"]` : `[data-eqitem="${s.id}"]`);
  if(cur) cur.classList.add('on');

  const box = $('#eq-right');
  if(box) box.innerHTML = '<div class="empty">⟡ loading… ⟡</div>';
  let d;
  try { d = await (await fetch(s.kind === 'set' ? `/api/equipset/${s.id}` : `/api/equipment/${s.id}`)).json(); }
  catch(e){ if(box) box.innerHTML = '<div class="esub" style="padding:20px;color:var(--crimson)">' + esc(errMessage(e)) + '</div>'; return; }
  if(d && d.detail){ if(box) box.innerHTML = empty(d.detail); return; }
  if(box) box.innerHTML = s.kind === 'set' ? renderSet(d) : renderItem(d);
  if(box) box.querySelectorAll('[data-goitem]').forEach(el =>
    el.onclick = () => openSelection({kind:'item', id:+el.dataset.goitem}));
  if(box) box.querySelectorAll('[data-goset]').forEach(el =>
    el.onclick = () => { EQTAB = 'sets'; openSelection({kind:'set', id:+el.dataset.goset}); });
  if(box && s.kind === 'set')
    wireSetActions(box, d,
      id => openSelection({kind:'set', id}),                       // relit l'API, ne suppose rien
      id => { EQIX = null; EQSEL = {kind:'set', id}; render(); }); // un set de plus a gauche
}

function itemCell(it, sub, attr){
  if(!it) return `<div class="eqcell ph"><span class="eqcellic">◆</span><div class="eqcelltx"><div class="eqcelln">—</div></div></div>`;
  const ic = iconImg('item', it.icon, 'eqcellic') || '<span class="eqcellic ph">◆</span>';
  return `<div class="eqcell${it.exists?'':' missing'}" data-goitem="${it.id}" ${attr||''}
    title="${esc(it.name)} (#${it.id})${it.exists?'':' — MISSING from c_item'}">
    ${ic}<div class="eqcelltx"><div class="eqcelln">${esc(it.name)}</div>
    <div class="eqcells">#${it.id}${sub?' · '+esc(sub):''}</div></div></div>`;
}

function renderSet(d){
  if (isEditing()) return renderSetEdit(d);
  const pieces = d.pieces.length
    ? d.pieces.map(p => itemCell(p.item, 'field ' + p.field + (p.type!=null?' · type '+p.type:''))).join('')
    : empty('no piece in fields 3-7 — the server sees nothing to combine');

  /* The bonus chain is the whole point of a set, and it was invisible before:
     each tier resolves to a pseudo-item whose ENCHANT carries the real effect. */
  const bonus = d.bonuses.map(b => {
    if(!b.active) return `<div class="eqbon off" title="Field ${b.field} is empty: no bonus at ${b.pieces} pieces.">
      <span class="eqbonn">${b.pieces}p</span><span class="eqbontx">— none —</span></div>`;
    const en = b.enchant
      ? `<span class="eqbonen" title="Enchant #${b.enchant.id} — this is where the effect actually lives (c_item field 23).">✨ ${esc(b.enchant.name || ('#'+b.enchant.id))}</span>`
      : `<span class="eqbonen none" title="The bonus item declares no enchant, so it grants nothing.">no enchant</span>`;
    return `<div class="eqbon"><span class="eqbonn">${b.pieces}p</span>
      <span class="eqbontx" data-goitem="${b.item.id}">${esc(b.item.name)}</span>${en}
      <span class="eqbonf">field ${b.field}</span></div>`;
  }).join('');

  const dead = d.dead_pieces.length ? `
    <div class="eqwarn">
      <div class="eqwarnh">⛔ ${d.dead_pieces.length} piece(s) the ZoneServer never reads</div>
      <div class="eqwarnb">These sit in fields 8-13. <code>InitEquipSetID</code> — the only writer of
        <code>EquipSetPool</code> — builds its combinations from fields 3-7 only, so these items
        trigger no bonus at all. Moving them into fields 3-7 is what would make them count.</div>
      <div class="eqcells-row">${d.dead_pieces.map((p, i) =>
        `<div class="eqdeadwrap">${itemCell(p.item, 'field ' + p.field)}${moveButton(d, p.field, i)}</div>`
      ).join('')}</div>
    </div>` : '';

  return `<div class="eqpane">
    <div class="eqhead"><div class="eqheadn">${esc(d.name_en || ('Equip Set #'+d.id))}</div>
      <div class="eqheads">Equip Set #${d.id} · needs at least ${d.min_pieces} pieces worn${
        d.name_en ? '' : ' · <span class="eqhint">no English name in T_EquipSet.ini</span>'}${
        d.name_big5 ? ' · <span class="eqbig5" title="Big5 name from C_EquipSet.ini field 1">'+esc(d.name_big5)+'</span>' : ''}</div>
      ${setHeaderActions()}</div>
    <div class="eqsec"><div class="eqsech">Pieces the server reads <span class="eqhint">fields 3-7</span></div>
      <div class="eqcells-row">${pieces}</div></div>
    ${dead}
    <div class="eqsec"><div class="eqsech">Bonus chain <span class="eqhint">bonus = field[14 + worn − 2]</span></div>
      <div class="eqbons">${bonus}</div></div>
  </div>`;
}

function renderItem(d){
  const it = d.item;
  const ic = iconImg('item', it.icon, 'eqbigic') || '<span class="eqbigic ph">◆</span>';

  const sets = d.sets.length ? d.sets.map(s => `
    <div class="eqlink" data-goset="${s.id}">
      <span class="eqlinkn">${esc(s.name_en || s.name_big5 || ('#'+s.id))}</span>
      <span class="eqlinks">#${s.id} · ${s.pieces.length} pieces · ${s.bonuses.filter(b=>b.active).length} bonus tiers</span>
    </div>`).join('') : empty('belongs to no set');

  const ignored = d.sets_ignored.length ? `
    <div class="eqwarn"><div class="eqwarnh">⛔ listed in ${d.sets_ignored.length} set(s), but in a dead field</div>
    <div class="eqwarnb">This item appears in fields 8-13 of those sets, which the server never reads —
      wearing it contributes nothing.</div>
    <div class="eqbons">${d.sets_ignored.map(s => `<div class="eqlink" data-goset="${s.id}">
      <span class="eqlinkn">${esc(s.name_en || ('#'+s.id))}</span><span class="eqlinks">#${s.id}</span></div>`).join('')}</div></div>` : '';

  /* Growth stages: a curve, not a 25-column grid. We chart the widest-ranging
     numeric field so the progression is visible at a glance. */
  const grow = d.grow_stages.length ? `
    <div class="eqsec"><div class="eqsech">Growth stages <span class="eqhint">${d.grow_stages.length} stages · one c_item row each</span></div>
      ${renderGrowChart(d.grow_stages)}</div>` : '';

  const bonusOf = d.bonus_of.length ? `
    <div class="eqsec"><div class="eqsech">This item IS a set bonus</div>
      <div class="eqbons">${d.bonus_of.map(b => `<div class="eqlink" data-goset="${b.set_id}">
        <span class="eqlinkn">${esc(b.set_name || ('Set #'+b.set_id))}</span>
        <span class="eqlinks">granted at ${b.pieces} pieces</span></div>`).join('')}</div></div>` : '';

  return `<div class="eqpane">
    <div class="eqbig">${ic}
      <div class="eqbigtx"><div class="eqbign">${esc(it.name_en || it.name || ('#'+it.id))}</div>
        <div class="eqbigs">Item #${it.id}${it.type!=null?' · type '+it.type:''}</div>
        ${d.enchant?`<div class="eqbige">✨ enchant #${d.enchant.id} ${esc(d.enchant.name||'')}</div>`:''}
      </div></div>
    <div class="eqsec"><div class="eqsech">Sets it belongs to</div>${sets}</div>
    ${ignored}${bonusOf}${grow}
    <div class="eqsec"><div class="eqsech">Prefixes that can roll on it
      <span class="eqhint">matched by TYPE ${it.type}, never by item id</span></div>
      <div class="eqprefix">${d.prefix_kinds
        ? `<b>${d.prefix_kinds}</b> distinct prefix${d.prefix_kinds===1?'':'es'} · <b>${d.prefix_count}</b> records`
          + (d.prefixes.length < d.prefix_kinds ? ` <span class="eqhint">(showing top ${d.prefixes.length})</span>` : '')
        : 'no prefix targets this item type'}</div>
      <div class="eqchips">${d.prefixes.map(p =>
        `<span class="eqchip" title="${esc(p.name)} — ${p.count} record(s), ids ${p.ids.slice(0,10).join(', ')}${p.ids.length<p.count?'…':''}${p.grades.length?'\ngrades: '+esc(p.grades.join(', ')):''}">${esc(p.name)}<b class="eqchipn">${p.count}</b></span>`).join('')}</div>
    </div>
  </div>`;
}

/* A compact inline sparkline of the growth curve. Picks the numeric field whose
   value climbs the most across stages — that's the one worth showing. */
function renderGrowChart(stages){
  const series = {};
  stages.forEach((s, i) => s.fields.forEach(f => {
    const v = Number(f.value);
    if(!Number.isFinite(v)) return;
    (series[f.label] = series[f.label] || [])[i] = v;
  }));
  let best = null;
  for(const [label, vals] of Object.entries(series)){
    const clean = vals.filter(Number.isFinite);
    if(clean.length < stages.length * 0.8) continue;      // partial series lie about the curve
    const span = Math.max(...clean) - Math.min(...clean);
    if(span > 0 && (!best || span > best.span)) best = {label, vals: clean, span};
  }
  const rows = stages.map(s =>
    `<span class="eqstage" title="${s.fields.map(f=>esc(f.label)+': '+esc(f.value)).join('\n')}">${s.stage}</span>`).join('');
  if(!best) return `<div class="eqstages">${rows}</div>`;
  const max = Math.max(...best.vals), min = Math.min(...best.vals);
  const bars = best.vals.map((v, i) =>
    `<span class="eqbar" style="height:${Math.max(2, Math.round((v-min)/(max-min)*100))}%"
      title="stage ${stages[i]?stages[i].stage:i+1} — ${esc(best.label)}: ${v}"></span>`).join('');
  return `<div class="eqchart"><div class="eqchartl">${esc(best.label)} <b>${min} → ${max}</b></div>
    <div class="eqbars">${bars}</div></div><div class="eqstages">${rows}</div>`;
}
