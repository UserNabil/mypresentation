/* ============================================================================
   CLIENT DEPLOY - modale #deploymodal : publication du client de jeu vers le
   CDN du launcher (R2/Cloudflare), PAR ENVIRONNEMENT, plus l upload du binaire
   du launcher lui-meme.

   Extrait de static/index.html (protocole docs/WORK_SPLIT.md). Code COPIE tel
   quel : aucun changement de comportement, seuls les acces aux globaux passent
   par l hote.

   /!\ Contrat d hote - AUCUN global n est lu depuis ce module. Tout arrive par
   l objet passe a initDeploy() :
     $           selecteur (document.querySelector)
     esc         echappement HTML
     toast       notification
     uiConfirm   confirmation modale (async -> bool)
     guardPage   guardPage(action, pageName) -> bool (permission 'deploy')
     envTag      envTag(env) -> markup icone + nom de l environnement

   Pieges consignes ici pour ne pas les reperdre :
   - Publier ecrit sur le CDN de l ENV COURANT. La modale reaffiche l env a
     QUATRE endroits (#cd-envbadge, #cd-env2..4) : c est deliberement redondant,
     l ecran est long et on ne doit jamais scroller sans savoir ou l on publie.
     En prod une confirmation supplementaire est exigee.
   - Le bouton Publish est REDESARME a chaque rechargement de config : on ne
     publie que ce qu un scan vient de mesurer (CD_LAST_SCAN). Sans scan, la
     version et la liste de fichiers seraient celles d un etat perime.
   - Les secrets R2 ne reviennent jamais du back : les deux champs de cle sont
     vides et leur placeholder dit seulement << set / not set >>. Un champ laisse
     vide CONSERVE la valeur existante : ne pas << nettoyer >> en envoyant ''.
   - #btn-clientdeploy referme d abord les menus deroulants ouverts (.hdrop) :
     le bouton vit dans un de ces menus, qui resterait sinon ouvert par-dessus
     la modale.
   - initDeploy() doit etre appele EXACTEMENT la ou les cablages en ligne
     etaient : index.html enveloppe plus bas #btn-clientdeploy dans UI.runBusy
     (`wireBusy`, vers la ligne 11200) et cette passe ne voit que les onclick
     DEJA poses.
   ============================================================================ */

import { makeProgress } from '../core/progress.js';

let H = null;

let CD_LAST_SCAN=null;
function cdProg(key,pct,label){ const {$}=H; const wrap=$('#cd-'+key+'-prog');if(!wrap)return;
  const bar=wrap.querySelector('.pkgbar'),fill=wrap.querySelector('.pkgbar>i'),pc=wrap.querySelector('.pkgpct');
  if(pct===null){wrap.classList.remove('on');return;} wrap.classList.add('on');
  if(pct<0){bar.classList.add('indet');fill.style.width='';pc.textContent=label||'';}
  else{bar.classList.remove('indet');fill.style.width=Math.max(0,Math.min(100,pct))+'%';pc.textContent=label!=null?label:(Math.round(pct)+'%');} }
