/* ============================================================================
   CLASSES — modale de SLOT (#clsSlotModal), 3 onglets :
     Details (lecture) / Change (recherche) / Edit (donnees de l'entite).

   Regle de la page : TOUT s'edite ici, JAMAIS de redirection vers la page de
   detail de l'entite. Un aller-retour ferait perdre la classe selectionnee.

   ⛔ Aucun global : tout passe par host() (voir classes_state.js).
   Le HTML de la modale reste dans index.html (bloc statique) ; ce module ne
   fait que la remplir et l'ouvrir/fermer via la classe CSS `open`.

   Pieges consignes ici :
   - DEUX portes d'entree, deux comportements : `clsEditSlot` (mode edition,
     connait la COLONNE a reecrire) et `clsViewSlot` (lecture, ne connait que
     l'id -> `viewonly`, seul l'onglet Details existe car il n'y a aucune
     colonne a ecrire). Confondre les deux fait ecrire dans `idx=null`.
   - « Change » ecrit la COLONNE de la classe (quel skill occupe le slot),
     « Edit » ecrit les DONNEES de l'entite. Ce ne sont pas les memes fichiers
     et pas le meme endpoint — d'ou deux fonctions d'ecriture separees.
   - Le nom se modifie via `name_en` (table T_*), JAMAIS via la colonne Big5 du
     record : reecrire du Big5 depuis le navigateur corrompt le catalogue.
   - L'effet reel d'un certificat n'est PAS dans l'item : c'est l'enchant de sa
     colonne 23. Pour une connaissance, l'entite EST l'enchant. Sans cette
     resolution, editer « bonus 5 % » n'aurait aucun effet en jeu.
   - `openIconPicker` n'existe pas encore dans le tool : le repli (saisie
     manuelle du code) est le chemin REEL aujourd'hui, ne pas le supprimer.
   ============================================================================ */
import { host, S, g } from './classes_state.js';
import { clsIconTag } from './classes_views.js';
import { loadClassDetail, clsSaveFields, clsSaveToast, clsRestartBanner } from './classes.js';

let CLSSLOT=null, CLSSLOT_PICK=null, _clsslotT=null, CLSSLOT_TAB='change', CLSSLOT_ENT=null, CLSMAPS=null, CLSSLOT_EFF=null;
const CLSSLOT_KIND={spell:{etype:'spell',label:'skill (C_Spell)'},item:{etype:'item',label:'certificate item (c_item)'},enchant:{etype:'enchant',label:'knowledge enchant (c_enchant)'}};
// Champs "rapides" par etype (index de colonne -> label). ⚠ SANS le Name : le nom se gere via name_en
// (T_*) editable, PAS via la colonne Big5. Description = le vrai texte affiche.
const CLSSLOT_QUICK={
  spell:[[22,'Required level'],[44,'Description']],
  item:[[14,'Required level'],[34,'Description']],
  enchant:[],
};
// index de la colonne ICONE par etype (pour l'apercu + remplacement d'icone client)
const CLSSLOT_ICONCOL={spell:1, item:1, enchant:1};

async function clsMaps(){ if(!CLSMAPS){try{CLSMAPS=await (await fetch('/api/maps')).json();}catch(_){CLSMAPS={};}} return CLSMAPS; }

export function clsEditSlot(kind,idx,curId){
  const {$}=host();
  if(!S.detail)return;
  CLSSLOT={kind,idx,curId}; CLSSLOT_PICK=null; CLSSLOT_ENT=null;
  CLSSLOT_TAB=(curId&&curId!=='0')?'edit':'change';   // slot rempli -> ouvre sur Edit ; vide -> Change
  const meta=CLSSLOT_KIND[kind]||CLSSLOT_KIND.spell;
  $('#clsslot-title').textContent=meta.label+' — column #'+idx;
  $('#clsSlotModal').classList.add('open');
  clsSlotRender();
  if(curId&&curId!=='0')clsSlotLoadEntity();
}

// MODE VIEW : ouvre la modale de slot en LECTURE SEULE sur l'onglet Details (pas de colonne connue,
// donc Change/Edit indisponibles). Utilise quand on clique un skill/cert/knowledge hors mode edition.
export function clsViewSlot(kind,id){
  const {$}=host();
  if(!id||id==='0')return;
  CLSSLOT={kind,idx:null,curId:String(id),viewonly:true}; CLSSLOT_PICK=null; CLSSLOT_ENT=null;
  CLSSLOT_TAB='details';
  const meta=CLSSLOT_KIND[kind]||CLSSLOT_KIND.spell;
  $('#clsslot-title').textContent=meta.label+' — view';
  $('#clsSlotModal').classList.add('open');
  clsSlotRender();
  clsSlotLoadEntity();
}

