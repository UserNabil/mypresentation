/* ============================================================================
   APERÇU DES RECORDS — voir ce qu'il y a VRAIMENT dans les .ini, client et serveur.

   Pourquoi : « installe » ne dit que « l'id est present ». Il ne dit ni combien de champs porte le
   record, ni s'il a ete tronque par une ecriture ratee — et c'est cette difference qui a coute un
   client mort au boot et une soiree de recherche. Ici on montre les champs, on les compte, et on
   compare au nombre de colonnes que le fichier DECLARE lui-meme (`|V.11|78|`).

   Ce qui est signale, et rien d'autre :
     - record ABSENT du fichier ;
     - nombre de champs != nombre de colonnes declare  -> tronque ou en trop.
   Un fichier sans en-tete `|V.x|cols|` (les textes client) n'a pas de reference : on affiche le
   compte sans jamais accuser.

   ⚠ Le compte des champs se lit en cp950 et le record va d'un `<id>|` au suivant — pas d'un saut de
   ligne au suivant : les descriptions s'etalent sur plusieurs lignes, et l'octet 0x7C vit a
   l'interieur de milliers de noms Big5.

   Contrat d'appel (feature_manager_actions.js) :
     openRecordsPreview({ esc, toast, errMessage }, nomDeLaFeature)
   ============================================================================ */

let H = null;

const $$ = (s) => document.querySelector(s);

function sheet() {
  let el = document.getElementById('recprev');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'modal';
  el.id = 'recprev';
  el.innerHTML = `<div class="sheet" style="width:min(1100px,96vw)">
    <h2 id="rp-title">Records</h2>
    <div class="body"><div id="rp-body"></div></div>
    <div class="foot"><span class="esub" id="rp-sum" style="margin-right:auto"></span>
      <button class="sbtn" id="rp-close">Close</button></div>
  </div>`;
  document.body.appendChild(el);
  $$('#rp-close').onclick = () => el.classList.remove('open');
  return el;
}

/** Un tableau par fichier. Les colonnes sont numerotees : c'est ce qui permet de dire « le champ 34
    est vide » a quelqu'un qui lit une doc de format, sans compter a la main. */
function tableau(f) {
  const rows = f.rows || [];
  if (!f.found) {
    return `<div class="fm-comp"><div class="fm-comp-h"><b>${H.esc(f.file)}</b>
      <span class="esub" style="margin:0 0 0 8px">${H.esc(f.side)}</span></div>
      <div class="esub" style="color:#cf9b2a">${H.esc(f.note || 'not found')}</div></div>`;
  }
  const nCol = Math.max(0, ...rows.map(r => (r.values || []).length));
  const larg = Math.min(nCol, 14);          // au-dela, on coupe : le reste se lit en survol
  const entete = ['id'].concat(Array.from({ length: larg - 1 }, (_, i) => String(i + 1)));
  const corps = rows.map(r => {
    if (!r.present) {
      return `<tr><td style="color:#d1242f;font-weight:700">${r.id}</td>
        <td colspan="${larg}" style="color:#d1242f">ABSENT from this file</td></tr>`;
    }
    const cells = (r.values || []).slice(0, larg).map((v, i) =>
      `<td title="field ${i}">${H.esc(v)}</td>`).join('');
    const alerte = r.truncated
      ? `<span style="color:#d1242f;font-weight:700" title="the file declares ${r.expected} columns">
           ${r.fields} ≠ ${r.expected}</span>`
      : `<span style="opacity:.55">${r.fields}</span>`;
    return `<tr${r.truncated ? ' style="background:rgba(209,36,47,.08)"' : ''}>${cells}
      <td style="text-align:right">${alerte}</td></tr>`;
  }).join('');
  const casses = rows.filter(r => r.truncated).length;
  const absents = rows.filter(r => !r.present).length;
  const etat = (casses || absents)
    ? `<span style="color:#d1242f;font-weight:700">${absents ? absents + ' missing' : ''}${absents && casses ? ' · ' : ''}${casses ? casses + ' with a wrong field count' : ''}</span>`
    : '<span style="color:#2ea043;font-weight:700">✓ all records complete</span>';
  return `<div class="fm-comp"><div class="fm-comp-h"><b>${H.esc(f.file)}</b>
      <span class="esub" style="margin:0 0 0 8px">${H.esc(f.side)}${f.expected ? ' · ' + f.expected + ' columns' : ' · no column header'}</span>
      <span style="margin-left:auto">${etat}</span></div>
    <div style="overflow:auto;max-height:44vh"><table class="rp-t">
      <thead><tr>${entete.map(h => `<th>${h}</th>`).join('')}<th style="text-align:right">fields</th></tr></thead>
      <tbody>${corps}</tbody></table></div>
    <div class="esub" style="font-size:11px;opacity:.6">${H.esc(f.path || '')}</div></div>`;
}

export async function openRecordsPreview(host, nom) {
  H = host;
  const el = sheet();
  el.classList.add('open');
  $$('#rp-title').textContent = 'Records — ' + nom;
  $$('#rp-sum').textContent = '';
  $$('#rp-body').innerHTML = '<div class="esub"><span class="spin"></span> reading the .ini files (client + server)…</div>';
  let j;
  try {
    j = await (await fetch('/api/features/detail/' + encodeURIComponent(nom) + '/records')).json();
    if (j.detail) throw new Error(j.detail);
  } catch (e) {
    $$('#rp-body').innerHTML = '<div style="color:var(--crimson)">' + H.esc(H.errMessage(e)) + '</div>';
    return;
  }
  const files = j.files || [];
  if (!files.length) {
    $$('#rp-body').innerHTML = '<div class="esub">This feature ships no data record.</div>';
    return;
  }
  $$('#rp-body').innerHTML = files.map(tableau).join('');
  const tot = files.reduce((n, f) => n + (f.rows || []).length, 0);
  const ko = files.reduce((n, f) => n + (f.rows || []).filter(r => r.truncated || !r.present).length, 0);
  $$('#rp-sum').innerHTML = ko
    ? `<span style="color:#d1242f;font-weight:700">${ko} of ${tot} record(s) need attention</span>`
    : `<span style="color:#2ea043">${tot} record(s) checked — all complete</span>`;
}