async function openDeploy(){ const {$}=H; if(!H.guardPage('deploy','Client Deploy'))return; $('#deploymodal').classList.add('open'); await cdLoadConfig(); }
async function cdLoadConfig(){
  const {$,esc,envTag}=H;
  let j; try{ j=await(await fetch('/api/deploy/client/config')).json(); }catch(e){ return; }
  if(j.detail){ $('#cd-config-res').innerHTML='<span class="err">✗ '+esc(j.detail)+'</span>'; return; }
  const env=j.env||'?';
  const b=$('#cd-envbadge'); if(b){b.innerHTML=envTag(env);b.className='';}   // icône d'env + nom (plus de badge texte)
  ['#cd-env2','#cd-env3','#cd-env4'].forEach(s=>{const e=$(s);if(e)e.innerHTML=envTag(env);});
  $('#cd-staging').value=j.staging||''; $('#cd-mode').value=j.mode||'pkg';
  $('#cd-baseurl').value=j.cdn_base_url||''; $('#cd-prefix').value=j.cdn_prefix||'files';
  $('#cd-channel').value=j.channel||'live'; $('#cd-zone').value=j.cdn_zone||'';
  // R2 credentials card (values live in .secrets.json — endpoint/bucket prefilled, keys only shown as set/not)
  $('#cd-s-endpoint').value=j.cdn_endpoint||''; $('#cd-s-bucket').value=j.cdn_bucket||'';
  $('#cd-s-ak').value=''; $('#cd-s-ak').placeholder=j.has_access_key?'●●●●●●  set — blank to keep':'(not set)';
  $('#cd-s-sc').value=''; $('#cd-s-sc').placeholder=j.has_secret?'●●●●●●  set — blank to keep':'(not set)';
  $('#cd-s-perenv').checked=!!j.creds_per_env;
  $('#cd-creds').innerHTML=j.creds_ok?'<img src="/studio/icons/icons/24/password.png" srcset="/studio/icons/icons/24/password.png 1x, /icons/icons/48/password.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> R2 creds set'+(j.creds_per_env?' (per-env)':''):'<span style="color:var(--crimson)"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> R2 creds NOT set — fill the credentials card below</span>';
  $('#cd-config-res').innerHTML=j.published_version?('Published: <b>v'+esc(j.published_version)+'</b> ('+j.published_files+' files)'):(j.staging_ok?'Nothing published yet on this env.':'<span style="color:var(--crimson)">staging folder not set/found</span>');
  const pb=$('#cd-publish-btn'); pb.disabled=true; pb.textContent='Publish (scan first)';
}
async function cdSaveConfig(){
  const {$,toast}=H;
  const body={ staging:$('#cd-staging').value.trim(), mode:$('#cd-mode').value, cdn_base_url:$('#cd-baseurl').value.trim(),
    cdn_prefix:$('#cd-prefix').value.trim(), channel:$('#cd-channel').value.trim(), cdn_zone:$('#cd-zone').value.trim() };
  const r=await fetch('/api/deploy/client/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(r.ok){ toast('deploy config saved','ok'); await cdLoadConfig(); } else toast(''+(j.detail||'save failed'),'error');
}
async function cdSaveSecrets(){
  const {$,toast}=H;
  const body={ endpoint:$('#cd-s-endpoint').value.trim(), bucket:$('#cd-s-bucket').value.trim(),
    access_key:$('#cd-s-ak').value, secret:$('#cd-s-sc').value, per_env:$('#cd-s-perenv').checked };
  const r=await fetch('/api/deploy/client/secrets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(r.ok){ $('#cd-s-ak').value=''; $('#cd-s-sc').value=''; toast('R2 credentials saved to .secrets.json','ok'); await cdLoadConfig(); }
  else toast(''+(j.detail||'save failed'),'error');
}
async function cdScan(){
  const {$,esc}=H;
  const res=$('#cd-scan-res'); res.innerHTML=''; cdProg('scan',-1,'scanning…'); $('#cd-scan-btn').disabled=true;
  const body={ version:$('#cd-version').value.trim()||null, bump:$('#cd-bump').value };
  let r,j; try{ r=await fetch('/api/deploy/client/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); j=await r.json().catch(()=>({})); }
  catch(e){ cdProg('scan',null); $('#cd-scan-btn').disabled=false; res.innerHTML='<span class="err">✗ '+esc(String(e))+'</span>'; return; }
  cdProg('scan',null); $('#cd-scan-btn').disabled=false;
  if(!r.ok){ res.innerHTML='<span class="err">✗ '+esc(j.detail||'scan failed')+'</span>'; return; }
  CD_LAST_SCAN=j; const d=j.diff, mb=x=>(x/1048576).toFixed(1);
  const changed=[...(d.added||[]).map(p=>['+',p]),...(d.changed||[]).map(p=>['~',p])];
  res.innerHTML=`<div style="font-size:12px;line-height:1.6">
    <b>${esc(j.mode)}</b> mode · version <b>v${esc(j.version)}</b>${j.published_version?(' (was v'+esc(j.published_version)+')'):''} · channel ${esc(j.channel)}<br>
    <b>${d.total_count}</b> files (${mb(d.total_bytes)} MB) · <b style="color:${d.upload_count?'#c98a2f':'#7bc96f'}">${d.upload_count}</b> to upload (${mb(d.upload_bytes)} MB) · ${d.unchanged} unchanged${d.removed.length?(' · '+d.removed.length+' removed (kept on CDN)'):''}<br>
    ${!j.creds_ok?'<span style="color:var(--crimson)"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> R2 creds not set — preview only, cannot publish</span>':''}</div>
  <div style="max-height:220px;overflow:auto;margin-top:8px;font-family:monospace;font-size:11px;border-top:1px solid var(--edge);padding-top:6px">
    ${changed.length?changed.map(([s,p])=>`<div><span style="color:${s==='+'?'#7bc96f':'#e2b93d'}">${s}</span> ${esc(p)}</div>`).join(''):'<span style="color:var(--faint)">no changes vs published — nothing to upload</span>'}
    ${(d.removed||[]).map(p=>`<div><span style="color:#e06c75">−</span> ${esc(p)}</div>`).join('')}</div>`;
  const pb=$('#cd-publish-btn'); pb.disabled=!(j.creds_ok&&d.upload_count>0);
  pb.textContent=d.upload_count?('Publish v'+j.version+' ('+d.upload_count+' files)'):'Nothing to publish';
}
async function cdPublish(){
  const {$,esc,uiConfirm}=H;
  if(!CD_LAST_SCAN)return;
  if(CD_LAST_SCAN.env==='prod'&&!await uiConfirm('Publish client v'+CD_LAST_SCAN.version+' to PROD — every player will patch to it. Continue?','<img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> PROD client deploy','Publish to PROD'))return;
  const res=$('#cd-publish-res'); res.innerHTML=''; cdProg('publish',-1,'starting…'); $('#cd-publish-btn').disabled=true;
  const r=await fetch('/api/deploy/client/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:CD_LAST_SCAN.version})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){ cdProg('publish',null); $('#cd-publish-btn').disabled=false; res.innerHTML='<span class="err">✗ '+esc(j.detail||'failed to start')+'</span>'; return; }
  cdPollDeploy('publish');
}
/* Un suivi PAR operation : il retient le total maximum vu. Cree au 1er tour, jete a la fin. */
const _cdEta={};
async function cdPollDeploy(key){
  const {$,esc,toast}=H;
  let j; try{ j=await(await fetch('/api/deploy/client/status')).json(); }catch(e){ delete _cdEta[key]; cdProg(key,null); return; }
  /* Ce statut rend deja un POURCENTAGE : `push(pct, 100)` le normalise comme les autres. */
  if(!_cdEta[key])_cdEta[key]=makeProgress();
  const e=_cdEta[key].push(j.pct||0, (j.pct||0)>0?100:0);
  cdProg(key, e.part<0?-1:e.part*100,
         e.part<0 ? (j.step||'working…') : (e.pct+(j.step?' · '+j.step:'')));
  const res=$('#cd-'+key+'-res');
  if(res)res.innerHTML=(j.steps||[]).map(s=>`<div style="font-size:11.5px">${s.status==='ok'?'✔':s.status==='error'?'✗':s.status==='warn'?'<img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">':s.status==='skip'?'·':'…'} <b>${esc(s.name)}</b> ${esc(s.detail||'')}</div>`).join('');
  if(j.running){ setTimeout(()=>cdPollDeploy(key),700); return; }
  delete _cdEta[key];
  cdProg(key,null);
  if(j.error){ toast('deploy: '+j.error,'error',8000); } else { toast('client '+(j.kind==='rollback'?'rolled back':'deployed'),'ok'); cdLoadConfig(); cdLoadHistory(); }
}
async function cdLoadHistory(){
  const {$,esc}=H;
  const res=$('#cd-history-res'); res.innerHTML='loading…';
  let j; try{ j=await(await fetch('/api/deploy/client/history')).json(); }catch(e){ res.innerHTML='<span class="err">✗ failed</span>'; return; }
  if(j.detail){ res.innerHTML='<span class="err">✗ '+esc(j.detail)+'</span>'; return; }
  const h=j.history||[];
  res.innerHTML=h.length?h.map(v=>`<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px dashed var(--edge);font-size:12px">
    <b>v${esc(v.version||'?')}</b> <span style="color:var(--faint)">${esc(v.channel||'')} · ${v.files} files · ${esc(v.stamp||'')}</span>
    <button class="sbtn ghost xs" style="margin-left:auto" data-cdroll="${esc(v.file)}" data-cdver="${esc(v.version||'')}"><img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /icons/icons/64/refresh.png 2x" class="ui-icon" width="24" height="24" alt=""> Roll back to this</button></div>`).join('')
    :'<span style="color:var(--faint)">no published versions yet</span>';
  res.querySelectorAll('[data-cdroll]').forEach(b=>b.onclick=()=>cdRollback(b.getAttribute('data-cdroll'),b.getAttribute('data-cdver')));
}
async function cdRollback(file,ver){
  const {$,esc,uiConfirm}=H;
  const local=$('#cd-rollback-local').checked;
  if(!await uiConfirm('Roll the CDN back to v'+ver+'? Every client re-verifies and reverts to it.'+(local?' The local pkg backup will also be restored.':''),'<img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /icons/icons/48/refresh.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Rollback client',' Roll back'))return;
  const res=$('#cd-publish-res'); res.innerHTML=''; cdProg('publish',-1,'rolling back…');
  const r=await fetch('/api/deploy/client/rollback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:file,local_pkg:local})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){ cdProg('publish',null); res.innerHTML='<span class="err">✗ '+esc(j.detail||'failed')+'</span>'; return; }
  cdPollDeploy('publish');
}
async function cdPublishLauncher(){
  const {$,esc,toast}=H;
  const res=$('#cd-launcher-res'); res.innerHTML='';
  const body={ local_path:$('#cd-l-path').value.trim(), remote_name:$('#cd-l-name').value.trim()||null,
    manifest_name:$('#cd-l-manifest').value.trim()||null, version:$('#cd-l-version').value.trim()||null, notes:$('#cd-l-notes').value.trim()||null };
  if(!body.local_path){ res.innerHTML='<span class="err">✗ pick a local file</span>'; return; }
  $('#cd-launcher-btn').disabled=true; res.innerHTML='<span style="color:var(--faint)">uploading…</span>';
  const r=await fetch('/api/deploy/client/launcher',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({})); $('#cd-launcher-btn').disabled=false;
  if(!r.ok){ res.innerHTML='<span class="err">✗ '+esc(j.detail||'failed')+'</span>'; return; }
  res.innerHTML='<span style="color:#7bc96f">✔ published: '+esc((j.uploaded||[]).join(', '))+'</span> → '+esc(j.base||'')
    +(j.manifest?('<br>manifest v'+esc(j.manifest.version||'')+' · sha256 '+esc((j.manifest.sha256||'').slice(0,12))+'…'):'');
  toast('launcher file published','ok');
}

export function initDeploy(host){
  H=host;
  const {$}=H;
  $('#btn-clientdeploy')&&($('#btn-clientdeploy').onclick=()=>{document.querySelectorAll('.hdrop.open').forEach(d=>d.classList.remove('open'));openDeploy();});
  $('#cd-close')&&($('#cd-close').onclick=()=>$('#deploymodal').classList.remove('open'));
  $('#cd-save-btn')&&($('#cd-save-btn').onclick=cdSaveConfig);
  $('#cd-secrets-btn')&&($('#cd-secrets-btn').onclick=cdSaveSecrets);
  $('#cd-scan-btn')&&($('#cd-scan-btn').onclick=cdScan);
  $('#cd-publish-btn')&&($('#cd-publish-btn').onclick=cdPublish);
  $('#cd-launcher-btn')&&($('#cd-launcher-btn').onclick=cdPublishLauncher);
  $('#cd-history-btn')&&($('#cd-history-btn').onclick=cdLoadHistory);
}
