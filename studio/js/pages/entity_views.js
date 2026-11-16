/* ============================================================================
   ENTITY - fabriques de HTML de la fiche d'entite. Aucun effet de bord : ces
   fonctions RENDENT une chaine, elles ne cablent rien (le cablage vit dans
   entity.js / entity_edit.js). Code COPIE d'index.html sans changement de
   comportement : seuls les acces aux globaux passent par l'hote.

   Pieges consignes ici :
   - presenceSkeleton() doit rester le pendant EXACT de loadPresence() : c'est
     l'etat d'attente affiche avant la reponse serveur, et c'est aussi ce qu'on
     rejoue au clic pour forcer une relecture fraiche.
   - Le vocabulaire des Break Points vient du BACK (engine.BP_TYPES) : « Light »
     y designe le SACRE et « Lightning » la foudre. RES_ICO corrige ce piege ;
     une icone absente tombait en 404 masquee par onerror, donc un trou
     SILENCIEUX dans la rangee - d'ou la pastille `wkmissing` explicite.
   - La couleur d'un tooltip vient de data/db/color.ini : le code $N$ designe la
     LIGNE dont le 4e champ vaut N, donc l'index N-1. Ne pas « corriger » en N.
   - bpChanged() compare au record COURANT : sans lui le bouton « Save Break
     Point » resterait actif et reecrirait des valeurs identiques.
   ============================================================================ */
import { H, cur, ed, S, draftVal } from './entity_state.js';

// ---- Pastilles CLIENT / SERVER / DB : où le record existe (fiabilise l'avant-clone) ----
function presenceSkeleton(){
  return `<span class="pz pz-wait" data-k="client">client <b>⋯</b></span>`
       + `<span class="pz pz-wait" data-k="server">server <b>⋯</b></span>`
       + `<span class="pz pz-wait" data-k="db">db <b>⋯</b></span>`;
}
function _pz(k,label,state,title){   // state: yes | no | warn | na
  return `<span class="pz pz-${state}" data-k="${k}" title="${H.esc(title)}">${label} <b>${state==='yes'?'✓':state==='na'?'–':'✕'}</b></span>`;
}

// ---- ENCHANTS : effets décodés (catalogue opcodes équipe) + lien/appliquer sur un item ----
function decodedEffectsHTML(decoded,flagBits){
  let h='';
  (decoded||[]).forEach(s=>{
    const ps=(s.params||[]).filter(p=>p.value!==''||p.label).map(p=>`<span class="ench-p"><b>${H.esc(p.label||('col'+p.i))}</b>${p.value!==''?'='+H.esc(p.value):''}</span>`).join('');
    h+=`<div class="ench-slot${s.known?'':' unknown'}">
      <div class="ench-op"><span class="ench-nm">${H.esc(s.name)}</span><span class="ench-code">op ${s.opcode}${s.item?' · item':''} · slot ${s.slot}</span></div>
      ${s.desc?`<div class="ench-desc">${H.esc(s.desc)}</div>`:''}${ps?`<div class="ench-params">${ps}</div>`:''}</div>`;
  });
  if(flagBits&&flagBits.length)h+=`<div class="ench-flags">🚩 ${flagBits.map(H.esc).join(' · ')}</div>`;
  return h;
}
function enchantExtras(m){
  if(m.etype==='enchant'){
    const dec=decodedEffectsHTML(m.decoded,m.flag_bits);
    return dec?`<div class="ench-box"><div class="ench-title"><img src="/studio/icons/icons/24/enchants.png" srcset="/studio/icons/icons/24/enchants.png 1x, /icons/icons/48/enchants.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Decoded effects <span class="ench-hint">(team opcode catalog)</span></div>${dec}</div>`:'';
  }
  if(m.etype==='item'){
    const el=m.enchant_link;
    if(el)return `<div class="ench-box"><div class="ench-title"><img src="/studio/icons/icons/24/enchants.png" srcset="/studio/icons/icons/24/enchants.png 1x, /icons/icons/48/enchants.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Enchant <span class="ench-chip" id="ench-open" title="open enchant #${el.id}">#${el.id} ${H.esc(el.name||'')}</span><span class="editpen" id="ench-change" title="apply a different enchant"><img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span><span class="editpen" id="ench-clear" title="remove the enchant (clear field 23)" style="color:var(--crimson)">✕</span></div>${decodedEffectsHTML(el.decoded)}</div>`;
    return `<div class="ench-box"><button class="hbtn" id="ench-apply" title="apply an enchant to this item (field 23)"><img src="/studio/icons/icons/24/enchants.png" srcset="/studio/icons/icons/24/enchants.png 1x, /icons/icons/48/enchants.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Apply an enchant</button></div>`;
  }
  return '';
}