function clsSlotRender(){
  const {$,esc}=host();
  if(!CLSSLOT)return;
  const meta=CLSSLOT_KIND[CLSSLOT.kind]||CLSSLOT_KIND.spell;
  const scope=S.group?'all 5 races':'this race';
  const has=CLSSLOT.curId&&CLSSLOT.curId!=='0';
  // viewonly : SEUL l'onglet Details (lecture) — pas de Change/Edit (aucune colonne a ecrire)
  const tabs=CLSSLOT.viewonly?[['details','<img src="/studio/icons/icons/24/preview.png" srcset="/studio/icons/icons/24/preview.png 1x, /studio/icons/icons/48/preview.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Details']]
    :[['details','<img src="/studio/icons/icons/24/preview.png" srcset="/studio/icons/icons/24/preview.png 1x, /studio/icons/icons/48/preview.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Details'],['change','<img src="/studio/icons/icons/24/search.png" srcset="/studio/icons/icons/24/search.png 1x, /studio/icons/icons/48/search.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Change'],['edit','<img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Edit '+CLSSLOT.kind]];
  const tabbar=tabs.map(([k,l])=>`<button class="clsslottab${k===CLSSLOT_TAB?' on':''}" data-sst="${k}"${(k!=='change'&&!has)?' disabled':''}>${l}</button>`).join('');
  let body='';
  if(CLSSLOT_TAB==='change'){
    body=`<div class="fld"><label>Search ${esc(meta.label)} by name or id</label>
      <input id="clsslot-q" placeholder="type a name…" autocomplete="off">
      <div id="clsslot-results" class="crslot-results"></div></div>
    <div class="fld"><label>Currently</label><div class="esub" id="clsslot-cur" style="margin:0">#${esc(CLSSLOT.curId||'—')}</div></div>
    <div class="esub" style="margin:2px 0 0;color:var(--gold2)">writes column #${CLSSLOT.idx} · client + server · ${esc(scope)}</div>`;
  }else if(CLSSLOT_TAB==='details'){
    body=`<div id="clsslot-det" class="clsslotdet">${CLSSLOT_ENT?clsSlotDetailsHtml():'<div class="esub">loading…</div>'}</div>`;
  }else{ // edit
    body=`<div id="clsslot-edit">${CLSSLOT_ENT?clsSlotEditHtml():'<div class="esub">loading…</div>'}</div>`;
  }
  $('#clsslot-body').innerHTML=`<div class="clsslottabs">${tabbar}</div>${body}<div id="clsslot-err" class="lg-err"></div>`;
  // footer buttons visibility per tab
  $('#clsslot-save').style.display=(CLSSLOT_TAB==='details')?'none':'';
  $('#clsslot-clear').style.display=(CLSSLOT_TAB==='change')?'':'none';
  $('#clsslot-save').textContent=(CLSSLOT_TAB==='edit')?'Save '+CLSSLOT.kind:'Save';
  $('#clsslot-save').disabled=(CLSSLOT_TAB==='change');   // enabled once a result is picked / a field edited
  $('#clsSlotModal').querySelectorAll('.clsslottab').forEach(b=>b.onclick=()=>{if(b.disabled)return;CLSSLOT_TAB=b.dataset.sst;clsSlotRender();});
  if(CLSSLOT_TAB==='change'){const q=$('#clsslot-q');if(q){q.focus();q.oninput=()=>{clearTimeout(_clsslotT);_clsslotT=setTimeout(()=>clsSlotSearch(q.value.trim()),220);};}}
  if(CLSSLOT_TAB==='edit')clsSlotWireEdit();
}

async function clsSlotLoadEntity(){
  const meta=CLSSLOT_KIND[CLSSLOT.kind]||CLSSLOT_KIND.spell;
  await clsMaps();
  CLSSLOT_EFF=null;
  try{CLSSLOT_ENT=await (await fetch('/api/entity/'+meta.etype+'/'+CLSSLOT.curId)).json();}catch(_){CLSSLOT_ENT=null;}
  // resoudre l'ENCHANT lie (source de l'effet, ex bonus 5%) :
  //  - cert (item) -> enchant = col23 de l'item ; knowledge (enchant) -> l'entite elle-meme.
  let enchId=null;
  if(CLSSLOT.kind==='enchant')enchId=CLSSLOT.curId;
  else if(CLSSLOT.kind==='item'){ const f=clsSlotEntFields(); const c23=(f[23]||'').trim(); if(c23&&c23!=='0')enchId=c23; }
  if(enchId){
    try{ CLSSLOT_EFF=await (await fetch('/api/enchant/'+enchId+'/effect')).json(); }catch(_){ CLSSLOT_EFF={slots:[]}; }
  }else CLSSLOT_EFF={slots:[]};
  if(CLSSLOT&&(CLSSLOT_TAB==='details'||CLSSLOT_TAB==='edit'))clsSlotRender();
}

