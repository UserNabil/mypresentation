/* ============================================================================
   CLASSES — vues. Fabriques de HTML, sans effet de bord et sans fetch.

   Le cablage (onclick) est fait par classes.js apres insertion : ces fonctions
   ne posent que des attributs `data-*`. Deux raisons, toutes deux vecues :
   - un `onclick=` inline dans une chaine echapperait mal les noms Big5 ;
   - l'onglet est re-rendu seul (`#cls-tabbody`), donc le cablage doit pouvoir
     etre rejoue sans reconstruire toute la page.

   ⛔ Aucun global : tout passe par host() (voir classes_state.js).

   Pieges consignes ici :
   - `clsSlotAttr` change de nature selon le mode. En lecture, l'attribut porte
     l'ID de l'entite (on ouvre sa fiche) ; en edition il porte la COLONNE
     (`field_idx`) car c'est la colonne qu'on va reecrire, pas l'entite. Un slot
     sans `field_idx` n'est donc PAS editable, meme en mode edition.
   - Les trois natures d'effet d'une classe sont distinctes et ne doivent pas
     etre melangees sous le mot « skill » : certificats (item -> enchant),
     connaissances (enchant direct), bonus de palier (arbre de talents).
   - `clsRawEditor` : les colonnes 4/6/7 sont des textes longs -> textarea. Une
     valeur contenant '|' ou un saut de ligne est refusee par la garde serveur
     (elle casserait le record .ini), d'ou la mention dans l'aide.
   ============================================================================ */
import { host, S, g } from './classes_state.js';

/* La couleur d'une stat doit etre IDENTIQUE en lecture et en edition : sinon le
   passage d'un mode a l'autre donne l'impression d'avoir change de stat. */
const CLS_STATCOL={HP:'#b3562f',MP:'#2f6bb3',STR:'#b3562f',AGI:'#3c7a3c',INT:'#7a4f9e',WIS:'#9a6a2b',LCK:'#a5476f'};

function clsOpenAttr(kind,id){return kind==='item'?`data-openitem="${id}"`:(kind==='enchant'?`data-openenchant="${id}"`:`data-openspell="${id}"`);}
export function clsIconTag(kind,code,cls){return host().iconImg(kind==='item'?'item':'spell',code,cls);}

export function renderClassLeft(){
  const {esc,iconImg}=host();
  const ql=S.q.trim().toLowerCase();
  let html='';
  for(const grp of (g.tree().groups||[])){
    let fams=grp.families;
    if(ql)fams=fams.filter(f=>(f.name_en+' '+(f.name_fr||'')).toLowerCase().includes(ql));
    if(!fams.length)continue;
    html+=`<div class="clsrole"><span class="clsroledot" style="background:${grp.color}"></span>${esc(grp.label)}<span class="clsrolen">${fams.length}</span></div>`;
    for(const f of fams){
      const sub=(f.name_fr&&f.name_fr!==f.name_en)?f.name_fr:'';
      html+=`<div class="clsrow${f.family===g.fam()?' on':''}" data-clsfam="${f.family}" style="--rc:${grp.color}">
        ${iconImg('uiicon',f.icon,'clsrowic')||'<span class="clsrowic ph"><img src="/studio/icons/icons/24/classes.png" srcset="/studio/icons/icons/24/classes.png 1x, /studio/icons/icons/48/classes.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>'}
        <div class="clsrowtx"><div class="clsrowname">${esc(f.name_en)}</div>
          <div class="clsrowsub">${esc(sub)}</div></div></div>`;
    }
  }
  return html||'<div class="esub" style="padding:14px;color:var(--faint)">no class matches “'+esc(S.q)+'”</div>';
}

export function renderClassTab(){
  const d=S.detail;
  if(g.tab()==='news')return renderClassNews(d);
  if(g.tab()==='knowledge')return renderClassKnowledge(d);
  if(g.tab()==='skills')return renderClassSkills(d);
  return '';
}

