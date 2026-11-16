/* ============================================================================
   FEATURE MANAGER — le detail d une feature (carte client + carte serveur).

   ⛔ GARDE A NE JAMAIS RETIRER : `const main=target||H.$('#fm-main'); if(!main)return;`
   Le detail se rend en DEUX temps (scan client rapide, puis scan serveur SSH
   lent). Un rendu qui atterrit APRES que l utilisateur a quitte la page ne
   trouve plus #fm-main : sans cette garde il jetait. Elle a ete ajoutee apres
   incident — la conserver telle quelle.

   Pieges consignes ici :
   - `target` permet de rendre HORS ECRAN (fragment detache) pour n extraire
     qu UNE carte : c est le mecanisme de fmSwapCard, qui evite de reconstruire
     tests + preview + scroll a chaque action.
   - Les cartes portent des id STABLES (#fm-card-client, #fm-card-server,
     #fm-card-chlog) : c est ce qui rend le swap ciblable. Les renommer casse
     fmRefreshClientOnly / fmRefreshServerOnly sans aucune erreur console.
   - `unpackable` (le repack ne PEUT pas injecter le fichier) est exclu du
     compteur `nPend` : le compter gardait la feature en « repack required »
     pour l eternite, et cliquer Repack n y changeait rien.
   - Un fichier livre par deux features n est un CONFLIT que si les contenus
     divergent involontairement. `shared` / `coordinated` sont des situations
     SAINES : les afficher en rouge decourageait un deploiement legitime.
   ============================================================================ */
import { H, fm } from './feature_manager_state.js';
import { fmPreviewHtml, fmReadinessHtml, fmChip } from './feature_manager_views.js';
import { fmWireReadiness, fmWireDetailButtons, fmApplyRoleMode } from './feature_manager_actions.js';
import { fmWirePreview } from './feature_manager_ops.js';
import { fmProdCardHtml, fmWireProd } from './feature_manager_prod.js';
import { fmOpenLayoutPreview } from './feature_manager_layout.js';
import { fmPartsCardHtml, fmWireParts, fmPartsHitKey } from './feature_manager_parts.js';
import { fmBoEnvHtml } from './feature_manager_boenv.js';
import { fmMsgFbHtml } from './feature_manager_msgfb.js';
import { fmCrierHtml } from './feature_manager_crier.js';
import { fmVideoGuideHtml, fmWireVideo } from './feature_manager_video.js';

export const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||18}" height="${s||18}" alt="" aria-hidden="true">`;
const E=v=>H.esc(v==null?'':v);
const STATE_UI={
  ok:['Installed','status_success','ok'], partial:['Partial','status_warning','warn'], repack:['Repack needed','package_warning','warn'],
  off:['Off','status_error','bad'], na:['N/A','status_off','na'], unknown:['Unknown','status_info','na'], upd:['Update','package_updated','warn'],
  deployable:['Deployable','deploy','warn'], loading:['Scanning…','server_scan','na']
};
const chip=(letter,st,title)=>{ const u=STATE_UI[st]||STATE_UI.na;
  return `<span class="fx-chip fx-${u[2]}" title="${E(title||'')}"><b class="fx-chipl">${letter}</b>${u[0]}</span>`; };

function clientModel(d){
  const c=d.client; if(!c) return null;
  const nPend=(c.pkg_pending||[]).filter(p=>p.reason!=='unpackable'&&p.reason!=='older_copy').length;
  const nUnpack=(c.pkg_pending||[]).filter(p=>p.reason==='unpackable').length;
  const st=c.payload_only?(c.fully_installed?'ok':((c.payload&&c.payload.present_bytes)?'partial':'off'))
         :(!c.in_build?'na':(c.fully_installed?'ok'
         :(nPend&&c.files_missing===0&&c.data_missing===0&&c.state>=1?'repack'
         :(c.state>=1?'partial':'off'))));
  const man=Object.assign({layouts:[],icons:[],imagesets:[],data:[],labels:[],raw:[],embedded:[],restore:[]},c.manifest||{});
  const shadowAll=man.shadowing_loose||[];
  return {c,nPend,nUnpack,st,man,
    shadow:shadowAll.filter(a=>a.cdn_publishes!==true), shadowOk:shadowAll.filter(a=>a.cdn_publishes===true),
    conf:c.conflicts||[],
    hasStaged:!!(man.layouts.length||man.icons.length||man.imagesets.length||man.raw.length||man.data.length||man.labels.length),
    nothing:!(man.layouts.length||man.icons.length||man.imagesets.length||man.raw.length||man.data.length||man.labels.length||man.embedded.length)};
}

function serverModel(d, serverState){
  if(serverState==='loading') return {st:'loading'};
  const s=d.server; if(!s) return null;
  if(s.ssh_error) return {s,st:'unknown',items:[],miss:0,viaDeploy:0,corrupt:[]};
  const sd=s.data, ns=(s.native&&s.native.status)||{};
  const entry=s.native&&!s.native.no_entry?(s.native.scripts||[])[0]:null;
  const isWip=!!(s.native&&(ns.wip||/\bwip\b|squelette|skeleton|non applicable|not applicable/i.test(ns.note||ns.raw||'')));
  const nat=ns.scannable?(ns.patched_all==null?'unknown':(ns.patched_all?'ok':(ns.patched_some?'partial':'off'))):null;
  const items=(sd&&sd.applicable&&!sd.ssh_error)?(sd.items||[]):[];
  const miss=items.filter(x=>x.present===false&&!x.deploy_handled).length;
  const viaDeploy=items.filter(x=>x.present===false&&x.deploy_handled).length;
  const corrupt=(sd&&sd.corrupt)||[];
  const dataOk=!(sd&&sd.applicable&&sd.all_present===false);
  let st;
  if(nat===null&&!(sd&&sd.applicable)) st=isWip?'na':'deployable';
  else if(nat==='unknown') st='unknown';
  else st=((nat==='off')&&!dataOk)?'off':(((nat==='ok'||nat===null)&&dataOk)?'ok':'partial');
  if(corrupt.length) st='off';
  if(s.outdated) st='upd';
  return {s,sd,ns,entry,isWip,nat,items,miss,viaDeploy,corrupt,st};
}

function overall(cm, sm){
  const parts=[cm&&cm.st, sm&&sm.st].filter(x=>x&&x!=='na'&&x!=='loading');
  if(!parts.length) return 'na';
  if(parts.every(x=>x==='ok')) return 'ok';
  if(parts.every(x=>x==='off')) return 'off';
  return 'partial';
}

