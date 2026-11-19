/* ============================================================================
   CLASSES — page (arbre des classes, detail, edition client + serveur).

   Extrait de static/index.html (protocole docs/WORK_SPLIT.md).
   Le lot tient en 4 fichiers :
     classes_state.js  etat + contrat d'hote
     classes_views.js  fabriques de HTML pures
     classes_slot.js   modale de slot (skill / certificat / connaissance)
     classes.js        ce fichier : page, sauvegardes, modales info/creation

   ⛔ AUCUN GLOBAL n'est lu ici. Tout arrive par l'objet passe a initClasses() :
     $ esc enc toast uiConfirm errMessage iconImg
     canEditData()  -> bool  droit d'ecrire les donnees (bouton « New class »)
     navBack()               retour arriere de la barre de navigation
     navLen()       -> int   NAV.length : « Back » ne s'affiche que s'il y a ou revenir
     openIconPicker optionnel (absent du tool aujourd'hui -> repli manuel)
     getTree/setTree getRace/setRace getSel/setSel getFam/setFam getTab/setTab

   ⚠ POURQUOI DES ACCESSEURS POUR CINQ VARIABLES SEULEMENT.
   CLSTREE / CLSRACE / CLSSEL / CLSFAM / CLSTAB restent declares dans
   index.html : `snapshotCurrent()` les lit pour pouvoir restaurer la vue
   « class N » apres un retour arriere. Les rapatrier ici casserait la
   restauration EN SILENCE (le test `typeof CLSSEL!=='undefined'` deviendrait
   simplement toujours faux, aucune erreur console). Le reste de l'etat
   (detail, filtre, mode edition, portee) est prive et vit dans classes_state.

   Pieges consignes ici :
   - Une classe existe en 5 VARIANTES DE RACE partageant un id de base
     (id = race*100 + base). D'ou la portee d'ecriture `S.group` : par defaut on
     ecrit les 5, sinon les variantes divergent et le jeu affiche des stats
     differentes selon la race. `((id%100)+100)%100` -> id de base 1..61.
   - Toute ecriture est CLIENT (C_Class.ini) + SERVEUR (S_Class.ini) byte-exact.
     Le serveur lit S_Class AU BOOT : d'ou la banniere « restart the ZoneServer »
     des que la reponse porte `restart_zs`. Sans elle on croit l'edition sans
     effet et on la refait dix fois.
   - « New class » ne rend PAS la classe jouable : le ZoneServer doit encore
     etre patche en binaire pour cabler le nouvel id. Dev uniquement.
   ============================================================================ */
import { searchScope } from '../ui/search_scope.js';
import { clsSetHost, host, S, g } from './classes_state.js';
import { renderClassLeft, renderClassTab } from './classes_views.js';
import { clsEditSlot, clsViewSlot, clsSlotSave, clsSlotClear } from './classes_slot.js';

/* ---------------------------------------------------------------- entree ---- */
export async function openClasses(){
  const {$,esc}=host();
  $('#content').innerHTML='<div class="empty">⟡ loading classes… ⟡</div>';
  try{
    const r=await fetch('/api/class_tree');
    g.setTree(await r.json());
    if(!r.ok)throw new Error(g.tree().detail||r.status);
  }catch(e){$('#content').innerHTML='<div class="esub" style="padding:20px;color:var(--crimson)">could not load classes — '+esc(e)+'</div>';return;}
  if(!g.fam() || !clsFindFam(g.fam())){const f0=clsFirstFam(); if(f0){g.setFam(f0.family); g.setSel(clsFamId(f0));}}
  renderClasses();
  if(g.sel()) loadClassDetail(g.sel());
}

function clsAllFams(){const o=[];for(const grp of (g.tree()&&g.tree().groups||[]))for(const f of grp.families)o.push(f);return o;}
function clsFindFam(fam){return clsAllFams().find(f=>f.family===fam);}
function clsFirstFam(){const a=clsAllFams();return a.length?a[0]:null;}
// une famille n'existe pas forcement pour la race courante : on retombe alors sur sa 1re variante
function clsFamId(f){if(!f||!f.ids)return null;if(f.ids[g.race()]!=null)return f.ids[g.race()];const k=Object.keys(f.ids);return k.length?f.ids[k[0]]:null;}