function clsStatBars(d){
  const stats=(d.stats||[]).slice().sort((a,b)=>b.pct-a.pct);
  const bars=stats.map(s=>{const col=CLS_STATCOL[s.key]||'#9a6a2b';const w=Math.max(3,Math.min(100,(s.pct/150)*100));
    return `<div class="igstat"><span class="igstatk" style="color:${col}">${s.key}</span>
      <div class="igstatbar"><div class="igstatfill" style="width:${w}%;background:${col}"></div></div>
      <span class="igstatv" style="color:${col}">${s.pct}%</span></div>`;}).join('');
  return `<div class="clspanel"><div class="clspanelh"><img src="/studio/icons/icons/24/readiness.png" srcset="/studio/icons/icons/24/readiness.png 1x, /studio/icons/icons/48/readiness.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Class Stat Bonus</div><div class="clspanelb">${bars}</div></div>`;
}

function clsStatEdit(d){
  const rows=(d.stats||[]).map(s=>{const col=CLS_STATCOL[s.key]||'#9a6a2b';
    return `<div class="igstat"><span class="igstatk" style="color:${col}">${s.key}</span>
      <input class="clsstatinput" type="number" data-sidx="${s.idx}" value="${s.pct}" min="0" max="500">
      <span class="clsstatpc">%</span></div>`;}).join('');
  return `<div class="clspanel"><div class="clspanelh"><img src="/studio/icons/icons/24/readiness.png" srcset="/studio/icons/icons/24/readiness.png 1x, /studio/icons/icons/48/readiness.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Class Stat Bonus <span class="clsn">editing</span></div>
    <div class="clspanelb">${rows}
      <div class="clsstatsave"><button class="hbtn gold" id="cls-savestats"><img src="/studio/icons/icons/24/save.png" srcset="/studio/icons/icons/24/save.png 1x, /studio/icons/icons/64/save.png 2x" class="ui-icon" width="24" height="24" alt=""> Save stats</button>
        <span class="clsstathint">base = 100% · client + server (stats ARE applied server-side) · restart ZS to apply</span></div></div></div>`;
}

function renderClassNews(d){
  const {esc}=host();
  return `${d.desc?`<div class="clsdescbox">${esc(d.desc)}</div>`:''}
    <div class="clscols">
      ${S.edit?clsStatEdit(d):clsStatBars(d)}
      <div class="clscolside">
        ${d.branch?`<div class="clspanel"><div class="clspanelh"><img src="/studio/icons/icons/24/creatures.png" srcset="/studio/icons/icons/24/creatures.png 1x, /studio/icons/icons/48/creatures.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Branch</div><div class="clspanelb"><div class="clsbranchn">${esc(d.branch)}</div>${d.branch_desc?`<div class="clsbranchd">${esc(d.branch_desc)}</div>`:''}</div></div>`:''}
        ${d.unlock?`<div class="clspanel"><div class="clspanelh"><img src="/studio/icons/icons/24/lock.png" srcset="/studio/icons/icons/24/lock.png 1x, /studio/icons/icons/48/lock.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Unlock</div><div class="clspanelb"><div class="clsunlockt">${esc(d.unlock)}</div></div></div>`:''}
        <div class="clspanel"><div class="clspanelh">ℹ️ Info</div><div class="clspanelb">
          <div class="clsinfo">ID <b>${d.id}</b> · Race <b>${esc(d.race_name)}</b> · ${esc(d.fam_name)}</div>
          <div class="clsinfo">Role <span class="clsbadge sm" style="background:${d.role_color}">${esc(d.role_label)}</span>${d.is_base?' <span class="clschip base">★ starting</span>':''}</div>
        </div></div>
      </div>
    </div>
    ${S.edit?clsRawEditor(d):''}`;
}

function clsRawEditor(d){
  const {esc}=host();
  if(!d.raw||!d.raw.length)return '';
  const CATS=[['base','Identity'],['req','Unlock requirements'],['stats','Stats & coefficients'],['cert','Certificates (item ids)'],['skills','Skills & passives (C_Spell ids)'],['know','Knowledge (enchant ids)'],['text','Texts'],['visual','Appearance'],['other','Other / flags']];
  let body='';
  for(const [ckey,clabel] of CATS){
    const rows=d.raw.filter(f=>f.cat===ckey);
    if(!rows.length)continue;
    body+=`<div class="clsrawcat">${esc(clabel)}</div>`;
    body+=rows.map(f=>{
      const long=[4,6,7].includes(f.i);
      const inp=long
        ?`<textarea class="clsrawinput" data-ridx="${f.i}" rows="2">${esc(f.value)}</textarea>`
        :`<input class="clsrawinput" data-ridx="${f.i}" value="${esc(f.value)}">`;
      return `<div class="clsrawrow"><span class="clsrawlbl">${esc(f.label)} <i>#${f.i}</i></span>${inp}${f.hint?`<span class="clsrawhint">→ ${esc(f.hint)}</span>`:''}</div>`;
    }).join('');
  }
  return `<details class="clspanel clsrawwrap"><summary class="clspanelh"><img src="/studio/icons/icons/24/dna.png" srcset="/studio/icons/icons/24/dna.png 1x, /studio/icons/icons/48/dna.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> All fields <span class="clsn">advanced — edit any of the 66 columns</span></summary>
    <div class="clspanelb">${body}
      <div class="clsstatsave"><button class="hbtn gold" id="cls-saveraw"><img src="/studio/icons/icons/24/save.png" srcset="/studio/icons/icons/24/save.png 1x, /studio/icons/icons/64/save.png 2x" class="ui-icon" width="24" height="24" alt=""> Save all fields</button>
        <span class="clsstathint">writes C_Class.ini (client) + S_Class.ini (server) byte-exact · a value with '|' or a newline is refused by the guard · a server edit needs a ZoneServer restart to apply</span></div></div></details>`;
}