function clsSlotEntFields(){
  // le detail entite renvoie fields=[{i,label,value,...}] -> on en fait une map i->value (chaine)
  const e=CLSSLOT_ENT||{}; const m={};
  (e.fields||[]).forEach(f=>{ if(f&&f.i!=null)m[f.i]=(f.value==null?'':String(f.value)); });
  return m;
}

function clsSlotDetailsHtml(){
  const {esc}=host();
  const e=CLSSLOT_ENT||{}; const f=clsSlotEntFields();
  const nm=e.name_en||e.name||('#'+CLSSLOT.curId);
  const desc=e.disp_desc||e.desc_big5||'';
  const quick=CLSSLOT_QUICK[CLSSLOT.kind]||[];
  const facts=quick.filter(([i,lbl])=>!/desc|name/i.test(lbl)&&f[i]).map(([i,lbl])=>`<span class="clschip">${esc(lbl)}: ${esc(f[i])}</span>`).join('');
  const eff=(e.effects||e.effect_lines||[]);
  return `<div class="clsslotname">${esc(nm)} <span class="esub">#${esc(''+CLSSLOT.curId)}</span></div>
    ${facts?`<div class="clsslotefx">${facts}</div>`:''}
    ${desc?`<div class="clsslotdesc">${esc(desc)}</div>`:''}
    ${eff.length?`<div class="clsslotefx">${eff.map(x=>`<span class="clschip">${esc(typeof x==='string'?x:(x.text||''))}</span>`).join('')}</div>`:''}`;
}

function clsSlotEditHtml(){
  const {esc}=host();
  const e=CLSSLOT_ENT||{}; const f=clsSlotEntFields();
  const quick=CLSSLOT_QUICK[CLSSLOT.kind]||[];
  const gv=i=>{const v=(f&&f[i]!=null)?f[i]:'';return String(v);};
  const iconCol=CLSSLOT_ICONCOL[CLSSLOT.kind]; const iconCode=iconCol!=null?gv(iconCol):'';
  const iconImgTag=clsIconTag(CLSSLOT.kind==='item'?'item':(CLSSLOT.kind==='enchant'?'spell':'spell'),iconCode,'clsslotic')||'<span class="clsslotic ph"><img src="/studio/icons/icons/24/generation_3d.png" srcset="/studio/icons/icons/24/generation_3d.png 1x, /studio/icons/icons/48/generation_3d.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>';
  // NOM ANGLAIS editable (T_*), PAS le Big5 (le champ Name Big5 reste dans le repli 'raw' si besoin)
  const nameRow=`<div class="fld"><label>Name (English) <i class="esub">T_${CLSSLOT.kind}</i></label>
    <input id="clsslot-name" value="${esc(e.name_en||'')}"></div>`;
  const rows=quick.map(([i,lbl])=>{
    const long=/desc/i.test(lbl);
    const inp=long?`<textarea class="clsslotf" data-fi="${i}" rows="2">${esc(gv(i))}</textarea>`
                  :`<input class="clsslotf" data-fi="${i}" value="${esc(gv(i))}">`;
    return `<div class="fld"><label>${esc(lbl)} <i class="esub">#${i}</i></label>${inp}</div>`;
  }).join('');
  // ICONE : apercu + bouton "Replace icon" (remplace l'icone DANS le client)
  const iconRow=iconCol!=null?`<div class="fld"><label>Icon <i class="esub">#${iconCol} (${esc(iconCode||'—')})</i></label>
    <div class="clsslotico-row">${iconImgTag}
      <input class="clsslotf" data-fi="${iconCol}" id="clsslot-iconcode" value="${esc(iconCode)}" style="flex:1">
      <button class="mini" id="clsslot-iconpick" type="button" title="pick or upload a new icon in the client"><img src="/studio/icons/icons/24/preview.png" srcset="/studio/icons/icons/24/preview.png 1x, /studio/icons/icons/64/preview.png 2x" class="ui-icon" width="24" height="24" alt=""> Replace…</button>
    </div></div>`:'';
  // SECTION EFFECT : l'enchant lie (params editables — ex bonus 5 -> 10)
  const effHtml=`<div id="clsslot-eff">${CLSSLOT_EFF===null?'<div class="esub" style="padding:6px 0">loading effect…</div>':clsSlotEffectHtml()}</div>`;
  return `<div class="clsslotname">${esc(e.name_en||('#'+CLSSLOT.curId))} <span class="esub">#${esc(''+CLSSLOT.curId)}</span></div>
    ${nameRow}${iconRow}${rows}
    ${effHtml}
    <div class="esub" style="color:var(--gold2)">writes ${esc(CLSSLOT.kind)} #${esc(''+CLSSLOT.curId)} · client + server (byte-exact)</div>`;
}