function alertsFor(d, cm, sm){
  const out=[], n=E(d.name);
  if(cm){
    const {c,nPend,man,shadow,conf}=cm;
    if(nPend) out.push({k:'repack',lvl:'warn',ic:'package_warning',
      t:`${nPend} staged file${nPend>1?'s':''} not yet packed`,
      x:'Client changes are copied to game_unpacked, but not visible in-game until you repack. One repack puts the waiting files of every feature into the game.',
      b:`<button class="mini gold" data-fmrepack="1" title="repacks every waiting file of every feature, in one go">${IC('repack')} Repack all pending</button>`});
    [...man.layouts,...man.imagesets].filter(a=>a.stale&&(a.missing_widgets||[]).length).forEach(a=>out.push({k:'mw:'+a.file,lvl:'error',ic:'status_error',
      t:`${a.file} is missing ${a.missing_widgets.length} element${a.missing_widgets.length>1?'s':''}`,
      x:'The file the game reads lacks elements of this feature: '+a.missing_widgets.slice(0,4).map(w=>w.split('/').pop()).join(', ')+(a.missing_widgets.length>4?'…':''),
      b:`<button class="mini" data-fmreinstall="${n}">${IC('install')} Install missing files</button>`}));
    const plainMissing=[...man.layouts,...man.icons,...man.imagesets,...man.raw].filter(a=>!a.installed&&!(a.stale&&(a.missing_widgets||[]).length)).length;
    if(plainMissing) out.push({k:'files',lvl:'error',ic:'missing',t:`${plainMissing} client file${plainMissing>1?'s':''} missing or outdated`,
      x:'Install copies the feature files into game_unpacked; repack afterwards on a packed client.',
      b:`<button class="mini" data-fmreinstall="${n}">${IC('install')} Install files</button>`});
    if(c.data_missing>0) out.push({k:'data',lvl:'error',ic:'database_record',t:`${c.data_missing} data record${c.data_missing>1?'s':''} missing`,
      x:'The c_/t_ records (and text labels) of this feature are not in game_unpacked/data/db.',
      b:`<button class="mini" data-fminstalldata="${n}">${IC('install_data')} Install data</button>`});
    if(shadow.length) out.push({k:'shadow',lvl:'error',ic:'loose_file',t:`${shadow.length} loose file${shadow.length>1?'s':''} shadow the pkg`,
      x:'The game reads these loose copies in game/ instead of your repacked pkg. Launch via game_.exe, never Launcher.exe.',
      b:`<button class="mini" data-fmcleanloose="${n}">${IC('clean_files')} Clean loose files</button>`});
    const behind=[...man.layouts,...man.imagesets].filter(a=>!a.stale&&a.unpacked_behind);
    if(behind.length) out.push({k:'behind',lvl:'info',ic:'status_info',t:'game_unpacked is behind what the game reads',
      x:behind.map(a=>a.file).join(', ')+' — reinstall before any repack, or the repack would put the old version back.',
      b:`<button class="mini" data-fmreinstall="${n}">${IC('reinstall')} Reinstall</button>`});
    const confl=conf.filter(x=>x.kind==='conflict');
    if(confl.length) out.push({k:'conf',lvl:'error',ic:'status_error',t:`${confl.length} file conflict${confl.length>1?'s':''} with another feature`,
      x:confl.map(x=>x.rel+' (also in '+(x.others||[]).join(', ')+')'+((x.details||[]).length?': '+x.details.join('; '):'')).join(' · ')+'. Open the preview to see what clashes.',
      b:`<button class="mini" data-fxlayout="${E(confl[0].rel)}">${IC('screenshot')} Open layout preview</button>`});
    if(!c.in_build&&!c.payload_only) out.push({k:'build',lvl:'info',ic:'dll',t:'Not in the DLL build',
      x:'The feature is commented out in registry.c: rebuild the DLL to include it.'});
  }
  if(sm&&sm.s){
    const {s,entry}=sm, miss=sm.miss||0, corrupt=sm.corrupt||[], viaDeploy=sm.viaDeploy||0, sd=sm.sd||null;
    if(s.ssh_error) out.push({k:'ssh',lvl:'info',ic:'server',t:'Server unreachable',x:'SSH: '+s.ssh_error});
    if(s.outdated) out.push({k:'upd',lvl:'warn',ic:'package_updated',t:`New server version to deploy: v${s.deployed_version||'?'} → v${s.source_version||'?'}`,
      x:'The last deploy recorded on this environment is older than the repo.',
      b:entry?`<button class="mini gold" data-fmnative="${n}" data-fmscript="${E(entry)}">${IC('deploy')} Deploy</button>`:''});
    if(corrupt.length) out.push({k:'corrupt',lvl:'error',ic:'status_error',t:`${corrupt.join(', ')} is malformed`,
      x:'The field count does not divide evenly: the ZoneServer will refuse the whole file at boot. Restore it before deploying anything else.'});
    if(sd&&(sd.conflicts||[]).length) out.push({k:'sclash',lvl:'error',ic:'status_error',t:`${sd.conflicts.join(', ')}: other values on the server`,
      x:'The server file already has a row with this key and different values. Install never overwrites it: fix or remove that row by hand first.'});
    if(miss) out.push({k:'smiss',lvl:'warn',ic:'database_record',t:`${miss} server record${miss>1?'s':''} missing`,
      x:'Install injects the S_ records and the Data/db rows (server/rows/) this feature ships, byte-exact.',
      b:`<button class="mini" data-fmsrvdata="${n}">${IC('install_data')} Install S_ items</button>`});
    if(viaDeploy&&sm.nat!=='ok') out.push({k:'viadeploy',lvl:'info',ic:'deploy',t:`${viaDeploy} record${viaDeploy>1?'s':''} created by the server Deploy`,
      x:'They appear once deploy.py has run on this environment.'});
  }
  const dis=(fm()._dismiss||{})[d.name]||{};
  return out.filter(a=>!dis[a.k]);
}

function alertsHtml(d, alerts){
  if(!alerts.length) return '';
  const one=a=>`<div class="fx-alert fx-${a.lvl}" data-fxalert="${E(a.k)}">${IC(a.ic,22)}
      <div class="fx-alert-t"><b>${E(a.t)}</b><span>${E(a.x||'')}</span></div>
      ${a.b||''}<button class="fx-x" data-fxdismiss="${E(a.k)}" title="hide until the next visit">${IC('close',14)}</button></div>`;
  const first=alerts.slice(0,2).map(one).join(''), rest=alerts.slice(2);
  return first+(rest.length?`<details class="fx-more"${fm()._moreAlerts?' open':''}><summary>${IC('chevron_right',14)} + ${rest.length} more issue${rest.length>1?'s':''}</summary>${rest.map(one).join('')}</details>`:'');
}

