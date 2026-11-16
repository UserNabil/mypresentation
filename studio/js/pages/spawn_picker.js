/* ============================================================================
   pages/spawn_picker.js — modale « Add spawn » (choix d'une scene / donjon).

   PAGE TEMOIN de la decision d'architecture du 2026-08-06 (docs/DECISIONS.md).
   Elle prouve le motif d'extraction sur un cas reel et complet :

     * son HTML n'est plus dans index.html — il est construit ici, en NOEUDS,
       et insere au premier appel de initSpawnPicker(). La modale nait fermee
       (classe `modal` sans `open`), donc rien de visible ne depend du module :
       aucun risque de premier rendu, c'est ce qui rend les 50 modales
       extractibles alors que le HTML visible au boot ne l'est pas ;

     * ses dependances sur l'etat d'index.html (`CUR`, showOverlay, refresh)
       n'y sont pas codees en dur : elles arrivent par l'HOTE passe a l'init.
       Un module qui irait chercher `window.CUR` recreerait exactement le
       couplage qu'on defait — et le meme piege que les handlers en chaine de
       AUDIT §2.4 bis, ou du comportement dependait d'une portee globale.

   Trois defauts de la version en ligne sont corriges ici, tous constates :
     1. `hideOverlay()` n'etait PAS dans un `finally` : une erreur reseau
        laissait le voile « Adding spawn… » sur l'ecran, definitivement (B6) ;
     2. la recherche n'avait aucun `catch` : une reponse en erreur tuait le
        gestionnaire sans un mot a l'utilisateur ;
     3. `querySelectorAll('.pickrow span:last-child').forEach(x=>{})` etait une
        boucle VIDE — retiree : un `forEach` sans corps n'a aucun effet
        observable, ce n'est pas une fonctionnalite qu'on supprime.
   ============================================================================ */

import { $, el, clear, enc } from '../core/dom.js';
import { api, errMessage } from '../core/api.js';
import { toast } from '../ui/toast.js';

let HOTE = null;         // {current(), overlay(msg), hideOverlay(), afterAdd()}
let scene = null;        // code de la scene choisie
let minuteur = null;

/* ---- le HTML de la modale, en noeuds ------------------------------------- */

function champ(libelle, input, style) {
  return el('div', { class: 'fld', style: style || null }, el('label', {}, libelle), input);
}

function construire() {
  const q = el('input', { id: 'spk-q', placeholder: 'type to search…' });
  const liste = el('div', { id: 'spk-list', style: { maxHeight: '240px', overflow: 'auto' } });
  const nb = el('input', { id: 'spk-count', type: 'number', value: '1' });
  const resp = el('input', { id: 'spk-respawn', type: 'number', value: '600' });
  const annuler = el('button', { class: 'sbtn ghost', id: 'spk-cancel' }, 'Cancel');
  const ok = el('button', { class: 'sbtn', id: 'spk-ok' }, 'Add to scene');

  const modale = el('div', { class: 'modal', id: 'spawnpicker' },
    el('div', { class: 'sheet', style: { width: 'min(520px,92vw)' } },
      el('h2', {}, '<img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Add spawn — pick a scene / dungeon'),
      el('div', { class: 'body' },
        champ('Search scene (name or code)', q),
        liste,
        el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
          champ('Count', nb, { flex: '1', margin: '0' }),
          champ('Respawn (s)', resp, { flex: '1', margin: '0' })),
        el('div', { class: 'note', style: { color: 'var(--faint)', fontSize: '11.5px' } },
          'Position is copied from an existing spawn in the chosen scene (you can fine-tune '
          + 'X/Y later in the scene file). Writes client + server.')),
      el('div', { class: 'foot' }, annuler, ok)));

  annuler.onclick = () => modale.classList.remove('open');
  q.addEventListener('input', () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => chercher(q.value.trim(), liste), 200);
  });
  ok.onclick = () => ajouter(modale, nb, resp);
  document.body.appendChild(modale);
}

/* ---- recherche ----------------------------------------------------------- */

function ligneScene(s, liste) {
  const choisie = scene === s.code;
  const r = el('div', { class: 'pickrow' + (choisie ? ' sel' : ''), dataset: { code: s.code } },
    el('span', { class: 'lootslot' }, '<img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">'),
    el('div', { style: { flex: '1', minWidth: '0' } },
      el('div', { style: { color: 'var(--ink)', fontWeight: '600' } }, String(s.name == null ? '' : s.name)),
      el('div', { style: { fontSize: '11px', color: 'var(--faint)' } }, String(s.code == null ? '' : s.code))),
    el('span', { style: { color: 'var(--gold)', fontWeight: '700' } }, choisie ? '✓' : '+'));
  r.onclick = () => {
    scene = s.code;
    liste.querySelectorAll('.pickrow').forEach(x => x.classList.toggle('sel', x === r));
  };
  return r;
}

async function chercher(q, liste) {
  let j;
  try {
    j = await api.get('/api/scenes?limit=40&q=' + enc(q));
  } catch (e) {
    // La version en ligne n'avait AUCUN catch : l'erreur tuait le gestionnaire en silence.
    clear(liste).appendChild(el('div', { class: 'esub', style: { padding: '10px' } }, errMessage(e)));
    return;
  }
  const items = (j && j.items) || [];
  clear(liste);
  if (!items.length) {
    liste.appendChild(el('div', { class: 'esub', style: { padding: '10px' } }, 'No scene'));
    return;
  }
  for (const s of items) liste.appendChild(ligneScene(s, liste));
}

/* ---- ajout --------------------------------------------------------------- */

async function ajouter(modale, nb, resp) {
  if (!scene) { toast('pick a scene first'); return; }
  const cur = HOTE.current();
  if (!cur) return;
  HOTE.overlay('Adding spawn…');
  try {
    await api.post('/api/scene/' + scene + '/spawn/add',
      { monster_id: cur.id, count: +nb.value || 1, respawn: +resp.value || 600 });
    modale.classList.remove('open');
    toast('' + (cur.name_en || ('#' + cur.id)) + ' added to ' + scene + ' (revert in History)');
    HOTE.afterAdd();
  } catch (e) {
    toast('' + errMessage(e));
  } finally {
    HOTE.hideOverlay();          // ⛔ le `finally` que la version en ligne n'avait pas (B6)
  }
}

/* ---- API du module ------------------------------------------------------- */

/**
 * @param {object} hote
 *   hote.current()      -> l'entite courante (`CUR` cote index.html) ou null
 *   hote.overlay(msg)   -> affiche le voile d'attente
 *   hote.hideOverlay()  -> le retire
 *   hote.afterAdd()     -> rafraichit la vue appelante
 */
export function initSpawnPicker(hote) {
  HOTE = hote;
  if (!$('#spawnpicker')) construire();
}

/** Ouvre la modale. Sans entite courante, elle ne s'ouvre pas — comme avant. */
export function openSpawnPicker() {
  if (!HOTE || !HOTE.current()) return;
  scene = null;
  const q = $('#spk-q'), liste = $('#spk-list');
  if (q) q.value = '';
  if (liste) clear(liste);
  const nb = $('#spk-count'), resp = $('#spk-respawn');
  if (nb) nb.value = '1';
  if (resp) resp.value = '600';
  $('#spawnpicker').classList.add('open');
  if (q) q.focus();
}