// Rend la section EFFECT : slots de l'enchant lie, chaque param editable (label + valeur).
function clsSlotEffectHtml(){
  const {esc}=host();
  const ef=CLSSLOT_EFF; if(!ef||!ef.slots||!ef.slots.length)return '';
  const enchId=ef.id;
  const slots=ef.slots.map(s=>{
    const params=(s.params||[]).filter(p=>p.value!==''||p.label).map(p=>
      `<div class="clseffp"><span class="clseffl">${esc(p.label||('param'+p.i))}</span>
        <input class="clseffv" data-effcol="${p.i}" value="${esc(p.value||'')}" inputmode="numeric"></div>`).join('');
    return `<div class="clseffslot"><div class="clseffop"><img src="/studio/icons/icons/24/settings.png" srcset="/studio/icons/icons/24/settings.png 1x, /studio/icons/icons/48/settings.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> ${esc(s.name||('opcode '+s.opcode))} <i class="esub">op ${s.opcode}</i></div>${params}</div>`;
  }).join('');
  return `<div class="clseffbox"><div class="clseffh"><img src="/studio/icons/icons/24/objectives.png" srcset="/studio/icons/icons/24/objectives.png 1x, /studio/icons/icons/48/objectives.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Effect <span class="esub">enchant #${enchId} — edit a value (e.g. 5 → 10)</span></div>${slots}</div>`;
}

function clsSlotWireEdit(){
  const {$}=host();
  $('#clsslot-body').querySelectorAll('.clsslotf').forEach(inp=>inp.oninput=()=>{$('#clsslot-save').disabled=false;});
  $('#clsslot-body').querySelectorAll('.clseffv').forEach(inp=>inp.oninput=()=>{$('#clsslot-save').disabled=false;});
  const nm=$('#clsslot-name'); if(nm)nm.oninput=()=>{$('#clsslot-save').disabled=false;};
  const ip=$('#clsslot-iconpick'); if(ip)ip.onclick=()=>clsSlotPickIcon();
}

async function clsSlotSearch(term){
  const {$,esc,enc}=host();
  const box=$('#clsslot-results'); if(!box||!CLSSLOT)return;
  if(!term){box.innerHTML='';return;}
  const meta=CLSSLOT_KIND[CLSSLOT.kind]||CLSSLOT_KIND.spell;
  box.innerHTML='<div class="esub" style="padding:6px">searching…</div>';
  let j;try{j=await fetch('/api/search?types='+meta.etype+'&limit=25&q='+enc(term)).then(r=>r.json());}
  catch(e){box.innerHTML='<div class="esub" style="color:var(--crimson);padding:6px">search failed</div>';return;}
  const rows=(Array.isArray(j)?j:(j.results||j.items||[])).filter(x=>x&&x.id!=null&&x.etype===meta.etype);
  box.innerHTML=rows.slice(0,25).map(x=>{const nm=x.name_en||x.name||('#'+x.id);
    return `<button class="crslot-opt" data-id="${esc(''+x.id)}" data-nm="${esc(nm)}">${esc(nm)} <span class="esub">#${esc(''+x.id)}</span></button>`;
  }).join('')||'<div class="esub" style="padding:6px">no match</div>';
  box.querySelectorAll('.crslot-opt').forEach(b=>b.onclick=()=>{
    CLSSLOT_PICK={id:b.dataset.id,name:b.dataset.nm};
    $('#clsslot-cur').innerHTML='#'+esc(b.dataset.id)+' · '+esc(b.dataset.nm)+' <span style="color:var(--gold2)">(new)</span>';
    $('#clsslot-q').value=b.dataset.nm; box.innerHTML=''; $('#clsslot-save').disabled=false;
  });
}