function heroHtml(d, cm, sm, pvList){
  const c=d.client, s=d.server, n=E(d.name);
  const cliVer=d.version||null, srvVer=(s&&s.components&&s.components.length)?(s.components[0].version||null):null;
  const vers=(cliVer&&srvVer&&cliVer!==srvVer)
    ?`<span class="fx-ver">${IC('client',14)} v${E(cliVer)}</span><span class="fx-ver">${IC('server',14)} v${E(srvVer)}</span>`
    :((cliVer||srvVer)?`<span class="fx-ver" title="version of this feature in the code of the active environment (${E(((fm().list||{}).env_name||(fm().list||{}).env)||'repo')} branch), not necessarily the newest one">${E(((fm().list||{}).env_name||(fm().list||{}).env)||'repo')} v${E(cliVer||srvVer)}</span>`:'');
  const ov=overall(cm, sm), u=STATE_UI[ov];
  const rd=d.readiness||{}, tot=rd.total||0, done=rd.done||0;
  const bar=rd.defined?`<div class="fx-tprog" title="tests confirmed on ${E(((fm().list||{}).env_name||(fm().list||{}).env)||'this environment')}"><span>${done}/${tot} tests confirmed</span><i><b style="width:${tot?Math.round(done/tot*100):0}%"></b></i></div>`:'';
  let primary='';
  if(cm&&cm.nPend) primary=`<button class="fx-btn gold" data-fmrepack="1" title="repacks every waiting file of every feature, in one go">${IC('repack',20)} Repack all pending</button>`;
  else if(cm&&cm.c.files_missing>0) primary=`<button class="fx-btn gold" data-fmreinstall="${n}">${IC('install',20)} Install files</button>`;
  else if(cm&&cm.c.data_missing>0) primary=`<button class="fx-btn gold" data-fminstalldata="${n}">${IC('install_data',20)} Install data</button>`;
  else if(sm&&sm.s&&sm.s.outdated&&sm.entry) primary=`<button class="fx-btn gold" data-fmnative="${n}" data-fmscript="${E(sm.entry)}">${IC('deploy',20)} Deploy server</button>`;
  const more=[];
  if(c&&!c.payload_only&&c.in_build) more.push(c.state>=1?`<button data-fmoff="${n}">${IC('status_off')} Disable in client</button>`:`<button data-fmon="${n}">${IC('status_success')} Enable in client</button>`);
  if(c) more.push(`<button data-fmreverify="${n}">${IC('reverify')} Re-verify client</button>`);
  if(d.has_server) more.push(`<button data-fmreverify="${n}" data-fmscope="server">${IC('server_scan')} Re-verify server</button>`);
  if(d.has_server) more.push(`<button data-fmsrvscript="${n}">${IC('copy')} Copy install script</button>`);
  if(cm&&(cm.man.data.length)||(sm&&sm.items&&sm.items.length)) more.push(`<button data-fmrecords="${n}">${IC('database_record')} Preview records</button>`);
  if(cm&&cm.hasStaged) more.push(`<button data-fmpubassets="1" data-minrole="GM">${IC('deploy')} ${c&&c.rfg_client?'Hand-off zip (RFG)':'Deploy assets to CDN'}</button>`);
  more.push(`<button data-fxtab="overview" data-fxfocus="fmprev-in">${IC('link')} Edit preview links</button>`);
  return `<div class="fx-hero">
    <img class="fx-hero-ico" src="/studio/icons/features/${n}.png" alt="" onerror="this.onerror=null;this.src='/studio/icons/icons/48/feature.png'">
    <div class="fx-hero-main">
      <div class="fx-hero-top"><h1>${n}</h1>${vers}</div>
      ${c&&c.description?`<p class="fx-desc" title="${E(c.description)}">${E(c.description)}</p>`:''}
      <div class="fx-hero-st"><span class="fx-big fx-${u[2]}">${IC(u[1],20)} ${u[0]}</span>
        ${cm?chip('C',cm.st,'client'):''}${sm?chip('S',sm.st,'server — '+(((fm().list||{}).env_name||(fm().list||{}).env)||'')):''}${bar}</div>
    </div>
    <div class="fx-hero-act">${primary}
      ${pvList.length?`<button class="fx-btn" data-fxpreview="1">${IC('open_external',18)} Open preview</button>`:''}
      <div class="fx-menu"><button class="fx-btn" data-fxmenu="1">${IC('more_horizontal',18)} More ${IC('chevron_down',14)}</button>
        <div class="fx-menu-pop" hidden>${more.join('')}</div></div>
    </div></div>`;
}

function tabsHtml(d, cm, sm){
  const rd=d.readiness||{}, left=Math.max(0,(rd.total||0)-(rd.done||0));
  const warn=st=>st&&!['ok','na','loading','deployable'].includes(st);
  const tabs=[['overview','overview','Overview','']];
  if(cm) tabs.push(['client','client','Client',warn(cm.st)?IC('status_warning',16):'']);
  if(d.has_server) tabs.push(['server','server','Server',sm&&warn(sm.st)?IC('status_warning',16):'']);
  tabs.push(['tests','tests','Tests',left&&rd.defined?`<span class="fx-count">${left}</span>`:'']);
  if(d.changelog) tabs.push(['changelog','changelog','Changelog','']);
  if(d.video) tabs.push(['video','video','Video guide','']);
  const cur=fmTab(d, tabs.map(t=>t[0]));
  return `<nav class="fx-tabs" role="tablist">${tabs.map(([k,ic,l,b])=>`<button role="tab" class="fx-tab${k===cur?' on':''}" data-fxtab="${k}">${IC(ic,18)} ${l} ${b}</button>`).join('')}</nav>`;
}
function fmTab(d, avail){
  let t=fm()._tab||'overview';
  if(!avail.includes(t)) t='overview';
  return t;
}

const TYPE_IC={layout:'layout',icon:'image',imageset:'imageset',asset:'texture',data:'database_record',label:'data',embedded:'dll'};
const READ={dll:'DLL',pkg:'pkg',unpacked:'game_unpacked'};
function fileRow(a,type,name){
  const st=a.installed?['OK','status_success','ok']:(a.stale?['Partial','status_partial','warn']:['Missing','status_error','bad']);
  const read=a.seen_in?READ[a.seen_in]||a.seen_in:(type==='data'||type==='label'?'data/db':(a.installed?'game_unpacked':'—'));
  const mw=(a.missing_widgets||[]);
  const det=[a.rel&&['path',a.rel],a.src&&['source',a.src],a.dst&&['installed at',a.dst],a.id&&['record id',a.id],a.old!=null&&['label',`'${a.old}' → '${a.new}'`]].filter(Boolean);
  return `<div class="fx-frow"><span class="fx-fname">${IC(TYPE_IC[type]||'file',18)}<code>${E(name)}</code>${type==='layout'&&a.rel?`<button class="fx-lpbtn" data-fxlayout="${E(a.rel)}" title="preview the layout the tool would install: every feature's section, checked">${IC('screenshot',14)} Preview</button>`:''}</span>
      <span class="fx-ftype">${type}</span><span class="fx-fread">${E(read)}${a.installed&&a.seen_in==='dll'?' <span class="fx-dim">(imposed)</span>':''}</span>
      <span class="fx-fst fx-${st[2]}"><i></i>${st[0]}</span></div>
    ${mw.length?`<div class="fx-fsub fx-bad">${IC('missing',16)} Missing elements: ${mw.slice(0,12).map(w=>`<code>${E(w.split('/').pop())}</code>`).join(' ')}${mw.length>12?' …':''}</div>`:''}
    ${(a.changed_props||[]).length?`<div class="fx-fsub fx-warn">${IC('status_info',16)} Out-of-date properties in the file the game reads: ${a.changed_props.slice(0,6).map(p=>`<code>${E(p.split('/').pop())}</code>`).join(' ')}${a.changed_props.length>6?' …':''} — install, then repack</div>`:''}
    ${a.unpacked_behind&&!a.stale?`<div class="fx-fsub fx-warn">${IC('status_info',16)} game_unpacked holds an older copy — reinstall before repacking</div>`:''}
    ${det.length?`<details class="fx-fdet"><summary>${IC('file_details',16)} Show file details</summary>${det.map(([k,v])=>`<div><span>${k}</span><code>${E(v)}</code></div>`).join('')}</details>`:''}`;
}
function fileGroup(key,title,arr,type,note,nameOf){
  if(!arr.length) return '';
  const ok=arr.filter(a=>a.installed).length, miss=arr.length-ok;
  const open=(fm()._grpOpen||{})[key]; const isOpen=open==null?!!miss:open;
  return `<details class="fx-grp" data-fxgrp="${key}"${isOpen?' open':''}><summary>
      <span class="fx-chev">${IC('chevron_right',14)}</span>${IC(miss?'folder_open':'folder',22)}
      <span class="fx-grp-t"><b>${title}</b> ${key==='pend'?'':`<span class="fx-dim">(${ok}/${arr.length})</span>`}<small>${note}</small></span>
      ${key==='pend'?`<span class="fx-fst fx-warn">${IC('package_warning',16)} ${arr.length} to pack</span>`:miss?`<span class="fx-fst fx-bad">${IC('status_error',16)} ${miss} missing</span>`:`<span class="fx-fst fx-ok">${IC('status_success',16)} ${ok}/${arr.length} OK</span>`}
    </summary>${arr.map(a=>fileRow(a,type,nameOf?nameOf(a):(a.file||a.rel))).join('')}</details>`;
}