function spawnBox(m){
  if(m.etype!=='monster')return '';
  const sp=m.spawns||[];
  if(!sp.length&&!ed())return '';
  const badge=s=>`<span class="ebadge map" title="${H.esc(s.scene)}">${H.esc(s.map)}${ed()?` <span class="delx" data-rmspawn="${s.scene}" title="remove from this scene">✕</span>`:''}</span>`;
  return `<div class="spawnbox"><div class="lbl"><img src="/studio/icons/icons/24/pin.png" srcset="/studio/icons/icons/24/pin.png 1x, /icons/icons/48/pin.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Appears in (${sp.length})${ed()?` <span class="addbtn" id="add-spawn" style="margin-left:8px">+ Add to scene</span>`:''}</div>
    <div class="ebadges">${sp.slice(0,20).map(badge).join('')||'<span class="esub">Not placed in any scene.</span>'}</div>
    ${sp.length?`<div id="respawn-editor" style="margin-top:8px"></div>`:''}</div>`;
}
function heroBadges(m){
  if(m.etype==='monster'){const c=m.fields[3]||{},rank=(+(m.fields[5]?m.fields[5].value:0))||0;
    return `<span class="ebadge"><b>Lv ${H.esc(m.level)}</b></span><span class="ebadge">${'★'.repeat(Math.min(5,rank+1))}</span>
      <span class="ebadge">category <b>${H.esc(c.value||'?')}</b>${c.cur_label?' '+H.esc(c.cur_label):''}</span>
      <span class="ebadge">model <b>${H.esc(m.model||'—')}</b></span>`;}
  const f=i=>{const x=m.fields[i];return x?x.value:'';};
  if(m.etype==='item')return `<span class="ebadge">type <b>${H.esc(f(8))}</b></span><span class="ebadge">grade <b>${H.esc(f(3))}</b></span>`;
  if(m.etype==='spell')return `<span class="ebadge">max Lv <b>${H.esc(f(20))}</b></span><span class="ebadge">MP <b>${H.esc(f(27))}</b></span>`;
  return '';
}
// ----- RESISTANCES tab : values with the game's ICONS instead of names, Elemental/Physical groups.
function resistIconPanel(){
  const m=cur();
  const R=[[25,'Slash','res_slash'],[26,'Strike','res_strike'],[27,'Pierce','res_pierce'],
    [28,'Fire','res_fire'],[29,'Ice','res_ice'],[30,'Light','res_light'],[31,'Nature','res_nature'],[32,'Holy','res_holy'],[33,'Dark','res_dark']];
  const fv=i=>{const dv=draftVal(i),f=m.fields[i];return dv!==null?dv:(f?f.value:'');};
  const cell=([i,name,ic])=>{const v=fv(i),n=+v,weak=(v!==''&&!isNaN(n)&&n<0);
    return `<div class="rescell big${weak?' weak':''}" title="${name} resist${weak?' — WEAKNESS (negative)':''}">
      <img class="resico" src="/studio/icons/${ic}.png${H.ICONV}" alt="${H.esc(name)}" onerror="this.style.visibility='hidden'">
      ${ed()?`<input class="resin" data-fi="${i}" value="${H.esc(v)}" title="${name} resist (negative = weak)">`:`<span class="resval">${H.esc(v||'0')}</span>`}</div>`;};
  return `<div class="dtblhead"><img src="/studio/icons/icons/24/integrity.png" srcset="/studio/icons/icons/24/integrity.png 1x, /icons/icons/48/integrity.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Resistances <span style="color:var(--faint);font-size:11px;font-weight:400">(scale -100..500 · negative = weakness)</span></div>
    <div class="resgrp">Elemental</div><div class="resrow big">${R.slice(3).map(cell).join('')}</div>
    <div class="resgrp" style="margin-top:10px">Physical</div><div class="resrow big">${R.slice(0,3).map(cell).join('')}</div>
    <div style="height:14px"></div>`;}
