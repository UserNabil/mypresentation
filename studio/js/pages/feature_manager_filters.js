/* ============================================================================
   FEATURE MANAGER — etats d une ligne de la liste et filtres (pastilles).

   - Badges C/S : UN seul calcul pour les trois rendus (liste, detail,
     enrichissement), sinon les compteurs changent selon le chemin pris.
   - « Client missing » : fichiers, donnees, repack, ou feature absente de la
     d3d9.dll deployee dans le client configure (lue par son contenu).
   - Environnements (dev seulement / preprod / prod) : lus en LECTURE SEULE par
     /api/features/env-stages, apres le rendu de la liste.
   ============================================================================ */
import { H, fm } from './feature_manager_state.js';
import { fmBadge } from './feature_manager_views.js';
import { fmPollEnrich } from './feature_manager.js';
import { fmMarkPartHits } from './feature_manager_parts.js';

/* ⭐ UN SEUL CALCUL DES BADGES C/S. Le rendu initial de la liste avait sa propre formule, sans
   l'etat « partial » : une feature a qui il manquait des fichiers s'affichait ROUGE (Off) au
   premier rendu puis ORANGE apres l'enrichissement, et les compteurs ⚠ / Off changeaient selon
   le chemin pris. Les trois rendus (liste, detail, enrichissement) passent desormais par ici. */
export function fmClientState(f){
  const c=f.client; if(!c) return 'na';
  if(!f.has_client) return c.payload?(c.installed?'ok':(c.partial?'partial':'off')):'na';   // payload : les fichiers SONT l'installation
  if(!c.in_build) return 'na';
  if(c.needs_repack) return 'repack';
  if(c.installed) return fmDllGap(f)?'partial':(fmDllBehind(f)?'upd':'ok');
  return c.partial?'partial':'off';
}
export function fmServerState(f){
  const s=f.server; if(!s) return 'na';
  if(s.wip) return 'na';
  if(s.outdated) return 'upd';
  if((s.mp_port||s.mp_disk)&&s.installed!==false) return 'partial';
  if(s.mp_state&&s.mp_state!=='active'&&s.mp_state!=='not_installed'&&s.installed!==false) return 'partial';
  if(s.installed) return 'ok';
  if(s.installed==null) return 'unk';   // pas encore lu (1er rendu rapide, scan de fond en cours) : ni vert ni orange
  return s.some?'partial':'off';
}
export function fmBadgesHtml(f,cl,sv){
  const cw=fmClientGaps(f), bh=fmDllBehind(f); if(bh&&!cw.length) cw.push(bh);
  const dp=f.has_server&&f.server&&f.server.disk_prod;
  return ((f.has_client||(f.client&&f.client.payload))?fmBadge('C',cl,cw.join(' · ')):'')+(f.has_server?fmBadge('S',sv,fmServerWhy(f)):'')
    +(dp?`<span class="fm-dprod" title="${H.esc(dp)}">disk patch (prod)</span>`:'');
}
function fmAge(iso){
  const t=Date.parse(iso||''); if(!t) return '';
  const s=Math.max(0,(Date.now()-t)/1000);
  return s<90?'just now':s<5400?Math.round(s/60)+' min ago':s<172800?Math.round(s/3600)+' h ago':Math.round(s/86400)+' days ago';
}
/* D'ou vient le badge S : un VRAI scan du serveur (et quand), ou seulement la trace du dernier
   deploiement. Sans ca, rien ne distinguait un vert mesure d'un vert de memoire. */