// ecrit la COLONNE de classe (change quel skill/cert occupe le slot)
async function clsSlotWriteColumn(value){
  const {$}=host();
  if(!CLSSLOT)return;
  const fields={}; fields[CLSSLOT.idx]=String(value);
  const btn=$('#clsslot-save'); if(btn){btn.disabled=true;btn.textContent='saving…';}
  try{
    const j=await clsSaveFields(fields);
    $('#clsSlotModal').classList.remove('open');
    clsSaveToast(j,1);
    await loadClassDetail(g.sel());
  }catch(e){const er=$('#clsslot-err');if(er)er.textContent=''+e;if(btn){btn.disabled=false;btn.textContent='Save';}}
}

// ecrit les DONNEES de l'entite : champs (dont icone) + NOM EN (T_*) + PARAMS de l'effet (enchant lie).
// Tout via /api/save generique -> client + serveur byte-exact.
async function clsSlotWriteEntity(){
  const {$,toast}=host();
  if(!CLSSLOT||!CLSSLOT_ENT)return;
  const meta=CLSSLOT_KIND[CLSSLOT.kind]||CLSSLOT_KIND.spell;
  const f=clsSlotEntFields();
  const edits=[];
  // 1) champs de l'entite (level, description, icone)
  $('#clsslot-body').querySelectorAll('.clsslotf').forEach(inp=>{
    const i=+inp.dataset.fi, v=inp.value;
    if(String((f&&f[i]!=null)?f[i]:'')!==v)edits.push({etype:meta.etype,id:+CLSSLOT.curId,kind:'field',field_index:i,value:v});
  });
  // 2) NOM ANGLAIS (T_*) si change
  const nm=$('#clsslot-name'); const newName=nm?nm.value.trim():'';
  if(newName && newName!==(CLSSLOT_ENT.name_en||''))
    edits.push({etype:meta.etype,id:+CLSSLOT.curId,kind:'name',value:newName});
  // 3) PARAMS DE L'EFFET (enchant lie) — ex bonus 5 -> 10
  if(CLSSLOT_EFF&&CLSSLOT_EFF.id){
    const cur={}; (CLSSLOT_EFF.slots||[]).forEach(s=>(s.params||[]).forEach(p=>cur[p.i]=String(p.value||'')));
    $('#clsslot-body').querySelectorAll('.clseffv').forEach(inp=>{
      const i=+inp.dataset.effcol, v=inp.value;
      if(String(cur[i]||'')!==v)edits.push({etype:'enchant',id:+CLSSLOT_EFF.id,kind:'field',field_index:i,value:v});
    });
  }
  if(!edits.length){const er=$('#clsslot-err');if(er)er.textContent='no change';return;}
  const btn=$('#clsslot-save'); if(btn){btn.disabled=true;btn.textContent='saving…';}
  try{
    const r=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({edits})});
    const j=await r.json(); if(!r.ok)throw new Error(j.detail||r.status);
    $('#clsSlotModal').classList.remove('open');
    toast(''+CLSSLOT.kind+' #'+CLSSLOT.curId+' updated — client + server','ok');
    clsRestartBanner();
    await loadClassDetail(g.sel());
  }catch(e){const er=$('#clsslot-err');if(er)er.textContent=''+e;if(btn){btn.disabled=false;btn.textContent='Save '+CLSSLOT.kind;}}
}

// Remplacer l'icone dans le client : ouvre le picker d'icones du tool (reutilise l'infra existante).
// ⚠ ce picker N'EXISTE PAS encore : le repli ci-dessous est le chemin reellement emprunte.
function clsSlotPickIcon(){
  const {$,openIconPicker}=host();
  const folder=(CLSSLOT.kind==='item')?'itemicon':'uiicon';
  if(typeof openIconPicker==='function'){
    openIconPicker(folder,(code)=>{ const inp=$('#clsslot-iconcode'); if(inp){inp.value=code; $('#clsslot-save').disabled=false;} });
  }else{
    // repli : saisie manuelle du code (l'input est deja editable) + note
    const er=$('#clsslot-err'); if(er)er.textContent='type the icon code directly, or drop a .dds into the client icon folder';
  }
}

export function clsSlotSave(){
  const {$}=host();
  if(CLSSLOT_TAB==='edit')return clsSlotWriteEntity();
  if(CLSSLOT_PICK)clsSlotWriteColumn(CLSSLOT_PICK.id);
  else {const er=$('#clsslot-err');if(er)er.textContent='pick a result first (or use Clear slot)';}
}
export function clsSlotClear(){ clsSlotWriteColumn('0'); }
