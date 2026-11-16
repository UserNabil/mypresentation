/* ============================================================================
   EQUIPMENT — l'edition (extrait d'equipment.js, qui depassait les 400 lignes).

   ⛔ TOUTE ECRITURE PASSE PAR /api/save. C'est le chemin BYTE-EXACT de la fiche
   d'entite : garde-fou de format (re-parse + comparaison), sauvegarde avant
   ecriture, journal d'audit, et synchro serveur. Ouvrir un second chemin
   d'ecriture pour ces catalogues, ce serait se donner deux fois l'occasion de
   corrompre un .ini a offsets fixes.

   Ce que l'edition sait faire de particulier ici : DEPLACER une piece d'un champ
   mort (8-13) vers un champ que le serveur lit (3-7). C'est le geste qui repare
   les 109 sets concernes, et il se fait en UNE ecriture — vider l'ancien champ
   et remplir le nouveau dans le meme appel, sinon une panne entre les deux
   laisserait l'objet en double.
   Carte des champs : docs/studies/equipment_relations_re_2026-08-14.md
   ========================================================================== */

let D = null;             // dependances posees par initEquipEdit()
let EDITING = false;      // le volet droit est-il en mode edition

export function initEquipEdit(deps) { D = deps; }
export const isEditing = () => EDITING;
export const setEditing = v => { EDITING = !!v; };

const esc = s => D.esc(s);
const toast = (...a) => D.toast(...a);
const errMessage = e => D.errMessage(e);
const canEdit = () => { try { return D.canEditData(); } catch { return false; } };

async function jpost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || ('HTTP ' + r.status));
  return j;
}

const saveFields = (etype, id, idxVal) =>
  jpost('/api/save', { edits: Object.entries(idxVal).map(([i, v]) =>
    ({ etype, id, kind: 'field', field_index: +i, value: String(v ?? '') })) });

/* Une case editable. La valeur est un ID D'OBJET et le champ vise est nomme sur la case :
   vider la case efface le champ — c'est le seul moyen de retirer une piece. */
const editCell = (field, id, label, hint) =>
  `<label class="eqedit" title="${esc(hint || '')}">
     <span class="eqeditf">${esc(label)}</span>
     <input class="eqediti" type="text" inputmode="numeric" data-field="${field}"
            value="${id ? esc(String(id)) : ''}" placeholder="empty" autocomplete="off">
   </label>`;

/* Les boutons de la vue LECTURE : passer en edition, dupliquer, deplacer une piece morte. */
export function setHeaderActions() {
  if (!canEdit()) return '';
  return `<div class="eqacts">
    <button class="hbtn" id="eq-edit">✎ Edit fields</button>
    <button class="hbtn" id="eq-dup" title="Clone this set under the next free id, byte-exact (client + server + text).">⧉ Duplicate</button>
  </div>`;
}

/* ⚠️ La cible depend du RANG de la piece, pas seulement du set : deux pieces mortes qui
   proposeraient toutes deux « → champ 3 » laisseraient croire qu'elles s'ecraseraient l'une
   l'autre. Chacune vise donc un champ libre distinct, et celle qui n'en a plus n'a pas de
   bouton — plutot qu'un bouton qui echouerait. */
export function moveButton(d, field, i) {
  const to = (d.free_piece_fields || [])[i || 0];
  if (!canEdit() || to == null) return '';
  return `<button class="hbtn eqmove" data-move="${field}" data-to="${to}"
    title="Move this item from field ${field} to field ${to}, which the server actually reads.">→ field ${to}</button>`;
}

/* ------------------------------------------------------------------ vue d'edition
   Les champs sont nommes par CE QU'ILS FONT, pas par leur numero. Les champs morts y
   figurent : les cacher priverait de la seule facon de les VIDER apres un deplacement,
   et les afficher comme les autres ferait croire qu'ils servent. */
