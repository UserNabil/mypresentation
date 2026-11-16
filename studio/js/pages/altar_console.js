/* ============================================================================
   ALTAR — LIVE CONSOLE (sans DB), extraite d index.html (lignes 9313-9571).

   Pilote l'autel OUVERT EN JEU via la DLL altar_remote, SANS charger la grille de récompenses
   du serveur. On choisit la monnaie d'insert + la liste d'items CIBLES, puis Roll/Take (manuel)
   ou Auto (roll en boucle, Take auto quand une cible — ou un résiduel forcé — sort). Tout le tirage
   est fait par le client/serveur du jeu ; on ne fait qu'envoyer Transform(currency)/Take(0).

   Le corps est une COPIE VERBATIM ; les seules reecritures sont les acces a
   l etat de la PAGE AUTEL restee dans index.html (ALTARKIND, AWLIVE,
   AWLIVE_POLL, AWAUTO, ALTAR_LIVE_COUNTS, ALTAR_DLL_INGAME) devenus des
   accesseurs de `host`. Piege a connaitre : cet etat est PARTAGE avec la
   grille (loadAltar/renderAltar) — la console DOIT pouvoir l ecrire, sinon
   on sort de la console sur un mode Live desynchronise et le poll de la
   grille re-rend la grille PAR-DESSUS la console.

   ⛔ AUCUN GLOBAL. Tout passe par `host`, et TOUTES ses entrees sont des
   FONCTIONS (jamais des valeurs) : initAltarConsole() peut etre appele plus
   haut dans le bloc module que les `const ALTARCAT/AWAUTOBY/ALTARLABELS`
   (declarees vers 9121-9583) — une valeur simple partirait en TDZ.

   host = {
     $, esc, enc, toast, iconImg, iconMarkup,
     altarCat()      -> ALTARCAT           altarLabels() -> ALTARLABELS
     altarIcons()    -> ALTARICON          awAutoBy()    -> AWAUTOBY
     getAltarKind() / setAltarKind(k)      -> ALTARKIND
     getLive()      / setLive(v)           -> AWLIVE
     getLiveCounts()/ setLiveCounts(c)     -> ALTAR_LIVE_COUNTS
     setDllIngame(v)                       -> ALTAR_DLL_INGAME
     setAwAuto(a)                          -> AWAUTO
     stopGridPoll()  -> clearInterval(AWLIVE_POLL); AWLIVE_POLL=null
     startGridPoll() -> altarLiveStartPoll()
     altarLiveOk(), altarLivePush(p2,cat), altarLiveClaim(cat),
     altarRefreshBagSoon(), awWaitResult(prevTs,ms,cat), awSleep(ms),
     refreshAltarDot(), loadAltar(kind)
   }

   Exports :
     initAltarConsole(host)  pose le host. AUCUN cablage statique : la console
                             n a pas de bouton hors de son propre rendu ; on
                             y entre par openAltar() / le bouton #al-console
                             de la grille, tous deux restes dans index.html.
     openAltarConsole(kind)  point d entree
     awcIsOn()               remplace la lecture `AWC.on` de openAltar()
   ============================================================================ */

let H = null;

/* alias tardifs : H n existe pas encore quand ce fichier est evalue */
const $                   = s => H.$(s);
const esc                 = s => H.esc(s);
const enc                 = s => H.enc(s);
const toast               = (...a) => H.toast(...a);
const iconImg             = (...a) => H.iconImg(...a);
const iconMarkup          = (...a) => H.iconMarkup(...a);
const AB                  = () => H.awAutoBy();
const altarLiveOk         = () => H.altarLiveOk();
const altarLivePush       = (...a) => H.altarLivePush(...a);
const altarLiveClaim      = (...a) => H.altarLiveClaim(...a);
const altarRefreshBagSoon = () => H.altarRefreshBagSoon();
const awWaitResult        = (...a) => H.awWaitResult(...a);
const awSleep             = ms => H.awSleep(ms);
const refreshAltarDot     = () => H.refreshAltarDot();
const loadAltar           = k => H.loadAltar(k);
const altarLiveStartPoll  = () => H.startGridPoll();

