/* ============================================================================
   ALTAR REQUESTS — modale « reqModal » : un GS soumet l etat de son autel,
   un GM le relit puis le deploie. Le GS ne deploie JAMAIS lui-meme.

   Extrait de static/index.html (protocole docs/WORK_SPLIT.md). Le corps est une
   COPIE VERBATIM ; seuls les acces aux globals d index.html sont devenus des
   entrees de `host`.

   ⛔ Contrat d hote — AUCUN global n est lu depuis ce module. Tout arrive par
   l objet passe a initAltarRequests() :
     $            selecteur (document.querySelector)
     esc          echappement HTML
     toast        notification
     uiPrompt     saisie modale (async -> string | null)   note d action
     uiConfirm    confirmation modale (async -> bool)      garde du deploy
     can          test de permission ('altar.review', 'altar.deploy')
     guardPage    garde d ouverture de page (action, nom affiche) -> bool
     showOverlay  voile bloquant pendant le deploy
     hideOverlay  retrait du voile
     altarLabels()  -> ALTARLABELS  (kind -> libelle affichable)

   ⚠ `altarLabels` est une FONCTION, pas une valeur : `ALTARLABELS` est un
   `const` declare TRES BAS dans le bloc module d index.html (~8169) alors que
   initAltarRequests() est appele beaucoup plus haut (~2855). Passer la valeur
   directement partirait en TDZ au chargement. Meme piege que altar_console.js.

   Pieges consignes ici pour ne pas les reperdre :
   - Le detail d une requete est du HTML RECONSTRUIT a chaque fois : les
     boutons #rq-review / #rq-reject / #rq-deploy n existent qu apres ce
     rendu, d ou le recablage EN FIN de previewRequest(). Ne pas remonter ces
     `onclick` dans initAltarRequests(), ils viseraient des noeuds detruits.
   - Ces trois boutons ne sont emis que si l etat est « vivant »
     (submitted / reviewed) ET que le role a le droit : une requete deployee ou
     rejetee est en LECTURE SEULE, il n y a rien a recabler.
   - Cliquer une ligne relance loadRequests() (pour deplacer la classe .sel)
     PUIS previewRequest() ; loadRequests() re-appelle lui-meme previewRequest
     quand REQSEL est pose. C est volontairement redondant dans l original —
     on le garde tel quel, la double lecture est idempotente cote API.
   - REQSEL survit aux rechargements de liste : c est ce qui garde la selection
     visible apres une transition d etat (review / reject / deploy).

   Exports :
     initAltarRequests(host)  pose le host + le cablage statique (#req-close)
     openRequests()           point d entree (menu ⚙ « Requests », navContext)
   ============================================================================ */

let H = null;

/** REQuete SELectionnee dans la colonne de gauche (null = aucune). */
let REQSEL = null;

export function initAltarRequests(host){
  H = host;
  const { $ } = H;
  $('#req-close') && ($('#req-close').onclick = () => $('#reqModal').classList.remove('open'));
}

export async function openRequests(){
  const { $, guardPage } = H;
  if(!guardPage('altar.review','Altar requests'))return;
  await loadRequests();
  $('#reqModal').classList.add('open');
}

async function loadRequests(){
  const { $, esc, toast, altarLabels } = H;
  const r=await fetch('/api/altar_requests');const j=await r.json().catch(()=>({}));
  if(!r.ok){toast(''+(j.detail||'login required'),'error');return;}
  const ALTARLABELS=altarLabels();
  const reqs=j.requests||[];
  $('#req-list').innerHTML=reqs.length?reqs.map(q=>`
    <div class="reqrow${REQSEL===q.id?' sel':''}" data-id="${q.id}">
      <div style="display:flex;align-items:center;gap:6px">
        <b style="color:var(--ink)">#${q.id} ${esc(ALTARLABELS&&ALTARLABELS[q.kind]||q.kind)}</b>
        <span class="reqstate ${q.state}">${q.state}</span></div>
      <div style="font-size:11px;color:var(--faint);margin-top:3px">by ${esc(q.author)} · ${esc(q.env)} · ${esc(q.ts)}</div>
      ${q.note?`<div style="font-size:11.5px;color:var(--dim);margin-top:2px">“${esc(q.note)}”</div>`:''}
    </div>`).join(''):'<div class="esub" style="padding:14px">No requests yet. A GS submits one from the Altar Tool.</div>';
  $('#req-list').querySelectorAll('.reqrow').forEach(row=>row.onclick=()=>{REQSEL=+row.dataset.id;loadRequests();previewRequest(REQSEL);});
  if(REQSEL)previewRequest(REQSEL);
}