function clientCardHtml(d, cm){
  if(!cm) return '';
  const {c,man,nPend,nUnpack,shadow,shadowOk,conf,nothing}=cm, n=E(d.name);
  const nFiles=man.layouts.length+man.icons.length+man.imagesets.length+man.raw.length;
  const nData=man.data.length+man.labels.length+man.restore.length;
  const tools=[];
  if(nData) tools.push(`<button class="mini${c.data_missing>0?' gold':''}" data-fminstalldata="${n}" title="inject the data records (c_/t_) and text labels into game_unpacked/data/db byte-exact">${IC('install_data')} ${c.data_missing>0?'Install '+c.data_missing+' data':'Install data'}</button>`);
  if(nFiles) tools.push(`<button class="mini${c.files_missing>0?' gold':''}" data-fmreinstall="${n}" title="copy the feature files into game_unpacked (installs missing, refreshes present)">${IC('reinstall')} ${c.files_missing>0?'Install '+c.files_missing+' missing':'Reinstall'}</button>`);
  if(shadow.length) tools.push(`<button class="mini" data-fmcleanloose="${n}" title="delete the loose files shadowing the pkg (backup .bak_shadow kept)">${IC('clean_files')} Clean loose files</button>`);
  if(cm.hasStaged) tools.push(`<button class="mini${nPend?' gold':''}" data-fmrepack="1" title="repack game_unpacked → pkg: every waiting file of every feature, not only this one">${IC('repack')} Repack all${nPend?' ('+nPend+' here)':''}</button>`);
  const shared=conf.filter(x=>x.kind==='shared'), merged=conf.filter(x=>x.kind==='merged');
  const chips=(shared.length?fmChip('info', shared.length+' shared', [shared.length+' file(s) with the SAME content in every feature that ships them — safe.','',...shared.map(x=>'≡ '+x.rel+'   also in: '+(x.others||[]).join(', '))]):'')
    +(merged.length?fmChip('info', merged.length+' merged', [merged.length+' layout(s) also edited by another feature. Installing writes ONE merged file carrying the changes of every feature — no conflict.','',...merged.map(x=>'⇄ '+x.rel+'   merged with: '+(x.others||[]).join(', '))]):'');
  const dataArr=man.data.map(a=>({installed:a.installed,file:a.file,id:a.id}));
  const pend=(c.pkg_pending||[]).filter(p=>p.reason!=='unpackable'&&p.reason!=='older_copy').map(p=>({installed:false,stale:true,file:p.rel,rel:p.rel,seen_in:'unpacked'}));
  const emb=man.embedded.map(a=>({installed:true,file:a.file,seen_in:a.served_via||'dll'}));
  const labels=man.labels.map(a=>Object.assign({},a,{installed:a.installed,stale:!a.installed&&!a.applicable}));
  const table=nothing&&!c.payload_only
    ?`<div class="fx-empty">${IC('empty_folder',32)}<div><b>No files to install</b><span>This DLL feature patches the game at runtime.</span></div></div>`
    :`<div class="fx-table"><div class="fx-thead"><span>File</span><span>Type</span><span>Read from</span><span>Status</span></div>
      ${fileGroup('pend','Waiting for repack',pend,'asset',c.rfg_client?'staged in game_unpacked, not in the rfg archives yet':'staged in game_unpacked, not in the .pkg yet')}
      ${fileGroup('layouts','Layouts',man.layouts,'layout','UIData/layouts')}
      ${fileGroup('imagesets','Imagesets',man.imagesets,'imageset','UIData/imagesets')}
      ${fileGroup('icons','Icons',man.icons,'icon','UI/itemicon')}
      ${fileGroup('raw','Game assets',man.raw.map(a=>({installed:a.installed,stale:a.stale,file:a.rel,rel:a.rel})),'asset','models, textures, animations')}
      ${fileGroup('data','Data records',dataArr,'data','data/db (c_ / t_)',a=>a.file+(a.id?' #'+a.id:''))}
      ${fileGroup('restore','Native rows to restore',man.restore.map(a=>({installed:false,stale:true,file:a.file,id:a.id})),'data','overwritten by an older install, put back by Install data',a=>a.file+' #'+a.id)}
      ${fileGroup('labels','Text labels',labels,'label','T_TextIndex, same-length edits')}
      ${fileGroup('emb','Embedded in the DLL',emb,'embedded','served by the DLL, nothing to install')}
      ${fileGroup('shadow','Loose files shadowing the pkg',shadow.map(a=>({installed:false,file:a.rel,rel:a.rel,seen_in:'loose'})),'asset','game/ — delete them')}
    </div>`;
  const notes=[
    (c.pkg_pending||[]).some(p=>p.reason==='unverified')?'This game uses RFG archives (client 8.x) and the RFG key is missing on this PC: the tool cannot read what the game holds, so the staged files count as waiting. Paste the key in Packaging > Repack (RFG key).':'',
    (c.pkg_pending||[]).some(p=>p.reason==='older_copy')?`game_unpacked holds an older copy than the game of: ${(c.pkg_pending||[]).filter(p=>p.reason==='older_copy').slice(0,4).map(p=>p.rel).join(', ')} (never edited since the depack, the game's pkg changed since). Repack leaves it out on purpose; Reset client rebuilds game_unpacked.`:'',
    nUnpack?`${nUnpack} file(s) cannot be packed (unknown extension or folder for this .pkg): ${(c.pkg_pending||[]).filter(p=>p.reason==='unpackable').slice(0,4).map(p=>p.rel).join(', ')}`:'',
    shadowOk.length?`${shadowOk.length} file(s) also sit loose in game/ — expected, the hosting publishes that folder.`:''
  ].filter(Boolean).map(t=>`<div class="fx-note">${IC('status_info',16)} ${E(t)}</div>`).join('');
  const bp=c.binpatch, pl=c.payload;
  const mb=v=>(v>=1073741824?(v/1073741824).toFixed(2)+' GB':Math.round((v||0)/1048576)+' MB');
  const bin=bp&&bp.has_patcher?`<div class="fx-sub"><div class="fx-sub-h">${IC('binary',20)} <b>Client binary patch</b> <code>game_.exe</code>
      <span class="fx-fst fx-${bp.applied?'ok':'bad'}"><i></i>${bp.error?E(bp.error):(bp.applied?'patched':'not patched')}</span></div>
      <p class="fx-dim">Backup + idempotent. Close the game first; the Launcher re-downloads game_.exe, re-apply after.</p>
      <div class="fx-toolbar">${bp.applied?`<button class="mini" data-fmbinpatch="${n}" data-fmact="revert">Revert</button>`:`<button class="mini gold" data-fmbinpatch="${n}" data-fmact="deploy">${IC('native_patch')} Patch game_.exe</button>`}</div></div>`:'';
  const pay=pl&&pl.has_payload?`<div class="fx-sub" data-fmplcard="${n}"><div class="fx-sub-h">${IC('package',20)} <b>Runtime payload</b> <code>${E(pl.version||'')} · ${pl.files||0} files · ${mb(pl.total_bytes)}</code>
      <span class="fx-fst fx-${pl.applied?'ok':(pl.present_bytes?'warn':'bad')}"><i></i>${pl.error?'error':(pl.applied?'installed':((pl.missing||0)+' missing'))}</span></div>
      ${pl.error?`<p class="fx-bad">${E(pl.error)}</p>`:`<p class="fx-dim">${pl.applied?'Installed in '+E(pl.client_dir||'the client'):mb(pl.present_bytes)+' of '+mb(pl.total_bytes)+' present'}${pl.outdated?' · installed '+E(pl.installed_version||'?')+', feature ships '+E(pl.version||'?'):''} · source: ${pl.local_source?'local folder':'tool CDN'} · sha256 verified.</p>
      <div class="pkgprog" id="fm-pl-prog" style="display:none;margin:6px 0"><div class="pkgbar"><i></i></div><span class="pkgpct"></span></div>
      <div class="esub" id="fm-pl-log" style="display:none;opacity:.7;font-size:11.5px;white-space:pre-wrap;max-height:96px;overflow:auto;margin:2px 0"></div>
      <div class="fx-toolbar">${pl.applied&&!pl.outdated?'':`<button class="mini gold" data-fmpayload="${n}" data-fmact="install">${IC('install')} ${pl.applied?'Update to '+E(pl.version||''):'Install runtime ('+mb(pl.total_bytes-(pl.present_bytes||0))+')'}</button>`}
        <button class="mini" data-fmplverify="${n}">Verify bytes</button>
        ${(pl.present_bytes||pl.applied)?`<button class="mini" data-fmpayload="${n}" data-fmact="revert">Remove</button>`:''}</div>`}</div>`:'';
  return `<section class="fx-card"><div class="fx-card-h">${IC('folder',26)}<div class="fx-card-t"><h2>Client files</h2>
      <p>${c.payload_only?'This feature installs a runtime into the client: the files are the install.':`Copied into game_unpacked${c.packed_client?', then packed into the client':''}. The game reads the DLL first, then the pkg, then loose files.`}</p></div>
      <div class="fx-toolbar">${tools.join('')}</div></div>
    ${chips?`<div class="fx-chips">${chips}</div>`:''}<div id="fm-doctor"></div>${table}${notes}${bin}${pay}</section>`;
}