function fmServerWhy(f){
  const s=f.server||{}, p=[];
  if(s.mp_port) p.push('Needs mempatch port: no in-memory manifest, Deploy refused on this environment');
  if(s.mp_disk) p.push(s.mp_disk);
  if(s.mp_state){ p.push(s.mp_label||s.mp_state); if(s.mp_note) p.push(s.mp_note); }
  if(s.outdated) p.push('server has v'+(s.deployed_version||'?')+', repo v'+(s.source_version||'?'));
  else if(s.deployed_version) p.push('v'+s.deployed_version);
  if(s.from_scan||s.verified_at) p.push('verified on the server '+(fmAge(s.verified_at)||'recently'));
  else if(s.applied_at) p.push('not re-verified yet — from the deploy record ('+(s.applied_by||'?')+', '+fmAge(String(s.applied_at).replace(' ','T').replace(/(\+\d\d)$/,'$1:00'))+')');
  return p.join(' · ');
}
/* La DLL du client configure, lue par son CONTENU (table g_features, cf. _dll_binary_info).
   null = on ne sait pas (pas de client, binaire illisible, table introuvable) : on n'accuse
   alors AUCUNE feature. {} = aucun d3d9.dll dans le client : rien de compile n'y tourne. */
function fmDllTable(){
  const d=(fm().list||{}).dll||{};
  if(!d.client_dir) return null;
  if(d.deployed===false) return {};
  const b=d.deployed_build;
  if(!b||!b.readable) return null;
  const t=b.features||{};
  return Object.keys(t).length?t:null;
}
/* La DLL du client porte-t-elle une version PLUS ANCIENNE de la feature que le repo ? La presence seule
   ne suffisait pas : une DLL de la semaine derniere laissait tous les C au vert. */
function fmVerKey(v){ return String(v||'').split('.').slice(0,3).map(x=>parseInt(x,10)||0).concat([0,0,0]).slice(0,3); }
function fmDllBehind(f){
  const c=f.client||{};
  if(!f.has_client||!c.compiled||!c.in_build||!(c.state>=1)||!f.version) return '';
  const t=fmDllTable(); const dv=t&&t[f.name];
  if(!dv||typeof dv!=='string') return '';
  const a=fmVerKey(f.version), b=fmVerKey(dv);
  for(let i=0;i<3;i++){ if(a[i]!==b[i]) return a[i]>b[i]?'your client DLL has v'+dv+', repo v'+f.version+' — rebuild / Copy DLL':''; }
  return '';
}
function fmDllGap(f){
  const c=f.client||{};
  if(!f.has_client||!c.compiled||!c.in_build||!(c.state>=1)) return '';
  const t=fmDllTable();
  if(!t||t[f.name]) return '';
  return Object.keys(t).length?'not in the version.dll deployed in your client (Copy DLL)':'no version.dll in your client';
}
/* « Client missing » = ce qui manque pour que le client configure ait VRAIMENT la feature. Une
   feature desactivee (eden_patch.ini) ou retiree du build n'est pas « manquante » : elle est Off
   ou N/A, et ses propres filtres la montrent deja. */
function fmClientGaps(f){
  const c=f.client; if(!c) return [];
  const g=[], nf=c.files_missing||0, nd=c.data_missing||0;
  if(!f.has_client){
    if(c.payload&&!c.installed) g.push(nf?nf+' runtime file'+(nf>1?'s':'')+' missing or outdated':'runtime files not installed');
    return g;
  }
  if(!c.in_build||!(c.state>=1)) return g;
  if(nf) g.push(nf+' file'+(nf>1?'s':'')+' missing');
  if(nd) g.push(nd+' data item'+(nd>1?'s':'')+' missing');
  if(!nf&&!nd&&c.partial&&!c.needs_repack) g.push('not fully installed (see the Client card)');
  if(c.needs_repack) g.push('staged but not in the .pkg yet (repack)');
  const dg=fmDllGap(f); if(dg) g.push(dg);
  return g;
}
/* ═══ CE QU'IL ME RESTE A TESTER, ET MA LISTE A MOI ═══
   « To test » compte les tests que PERSONNE n'a confirmes ; un testeur qui a deja tout passe sur une
   feature la voyait encore la, au milieu de 45 autres (demande d'un testeur, 2026-10-04). `by` vient
   du back-end (readiness_summary) : {testeur: nombre de tests qu'il a votes ou commentes}. Absent =
   on ne sait pas encore (liste rapide, base injoignable) : la feature n'est alors ni « a faire » ni
   « finie » pour moi, plutot que de le deviner.
   Masquer est PERSONNEL (config locale du tool, par compte) : ca ne change que MA liste. */