export function renderSetEdit(d) {
  const byField = {};
  d.pieces.concat(d.dead_pieces).forEach(p => { byField[p.field] = p.item ? p.item.id : ''; });
  d.bonuses.forEach(b => { byField[b.field] = b.item ? b.item.id : ''; });

  const live = (d.piece_fields || []).map(f =>
    editCell(f, byField[f], 'piece · field ' + f,
             'Member item. The server combines fields 3-7 only.')).join('');
  const deadf = (d.dead_fields || []).map(f =>
    `<div class="eqedead">${editCell(f, byField[f], 'ignored · field ' + f,
      'The ZoneServer parses this field then never reads it. Keep it empty.')}</div>`).join('');
  const bon = (d.bonus_fields || []).map(b =>
    editCell(b.field, byField[b.field], `${b.pieces} pieces · field ${b.field}`,
      `Bonus granted at ${b.pieces} worn pieces. It is a pseudo-item whose ENCHANT carries the effect.`)).join('');

  return `<div class="eqpane">
    <div class="eqhead"><div class="eqheadn">✎ ${esc(d.name_en || ('Equip Set #' + d.id))}</div>
      <div class="eqheads">Editing C_EquipSet.ini / S_EquipSet.ini #${d.id} — values are item ids;
        clear a box to empty the field</div>
      <div class="eqacts">
        <button class="hbtn gold" id="eq-save">Save</button>
        <button class="hbtn" id="eq-cancel">Cancel</button>
      </div></div>
    <div class="eqsec"><div class="eqsech">Pieces the server reads <span class="eqhint">fields 3-7</span></div>
      <div class="eqedits">${live}</div></div>
    <div class="eqsec"><div class="eqsech">Fields the server ignores
      <span class="eqhint">parsed, then never read — keep them empty</span></div>
      <div class="eqedits">${deadf}</div></div>
    <div class="eqsec"><div class="eqsech">Bonus chain
      <span class="eqhint">bonus = field[14 + worn − 2]</span></div>
      <div class="eqedits">${bon}</div></div>
  </div>`;
}

/* `reopen(id)` re-interroge l'API : on ne rafraichit jamais l'ecran depuis ce qu'on CROIT
   avoir ecrit — c'est le serveur qui dit ce que le fichier contient. */
export function wireSetActions(box, d, reopen, reloadIndex) {
  if (EDITING) { wireEdit(box, d, reopen); return; }

  const e = box.querySelector('#eq-edit');
  if (e) e.onclick = () => { EDITING = true; reopen(d.id); };

  const dup = box.querySelector('#eq-dup');
  if (dup) dup.onclick = async () => {
    if (D.uiConfirm && !await D.uiConfirm(`Duplicate set #${d.id} under the next free id?`)) return;
    dup.disabled = true;
    try {
      const r = await jpost(`/api/entity/equipset/${d.id}/clone`, {});
      const nid = r.new_id ?? r.id;
      toast('Created set #' + nid, 'ok', 4000);
      reloadIndex(nid);                 // l'index de gauche a un set de plus
    } catch (ex) {
      toast('Clone refused — ' + errMessage(ex), 'error', 9000);
      dup.disabled = false;
    }
  };

  box.querySelectorAll('[data-move]').forEach(b => b.onclick = async () => {
    const from = +b.dataset.move, to = +b.dataset.to;   // la cible est celle affichee, pas re-devinee
    const p = (d.dead_pieces || []).find(x => x.field === from);
    if (!p || to == null) return;
    b.disabled = true; b.textContent = 'Moving…';
    try {
      await saveFields('equipset', d.id, { [from]: '', [to]: p.item.id });
      toast(`Item #${p.item.id} moved from field ${from} to field ${to} — it counts now`, 'ok', 5000);
      reopen(d.id);
    } catch (ex) {
      toast('Move refused — ' + errMessage(ex), 'error', 9000);
      b.disabled = false; b.textContent = '→ field ' + to;
    }
  });
}

function wireEdit(box, d, reopen) {
  const back = () => { EDITING = false; reopen(d.id); };
  const c = box.querySelector('#eq-cancel'); if (c) c.onclick = back;
  const s = box.querySelector('#eq-save');
  if (!s) return;
  s.onclick = async () => {
    const boxes = [...box.querySelectorAll('.eqediti')];
    const bad = boxes.filter(i => i.value.trim() && !/^\d+$/.test(i.value.trim()));
    if (bad.length) {
      toast('An item id is a number — check field ' + bad[0].dataset.field, 'error', 5000);
      bad[0].focus(); return;
    }
    const idxVal = {};
    boxes.forEach(i => { idxVal[i.dataset.field] = i.value.trim(); });
    s.disabled = true; s.textContent = 'Saving…';
    try {
      const r = await saveFields('equipset', d.id, idxVal);
      /* /api/save rend un etat PAR COUCHE. On le dit : un « ok » global masquerait un serveur
         non ecrit, or c'est le SERVEUR qui decide des bonus de set — le client ne fait que
         les afficher. Un set modifie cote client seul mentirait au joueur. */
      const L = r.layers || {};
      toast(`Saved — client ${L.client || '?'} · server ${L.server || '?'}`, r.ok ? 'ok' : 'warn', 6000);
      back();
    } catch (ex) {
      toast('Save refused — ' + errMessage(ex), 'error', 9000);
      s.disabled = false; s.textContent = 'Save';
    }
  };
}