export function fmServerLoadingHtml(env){
  return `<section class="fx-card"><div class="fx-card-h">${IC('server_scan',26)}<div class="fx-card-t"><h2>Server — ${E(env||'')}</h2><p>Scanning the server over SSH…</p></div></div>
    <div class="fx-skel">${[1,2,3].map(()=>'<div><i></i><i></i><i></i></div>').join('')}</div></section>`;
}

function fmMpCls(t){
  if(!t.mstate) return t.patched?'ok':'bad';
  if(t.mstate==='Active'||t.mstate.indexOf('Active (')===0) return 'ok';
  return /pending|Disabled/.test(t.mstate)?'warn':'bad';
}

function fmKillBtn(n, ns){
  const mp=ns&&ns.mempatch;
  if(!mp||!mp.installed||mp.error) return '';
  const off=!!mp.disabled, shipped=mp.off_by==='manifest';
  return `<button class="mini${off?' gold':''}" data-fmmpkill="${n}" data-fmmpoff="${off?'0':'1'}" data-fmmpshipped="${shipped?'1':'0'}" title="${off?(shipped?'Its delivered manifest ships enabled: false. Enable turns it on for these exact bytes: applied at the next start of its servers':'Turn this feature back on: applied again at the next start of its servers'):'Kill switch: its servers skip this feature from their next start. No binary is touched and the manifest stays installed.'}">${off?'Enable':'Disable (kill switch)'}</button>`;
}