export function fmTouchedBy(rd){
  if(!rd||rd.source!=='env-db') return null;
  const by={};
  (rd.checklist||[]).forEach(x=>{
    const who=new Set([...(x.up||[]),...(x.down||[]),...(x.comments||[]).map(c=>c.author).filter(Boolean)]);
    if(x.done&&x.done_by) who.add(x.done_by);
    who.forEach(u=>{ by[u]=(by[u]||0)+1; });
  });
  return by;
}
function fmMineLeft(f){
  const rd=f.readiness||{}, me=(H.me()&&H.me().username)||'';
  if(!rd.defined||!rd.by||!me) return null;
  return Math.max(0,(rd.total||0)-(rd.by[me]||0));
}
export function fmMineHtml(f){
  const n=fmMineLeft(f);
  if(!n) return '<span class="fm-mine"></span>';
  return `<span class="fm-mine" title="${n} test${n>1?'s':''} you have not voted on or commented yet">${n} for you</span>`;
}
export function fmHiddenSet(){
  const h=fm()._hidden;
  return h instanceof Set?h:(fm()._hidden=new Set());
}
export function fmHideBtnHtml(name){
  const h=fmHiddenSet().has(name);
  return `<button class="fm-hidebtn" data-fmhide title="${h?'show this feature in your list again':'hide this feature from your list (only for you — the Hidden filter shows it again)'}">${h?'unhide':'hide'}</button>`;
}
export async function fmSetHidden(names, hide){
  names=(names||[]).filter(Boolean); if(!names.length) return false;
  let r;
  try{ r=await H.fmPost('/api/features/prefs/hidden',{names, hidden:!!hide}); }
  catch(e){ H.toast('could not save: '+H.errMessage(e),'error'); return false; }
  fm()._hidden=new Set(r.hidden||[]);
  fmPaintHidden();
  H.toast((hide?'Hidden from your list: ':'Back in your list: ')+(names.length===1?names[0]:names.length+' features'),'ok');
  return true;
}
function fmPaintHidden(){
  const hid=fmHiddenSet();
  document.querySelectorAll('.fm-side2 .fm-row').forEach(r=>{
    const h=hid.has(r.dataset.fmsel); r.classList.toggle('fm-hid',h);
    const b=r.querySelector('[data-fmhide]'); if(b) b.outerHTML=fmHideBtnHtml(r.dataset.fmsel);
  });
  if(fm()._filter==='hidden'&&!hid.size){
    fm()._filter='';
    document.querySelectorAll('#fm-fchips .fm-chip').forEach(o=>o.classList.toggle('on',!(o.dataset.fmfilter||'')));
  }
  fmWireHideBtns();
  fmUpdateCounts();
  fmApplyFilter();
}
export function fmWireHideBtns(){
  document.querySelectorAll('.fm-side2 [data-fmhide]').forEach(b=>b.onclick=(ev)=>{
    ev.stopPropagation();
    const nm=b.closest('.fm-row').dataset.fmsel;
    b.disabled=true;
    fmSetHidden([nm], !fmHiddenSet().has(nm)).finally(()=>{ if(b.isConnected) b.disabled=false; });
  });
  const fin=H.$('#fm-mine-hide'); if(fin) fin.onclick=()=>{
    const names=fmMineFinished(); if(!names.length) return;
    fin.disabled=true;
    fmSetHidden(names, true).finally(()=>{ fin.disabled=false; });
  };
}
function fmMineFinished(){
  const hid=fmHiddenSet();
  return [...document.querySelectorAll('.fm-side2 .fm-row')]
    .filter(r=>!hid.has(r.dataset.fmsel)&&(r.dataset.fmstate||'').split(' ').includes('mydone'))
    .map(r=>r.dataset.fmsel);
}
function fmPaintMineBar(st){
  const bar=H.$('#fm-minebar'); if(!bar) return;
  const n=st==='mytest'?fmMineFinished().length:0;
  bar.hidden=!n;
  const t=H.$('#fm-mine-txt'); if(t) t.textContent=n+' feature'+(n>1?'s':'')+' fully tested by you';
}
export function fmRowStates(f,cl,sv){
  const rd=f.readiness||{}, st=[];
  const gaps=fmClientGaps(f);
  const ml=fmMineLeft(f); if(ml>0)st.push('mytest'); else if(ml===0)st.push('mydone');
  if(cl==='partial'||sv==='partial')st.push('missing');
  if(cl==='off'||sv==='off')st.push('off');
  if((f.server&&f.server.outdated)||cl==='upd')st.push('update');
  if(rd.defined&&!rd.ready)st.push('totest');
  if(gaps.length)st.push('cmissing');
  if((cl==='ok'||!(f.has_client||(f.client&&f.client.payload)))&&(!f.has_server||sv==='ok')&&!(f.server&&f.server.outdated)&&!gaps.length)st.push('ok');
  const env=fmEnvStage(f.name); if(env)st.push('env-'+env);
  if(env==='prod'){
    const x=((fm()._envStages||{}).features||{})[f.name];
    if(x&&x.prod&&x.prod.newer_in_preprod)st.push('env-prodold');
    if(x&&x.prod&&x.prod.stable===false)st.push('env-produnstable');
  }
  return st;
}