async function previewRequest(rid){
  const { $, esc, toast, can, uiPrompt, uiConfirm, showOverlay, hideOverlay } = H;
  const r=await fetch('/api/altar_requests/'+rid);const q=await r.json().catch(()=>({}));
  if(!r.ok){$('#req-detail').innerHTML='<div class="esub" style="padding:14px;color:var(--crimson)">'+esc(q.detail||'not found')+'</div>';return;}
  const p=q.payload||{};
  const cells=[];(p.pages||[]).forEach(pg=>(pg.cells||[]).forEach(c=>cells.push(c)));
  const gmReview=can('altar.review'), gmDeploy=can('altar.deploy');
  const live=(q.state==='submitted'||q.state==='reviewed');
  $('#req-detail').innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <b style="font-size:14px;color:var(--ink)">#${q.id} ${esc(p.label||q.kind)}</b>
      <span class="reqstate ${q.state}">${q.state}</span>
      <span style="flex:1"></span>
      ${gmReview&&live?`<button class="sbtn ghost" id="rq-review" style="padding:4px 9px">Mark reviewed</button>`:''}
      ${gmReview&&live?`<button class="sbtn ghost" id="rq-reject" style="padding:4px 9px;color:#8a241b">Reject</button>`:''}
      ${gmDeploy&&live?`<button class="sbtn" id="rq-deploy" style="padding:4px 11px"><img src="/studio/icons/icons/24/deploy_to_server.png" srcset="/studio/icons/icons/24/deploy_to_server.png 1x, /studio/icons/icons/48/deploy_to_server.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Deploy</button>`:''}
    </div>
    <div style="font-size:12px;color:var(--faint);margin-bottom:8px">by ${esc(q.author)} · env ${esc(q.env)} · ${esc(q.ts)} · ${cells.length} cells · ${p.count||0} entries</div>
    <div style="border:1px solid var(--edge);border-radius:8px;padding:8px;max-height:30vh;overflow:auto;background:#fbf6e8">
      ${cells.slice(0,60).map(c=>`<div style="display:flex;gap:8px;font-size:11.5px;padding:2px 0;border-bottom:1px dashed var(--edge)">
        <span style="flex:0 0 60px;color:var(--faint)">R${c.row??(c.key&&c.key.round)} S${c.col??(c.key&&c.key.slot)}</span>
        <span style="flex:1;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((c.item&&c.item.name)||('#'+c.item_id))} ×${c.qty||1}</span>
        <span style="flex:0 0 60px;text-align:right;color:var(--dim)">${c.weight!=null?(+c.weight)+'%':''}</span></div>`).join('')||'<div class="esub">empty</div>'}
    </div>
    <details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--faint)">Raw JSON</summary>
      <pre style="font-size:10.5px;max-height:24vh;overflow:auto;background:#2a2418;color:#d8c89a;padding:8px;border-radius:6px">${esc(JSON.stringify(p,null,2).slice(0,8000))}</pre></details>
    <div style="margin-top:8px"><div style="font-size:11px;color:var(--faint);font-weight:600;margin-bottom:3px">History</div>
      ${(q.log||[]).map(l=>`<div style="font-size:11px;color:var(--dim)">• ${esc(l.ts)} — <b>${esc(l.to)}</b> by ${esc(l.by)}${l.note?' ('+esc(l.note)+')':''}</div>`).join('')}</div>`;
  const act=async(path,msg)=>{const note=await uiPrompt('Note (optional)',msg,'')||'';
    const rr=await fetch('/api/altar_requests/'+rid+'/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note})});
    const jj=await rr.json().catch(()=>({}));
    if(rr.ok){toast(''+(jj.state||'done'),'ok');loadRequests();}else toast(''+(jj.detail||'failed'),'error');};
  if($('#rq-review'))$('#rq-review').onclick=()=>act('review','Mark reviewed');
  if($('#rq-reject'))$('#rq-reject').onclick=()=>act('reject','Reject request');
  if($('#rq-deploy'))$('#rq-deploy').onclick=async()=>{
    if(!await uiConfirm('Deploy request #'+rid+' to the LIVE server? The current data is backed up first.','Deploy altar request','Deploy'))return;
    showOverlay('Deploying request #'+rid+'…');
    const rr=await fetch('/api/altar_requests/'+rid+'/deploy',{method:'POST'});const jj=await rr.json().catch(()=>({}));hideOverlay();
    if(rr.ok){toast('deployed (request #'+rid+')','ok');loadRequests();}else toast(''+(jj.detail||'failed'),'error');};
}