export function initAltarConsole(host){ H = host; }

/* openAltar() (index.html) doit savoir si la console est ouverte sans toucher
   a AWC : sans ca il rendrait la grille par-dessus la console. */
export function awcIsOn(){ return AWC.on; }

/* ======================= copie verbatim d index.html ======================= */
const AWC={on:false, cat:0, kind:'crystal', cfg:null,
  curBy:{0:null,1:null,2:null},   // monnaie d'insert sélectionnée par autel (null => base = currencies[0])
  resBy:{0:null,1:null,2:null},   // dernier résultat reçu du jeu par autel (enrichi nom/icône)
  resTsBy:{0:0,1:0,2:0},          // ts du dernier résultat par autel (anti-doublon du poll)
  pollT:null, ingame:false, connected:false};
const TGTCACHE={};   // id -> {name,icon} pour afficher les chips de cibles sans grille
// --- PERSISTANCE (localStorage) : cibles + monnaie + max inserts PAR autel -> survivent au reload ---
const AWC_LS='ms_altar_console_v1';
function awcSave(){
  try{const t={},ins={},names={};
    for(const c of [0,1,2]){t[c]=[...AB()[c].targets]; ins[c]=AB()[c].inserts;
      for(const id of AB()[c].targets)if(TGTCACHE[id])names[id]=TGTCACHE[id];}
    localStorage.setItem(AWC_LS,JSON.stringify({targets:t,curBy:AWC.curBy,inserts:ins,names}));
  }catch(e){}
}
function awcLoad(){
  try{const s=JSON.parse(localStorage.getItem(AWC_LS)||'null'); if(!s)return;
    if(s.names)Object.assign(TGTCACHE,s.names);
    if(s.targets)for(const c of [0,1,2])if(s.targets[c])AB()[c].targets=new Set(s.targets[c].map(Number));
    if(s.curBy)AWC.curBy={...AWC.curBy,...s.curBy};
    if(s.inserts)for(const c of [0,1,2])if(s.inserts[c]>0)AB()[c].inserts=s.inserts[c];
  }catch(e){}
}
function awcAltar(cat){return (AWC.cfg&&AWC.cfg.find(a=>a.cat===cat))||null;}
function awcCurrencies(cat){const a=awcAltar(cat);return a?a.currencies:[];}
// stock LIVE connu d'une monnaie (lu dans le sac par la DLL) ; null = inconnu (DLL pas branchée)
function awcCount(id){const v=H.getLiveCounts()[String(id)]; return v==null?null:v;}
// monnaie d'insert effective : le choix explicite de l'user (s'il en a OU stock inconnu), sinon
// la 1re monnaie qu'il POSSÈDE (counts live), sinon la base. Si le choix explicite est VIDE en jeu
// mais qu'une autre monnaie a du stock -> on bascule dessus (évite de rester bloqué sur un 0,
// ex. choix persisté d'un perso vers un autre qui n'a pas cette monnaie).
function awcCurrencyId(cat){const cs=awcCurrencies(cat); if(!cs.length)return 0;
  const v=AWC.curBy[cat];
  if(v){const cnt=awcCount(v); if(cnt==null||cnt>0)return v;}   // choix gardé si possédé ou stock inconnu
  // sinon : 1re monnaie POSSÉDÉE (count>0), sinon 1re au stock INCONNU (la DLL ne la suit pas mais le
  // perso en a peut-être — mieux qu'une connue à 0, ex. crystal NT 40175 non suivi), sinon la base.
  const stocked=cs.find(c=>awcCount(c.item_id)>0);
  const unknown=cs.find(c=>awcCount(c.item_id)==null);
  return (stocked||unknown||{item_id:v||cs[0].item_id}).item_id;}