/* ═══ OU EN EST CHAQUE FEATURE : dev seulement, preprod, prod ═══
   Source = les listes que le pipeline tient deja a jour dans feature_ee : preprod_features.json
   (commits « validate(preprod) » sur main) et prod_features.json (branche prod, ecrit par
   promote-prod). Lecture SEULE, par /api/features/env-stages (SA, comme la carte « Environment
   pipeline »), APRES le rendu de la liste : la page n'attend jamais GitHub. Aucune base n'est
   interrogee. Si l'une des deux listes est introuvable, les pastilles restent grisees : compter
   « Dev only » sans savoir ce qui est en prod serait faux. */
function fmEnvStage(name){
  const e=fm()._envStages; if(!e||!e.ok||!H.can('features.promote')) return '';
  const x=(e.features||{})[name];
  return x?x.stage:'dev';
}
const fmDay=v=>String(v||'').slice(0,10);
function fmEnvTag(name){
  const e=fm()._envStages; if(!e||!e.ok||!H.can('features.promote')) return null;
  const x=(e.features||{})[name]||{stage:'dev'}, p=x.preprod, q=x.prod||{};
  if(x.stage==='prod'){
    const tip=q.baseline?'In prod (baseline): live before the branch system, not validated since'
      :'In prod'+(q.version?': v'+q.version:'')+', validated'+(q.validated_by?' by '+q.validated_by:'')+(q.validated_at?' on '+fmDay(q.validated_at):'');
    const newer=q.newer_in_preprod?' · OUTDATED: preprod has newer code than prod — validate for prod again to ship it'
      :(q.baseline&&p?' · validated for preprod on '+fmDay(p.validated_at)+(p.current===false?' (code changed since)':''):'');
    const risky=q.stable===false;
    const why=risky?' · UNTESTED: this prod version went in without passing all its preprod tests'+(q.tests_status?' ('+q.tests_status+')':'')+' — roll back to a stable version or get its tests voted':'';
    return {cls:'prod'+(q.baseline?' base':'')+(q.newer_in_preprod?' stale':'')+(risky?' unstable':''),
            txt:(q.newer_in_preprod?'prod ↑':'prod')+(risky?' !':''), tip:tip+(q.rolled_back?' · rolled back':'')+newer+why};
  }
  if(x.stage==='preprod'){
    const cur=p&&p.current===false;
    const ver=p&&p.version?' v'+p.version:'';
    return {cls:'preprod'+(cur?' new':''), txt:cur?'preprod · hidden':'preprod'+ver,
            tip:'Validated for preprod by '+((p&&p.validated_by)||'?')+' on '+fmDay(p&&p.validated_at)
              +(ver?' (version'+ver+')':'')+', not in prod yet'
              +(cur?' · its code CHANGED since: the preprod list HIDES it until it is validated again (testers see it under "Updated, waiting for validation")':'')};
  }
  return {cls:'dev', txt:'dev', tip:'Dev only: not validated for preprod yet'};
}
export function fmEnvTagHtml(name){
  const t=fmEnvTag(name);
  return t?`<span class="fm-envt ${t.cls}" title="${H.esc(t.tip)}">${t.txt}</span>`:'<span class="fm-envt"></span>';
}
function fmEnvSourceText(e){
  const s=e.sources||{}, part=k=>{ const x=s[k]; if(!x) return k+': not found';
    return k+': '+x.from+' ('+x.ref+(x.as_of?', as of '+fmDay(x.as_of):'')+')'; };
  return part('preprod')+' · '+part('prod');
}
export function fmPaintEnvChips(){
  const box=H.$('#fm-envchips'); if(!box) return;
  const e=fm()._envStages, ok=!!(e&&e.ok), st=H.$('#fm-envst');
  box.querySelectorAll('[data-fmenv]').forEach(b=>{
    b.disabled=!ok;
    b.classList.toggle('on', ok&&fm()._envFilter===b.dataset.fmenv);
  });
  if(!st) return;
  if(!e){ st.textContent='loading…'; st.title=''; return; }
  if(!ok){ st.textContent='unavailable'; st.title=((e.errors||[]).join('\n')||'the preprod or prod feature list could not be read')+'\n'+fmEnvSourceText(e); return; }
  st.textContent=''; st.title='';
  box.title=fmEnvSourceText(e)+((e.errors||[]).length?'\n'+e.errors.join('\n'):'');
}
export async function fmLoadEnvWaiting(isCurrent){
  const list=document.querySelector('.fm-side2 .fm-list'); if(!list) return;
  let w; try{ w=await H.fmGet('/api/features/env-waiting'); }catch(_){ return; }
  if(!isCurrent()) return;
  list.querySelectorAll('.fm-waiting').forEach(o=>o.remove());
  const all=(w&&w.waiting)||[];
  const changed=all.filter(x=>x.reason!=='syncing');
  const syncing=all.filter(x=>x.reason==='syncing').concat((w&&w.syncing)||[]);
  const who=x=>x.name+': validated'+(x.version?' v'+x.version:'')+(x.validated_by?' by '+x.validated_by:'')
    +(x.validated_at?' on '+fmDay(x.validated_at):'');
  const add=(cls,html,tip)=>{ const b=document.createElement('div'); b.className='fm-waiting '+cls; b.title=tip; b.innerHTML=html; list.appendChild(b); return b; };
  if(syncing.length){
    add('sync','<span class="fmspin"></span> Validated, syncing (a few seconds): '+syncing.map(x=>'<b>'+H.esc(x.name)+'</b>').join(', ')+'.',
      syncing.map(who).join('\n')+'\nThe validation is on GitHub; this list follows as soon as the preprod branch is pulled.');
    clearTimeout(fmLoadEnvWaiting._t);
    fmLoadEnvWaiting._t=setTimeout(()=>{ if(isCurrent()) fmPollEnrich(); },6000);
  }
  if(!changed.length) return;
  const can=!!(w&&w.can_revalidate);
  const btn=n=>can?` <button class="fx-btn gold fm-reval" data-fmreval="${H.esc(n)}" title="Validate the current code of ${H.esc(n)} for preprod">Revalidate</button>`:'';
  const box=add('changed','Code changed since validation, hidden until revalidated: '
      +changed.map(x=>'<b>'+H.esc(x.name)+'</b>'+btn(x.name)).join(', ')
      +(can&&changed.length>1?` <button class="fx-btn gold fm-reval" data-fmreval="${H.esc(changed.map(x=>x.name).join(','))}">Revalidate all (${changed.length})</button>`:'')
      +(can?'':'. A super-admin validates them again for preprod.'),
    changed.map(x=>who(x)+', code changed since').join('\n'));
  box.querySelectorAll('[data-fmreval]').forEach(b=>{ b.onclick=()=>fmRevalidatePreprod(b.dataset.fmreval.split(','), b, isCurrent); });
}
export async function fmRevalidatePreprod(names, btn, isCurrent){
  if(!names||!names.length) return;
  if(btn){ btn.disabled=true; btn.textContent='Revalidating…'; }
  try{
    const r=await H.fmPost('/api/features/preprod/revalidate',{names});
    const s=r&&r.synced||{}, ok=Object.values(s).length&&Object.values(s).every(v=>v==='ok'||v==='ahead');
    H.toast('✔ '+names.join(', ')+' validated for preprod'+(ok?' — preprod branch updated, list refreshing':' — preprod follows within seconds'),'ok');
    fm()._envStages=null;
    fmPollEnrich();
    setTimeout(()=>{ if(!isCurrent||isCurrent()){ fmLoadEnvStages(isCurrent||(()=>true)); fmLoadEnvWaiting(isCurrent||(()=>true)); } },4000);
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent='Revalidate'; }
    H.toast('✖ '+(H.errMessage?H.errMessage(e):e.message),'err');
  }
}
export async function fmLoadEnvStages(isCurrent){
  if(!H.can('features.promote')||!H.$('#fm-envchips')) return;
  let e;
  try{ e=await H.fmGet('/api/features/env-stages'); }
  catch(err){ e={ok:false, errors:[H.errMessage?H.errMessage(err):String(err)], sources:{}, features:{}}; }
  if(!isCurrent()) return;
  fm()._envStages=e;
  if(!e.ok&&fm()._envFilter) fm()._envFilter='';
  const byName=new Map(((fm().list||{}).features||[]).map(f=>[f.name,f]));
  document.querySelectorAll('.fm-side2 .fm-row').forEach(r=>{
    const f=byName.get(r.dataset.fmsel); if(!f) return;
    r.dataset.fmstate=fmRowStates(f,fmClientState(f),fmServerState(f)).join(' ');
    const old=r.querySelector('.fm-envt'); if(old) old.outerHTML=fmEnvTagHtml(f.name);
  });
  fmUpdateCounts();
  fmPaintEnvChips();
  fmApplyFilter();
  fmPaintPreprodStale(e, isCurrent);
}
/* Dev : une feature validee pour preprod puis repoussee disparait de la liste preprod jusqu'a une nouvelle
   validation. On le dit ici, juste apres le push, avec le bouton qui la revalide. */