// Graphique RADAR (toile d'araignee) : stats du monstre vs mediane de son niveau, a cote des donnees.
function radarChart(m){
  if(!m||m.etype!=='monster')return '';
  const b=m.balance;if(!b)return '';
  // axes detailles (7) si dispo, sinon fallback 3 ; ATK SPEED = mediane / intervalle (plus loin = plus rapide)
  const A=(b.axes&&b.axes.length?b.axes:[{key:'hp',label:'HP',ratio:b.hp},{key:'atk',label:'ATK',ratio:b.atk},{key:'def',label:'P.DEF',ratio:b['def']}])
    .filter(a=>a.ratio!=null);
  if(A.length<3)return '';
  const col=r=>r>=0.8&&r<=1.25?'#4a8a3a':(r>1.25?'#bf6a2a':'#bf3a3a');
  const tag=r=>r>1.6?'over':(r<0.55?'under':(r>=0.8&&r<=1.25?'balanced':(r>1.25?'high':'low')));
  const S=232,cx=S/2,cy=S/2,R=80,n=A.length,CAP=2;        // radar AGRANDI
  const ang=i=>-Math.PI/2+i*2*Math.PI/n;
  const pt=(i,r)=>[+(cx+Math.cos(ang(i))*R*r).toFixed(1),+(cy+Math.sin(ang(i))*R*r).toFixed(1)];
  const norm=v=>Math.max(0.04,Math.min(CAP,v))/CAP;
  const rings=[0.5,1,1.5,2].map(rr=>{const p=A.map((a,i)=>pt(i,rr/CAP).join(',')).join(' ');
    return `<polygon points="${p}" fill="none" stroke="${rr===1?'#9a6a2b':'#d6c5a0'}" stroke-width="${rr===1?1.5:0.7}"${rr===1?'':' stroke-dasharray="2 3"'}/>`;}).join('');
  const spokes=A.map((a,i)=>{const[x,y]=pt(i,1);return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#d6c5a0" stroke-width="0.6"/>`;}).join('');
  const valPts=A.map((a,i)=>pt(i,norm(a.ratio)).join(',')).join(' ');
  const dots=A.map((a,i)=>{const[x,y]=pt(i,norm(a.ratio));return `<circle cx="${x}" cy="${y}" r="2.8" fill="${col(a.ratio)}"/>`;}).join('');
  const labels=A.map((a,i)=>{const[x,y]=pt(i,1.2);return `<text x="${x}" y="${y}" font-family="Cinzel" font-size="9.5" font-weight="600" fill="#5b4420" text-anchor="middle" dominant-baseline="middle">${H.esc(a.label)}</text>`;}).join('');
  // detail : valeur du monstre vs mediane + ratio, par stat
  const fv=(a,v)=>v==null?'—':(a.fmt==='tenths_s'?(v/10).toFixed(1)+' s':v.toLocaleString());
  const rows=A.map(a=>`<div class="balrow2"${a.help?` title="${H.esc(a.help)}"`:''}><span class="bl">${H.esc(a.label)}</span>
    <span class="bv" style="color:${col(a.ratio)}">${fv(a,a.value)}</span>
    <span class="bm">med ${fv(a,a.median||0)}</span>
    <span class="br" style="color:${col(a.ratio)}">×${a.ratio} <small>${tag(a.ratio)}</small></span></div>`).join('');
  return `<div class="radarbox"><div class="radar-title"><img src="/studio/icons/icons/24/compare.png" srcset="/studio/icons/icons/24/compare.png 1x, /icons/icons/48/compare.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Balance · Lv ${b.level} <span>(vs ${b.sample} same-level mobs)</span></div>
    <svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${rings}${spokes}
      <polygon points="${valPts}" fill="rgba(154,106,43,.22)" stroke="#9a6a2b" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>
    <div class="baldetail">${rows}</div>
    <div class="radar-leg">solid gold ring = median (×1) · green = balanced, orange = high, red = low</div></div>`;}
// ⚠️ VOCABULAIRE DU BACK (engine.BP_TYPES) : « Lightning » = la FOUDRE, et « Light » = le SACRÉ
  // (ce que le jeu appelle Holy). Les deux pointaient `res_light` : la faiblesse sacrée portait donc
  // l'icône de la foudre, et `res_holy.png` n'était jamais servi. `Holy` n'est jamais émis par le
  // back — l'entrée était morte. Ancien commentaire (inexact) :
// l'icône pointait sur /icons/undefined.png, tombait en 404, et `onerror` la masquait EN
// SILENCE — d'où un trou dans la rangée sans le moindre message. On couvre les deux
// vocabulaires, et la résolution est insensible à la casse.
const RES_ICO={Slash:'res_slash',Strike:'res_strike',Pierce:'res_pierce',Fire:'res_fire',Ice:'res_ice',Lightning:'res_light',Nature:'res_nature',Light:'res_holy',Dark:'res_dark'};
function resIco(t){ if(!t)return null;
  return RES_ICO[t] || RES_ICO[String(t).charAt(0).toUpperCase()+String(t).slice(1).toLowerCase()] || null; }
// FAIBLESSES (Break Point) en OVERLAY par-dessus le modele 3D : switches icone-seule (grises si OFF /
// couleur si ON), alignes en LIGNE DROITE en bas, sous les pieds du monstre.
function weaknessFan(m){
  if(!m||m.etype!=='monster')return '';
  const bptypes=m.bp_types||['Slash','Strike','Pierce','Fire','Ice','Lightning','Nature','Light','Dark'];
  const active=new Set(S.bpSel!==null?S.bpSel:(m.bp_weakness||[]));
  const n=bptypes.length;
  const orbs=bptypes.map((t,k)=>{
    const x=7+k*(86/(n-1));                            // 7%..93% : rangee centree
    const ic=resIco(t);
    if(!ic) return `<span class="wkswitch wkmissing" style="left:${x.toFixed(2)}%" data-bptype="${t}" title="${H.esc(t)} — no icon mapped for this type (the row would silently lose a slot)">?</span>`;
    return `<img class="wkswitch${active.has(t)?' on':''}" style="left:${x.toFixed(2)}%" src="/studio/icons/${ic}.png${H.ICONV}" data-bptype="${t}" title="${H.esc(t)}${active.has(t)?' — weakness ON':' (off — click to toggle)'}" alt="${H.esc(t)}" onerror="this.classList.add('wkmissing');this.removeAttribute('src');this.title='${H.esc(t)} — icon file missing';">`;
  }).join('');
  return `<div class="weakrow">${orbs}</div>`;}
// barre sous le portrait : titre + (en edit) bouton Save weakness (grise tant que rien n'a change).
function bpChanged(){if(!cur())return false;
  const orbs=S.bpSel!==null&&(()=>{const o=new Set(cur().bp_weakness||[]);return S.bpSel.length!==o.size||S.bpSel.some(t=>!o.has(t));})();
  const val=S.bpValSel!==null&&(parseInt(S.bpValSel,10)||0)!==(cur().bp_value||0);
  return orbs||val;}
function weakBar(m){
  if(!m||m.etype!=='monster')return '';
  const bpv=S.bpValSel!==null?S.bpValSel:(m.bp_value||0), hp=m.bp_hp||0, sugg=Math.round(hp*0.4);
  return `<div class="weakbar"><div class="weakbar-h"><img src="/studio/icons/icons/24/break_point.png" srcset="/studio/icons/icons/24/break_point.png 1x, /icons/icons/48/break_point.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Break Point <span>${ed()?'orbs = which elements break it · BP bar = its size':'lit = breaks the BP bar'}</span></div>
    <div class="bpvalrow"><span class="bpvlbl">BP bar</span><input id="bp-value" type="number" min="0" value="${bpv}" ${ed()?'':'readonly'} title="Break Point bar value (field 12) — an HP-like pool you fill to break the bar, usually ≈40% of HP">${ed()&&hp?`<span class="bpvhint" id="bp-sugg" title="set to ≈40% of HP" style="cursor:url(/studio/cursors/glove.png?7) 10 3,pointer">use ≈40% HP: ${sugg.toLocaleString()}</span>`:`<span class="bpvhint">${hp?'≈40% HP = '+sugg.toLocaleString():'HP-like pool'}</span>`}</div>
    ${ed()?`<button class="addbtn" id="bp-save-mini" style="width:100%;margin-top:6px" ${bpChanged()?'':'disabled'}><img src="/studio/icons/icons/24/save.png" srcset="/studio/icons/icons/24/save.png 1x, /icons/icons/48/save.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Save Break Point</button>`:''}</div>`;}

// ---------- in-game tooltip LIVE PREVIEW ----------
// $NN$ colour palette = the GAME'S OWN data/db/color.ini (exact RGB; index N -> R,G,B). Authoritative.
const TIP_COLORS={0:'60,60,60',1:'192,192,192',2:'169,136,113',3:'111,93,140',4:'102,150,221',5:'121,153,105',6:'251,241,119',7:'206,91,103',8:'228,140,126',9:'96,67,54',10:'255,209,197',11:'245,122,124',12:'154,205,247',13:'239,139,115',14:'187,228,119',15:'171,154,219',16:'255,241,228',17:'253,228,221',18:'214,187,84',19:'192,156,116',20:'156,124,105',21:'209,100,71',22:'128,84,70',23:'95,95,95',24:'71,76,110',25:'172,172,172',26:'192,192,192',27:'247,220,136',28:'224,225,119',29:'247,232,160',30:'251,241,119',31:'225,119,116',32:'100,57,54',33:'50,92,98',34:'176,225,114',35:'200,227,175',36:'171,154,219',37:'100,82,66',38:'141,120,95',39:'76,73,115',40:'154,205,247',41:'122,134,214',42:'178,117,111',43:'232,172,160',44:'62,122,125',45:'204,179,132',46:'225,223,222',47:'121,153,105',48:'171,217,176',49:'204,218,255',50:'195,129,111',51:'0,255,255'};
const TIP_DEFAULT='rgb(235,230,215)';   // text with NO code = white/cream (e.g. Corona's first line)
const TIP_PALETTE=[5,7,12,13,15,16,21,35,52];
// IMPORTANT mapping: code $N$ -> color.ini ROW whose 4th field = N, i.e. index N-1. CONFIRMED on real
// data: $5$=blue (Gender tool desc), $15$=light green (Corona), $35$=green (Colors line).
function tipColor(n){const v=TIP_COLORS[n-1];return v?'rgb('+v+')':TIP_DEFAULT;}
// Grade (field 3 "GRADE (COLOR)") drives the item FRAME/contour colour (and the NAME colour by default).
// From in-game references: G3=green, G4=white, G5=orange, G6=violet. G1/G2/G7 are placeholders TO CONFIRM.
// EXACT frame colours sampled from the game's own imageset DejaVu.png (Quality W/G/B/P/O/Y sprites).
// Grade tier -> quality letter: G1=W white, G2=G green, G3=B blue, G4=P violet, G5=O orange, G6=Y gold.
const GRADE_COLORS={1:'243,243,243',2:'108,242,72',3:'69,192,246',4:'209,32,245',5:'255,147,14',6:'255,237,84',7:'255,237,84'};
// Some UI types (field 4) FORCE a fixed frame/name colour regardless of grade (e.g. UI013 = tools/boxes = white,
// confirmed on Gender tool G5 + Highlands box G6 both white). Most other UI types use the grade. Extend as confirmed.
const UITYPE_COLOR={'UI013':'243,243,243'};
// QUALITY (field 12) OVERRIDES the name colour when set (observed: 2=white, 5=green).
function gradeColor(g){const n=parseInt((String(g||'').match(/\d+/)||[0])[0])||0;const v=GRADE_COLORS[n];return v?'rgb('+v+')':'rgb(200,200,200)';}
const GRADE_LABEL={1:'white',2:'green',3:'blue',4:'purple',5:'orange',6:'gold',7:'bright gold'};
function gradeSelect(f,v){
  const codes=[1,2,3,4,5,6,7],std=codes.some(n=>v==='G'+String(n).padStart(5,'0'));
  const extra=(v&&!std)?`<option value="${H.esc(v)}" selected>${H.esc(v)} (other)</option>`:(!v?'<option value="" selected>(none)</option>':'');
  const opts=codes.map(n=>{const c='G'+String(n).padStart(5,'0');return `<option value="${c}"${v===c?' selected':''}>${c} — ${GRADE_LABEL[n]}</option>`;}).join('');
  return `<div style="display:flex;gap:7px;align-items:center"><span style="width:18px;height:18px;border-radius:3px;border:3px solid ${gradeColor(v)};flex:none" title="item outline color"></span><select data-fi="${f.i}" style="flex:1">${extra}${opts}</select></div>`;}
function fval(m,i){if(m===cur()){const dv=draftVal(i);if(dv!==null)return String(dv).trim();}const f=(m.fields||[]).find(x=>x.i===i);return f?String(f.value).trim():'';}
function renderTipText(txt){
  if(!txt)return '<div style="color:#7a7363">(empty — click <img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> on “In-game tooltip” to add)</div>';
  return H.esc(txt).split('\n').map(line=>{
    let html='',color=TIP_DEFAULT;
    for(const p of line.split(/(\$\d+\$)/)){
      const mm=p.match(/^\$(\d+)\$$/);
      if(mm){color=tipColor(+mm[1]);}
      else if(p){html+=`<span style="color:${color}">${p}</span>`;}
    }
    return `<div style="min-height:.45em">${html||'&nbsp;'}</div>`;
  }).join('');
}
function tooltipPreview(m){
  if(m.disp_desc===undefined&&m.etype!=='item'&&m.etype!=='spell')return '';
  const grade=fval(m,3),uitype=fval(m,4),uc=UITYPE_COLOR[uitype];
  const cc=uc?('rgb('+uc+')'):gradeColor(grade);       // UI-type fixed colour (UI013 tools=white) overrides, else GRADE
  const frame=cc,nc=cc;                                // frame AND name share it (Gender UI013 -> white, VIP UI011 G5 -> orange)
  const bound=fval(m,13),reqlvl=fval(m,14);
  const foot=['Item'];
  if(bound==='-1')foot.push("Can't be Traded");   // bound items can't be traded (the real signal)
  return `<div style="margin-top:9px">
    <div style="font-size:.78em;color:var(--faint);margin-bottom:3px;letter-spacing:.04em">▼ IN-GAME PREVIEW (live)</div>
    <div style="background:#15130f;border:1px solid #3a352a;border-radius:4px;padding:10px 12px;max-width:344px;font-size:.9em;line-height:1.45;box-shadow:0 5px 16px rgba(0,0,0,.45)">
      <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:7px">
        ${m.icon?`<span style="border:2px solid ${frame};border-radius:3px;padding:1px;display:inline-flex;flex:0 0 auto">${H.iconImg(m.etype,m.icon,'gameicon')}</span>`:''}
        <span style="color:${nc};font-weight:bold;font-size:1.05em;align-self:center">${H.esc(m.name_en||m.name_big5||('#'+m.id))}</span>
      </div>
      <div>${renderTipText(m.disp_desc)}</div>
      ${reqlvl&&reqlvl!=='0'?`<div style="color:rgb(225,119,116);margin-top:6px">Level Requirement ${H.esc(reqlvl)}</div>`:''}
      <div style="border-top:1px solid #2e2a22;margin-top:8px;padding-top:5px;color:#9a917c;font-size:.92em">${foot.map(H.esc).join('&nbsp;&nbsp;&nbsp;')}</div>
    </div>
  </div>`;
}
function insertTipCode(n){const ta=H.$('#ne-textarea');if(!ta)return;const s=ta.selectionStart,e=ta.selectionEnd,v=ta.value,tok='$'+n+'$';ta.value=v.slice(0,s)+tok+v.slice(e);ta.focus();ta.selectionStart=ta.selectionEnd=s+tok.length;}

export { presenceSkeleton, _pz, enchantExtras, spawnBox, heroBadges,
         resistIconPanel, radarChart, weaknessFan, bpChanged, weakBar,
         tipColor, gradeSelect, tooltipPreview,
         insertTipCode, TIP_PALETTE };