function serverCardHtml(d, sm){
  const env=((fm().list||{}).env_name||(fm().list||{}).env)||'';
  if(!sm) return '';
  if(sm.st==='loading') return fmServerLoadingHtml(env);
  const {s,sd,ns,entry,isWip,items,miss,viaDeploy,corrupt}=sm, n=E(d.name);
  if(s.ssh_error) return `<section class="fx-card"><div class="fx-card-h">${IC('server',26)}<div class="fx-card-t"><h2>Server — ${E(env)}</h2><p class="fx-bad">SSH: ${E(s.ssh_error)}</p></div>
      <div class="fx-toolbar"><button class="mini" data-fmreverify="${n}" data-fmscope="server">${IC('reverify')} Re-verify</button></div></div></section>`;
  const tools=[];
  if(entry&&!isWip&&ns.mp_port) tools.push(`<button class="mini" disabled title="${E(ns.mp_port)}">${IC('deploy')} Needs mempatch port</button>`);
  else if(entry&&!isWip) tools.push(`<button class="mini gold" data-fmnative="${n}" data-fmscript="${E(entry)}">${IC('deploy')} Deploy</button>`);
  if(s.native&&s.native.imported&&H.can('features.promote')) tools.push(`<button class="mini" data-fmimprun="dryrun" data-fmimpname="${n}" title="run the dry-run command of this imported feature on the server, nothing is installed">Dry run</button><button class="mini" data-fmimprun="status" data-fmimpname="${n}" title="run the test command of this imported feature on the server">Test</button>`);
  if(sd&&sd.applicable&&!sd.ssh_error) tools.push(`<button class="mini${miss?' gold':''}" data-fmsrvdata="${n}"${miss?'':' disabled'}>${IC('install_data')} ${miss?'Install '+miss+' S_ item(s)':'S_ items up to date'}</button>`);
  tools.push(`<button class="mini" data-fmsrvrestart="1">${IC('restart')} Restart</button>`);
  tools.push(`<button class="mini" data-fmreverify="${n}" data-fmscope="server">${IC('reverify')} Re-verify</button>`);
  let patch='';
  if(s.native){
    if(s.native.no_entry){
      patch=fileGroupRaw('patch','Server patch',`<div class="fx-note">${IC('status_warning',16)} ${E(s.native.no_entry_reason||'no deployable entry point')} — scripts: ${(s.native.components||[]).map(E).join(', ')||'—'}
        <button class="mini gold" data-fmgitpull="1">${IC('restart')} Pull latest features</button></div>`,'warn','no deploy entry');
    }else if(isWip){
      patch=fileGroupRaw('patch','Server patch',`<div class="fx-note">${IC('status_info',16)} Server side not implemented yet — ${E(ns.note||ns.raw||'work in progress')}</div>`,'na','WIP');
    }else if(ns.mempatch&&ns.mempatch.installed===false&&!ns.mempatch.error&&!ns.patched_all){
      patch=fileGroupRaw('patch','Server patch',`<div class="fx-note">${IC('status_info',16)} ${E(ns.note||'not installed on this environment')}</div>`,'bad','not installed');
    }else if(ns.mempatch&&ns.mempatch.installed&&!ns.scannable&&!ns.mempatch.error){
      const mpTools=(entry?`<button class="mini" data-fmnativerevert="${n}" data-fmscript="${E(entry)}">Revert</button>`:'')+fmKillBtn(n,ns);
      patch=fileGroupRaw('patch','Server patch',`<div class="fx-note">${IC('status_info',16)} ${E(ns.note||'installed — applied at the next server start')}</div>`+(mpTools?`<div class="fx-toolbar fx-inrow">${mpTools}</div>`:''),'warn',ns.mempatch.disabled?(ns.mempatch.off_by==='manifest'?'off (delivered manifest)':'disabled (kill switch)'):'restart pending');
    }else{
      const tg=(ns.targets||[]).filter(t=>!t.unknown);
      const mem=tg.some(t=>t.memory);
      const mpst=ns.mp_state||'';
      const svc=!!ns.state_line&&!tg.length&&!mem&&!mpst;
      const svcRows=svc?((ns.detail&&ns.detail.length?ns.detail:[ns.note||'']).map(l=>`<div class="fx-note">${IC(/^warning|not |missing|refused|restarting|failed|error/i.test(l)?'status_warning':'status_info',16)} ${E(l)}</div>`).join('')):'';
      const rows=svc?svcRows:((mem||mpst)?`<div class="fx-note">${IC('dll',16)} ${E(ns.note||'patched in memory by eden_launcher')}</div>`:'')+(ns.scannable?tg.map(t=>`<div class="fx-frow"><span class="fx-fname">${IC('binary',18)}<code>${E(t.binary)}</code></span><span class="fx-ftype">${t.memory?'process':'binary'}</span><span class="fx-fread">${t.memory?'memory (eden_launcher)':E(entry||'')}</span><span class="fx-fst fx-${fmMpCls(t)}" title="${E(t.mdetail||'')}"><i></i>${t.mstate?E(t.mstate):(t.patched?(t.memory?'Active':'Patched'):(t.memory?'Inactive':'Not patched'))}</span></div>`).join('')
        :`<div class="fx-note">${IC('status_info',16)} ${E(ns.note||ns.error||'status unknown — re-verify')}</div>`);
      const nOk=tg.filter(t=>t.patched).length;
      const rowTools=(entry?`<button class="mini" data-fmnativerevert="${n}" data-fmscript="${E(entry)}">Revert</button>`:'')+(mem?fmKillBtn(n,ns):'');
      patch=fileGroupRaw('patch','Server patch',rows+(rowTools?`<div class="fx-toolbar fx-inrow">${rowTools}</div>`:''),
        mpst?(mpst==='active'?'ok':(mpst==='not_installed'?(ns.patched_all?'ok':'bad'):'warn'))
          :(ns.scannable?(ns.kill_switch?'warn':(ns.patched_all?'ok':(ns.patched_some?'warn':'bad'))):'na'),
        mpst&&ns.mp_label?(ns.mp_label+(tg.length?` (${nOk}/${tg.length})`:'')+(ns.mp_current===false?' · differs from repo':''))
          :(svc?String(ns.state_line).replace('_',' '):(ns.scannable?(ns.kill_switch?(ns.mp_off_by==='manifest'?'off (delivered manifest)':'kill switch ON'):`${nOk}/${tg.length} ${mem?'active in memory':'patched'}`):'unknown')));
    }
  }
  if(ns.mp_port) patch=fileGroupRaw('mpport','Needs mempatch port',`<div class="fx-note">${IC('status_warning',16)} ${E(ns.mp_port)}</div>`,'warn','deploy refused')+patch;
  if(ns.mp_disk) patch=fileGroupRaw('mpdisk','Written on disk',`<div class="fx-note">${IC('status_warning',16)} ${E(ns.mp_disk)}</div>`,'warn','written on disk')+patch;
  let data='';
  if(sd&&sd.applicable){
    if(sd.ssh_error) data=`<div class="fx-note fx-bad">${IC('status_error',16)} S_ data: ${E(sd.ssh_error)}</div>`;
    else{
      const rec=items.map(x=>`<div class="fx-frow"><span class="fx-fname">${IC('database_record',18)}<code>${E(x.file)} #${E(x.id)}</code></span><span class="fx-ftype">record</span><span class="fx-fread">Data/db</span>
        <span class="fx-fst fx-${x.present===true?'ok':(x.present===false?(x.deploy_handled?'na':'bad'):'na')}"><i></i>${x.present===true?'OK':(x.present===false?(x.deploy_handled?'Via Deploy':'Missing'):'Unknown')}</span></div>`).join('');
      const fich=sd.files||{};
      const files=Object.keys(fich).sort().map(f=>{ const v=fich[f];
        return `<div class="fx-frow"><span class="fx-fname">${IC('data',18)}<code>${E(f)}</code></span><span class="fx-ftype">${v.records} rec · ${v.cols} cols</span><span class="fx-fread">${v.blank_lines?v.blank_lines+' blank line(s)':''}${v.remainder?' <b class="fx-bad">'+v.remainder+' field(s) left over</b>':''}</span>
          <span class="fx-fst fx-${v.valid===true?'ok':(v.valid===false?'bad':'na')}"><i></i>${v.valid===true?'Readable':(v.valid===false?'Malformed':'?')}</span></div>`; }).join('');
      const okS=items.filter(x=>x.present).length;
      data=(files?fileGroupRaw('sfiles','Server data files',files,corrupt.length?'bad':'ok',corrupt.length?corrupt.length+' malformed':'readable by the server'):'')
        +fileGroupRaw('srec','Server records (S_)',rec,miss?'bad':(viaDeploy?'warn':'ok'),`${okS}/${items.length} present`+(viaDeploy?` · ${viaDeploy} via Deploy`:''));
    }
  }
  const comps=(s.components||[]).filter(x=>x&&x.name);
  const compRows=comps.length?fileGroupRaw('comps','Components',comps.map(x=>`<div class="fx-frow"><span class="fx-fname">${IC('package',18)}<code>${E(x.name)}</code></span><span class="fx-ftype">${E(x.version?'v'+x.version:'')}</span><span class="fx-fread"></span><span class="fx-fst fx-${x.fully_installed?'ok':'bad'}"><i></i>${x.fully_installed?'Installed':'Missing'}</span></div>`).join(''),
    comps.every(x=>x.fully_installed)?'ok':'bad',`${comps.filter(x=>x.fully_installed).length}/${comps.length}`):'';
  return `<section class="fx-card"><div class="fx-card-h">${IC('server',26)}<div class="fx-card-t"><h2>Server — ${E(env)}</h2>
      <p>Every feature deploys through one deploy.py (deploy / status / revert). S_ records are the server twin of the client c_/t_ records.</p></div>
      <div class="fx-toolbar">${tools.join('')}</div></div>
    <div class="fx-table"><div class="fx-thead"><span>Item</span><span>Type</span><span>Where</span><span>Status</span></div>${patch}${compRows}${data}</div>${fmBoEnvHtml(d.name)}</section>${fmMsgFbHtml(d.name)}${fmCrierHtml(d.name)}`;
}
function fileGroupRaw(key,title,body,lvl,label){
  const open=(fm()._grpOpen||{})[key]; const isOpen=open==null?(lvl==='bad'||lvl==='warn'):open;
  const ic={ok:'status_success',bad:'status_error',warn:'status_warning',na:'status_info'}[lvl]||'status_info';
  return `<details class="fx-grp" data-fxgrp="${key}"${isOpen?' open':''}><summary><span class="fx-chev">${IC('chevron_right',14)}</span>${IC(isOpen?'folder_open':'folder',22)}
    <span class="fx-grp-t"><b>${title}</b></span><span class="fx-fst fx-${lvl}">${IC(ic,16)} ${E(label)}</span></summary>${body}</details>`;
}