function fmPaintPreprodStale(e, isCurrent){
  const list=document.querySelector('.fm-side2 .fm-list'); if(!list) return;
  list.querySelectorAll('.fm-waiting.devstale').forEach(o=>o.remove());
  const env=String(((H.me&&H.me())||{}).active_env||'dev').toLowerCase();
  if(env!=='dev'||!e||!e.ok) return;
  const stale=Object.entries(e.features||{}).filter(([n,x])=>x&&x.preprod&&x.preprod.current===false&&!n.startsWith('_')).map(([n])=>n).sort();
  if(!stale.length) return;
  const b=document.createElement('div');
  b.className='fm-waiting changed devstale';
  b.title='Validated for preprod, then pushed again: the preprod list hides them until they are validated again.';
  b.innerHTML='Pushed after their preprod validation, hidden in preprod: '+stale.map(n=>'<b>'+H.esc(n)+'</b>').join(', ')
    +` <button class="fx-btn gold fm-reval" data-fmreval="${H.esc(stale.join(','))}">Revalidate for preprod${stale.length>1?' ('+stale.length+')':''}</button>`;
  list.appendChild(b);
  b.querySelector('[data-fmreval]').onclick=ev=>fmRevalidatePreprod(stale, ev.currentTarget, isCurrent);
}
export function fmUpdateCounts(){
  const hid=fmHiddenSet();
  const all=[...document.querySelectorAll('.fm-side2 .fm-row')];
  const rows=all.filter(r=>!hid.has(r.dataset.fmsel));
  document.querySelectorAll('#fm-fchips [data-fmcount], #fm-envchips [data-fmcount]').forEach(b=>{
    const k=b.dataset.fmcount;
    const n=k==='hidden'?all.length-rows.length:(k?rows.filter(r=>(r.dataset.fmstate||'').split(' ').includes(k)).length:rows.length);
    b.textContent=n?String(n):'';
    const chip=b.closest('.fm-chip');
    if(chip&&(k==='update'||k==='hidden'))chip.hidden=!n;
  });
}
// Recherche par NOM + filtre par ÉTAT (pastilles sous la barre) + filtre par ENVIRONNEMENT (seconde
// rangée, SA). On cherche le plus souvent « ce qui ne va pas » plutôt qu'un nom précis — d'où les
// filtres. Les trois se combinent (ET) : « Client missing » + « Prod » = ce qui est en prod et
// manque à mon client.
export function fmApplyFilter(){
  const inp=H.$('#fm-search'), combo=H.$('#fm-searchcombo'); if(!inp||!document.querySelector('.fm-list'))return;
  const q=(inp.value||'').trim().toLowerCase(); if(combo)combo.classList.toggle('has',!!inp.value);
  const st=fm()._filter||'';
  const ev=(fm()._envFilter&&fm()._envStages&&fm()._envStages.ok)?'env-'+fm()._envFilter:'';
  const hid=fmHiddenSet();
  let shown=0;
  document.querySelectorAll('.fm-row').forEach(r=>{
    const nm=(r.dataset.fmsel||'').toLowerCase();
    const states=(r.dataset.fmstate||'').split(' ');
    const isH=hid.has(r.dataset.fmsel);
    const pk=(r.dataset.fmparts||'');
    const hit=(st==='hidden'?isH:!isH) && (!q||nm.includes(q)||pk.includes(q)) && (!st||st==='hidden'||states.includes(st)) && (!ev||states.includes(ev));
    r.style.display=hit?'':'none'; if(hit)shown++;
    fmMarkPartHits(r, q); });
  const lst=document.querySelector('.fm-side2 .fm-list'); if(lst) lst.classList.toggle('fm-mineview',st==='mytest');
  fmPaintMineBar(st);
  let empty=document.querySelector('.fm-noresult');
  if(!shown){ if(!empty){ empty=document.createElement('div'); empty.className='fm-noresult esub'; empty.style.cssText='padding:12px;opacity:.6'; document.querySelector('.fm-list').appendChild(empty);}
    empty.textContent=q?('no feature matches “'+q+'”'+((st||ev)?' with this filter':'')):(st==='mytest'?'nothing left for you to test':'no feature in this filter'); }
  else if(empty){ empty.remove(); }
  const ns=H.$('#fm-nshown'); if(ns)ns.textContent=String(shown);
  fm()._search=inp.value;                                     // preserve query across re-renders
}

export function fmWireEnvChips(){
  document.querySelectorAll('#fm-envchips [data-fmenv]').forEach(b=>{
    b.onclick=()=>{ fm()._envFilter=(fm()._envFilter===b.dataset.fmenv)?'':b.dataset.fmenv;
      fmPaintEnvChips(); fmApplyFilter(); };
  });
}