function renderClassKnowledge(d){
  // 3 natures d'effet DISTINCTES : certificats (items->enchant), connaissances (enchant direct),
  // bonus de palier (arbre de talents). Chacune sa section, editable independamment.
  return clsCertPanel('<img src="/studio/icons/icons/24/medal.png" srcset="/studio/icons/icons/24/medal.png 1x, /studio/icons/icons/48/medal.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Certificates (license items)',d.certificates,'item')
       + clsCertPanel('<img src="/studio/icons/icons/24/spellbook.png" srcset="/studio/icons/icons/24/spellbook.png 1x, /studio/icons/icons/48/spellbook.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Knowledge (enchant effects)',d.knowledge,'enchant')
       + clsTalentPanel(d.talent_tree);
}

function renderClassSkills(d){
  //  Active skills (C_Spell 34-44) · Passives (C_Spell 30-33) · Reg. skills (arme, si dispo)
  const reg=(d.reg_skills&&d.reg_skills.length)?clsSkillPanel('<img src="/studio/icons/icons/24/skillbook.png" srcset="/studio/icons/icons/24/skillbook.png 1x, /studio/icons/icons/48/skillbook.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Weapon skills',d.reg_skills,'spell',true):'';
  return `<div class="clsskillcols">
    ${clsSkillPanel('<img src="/studio/icons/icons/24/enchants.png" srcset="/studio/icons/icons/24/enchants.png 1x, /studio/icons/icons/48/enchants.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Active skills',d.class_skills,'spell',true)}
    ${clsSkillPanel('<img src="/studio/icons/icons/24/integrity.png" srcset="/studio/icons/icons/24/integrity.png 1x, /studio/icons/icons/48/integrity.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Passive skills',d.passives,'spell',true)}
    ${reg}
  </div>`;
}

function clsSlotAttr(kind,s){
  // en mode edition on cible le SLOT (colonne field_idx) pour le picker ; sinon on navigue vers la fiche
  return (S.edit && s.field_idx!=null)
    ? `data-slotkind="${kind}" data-slotidx="${s.field_idx}" data-slotid="${host().esc(''+(s.id||''))}"`
    : clsOpenAttr(kind,s.id);
}

function clsSkillCell(s,kind){
  const {esc}=host();
  const icon=clsIconTag(kind,s.icon,'clsskic')||`<span class="clsskic ph"><img src="/studio/icons/icons/24/generation_3d.png" srcset="/studio/icons/icons/24/generation_3d.png 1x, /studio/icons/icons/48/generation_3d.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>`;
  const lv=s.max_level?`<div class="clscelll">Lv.${s.max_level}</div>`:'';
  return `<button class="clscell${s.exists===false?' missing':''}${S.edit?' editing':''}" ${clsSlotAttr(kind,s)} title="${S.edit?'click to change this slot':''}">
    ${icon}<div class="clscellx"><div class="clscelln">${esc(s.name)}</div>${lv}</div>${S.edit?'<span class="clsslotpen"><img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>':''}</button>`;
}