function mdLite(s){
  return E(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
}
function changelogHtml(txt){
  if(!txt) return '';
  const parts=txt.split(/\n(?=## )/).filter(p=>p.startsWith('## '));
  if(!parts.length) return `<section class="fx-card"><pre class="fm-chlog">${E(txt)}</pre></section>`;
  const items=parts.map((p,i)=>{
    const lines=p.split('\n'), h=lines[0].slice(3);
    const ver=(h.match(/\[?v?(\d+\.\d+\.\d+[\w.-]*)\]?/)||[])[1]||'';
    const date=(h.match(/\d{4}-\d{2}-\d{2}/)||[])[0]||'';
    const title=h.replace(/\[?v?\d+\.\d+\.\d+[\w.-]*\]?/,'').replace(/\d{4}-\d{2}-\d{2}/,'').replace(/^[\s—–:-]+|[\s—–:-]+$/g,'').replace(/\s+—\s+—\s+/,' — ');
    const body=lines.slice(1).join('\n').replace(/\n---[\s\S]*$/,'').trim();
    const html=body.split('\n').map(l=>/^\s*[-*] /.test(l)?`<li>${mdLite(l.replace(/^\s*[-*] /,''))}</li>`:(l.trim()?`<p>${mdLite(l)}</p>`:'')).join('').replace(/(<li>[\s\S]*?<\/li>)(?!<li>)/g,'$1');
    return `<details class="fx-cl"${i===0?' open':''}><summary><span class="fx-cl-dot"></span>${ver?`<span class="fx-ver">${IC('version_tag',14)} v${E(ver)}</span>`:''}<b>${E(title)}</b><small>${E(date)}</small></summary><div class="fx-cl-b">${html}</div></details>`;
  }).join('');
  return `<section class="fx-card"><div class="fx-card-h">${IC('changelog',26)}<div class="fx-card-t"><h2>Changelog</h2><p>${parts.length} version${parts.length>1?'s':''}, newest first.</p></div></div><div class="fx-timeline">${items}</div></section>`;
}

function overviewHtml(d, cm, sm, pvList){
  const c=d.client;
  const facts=[];
  if(c) facts.push(['Client',cm.st,c.payload_only?'runtime payload':(c.in_build?(c.state===2?'enabled (verbose)':(c.state>=1?'enabled':'disabled')):'not in the DLL build')]);
  if(d.has_server) facts.push(['Server',sm?sm.st:'loading',((fm().list||{}).env_name||(fm().list||{}).env)||'']);
  const rd=d.readiness||{};
  if(rd.defined) facts.push(['Tests',rd.ready?'ok':'partial',`${rd.done||0}/${rd.total||0} confirmed`]);
  return `<section class="fx-card"><div class="fx-card-h">${IC('overview',26)}<div class="fx-card-t"><h2>What this feature does</h2></div></div>
      <div class="fx-prose">${c&&c.description?E(c.description):'<span class="fx-dim">No description yet — see the changelog.</span>'}</div>
      <div class="fx-facts" id="fm-ov-facts">${facts.map(([k,st,v])=>{ const u=STATE_UI[st]||STATE_UI.na; return `<div class="fx-fact"><span>${k}</span><b class="fx-${u[2]}">${IC(u[1],16)} ${u[0]}</b><small>${E(v)}</small></div>`; }).join('')}</div></section>
    ${fmPartsCardHtml(d)}
    <section class="fx-card"><div class="fx-card-h">${IC('link',26)}<div class="fx-card-t"><h2>Preview links</h2><p>One GIF / MP4 / image URL per line — shown as a carousel.</p></div></div>
      <div class="fm-prevedit"><textarea id="fmprev-in" placeholder="https://…">${E(pvList.join('\n'))}</textarea><button class="mini gold" id="fmprev-save">Save preview(s)</button></div></section>`;
}

function sideHtml(d, pvList){
  const rd=d.readiness||{}, left=Math.max(0,(rd.total||0)-(rd.done||0));
  const prev=`<section class="fx-card fx-side-card" id="fm-side-prev"><div class="fx-side-h">${IC('screenshot',20)} <b>Preview</b>${pvList.length?`<a class="fx-link" href="/api/features/preview-proxy?url=${encodeURIComponent(pvList[fm()._pv||0]||pvList[0])}" target="_blank" rel="noopener">Open in new ${IC('external_link',14)}</a>`:''}</div>
    <div class="fm-prev">${pvList.length?fmPreviewHtml(pvList):`<div class="fx-empty sm">${IC('image',32)}<div><b>No preview yet</b><span>Add links in Overview.</span></div></div>`}</div></section>`;
  const ready=`<section class="fx-card fx-side-card" id="fm-side-ready"><div class="fx-side-h">${IC('tests',20)} <b>Readiness</b>
      <span class="fx-pill fx-${rd.ready?'ok':(rd.defined?'bad':'na')}">${IC(rd.ready?'ready':(rd.defined?'not_ready':'status_off'),16)} ${rd.ready?'Ready':(rd.defined?'Not ready yet':'No tests')}</span></div>
    <div class="fx-ready">${rd.defined?(rd.ready?`<b class="fx-ok">All ${rd.total} tests confirmed</b>`:`<b class="fx-big-n">${left} test${left>1?'s':''} left</b>`):'<b>No tests defined</b>'}
      <span>${rd.defined?`${rd.done||0} of ${rd.total} tests have been confirmed on ${E(((fm().list||{}).env_name||(fm().list||{}).env)||'this environment')}.`:'Add the checks a tester must verify in-game.'}</span>
      <button class="fx-btn" data-fxtab="tests">View tests ${IC('chevron_right',14)}</button></div></section>`;
  return prev+fmProdCardHtml(d.name)+ready;
}

export function fmRenderDetail(d, serverState, target){
  const main=target||H.$('#fm-main'); if(!main)return;
  fm()._srvState=serverState;
  const cm=clientModel(d), sm=serverModel(d, serverState);
  const pvList=Array.isArray(d.preview)?d.preview:(d.preview?[d.preview]:[]);
  const alerts=alertsFor(d, cm, sm);
  const ptk=fmPartsHitKey(d); if(ptk&&fm()._ptScrolled!==ptk) fm()._tab='overview';
  const tabs=tabsHtml(d, cm, sm);
  const cur=(tabs.match(/fx-tab on" data-fxtab="(\w+)"/)||[])[1]||'overview';
  const panel=(k,html)=>`<div class="fx-panel" data-fxpanel="${k}"${k===cur?'':' hidden'}>${html}</div>`;
  main.innerHTML=`<div class="fx-detail">
    <div id="fm-hero">${heroHtml(d, cm, sm, pvList)}</div>
    <div class="fx-grid">
      <div class="fx-maincol">
        <div id="fm-alerts" class="fx-alerts">${alertsHtml(d, alerts)}</div>
        <div id="fm-tabs">${tabs}</div>
        ${panel('overview', overviewHtml(d, cm, sm, pvList))}
        ${panel('client', `<div id="fm-card-client">${clientCardHtml(d, cm)}</div>`)}
        ${panel('server', `<div id="fm-card-server">${serverCardHtml(d, sm)}</div>`)}
        ${panel('tests', `<div id="fm-tests">${fmReadinessHtml(d.name, d.readiness||{checklist:[],done:0,total:0,ready:false,defined:false})}</div>`)}
        ${panel('changelog', `<div id="fm-card-chlog">${changelogHtml(d.changelog)}</div>`)}
        ${panel('video', `<div id="fm-card-video">${fmVideoGuideHtml(d)}</div>`)}
      </div>
      <aside class="fx-sidecol">${sideHtml(d, pvList)}</aside>
    </div></div>`;
  fmWireShell(main, d);
  fmWireParts(main, d);
  fmWireReadiness(main, d.name);
  fmWirePreview(main, pvList);
  fmWireVideo(main, d);
  fmWireDetailButtons(main, d);
  fmApplyRoleMode(main);
  if(!target) fmWireProd(main, d.name);
}

function fmShowTab(root, k){
  fm()._tab=k;
  root.querySelectorAll('.fx-tab').forEach(t=>t.classList.toggle('on',t.dataset.fxtab===k));
  root.querySelectorAll('[data-fxpanel]').forEach(p=>p.hidden=p.dataset.fxpanel!==k);
}
function fmWireShell(root, d){
  root.querySelectorAll('[data-fxtab]').forEach(b=>b.addEventListener('click',()=>{
    const det=b.closest('.fx-detail')||document; fmShowTab(det, b.dataset.fxtab);
    const pop=b.closest('.fx-menu-pop'); if(pop) pop.hidden=true;
    if(b.dataset.fxfocus){ const el=document.getElementById(b.dataset.fxfocus); if(el){ el.focus(); el.scrollIntoView({block:'center',behavior:'smooth'}); } }
    else if(b.closest('.fx-side-card')){ const t=det.querySelector('.fx-tabs'); if(t) t.scrollIntoView({block:'start',behavior:'smooth'}); }
  }));
  root.querySelectorAll('[data-fxlayout]').forEach(b=>b.onclick=ev=>{ ev.preventDefault(); ev.stopPropagation(); fmOpenLayoutPreview(b.dataset.fxlayout, d.name); });
  root.querySelectorAll('[data-fxdismiss]').forEach(b=>b.onclick=()=>{
    const m=fm()._dismiss||(fm()._dismiss={}); (m[d.name]||(m[d.name]={}))[b.dataset.fxdismiss]=true;
    const el=b.closest('.fx-alert'); if(el) el.remove();
  });
  const more=root.querySelector('.fx-more'); if(more) more.ontoggle=()=>{ fm()._moreAlerts=more.open; };
  root.querySelectorAll('details[data-fxcm]').forEach(g=>g.addEventListener('toggle',()=>{ const m=fm()._cmOpen||(fm()._cmOpen={}); m[g.dataset.fxcm]=g.open; }));
  root.querySelectorAll('details.fx-grp').forEach(g=>g.addEventListener('toggle',()=>{ const m=fm()._grpOpen||(fm()._grpOpen={}); m[g.dataset.fxgrp]=g.open; }));
  root.querySelectorAll('[data-fxpreview]').forEach(b=>b.onclick=()=>{ const cm=document.querySelector('.fx-detail [data-fmfull]'); if(cm) cm.click(); });
  root.querySelectorAll('[data-fxmenu]').forEach(b=>{ const pop=b.parentElement.querySelector('.fx-menu-pop');
    b.onclick=ev=>{ ev.stopPropagation(); pop.hidden=!pop.hidden; };
    pop.addEventListener('click',()=>{ setTimeout(()=>{ pop.hidden=true; },0); });
  });
  if(!fmWireShell._doc){ fmWireShell._doc=true;
    document.addEventListener('click',ev=>{ if(!ev.target.closest('.fx-menu')) document.querySelectorAll('.fx-menu-pop').forEach(p=>p.hidden=true); }); }
}

export function fmSwapParts(d, ids){
  const main=H.$('#fm-main'); if(!main) return;
  if(!main.querySelector('.fx-detail')){ fmRenderDetail(d, fm()._srvState); return; }
  const sy=main.scrollTop;
  const tmp=document.createElement('div');
  fmRenderDetail(d, fm()._srvState, tmp);
  const pvList=Array.isArray(d.preview)?d.preview:(d.preview?[d.preview]:[]);
  ids.forEach(id=>{
    const now=document.getElementById(id), fresh=tmp.querySelector('#'+id);
    if(!now||!fresh) return;
    now.replaceWith(fresh);
    fmWireShell(fresh, d);
    fmWireDetailButtons(fresh, d);
    if(fresh.querySelector('[data-fmvote],#fmt-add')) fmWireReadiness(fresh, d.name);
    if(fresh.querySelector('.fm-carousel')) fmWirePreview(fresh, pvList);
    fmApplyRoleMode(fresh);
  });
  main.scrollTop=sy;
}
export function fmSwapCard(cardId, d){
  if(!document.getElementById(cardId)){ fmRenderDetail(d, null); return; }
  if(cardId==='fm-card-server') fm()._srvState=null;
  fmSwapParts(d, [cardId,'fm-hero','fm-alerts','fm-tabs','fm-ov-facts','fm-side-ready']);
}