export function renderClasses(){
  const {$,esc,canEditData,navBack,navLen}=host();
  const t=g.tree();
  const races=(t.races||[]).map(r=>`<button class="clsrace${r.id===g.race()?' on':''}" data-clsrace="${r.id}" title="${esc(r.name)}"><img class="clsraceic" src="/studio/race/${r.icon??r.id}.png" alt="" onerror="this.style.display='none'"><span>${esc(r.name)}</span></button>`).join('');
  $('#content').innerHTML=`<div class="clspage">
    <div class="clstoolbar">
      <div class="clstitle">${navLen()?'<span class="backbtn" id="cls-navback">← Back</span> ':''}<img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /studio/icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Classes</div>
      <div class="clsraces" title="Race — the same class exists per race; pick a race then a class to load its variant.">${races}</div>
      <span class="grow"></span>
      <div class="clsfind"><span><img src="/studio/icons/icons/24/search.png" srcset="/studio/icons/icons/24/search.png 1x, /studio/icons/icons/48/search.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span><input id="cls-q" placeholder="Filter class…" value="${esc(S.q)}"></div>
      ${canEditData()?`<button class="clseditbtn" id="cls-new" title="Create a new class (dev only). Adds one row per race to C_Class, S_Class, T_Class and the talent files. Data only: restart the ZoneServer and repack the client."><img src="/studio/icons/icons/24/add.png" srcset="/studio/icons/icons/24/add.png 1x, /studio/icons/icons/48/add.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> New class</button>`:''}
      <span class="clsmeta">${t.count} families</span>
    </div>
    <div class="clsbody">
      <div class="clsleft" id="cls-left">${renderClassLeft()}</div>
      <div class="clsright" id="cls-right"><div class="empty">${g.sel()?'⟡ loading… ⟡':'⟡ pick a class ⟡'}</div></div>
    </div>
  </div>`;
  wireClassLeft();
  if($('#cls-navback'))$('#cls-navback').onclick=()=>navBack();
  const nb=$('#cls-new'); if(nb)nb.onclick=clsNewClass;
  $('#content').querySelectorAll('[data-clsrace]').forEach(b=>b.onclick=()=>{g.setRace(+b.dataset.clsrace);
    if(g.fam()){const f=clsFindFam(g.fam());if(f){g.setSel(clsFamId(f));}}
    renderClasses(); if(g.sel()) loadClassDetail(g.sel());});
  const q=$('#cls-q'); if(q){const apply=v=>{S.q=v;const L=$('#cls-left');if(L){L.innerHTML=renderClassLeft();wireClassLeft();}};q.oninput=()=>apply(q.value);searchScope.bindInput({key:'classes',label:'Classes',placeholder:'Filter class',onQuery:apply},q);}
}

function wireClassLeft(){const {$}=host();$('#content').querySelectorAll('[data-clsfam]').forEach(el=>el.onclick=()=>{
  const fam=+el.dataset.clsfam; const f=clsFindFam(fam); if(!f)return; const id=clsFamId(f); if(id==null)return;
  g.setFam(fam); g.setSel(id);
  $('#content').querySelectorAll('.clsrow').forEach(x=>x.classList.toggle('on',+x.dataset.clsfam===fam));
  loadClassDetail(g.sel());});}

export async function loadClassDetail(id){
  const {$,esc}=host();
  const box=$('#cls-right'); if(box)box.innerHTML='<div class="empty">⟡ loading… ⟡</div>';
  try{const r=await fetch('/api/class/'+id);S.detail=await r.json();if(!r.ok)throw new Error(S.detail.detail||r.status);if(S.detail.race===5)S.edit=false;}
  catch(e){if(box)box.innerHTML='<div class="esub" style="padding:20px;color:var(--crimson)">'+esc(e)+'</div>';return;}
  renderClassDetail();
}

// detail fidele a workspace : barre de paliers + 3 onglets (Overview / Licenses / Skills).
function renderClassDetail(){
  const {$,esc}=host();
  const d=S.detail; if(!d)return; const box=$('#cls-right'); if(!box)return;
  const tabs=[['news','<img src="/studio/icons/icons/24/action_journal.png" srcset="/studio/icons/icons/24/action_journal.png 1x, /studio/icons/icons/48/action_journal.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Overview'],['knowledge','<img src="/studio/icons/icons/24/spellbook.png" srcset="/studio/icons/icons/24/spellbook.png 1x, /studio/icons/icons/48/spellbook.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Licenses & Knowledge'],['skills','<img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /studio/icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Skills (active / passive)']];
  const tiers=(d.tiers||[]);
  const tierbar=`<div class="clstiers">
    <div class="clstierrow">${tiers.map(t=>`<button class="clstier${t.current?' on':''}" data-clstier="${t.id}" title="${esc(t.name)} #${t.id}">
        ${host().iconImg('uiicon',t.icon,'clstieric')||'<span class="clstieric ph"><img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /studio/icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>'}
        <span class="clstierlv">${t.is_base?'Lv.1':'Lv.—'}</span></button>`).join('')}</div>
    <div class="clstierinfo">
      <div class="clstiername">${esc(d.name_en)}</div>
      <div class="clstierrole"><span class="clsbadge" style="background:${d.role_color}">${esc(d.role_label)}</span> ${esc(d.race_name)} · ${esc(d.fam_name)} · #${d.id}</div>
    </div>
    <span class="grow"></span>
    ${S.edit?`<div class="clsscope" title="A class has one row per race, sharing one runtime id. All races writes the original races; rows made by a race feature follow that feature. This race = only the selected row.">
      <button class="clsscopebtn${S.group?' on':''}" id="cls-scope-all"><img src="/studio/icons/icons/24/links.png" srcset="/studio/icons/icons/24/links.png 1x, /studio/icons/icons/48/links.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> All races</button>
      <button class="clsscopebtn${S.group?'':' on'}" id="cls-scope-one">◇ This race only</button>
    </div>`:''}
    ${S.edit?`<button class="clseditbtn" id="cls-info" title="Edit this class' identity: name, family, icon, description, unlock text, required levels — in one modal, client + server."><img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Class info</button>`:''}
    ${d.race===5?'<span class="clsmeta" title="Turtle class rows 501-561 are generated by turtle_race from the Anura rows (features/turtle_race/tools/gen_class_rows.py): edit the Anura class, then regenerate the Turtle rows and install turtle_race again.">Turtle rows: generated by turtle_race</span>':''}
    ${canEditData()?`<button class="clseditbtn${S.edit?' on':''}" id="cls-edit"${d.race===5?' disabled':''} title="Edit this class TOTAL client + server (C_Class.ini + S_Class.ini, byte-exact). Skills/certs/knowledge are edited by clicking them.">${S.edit?'✓ Done':'<img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Edit'}</button>`:''}
  </div>`;
  box.innerHTML=`<div class="clsdetail">
    ${tierbar}
    <div class="clstabs">${tabs.map(([k,l])=>`<button class="clstab${k===g.tab()?' on':''}" data-clstab="${k}">${l}</button>`).join('')}</div>
    <div class="clstabbody" id="cls-tabbody">${renderClassTab()}</div>
  </div>`;
  box.querySelectorAll('[data-clstab]').forEach(b=>b.onclick=()=>{g.setTab(b.dataset.clstab);const tb=$('#cls-tabbody');if(tb){tb.innerHTML=renderClassTab();wireClassTab();}box.querySelectorAll('.clstab').forEach(x=>x.classList.toggle('on',x.dataset.clstab===g.tab()));});
  box.querySelectorAll('[data-clstier]').forEach(b=>b.onclick=()=>{g.setSel(+b.dataset.clstier);loadClassDetail(g.sel());});
  const eb=$('#cls-edit'); if(eb)eb.onclick=()=>{S.edit=!S.edit;if(S.edit)g.setTab('news');renderClassDetail();};
  const sa=$('#cls-scope-all'); if(sa)sa.onclick=()=>{S.group=true;renderClassDetail();};
  const so=$('#cls-scope-one'); if(so)so.onclick=()=>{S.group=false;renderClassDetail();};
  const ib=$('#cls-info'); if(ib)ib.onclick=clsEditInfo;
  wireClassTab();
}

function wireClassTab(){
  const {$}=host();
  const box=$('#cls-tabbody'); if(!box)return;
  // MODE VIEW (page Classes en lecture) : cliquer un skill/cert/knowledge ouvre la MODALE de view
  // (onglet Details, lecture seule) — PAS de redirection vers la page de detail.
  // MODE EDITION (S.edit) : les slots portent data-slotidx et ouvrent clsEditSlot.
  const openView=(kind,id)=>clsViewSlot(kind,id);
  box.querySelectorAll('[data-openspell]').forEach(b=>b.onclick=()=>openView('spell',+b.dataset.openspell));
  box.querySelectorAll('[data-openitem]').forEach(b=>b.onclick=()=>openView('item',+b.dataset.openitem));
  box.querySelectorAll('[data-openenchant]').forEach(b=>b.onclick=()=>openView('enchant',+b.dataset.openenchant));
  // mode edition : cliquer un slot ouvre le picker (change quel skill/cert/knowledge occupe la colonne)
  box.querySelectorAll('[data-slotidx]').forEach(b=>b.onclick=()=>clsEditSlot(b.dataset.slotkind,+b.dataset.slotidx,b.dataset.slotid||''));
  const sv=$('#cls-savestats'); if(sv)sv.onclick=saveClassStats;
  const sr=$('#cls-saveraw'); if(sr)sr.onclick=saveClassRaw;
}

/* ------------------------------------------------------------ ecritures ---- */
// Ecriture de champs classe : sur la variante courante OU sur toutes les races si S.group.
// Renvoie la reponse JSON (avec restart_zs) ou leve. Toute ecriture est CLIENT + SERVEUR.
export async function clsSaveFields(fields){
  if(S.group){
    const base=((g.sel()%100)+100)%100;   // id de base 1..61 de la variante courante
    const r=await fetch('/api/class/group/'+base+'/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
    const j=await r.json(); if(!r.ok)throw new Error(j.detail||r.status); return j;
  }
  const r=await fetch('/api/class/'+g.sel()+'/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
  const j=await r.json(); if(!r.ok)throw new Error(j.detail||r.status); return j;
}

// Toast unifie + banniere « restart ZS required » (le serveur lit S_Class au boot).
export function clsSaveToast(j,n){
  const scope=S.group?('all '+((j.written||[]).length||5)+' races'):'this race';
  host().toast(''+n+' field(s) saved — client + server ('+scope+')','ok');
  if(j&&j.restart_zs)clsRestartBanner();
}

export function clsRestartBanner(){
  const {$}=host();
  let b=$('#cls-restartbar');
  if(!b){b=document.createElement('div');b.id='cls-restartbar';b.className='clsrestartbar';
    document.body.appendChild(b);}
  b.innerHTML='⟳ Server class data changed — <b>restart the ZoneServer</b> to apply it in-game. '
    +'<span class="clsrestartx" title="dismiss">✕</span>';
  b.querySelector('.clsrestartx').onclick=()=>b.remove();
}

async function saveClassRaw(){
  const {$,toast,errMessage}=host();
  const box=$('#cls-tabbody'); if(!box||!S.detail)return;
  const fields={}; const orig={};
  (S.detail.raw||[]).forEach(f=>orig[f.i]=f.value);
  box.querySelectorAll('.clsrawinput').forEach(inp=>{const i=inp.dataset.ridx;const v=inp.value;
    if(i!=null && v!==orig[i])fields[i]=v;});
  if(!Object.keys(fields).length){toast('no field changed');return;}
  const btn=$('#cls-saveraw'); if(btn){btn.disabled=true;btn.textContent='saving…';}
  try{
    const j=await clsSaveFields(fields);
    clsSaveToast(j,Object.keys(fields).length);
    S.edit=false; await loadClassDetail(g.sel());
  }catch(e){toast('save: '+errMessage(e),'error'); if(btn){btn.disabled=false;btn.textContent='Save all fields';}}
}

async function saveClassStats(){
  const {$,toast,errMessage}=host();
  const box=$('#cls-tabbody'); if(!box)return;
  const fields={};
  box.querySelectorAll('.clsstatinput').forEach(inp=>{const idx=inp.dataset.sidx;const v=inp.value.trim();if(idx&&v!=='')fields[idx]=v;});
  if(!Object.keys(fields).length){toast('nothing to save');return;}
  const btn=$('#cls-savestats'); if(btn){btn.disabled=true;btn.textContent='saving…';}
  try{
    const j=await clsSaveFields(fields);
    clsSaveToast(j,Object.keys(fields).length);
    S.edit=false; await loadClassDetail(g.sel());
  }catch(e){toast('save: '+errMessage(e),'error'); if(btn){btn.disabled=false;btn.textContent='Save coefficients';}}
}

/* ----------------------------------------- modale « Edit class info » ------ */
// identite de la classe (famille, icone, description, unlock, niveaux), en une fois,
// client + server. Le nom EN vient de T_Class — edite via le champ Name ci-dessous.
const CLS_FAMOPTS=[[1,'Warriors'],[2,'Magic'],[3,'Hunter'],[4,'Priests'],[5,'Thieves'],[6,'Bard'],[7,'Knight'],[8,'Engineer'],[9,'Martial artist'],[10,'The illusionist'],[11,'Dancer'],[12,'Witch Doctor'],[13,'Paladin'],[14,'Range'],[15,'Necromancer'],[16,'Samurai'],[17,'Sage'],[18,'Dragon Knight'],[19,'Magic Swordsman'],[20,'Mimic'],[59,'The Judge']];

function clsEditInfo(){
  const {$,esc}=host();
  const d=S.detail; if(!d)return;
  const raw={}; (d.raw||[]).forEach(f=>raw[f.i]=String(f.value==null?'':f.value));
  const gv=i=>esc(raw[i]||'');
  const scope=S.group?'all races':'this race';
  const famCur=String(raw[2]||'').trim();
  const famList=CLS_FAMOPTS.some(([id])=>String(id)===famCur)||!famCur?CLS_FAMOPTS:CLS_FAMOPTS.concat([[famCur,(d.fam_name||('Class '+famCur))]]);
  const famOpts=famList.map(([id,nm])=>`<option value="${esc(String(id))}"${famCur===String(id)?' selected':''}>${esc(nm)} (${esc(String(id))})</option>`).join('');
  $('#clsinfo-title').textContent='Edit class info — '+esc(d.name_en||('#'+d.id));
  $('#clsinfo-body').innerHTML=`
    <div class="fld"><label>Name (English, T_Class) <i class="esub">shared by every race</i></label>
      <input id="ci-name" value="${esc(d.name_en||'')}"></div>
    <div class="cirow">
      <div class="fld"><label>Family / class tree <i class="esub">#2</i></label><select id="ci-fam">${famOpts}</select></div>
      <div class="fld"><label>Icon code <i class="esub">#3</i></label><input id="ci-icon" value="${gv(3)}" style="width:120px"></div>
    </div>
    <div class="fld"><label>Description <i class="esub">#4</i></label><textarea id="ci-desc" rows="3">${gv(4)}</textarea></div>
    <div class="fld"><label>Unlock requirements (text) <i class="esub">#7</i></label><textarea id="ci-unlock" rows="2">${gv(7)}</textarea></div>
    <div class="cirow">
      <div class="fld"><label>Req. prior-class level <i class="esub">#9</i></label><input id="ci-l9" value="${gv(9)}" style="width:90px"></div>
      <div class="fld"><label>Req. character level <i class="esub">#10</i></label><input id="ci-l10" value="${gv(10)}" style="width:90px"></div>
    </div>
    <div class="esub" style="color:var(--gold2)">writes C_Class + S_Class · ${esc(scope)} · a ZoneServer restart applies server-side changes</div>
    <hr class="clsinfohr">
    <div class="fld"><label>Copy playable content FROM another class <i class="esub">stats, skills, certs, knowledge, appearance — keeps this class' id, family & unlock</i></label>
      <div style="display:flex;gap:8px">
        <select id="ci-copyfrom" style="flex:1"><option value="">— choose a source class —</option>${clsCopyOpts(d.family)}</select>
        <button class="sbtn" id="ci-copybtn" type="button">Copy content</button>
      </div></div>
    <div id="clsinfo-err" class="lg-err"></div>`;
  $('#clsInfoModal').classList.add('open');
  const cb=$('#ci-copybtn'); if(cb)cb.onclick=clsCopyContent;
}

// options du selecteur "copier depuis" = toutes les familles SAUF la courante (une par famille, base race 0)
function clsCopyOpts(curFam){
  const {esc}=host();
  if(!g.tree())return '';
  const opts=[];
  for(const grp of (g.tree().groups||[])) for(const f of grp.families){
    if(f.family===curFam)continue;
    const id0=(f.ids&&(f.ids['0']||Object.values(f.ids)[0]));
    if(id0)opts.push(`<option value="${id0}">${esc(f.name_en)} (${grp.label})</option>`);
  }
  return opts.join('');
}

async function clsCopyContent(){
  const {$,toast,uiConfirm}=host();
  const d=S.detail; if(!d)return;
  const src=$('#ci-copyfrom')?.value; if(!src){$('#clsinfo-err').textContent='choose a source class first';return;}
  const srcBase=((+src%100)+100)%100, dstBase=((d.id%100)+100)%100;
  const srcName=$('#ci-copyfrom').selectedOptions[0]?.textContent||('#'+src);
  if(!await uiConfirm('Copy the playable content (stats, skills, certs, knowledge, appearance) of '+srcName+' onto '+(d.name_en||'#'+d.id)+' for all races?\nThis class keeps its own id, family and unlock. Client + server, byte-exact (backups kept).','Copy class content','Copy'))return;
  const btn=$('#ci-copybtn'); if(btn){btn.disabled=true;btn.textContent='copying…';}
  try{
    const r=await fetch('/api/class/'+dstBase+'/copy-from',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:srcBase})});
    const j=await r.json(); if(!r.ok)throw new Error(j.detail||r.status);
    $('#clsInfoModal').classList.remove('open');
    toast('content copied onto '+(d.name_en||'#'+d.id)+' — client + server ('+((j.written||[]).length)+' variants)','ok');
    if(j.restart_zs)clsRestartBanner();
    await loadClassDetail(g.sel());
  }catch(e){$('#clsinfo-err').textContent=''+e;if(btn){btn.disabled=false;btn.textContent='Copy content';}}
}

async function clsInfoSave(){
  const {$,toast}=host();
  const d=S.detail; if(!d)return;
  const raw={}; (d.raw||[]).forEach(f=>raw[f.i]=String(f.value==null?'':f.value));
  const fields={};
  const put=(i,v)=>{ if(String(raw[i]||'')!==String(v))fields[i]=v; };
  put(2,$('#ci-fam').value); put(3,$('#ci-icon').value); put(4,$('#ci-desc').value);
  put(7,$('#ci-unlock').value); put(9,$('#ci-l9').value); put(10,$('#ci-l10').value);
  const newName=$('#ci-name').value.trim();
  const btn=$('#clsinfo-save'); if(btn){btn.disabled=true;btn.textContent='saving…';}
  try{
    // 1) champs C_Class/S_Class (famille/icone/desc/unlock/niveaux)
    let saved=Object.keys(fields).length, restart=false;
    if(saved){ const j=await clsSaveFields(fields); restart=restart||!!(j&&j.restart_zs); }
    // 2) nom EN via T_Class (endpoint dedie, ecrit les 5 variantes race) si change
    if(newName && newName!==(d.name_en||'')){
      const base=((d.id%100)+100)%100;
      const body={name:newName}; if(!S.group)body.races=[Math.floor(d.id/100)];
      const r=await fetch('/api/class/'+base+'/name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const jn=await r.json(); if(!r.ok)throw new Error(jn.detail||('name: '+r.status)); saved++;
    }
    if(!saved){const er=$('#clsinfo-err');if(er)er.textContent='nothing changed';if(btn){btn.disabled=false;btn.textContent='Save';}return;}
    $('#clsInfoModal').classList.remove('open');
    toast('class info saved — client + server','ok');
    if(restart)clsRestartBanner();
    await loadClassDetail(g.sel());
  }catch(e){const er=$('#clsinfo-err');if(er)er.textContent=''+e;if(btn){btn.disabled=false;btn.textContent='Save';}}
}

/* --------------------------------- creation d'une classe NEUVE (dev only) -- */
// 5 records client+serveur, clones d'un template. NON jouable tant que le
// ZoneServer n'est pas patche en binaire pour cabler le nouvel id.
function clsNewClass(){
  const {$,esc}=host();
  const famOpts=CLS_FAMOPTS.map(([id,nm])=>`<option value="${id}">${esc(nm)} (${id})</option>`).join('');
  // templates = toutes les familles existantes (base race 0)
  let tplOpts='';
  for(const grp of (g.tree()?.groups||[])) for(const f of grp.families){
    const id0=(f.ids&&(f.ids['0']||Object.values(f.ids)[0]));
    if(id0)tplOpts+=`<option value="${id0}">${esc(f.name_en)}</option>`;
  }
  $('#clsnew-body').innerHTML=`
    <div class="esub" style="margin-bottom:10px">Adds one row per race (ids 62, 162, … 1262) to C_Class, S_Class, T_Class and the talent files, cloned from the template, byte-exact. <b>Data only:</b> no server patch is written. Restart the ZoneServer and repack the client to load it. <b>Dev only.</b></div>
    <div class="fld"><label>Class name (English)</label><input id="cn-name" placeholder="e.g. Spellblade"></div>
    <div class="cirow">
      <div class="fld"><label>Kind</label><select id="cn-mode"><option value="tree">New class tree</option><option value="awakening">Awakening of a family</option></select></div>
      <div class="fld"><label>Family (awakening only)</label><select id="cn-fam">${famOpts}</select></div>
      <div class="fld"><label>Clone stats/skills from</label><select id="cn-tpl">${tplOpts}</select></div>
    </div>
    <div id="clsnew-err" class="lg-err"></div>`;
  $('#clsNewModal').classList.add('open');
}

async function clsNewCreate(){
  const {$,toast,uiConfirm}=host();
  const name=$('#cn-name')?.value.trim();
  const mode=$('#cn-mode')?.value||'tree';
  const family=mode==='awakening'?+($('#cn-fam')?.value||0):null;
  const template=+($('#cn-tpl')?.value||0);
  if(!name){$('#clsnew-err').textContent='enter a class name';return;}
  if(!template){$('#clsnew-err').textContent='choose a template class';return;}
  if(!await uiConfirm('Create the class "'+name+'" (one row per race, cloned from the selected template)?\nData only: restart the ZoneServer and repack the client afterwards. Dev only.','Create new class','Create'))return;
  const btn=$('#clsnew-create'); if(btn){btn.disabled=true;btn.textContent='creating…';}
  try{
    const r=await fetch('/api/class/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mode,family,template})});
    const j=await r.json(); if(!r.ok)throw new Error(j.detail||r.status);
    $('#clsNewModal').classList.remove('open');
    toast('class "'+name+'" created: id '+j.base+', '+((j.ids||[]).length)+' race rows','ok');
    clsRestartBanner();
    toast('Restart the ZoneServer and repack the client to load it. Not yet proven in the running game.','warn');
    // recharger l'arbre
    g.setTree(null); await openClasses();
  }catch(e){$('#clsnew-err').textContent=''+e;if(btn){btn.disabled=false;btn.textContent='Create (dev)';}}
}

/* ------------------------------------------------------------------ init --- */
// Repose TOUS les cablages statiques de la page : le bouton de navigation et les
// 7 boutons des 3 modales (leur HTML, lui, reste dans index.html).
// Aucun ordre impose : ce sont des affectations onclick sur des noeuds deja parses.
export function initClasses(h){
  clsSetHost(h);
  const {$}=h;
  $('#btn-classes')&&($('#btn-classes').onclick=()=>openClasses());
  $('#clsslot-cancel')&&($('#clsslot-cancel').onclick=()=>$('#clsSlotModal').classList.remove('open'));
  $('#clsslot-save')&&($('#clsslot-save').onclick=()=>clsSlotSave());
  $('#clsslot-clear')&&($('#clsslot-clear').onclick=()=>clsSlotClear());
  $('#clsinfo-cancel')&&($('#clsinfo-cancel').onclick=()=>$('#clsInfoModal').classList.remove('open'));
  $('#clsinfo-save')&&($('#clsinfo-save').onclick=()=>clsInfoSave());
  $('#clsnew-cancel')&&($('#clsnew-cancel').onclick=()=>$('#clsNewModal').classList.remove('open'));
  $('#clsnew-create')&&($('#clsnew-create').onclick=()=>clsNewCreate());
}