function clsSkillPanel(title,arr,kind,oneCol){
  const body=(arr&&arr.length)?`<div class="clscellgrid${oneCol?' one':''}">${arr.map(s=>clsSkillCell(s,kind)).join('')}</div>`:`<div class="clsempty">none</div>`;
  return `<div class="clspanel"><div class="clspanelh">${title}${arr&&arr.length?` <span class="clsn">${arr.length}</span>`:''}</div><div class="clspanelb">${body}</div></div>`;
}

function clsCertCell(c,kind){
  const {esc}=host();
  const icon=clsIconTag(kind,c.icon,'clsskic')||`<span class="clsskic ph"><img src="/studio/icons/icons/24/action_journal.png" srcset="/studio/icons/icons/24/action_journal.png 1x, /studio/icons/icons/48/action_journal.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>`;
  const eff=(c.effects&&c.effects.length)?`<div class="clscelleff">${c.effects.map(esc).join(' · ')}</div>`:'';
  return `<button class="clscell wide${c.exists===false?' missing':''}${S.edit?' editing':''}" ${clsSlotAttr(kind,c)} title="${S.edit?'click to change this slot':''}">
    ${icon}<div class="clscellx"><div class="clscelln">${esc(c.name)}</div>${eff}</div>${S.edit?'<span class="clsslotpen"><img src="/studio/icons/icons/24/edit.png" srcset="/studio/icons/icons/24/edit.png 1x, /studio/icons/icons/48/edit.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span>':''}</button>`;
}

function clsCertPanel(title,arr,kind){
  const body=(arr&&arr.length)?`<div class="clscellgrid two">${arr.map(c=>clsCertCell(c,kind)).join('')}</div>`:`<div class="clsempty">none</div>`;
  return `<div class="clspanel"><div class="clspanelh">${title}${arr&&arr.length?` <span class="clsn">${arr.length}</span>`:''}</div><div class="clspanelb">${body}</div></div>`;
}

function clsTalentPanel(tree){
  const {esc,iconImg}=host();
  if(!tree||!tree.length)return '';
  const branches=tree.map(br=>{
    const nodes=br.slots.map(s=>{
      const icon=iconImg('spell',s.icon,'clstnic')||`<span class="clstnic ph">◆</span>`;
      const req=s.prereq_id?`<div class="clstnreq">req ${esc(s.prereq_name||('#'+s.prereq_id))} Lv${s.prereq_level}</div>`:'';
      const kp=(s.step&&s.unlock_kp)?`<div class="clstnreq" style="white-space:normal;color:#9a6a2b;font-weight:600">needs ${s.unlock_kp} KP in this tree</div>`:'';
      const tip=esc(s.name)+' — Max Lv.'+s.max_level+((s.step&&s.unlock_kp)?' — unlocks once '+s.unlock_kp+' KP are spent in the 3 rows of this class':'');
      const eff=(s.effects&&s.effects.length)?`<div class="clstneff">${s.effects.map(esc).join(' · ')}</div>`:'';
      return `<button class="clstnode" data-openenchant="${s.enchant_id}" title="${tip}">${icon}
        <div class="clstnx"><div class="clstnn">${esc(s.name)}</div><div class="clstnl">Max Lv.${s.max_level}</div>${req}${kp}${eff}</div></button>`;
    }).join('');
    return `<div class="clsbranch"><div class="clsbranchh">Row ${br.branch}</div><div class="clsbranchnodes">${nodes}</div></div>`;
  }).join('');
  return `<div class="clspanel"><div class="clspanelh"><img src="/studio/icons/icons/24/tree.png" srcset="/studio/icons/icons/24/tree.png 1x, /studio/icons/icons/48/tree.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Talent Tree</div><div class="clspanelb">${branches}</div></div>`;
}