function awcIsResidual(cat,id){return awcCurrencies(cat).some(c=>c.item_id===id);}
export async function openAltarConsole(kind){
  AWC.on=true; H.setLive(true);                       // la console implique le mode Live
  if(!AWC._loaded){awcLoad();AWC._loaded=true;}   // restaure cibles/monnaie/inserts persistés (1re ouverture)
  H.stopGridPoll();   // le poll GRILLE re-rendrait la grille par-dessus la console
  AWC.kind=kind||H.getAltarKind()||'crystal'; H.setAltarKind(AWC.kind); AWC.cat=H.altarCat()[AWC.kind];
  H.setAwAuto(AB()[AWC.cat]);
  if(!AWC.cfg){
    $('#content').innerHTML='<div class="empty">⟡ loading live console… ⟡</div>';
    try{const j=await (await fetch('/api/altar/live/config')).json();AWC.cfg=j.altars||[];
      AWC.cfg.forEach(a=>a.currencies.forEach(c=>{TGTCACHE[c.item_id]={name:c.item.name,icon:c.item.icon};}));}
    catch(e){AWC.cfg=[];toast('live config: '+e,'error');}
  }
  renderAltarConsole(); awcStartPoll();
}
function exitAltarConsole(){AWC.on=false; if(AWC.pollT){clearInterval(AWC.pollT);AWC.pollT=null;}
  loadAltar(AWC.kind).then(()=>{if(H.getLive())altarLiveStartPoll();});}
function awcResultHTML(cat){
  const r=AWC.resBy[cat];
  if(!r||!r.item)return `<div class="awcslot r"></div><span class="awrn awmini">no result yet — Roll to spin the altar</span>`;
  const b=r.bonus_item;
  return `<div class="awcslot r has">${r.item.icon?iconImg('item',r.item.icon):'<img src="/studio/icons/icons/24/rewards.png" srcset="/studio/icons/icons/24/rewards.png 1x, /studio/icons/icons/48/rewards.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">'}</div>
    <span class="awrn">${esc(r.item.name)} ×${r.count||1}${b?` <span title="bonus: ${esc(b.name)}"><img src="/studio/icons/icons/24/generation_3d.png" srcset="/studio/icons/icons/24/generation_3d.png 1x, /studio/icons/icons/48/generation_3d.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>`:''}${r.tier>0?` <span class="awmini">· tier ${r.tier}</span>`:''}</span>`;
}
function renderAltarConsole(){
  const cat=AWC.cat, A=AB()[cat];
  const curs=awcCurrencies(cat), curId=awcCurrencyId(cat);
  const ok=altarLiveOk();
  $('#content').innerHTML=`<div class="altarpage">
    <div class="altartoolbar">
      <div class="altarseg">${['crystal','diamond','gem'].map(k=>
        `<button class="aseg${k===AWC.kind?' on':''}" data-ck="${k}">${H.altarIcons()[k]}<span>${esc(H.altarLabels()[k].replace(' Altar',''))}</span></button>`).join('')}</div>
      <div class="altarmeta">${iconMarkup('live',24)} Live Console · no DB · the open in-game altar is driven by the client</div>
      <span class="grow"></span>
      <span id="altdot" class="altdot ${ok?'ok':'warn'}" title="${ok?'In-game — Live connected. Open the altar in-game to Roll / Auto.':'Not in-game — log in, load your character, then open the altar in-game.'}"></span>
      <button class="awbtn" id="awc-exit" title="back to the full editor grid (loads from the server DB)">⬅ Editor</button>
    </div>
    <div class="awconsole">
      <div class="awccard">
        <h3>Insert currency <span class="sub">what you roll with</span></h3>
        <div class="awccurs" id="awc-curs">${curs.length?curs.map(c=>{const cnt=awcCount(c.item_id);
          return `<button class="awcslot cur${c.item_id===curId?' sel':''}${cnt===0?' empty-stock':''}" data-curid="${c.item_id}" title="${esc(c.item.name)} (#${c.item_id})${cnt!=null?' — you have '+cnt:''}">${c.item.icon?iconImg('item',c.item.icon):'◆'}${cnt!=null?`<span class="q${cnt===0?' z':''}">${cnt>9999?'9999+':cnt}</span>`:''}</button>`;}).join('')
          :'<span class="awmini">no currency config</span>'}
          <label class="awmini" style="margin-left:8px">custom id <input class="awin" id="awc-custom" value="" placeholder="#" style="width:74px" title="override: type any currency item id to insert"></label></div>
        <div id="awc-curwarn" class="awmini" style="color:var(--crimson);margin-top:6px;display:${awcCount(curId)===0?'':'none'}"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> you have 0 of the selected currency in-game — pick one you own (rolling with 0 does nothing).</div>
        <div class="awcresult"><span class="awtag">Result</span><span id="awc-result">${awcResultHTML(cat)}</span></div>
        <div class="awcact">
          <button class="sbtn" id="awc-roll" ${ok?'':'disabled'} title="${ok?'Transform: spend 1 insert + roll, in-game':'open the altar in-game first (dot must be green)'}">✨ Roll</button>
          <button class="sbtn ghost" id="awc-take" ${ok?'':'disabled'} title="Take the current result into your in-game bag">Take</button>
          <button class="sbtn ghost" id="awc-claim" ${ok?'':'disabled'} title="Claim energy rewards in-game"><img src="/studio/icons/icons/24/rewards.png" srcset="/studio/icons/icons/24/rewards.png 1x, /studio/icons/icons/48/rewards.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Claim</button>
        </div>
        <div id="awc-livehint" class="awmini" style="color:var(--gold-d);margin-top:8px;display:${ok?'none':''}"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Open the altar in-game to enable Roll/Take (status dot must be green). Needs eden_patch.ini [Features] altar_remote = 1 or 2 and the game running.</div>
      </div>
      <div class="awccard">
        <h3><img src="/studio/icons/icons/24/objectives.png" srcset="/studio/icons/icons/24/objectives.png 1x, /studio/icons/icons/48/objectives.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Target items <span class="sub">auto-Take when one of these is rolled</span></h3>
        <div class="awctgtsearch"><input id="awc-tq" placeholder="search item by name or id…" autocomplete="off"><div id="awc-tlist" class="aelist"></div></div>
        <div id="awc-chips"></div>
        <div class="awcauto">
          <label class="awmini">max inserts <input class="awin" id="awc-n" value="${A.inserts}" style="width:64px"></label>
          <span id="awc-autobtns">${A.running?`<button class="awbtn" id="awc-auto-stop"><img src="/studio/icons/icons/24/stop.png" srcset="/studio/icons/icons/24/stop.png 1x, /studio/icons/icons/48/stop.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Stop · ${A.used}/${A.inserts} · ${A.got} taken${A.paused?' · <img src="/studio/icons/icons/24/pause.png" srcset="/studio/icons/icons/24/pause.png 1x, /studio/icons/icons/48/pause.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> paused':''}</button>`
            :`<button class="awbtn gold" id="awc-auto-go" ${ok?'':'disabled'}>▶ Start Auto</button>`}</span>
        </div>
      </div>
    </div></div>`;
  $('#content').querySelectorAll('[data-ck]').forEach(b=>b.onclick=()=>openAltarConsole(b.dataset.ck));
  if($('#awc-exit'))$('#awc-exit').onclick=exitAltarConsole;
  $('#content').querySelectorAll('[data-curid]').forEach(b=>b.onclick=()=>{AWC.curBy[cat]=+b.dataset.curid;
    if($('#awc-custom'))$('#awc-custom').value='';awcRenderCurrencies();awcSave();});   // ciblé : highlight + warning, sans wipe
  if($('#awc-n'))$('#awc-n').onchange=()=>{const v=Math.max(1,Math.min(99999,parseInt($('#awc-n').value)||10));
    AB()[cat].inserts=v;$('#awc-n').value=v;awcSave();};
  // les actions MANUELLES coupent l'auto d'abord -> on reprend toujours la main (jamais bloqué)
  if($('#awc-roll'))$('#awc-roll').onclick=()=>{A.running=false;awcRenderAutoBtn();awcRoll();};
  if($('#awc-take'))$('#awc-take').onclick=()=>{A.running=false;awcRenderAutoBtn();altarLivePush(0,cat);altarRefreshBagSoon();toast('Take sent to the game');};
  if($('#awc-claim'))$('#awc-claim').onclick=()=>{A.running=false;awcRenderAutoBtn();altarLiveClaim(cat);altarRefreshBagSoon();toast('Claim sent to the game');};
  if($('#awc-auto-go'))$('#awc-auto-go').onclick=()=>altarConsoleAuto(cat);
  if($('#awc-auto-stop'))$('#awc-auto-stop').onclick=()=>{A.running=false;awcRenderAutoBtn();};
  awcRenderChips(); awcWireSearch(cat);
}
// chips de cibles : rendu CIBLÉ dans #awc-chips (jamais de re-render global -> ne wipe pas la recherche)
function awcRenderChips(){
  const A=AB()[AWC.cat], box=$('#awc-chips'); if(!box)return;
  const tgts=[...A.targets];
  tgts.forEach(id=>{if(!TGTCACHE[id])awcResolveTarget(id);});   // résout les noms inconnus (ajoutés ailleurs)
  if(!tgts.length){box.innerHTML='<div class="awmini" style="margin-top:8px">No targets yet — search above and click an item to add it. Auto rolls until it gets one (or runs out of inserts).</div>';return;}
  box.innerHTML='<div class="awautotgts ico" style="margin-top:8px">'+tgts.map(id=>{const it=TGTCACHE[id];const nm=esc(it?it.name:('#'+id));
    return `<span class="autochip ico" data-untgt="${id}" title="${nm} — click to remove">${it&&it.icon?iconImg('item',it.icon):'<span class="aci">◆</span>'}<span class="acx">✕</span></span>`;}).join('')+'</div>';
  box.querySelectorAll('[data-untgt]').forEach(el=>el.onclick=()=>{A.targets.delete(+el.dataset.untgt);awcRenderChips();awcSave();});
}
function awcRoll(){
  const cat=AWC.cat;
  let curId=awcCurrencyId(cat);
  const cv=parseInt(($('#awc-custom')||{}).value); if(cv>0)curId=cv;
  if(!curId){toast('pick an insert currency first','warn');return;}
  if(awcCount(curId)===0){toast('you have 0 of this currency in-game — pick one you own','warn',5000);return;}
  altarLivePush(curId,cat); toast('Roll → game (rolling…)');
}
let _awcTqT=null;
function awcWireSearch(cat){
  const inp=$('#awc-tq'); if(!inp)return;
  inp.addEventListener('input',()=>{clearTimeout(_awcTqT);_awcTqT=setTimeout(async()=>{
    const q=inp.value.trim(); const lst=$('#awc-tlist'); if(!lst)return;
    if(!q){lst.innerHTML='';return;}
    let list=[]; try{list=await (await fetch('/api/search?types=item&limit=40&q='+enc(q))).json();}catch(e){}
    lst.innerHTML=(list||[]).map(i=>`<div class="aerow" data-id="${i.id}" data-nm="${esc(i.name)}" data-ic="${esc(i.icon||'')}">
      <span class="ic">${i.icon?iconImg('item',i.icon):'<img src="/studio/icons/icons/24/packaging.png" srcset="/studio/icons/icons/24/packaging.png 1x, /studio/icons/icons/48/packaging.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">'}</span><span class="nm">${esc(i.name)}</span><span class="id">#${i.id}</span></div>`).join('');
    lst.querySelectorAll('.aerow').forEach(r=>r.onclick=()=>{const id=+r.dataset.id;
      TGTCACHE[id]={name:r.dataset.nm,icon:r.dataset.ic};
      AB()[cat].targets.add(id); inp.value='';lst.innerHTML='';awcRenderChips();awcSave();
      toast('target added: '+r.dataset.nm);});
  },220);});
  // entrée d'un id brut + Enter -> ajoute directement
  inp.addEventListener('keydown',ev=>{if(ev.key!=='Enter')return; const v=parseInt(inp.value.trim());
    if(v>0){AB()[cat].targets.add(v); awcResolveTarget(v); inp.value='';$('#awc-tlist').innerHTML='';awcRenderChips();awcSave();}});
}
async function awcResolveTarget(id){   // résout nom/icône d'un id brut (pas de grille) pour le chip
  if(TGTCACHE[id])return;
  try{const j=await (await fetch('/api/altar/live/item/'+id)).json();
    if(j.item){TGTCACHE[id]={name:j.item.name,icon:j.item.icon};awcRenderChips();}}catch(e){}
}
// --- MISES À JOUR CIBLÉES (le poll NE reconstruit JAMAIS tout le panneau -> ne reset PLUS les inputs/focus) ---
function awcRenderResult(){const el=$('#awc-result'); if(el)el.innerHTML=awcResultHTML(AWC.cat);}
function awcRenderCurrencies(){
  const cat=AWC.cat, curId=awcCurrencyId(cat);
  document.querySelectorAll('#awc-curs [data-curid]').forEach(b=>{
    const id=+b.dataset.curid, cnt=awcCount(id);
    b.classList.toggle('sel', id===curId);
    b.classList.toggle('empty-stock', cnt===0);
    let q=b.querySelector('.q');
    if(cnt!=null){if(!q){q=document.createElement('span');q.className='q';b.appendChild(q);}
      q.textContent=cnt>9999?'9999+':cnt; q.classList.toggle('z',cnt===0);}
    else if(q){q.remove();}
  });
  const w=$('#awc-curwarn'); if(w)w.style.display=(awcCount(curId)===0)?'':'none';
}
function awcRenderStatus(){
  refreshAltarDot();
  const ok=altarLiveOk();
  ['awc-roll','awc-take','awc-claim'].forEach(id=>{const b=$('#'+id); if(b)b.disabled=!ok;});
  const go=$('#awc-auto-go'); if(go)go.disabled=!ok;
  const h=$('#awc-livehint'); if(h)h.style.display=ok?'none':'';
}
function awcRenderAutoBtn(){
  const A=AB()[AWC.cat], ok=altarLiveOk(), wrap=$('#awc-autobtns'); if(!wrap)return;
  wrap.innerHTML=A.running
    ?`<button class="awbtn" id="awc-auto-stop"><img src="/studio/icons/icons/24/stop.png" srcset="/studio/icons/icons/24/stop.png 1x, /studio/icons/icons/48/stop.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Stop · ${A.used}/${A.inserts} · ${A.got} taken${A.paused?' · <img src="/studio/icons/icons/24/pause.png" srcset="/studio/icons/icons/24/pause.png 1x, /studio/icons/icons/48/pause.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> paused':''}</button>`
    :`<button class="awbtn gold" id="awc-auto-go" ${ok?'':'disabled'}>▶ Start Auto</button>`;
  const go=$('#awc-auto-go'); if(go)go.onclick=()=>altarConsoleAuto(AWC.cat);
  const st=$('#awc-auto-stop'); if(st)st.onclick=()=>{A.running=false;awcRenderAutoBtn();};
}
function awcStartPoll(){
  if(AWC.pollT)return;
  AWC.pollT=setInterval(async()=>{
    if(!AWC.on){clearInterval(AWC.pollT);AWC.pollT=null;return;}
    const cat=AWC.cat, running=AB()[cat].running;   // pendant l'auto, l'auto pilote l'affichage
    // résultat live -> slot Result UNIQUEMENT (pas de re-render global)
    try{const j=await (await fetch('/api/altar/live/result?cat='+cat)).json(); const r=j.result;
      if(r&&r.ts&&r.ts!==AWC.resTsBy[cat]){AWC.resTsBy[cat]=r.ts;
        AWC.resBy[cat]=(r.item_id>0&&r.item)?r:null;   // item_id 0 = Take/reset en jeu
        if(!running)awcRenderResult();}
    }catch(e){}
    // stock LIVE des monnaies -> badges UNIQUEMENT (préserve la zone de recherche / inputs)
    try{const jc=await (await fetch('/api/altar/live/counts')).json(); const nc=jc.counts||{};
      if(JSON.stringify(nc)!==JSON.stringify(H.getLiveCounts())){H.setLiveCounts(nc); if(!running)awcRenderCurrencies();}
    }catch(e){}
    // statut in-game -> dot + activation boutons UNIQUEMENT
    try{const js=await (await fetch('/api/altar/live/status')).json(); H.setDllIngame(!!(js&&js.ingame));}
    catch(e){H.setDllIngame(false);}
    if(!running)awcRenderStatus();
  },400);
}
// AUTO console : roll en boucle, Take auto quand une cible (ou un résiduel/dernier palier forcé) sort.
// Sans grille : "forcé" = résiduel OU le PALIER N'AVANCE PLUS (le jeu reporte tier ; tier identique
// après un Transform = dernier palier atteint, le jeu désactive Transform) -> on DOIT Take.
async function altarConsoleAuto(cat){
  const A=AB()[cat];
  if(!altarLiveOk()){toast('open the altar in-game first (dot must be green)','warn');return;}
  if(!A.targets.size){toast('add at least 1 target item () first','warn');return;}
  if(A.running)return;
  A.inserts=Math.max(1,Math.min(99999,parseInt(($('#awc-n')||{}).value)||A.inserts||10));
  let curId=awcCurrencyId(cat); const cv=parseInt(($('#awc-custom')||{}).value); if(cv>0)curId=cv;
  if(!curId){toast('pick an insert currency','warn');return;}
  if(awcCount(curId)===0){toast('you have 0 of the selected currency in-game — pick one you own (Aglow/Hallowed for gem, etc.)','warn',6000);return;}
  A.running=true;A.used=0;A.got=0;A.idle=0;A.paused=false;awcRenderAutoBtn();
  let prevTs=AWC.resTsBy[cat];
  while(A.used<A.inserts && A.running){
    if(awcCount(curId)===0){toast('auto stopped — out of insert currency in-game','warn');break;}   // set & forget : stop quand la monnaie est épuisée
    let climb=0, done=false, rolled=false, lastTier=-1;
    while(!done && A.running){
      altarLivePush(curId,cat);                       // Transform en jeu
      const r=await awWaitResult(prevTs,7000,cat);    // le spinner gem/diamond est lent (surtout jeu non-focus)
      if(!r){
        if(climb>0){altarLivePush(0,cat);done=true;altarRefreshBagSoon();toast('must-take (tier cap)');await awSleep(300);break;}
        // 1re absence de résultat = on relance UNE fois en silence (roll lent) ; on n'annonce la
        // pause qu'à la 2e (altar probablement fermé / pas le bon autel ouvert en jeu).
        if(++A.idle>=2 && !A.paused){A.paused=true;awcRenderAutoBtn();toast('paused — open THIS altar in-game (and check you own the insert currency)','warn');}
        if(A.idle>=18){toast('stopped — altar stayed closed in-game','warn');A.running=false;break;}
        await awSleep(1100); continue;                 // rien consommé : on réessaie le même insert
      }
      if(A.paused){A.paused=false;toast('▶ auto resumed');}
      A.idle=0; rolled=true; prevTs=r.ts; AWC.resTsBy[cat]=r.ts; AWC.resBy[cat]=r;
      if(cat===AWC.cat)awcRenderResult();
      climb++;
      const tierCap=(r.tier>0 && r.tier===lastTier);   // le palier n'a pas bougé -> dernier palier (Transform désactivé)
      lastTier=r.tier;
      if(A.targets.has(r.item_id)){altarLivePush(0,cat);A.got++;done=true;altarRefreshBagSoon();toast('taken: '+(r.item?r.item.name:('#'+r.item_id)));}
      else if(awcIsResidual(cat,r.item_id)){altarLivePush(0,cat);done=true;altarRefreshBagSoon();toast('residual must-take');}
      else if(tierCap||climb>=14){altarLivePush(0,cat);done=true;altarRefreshBagSoon();toast('must-take (last tier)');}
      await awSleep(180);
    }
    if(rolled)A.used++;
    awcRenderAutoBtn(); await awSleep(150);
  }
  A.running=false;awcRenderAutoBtn();
  toast(`auto done: ${A.used} inserts used, ${A.got} target(s) taken`);
}
