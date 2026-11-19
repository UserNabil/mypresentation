/* ============================================================================
   FEATURE MANAGER — operations longues : deploy natif, docteur, install-all,
   plein ecran des previews, copie du DLL.

   Pieges consignes ici :
   - Les deploys serveur sont ASYNCHRONES cote back : on POSTe, puis on SONDE
     /status/<feature> une fois par seconde. Le batch « install all » ecrit dans
     le MEME log qu un deploy unitaire — d ou fmWatchNativeLog partage (10 min
     de fenetre pour un batch, 3 min pour un deploy unitaire).
   - Le batch isole chaque feature (`|| true`) : le code de sortie global ne dit
     RIEN. Le verdict se lit sur la ligne recapitulative « failures: » (« echecs: »
     avant 2.207.0).
   - Le bouton « Install all server » n avait AUCUN verrou : un second clic
     patchait les memes binaires en parallele du premier. Le verrou reste.
   - Le repack est SYSTEMATIQUE apres une install client, meme si « rien ne
     manquait » : le staging peut etre a jour alors que le PKG est perime — le
     jeu ne voit alors rien (cas vecu 2026-08-01).
   - Le docteur ne dit pas « installe » mais « est-ce que ca MARCHE en jeu ? ».
     Il tourne en fond, la carte s affiche sans l attendre.
   ============================================================================ */
import { H, fm } from './feature_manager_state.js';
import { fmRenderDetail, fmSwapParts } from './feature_manager_detail.js';
import { openFeatures, fmPackedReady } from './feature_manager.js';
import { fmChip } from './feature_manager_views.js';

// Suit un log de deploy serveur deja LANCE (le batch « install all » l'a demarre). Extrait du corps de
// fmDeployNative pour que les deux partagent exactement le meme affichage et le meme poller.
async function fmWatchNativeLog(feature,title,opts){
  opts=opts||{};
  H.showThemedDialog(title,'<div class="fmload"><span class="fmspin" id="fmnat-spin"></span> <span id="fmnat-msg">starting…</span> <button class="mini" id="fmnat-copy" style="margin-left:auto" title="copy the full deploy output"><img src="/studio/icons/icons/24/action_journal.png" srcset="/studio/icons/icons/24/action_journal.png 1x, /studio/icons/icons/64/action_journal.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Copy</button></div><pre id="fmnat-out" style="max-height:340px;overflow:auto;font-size:11px;white-space:pre-wrap;margin-top:8px;background:rgba(0,0,0,.05);padding:8px;border-radius:6px"></pre>');
  { const cb=H.$('#fmnat-copy'); if(cb)cb.onclick=async()=>{ try{ await navigator.clipboard.writeText((H.$('#fmnat-out')||{}).textContent||''); cb.textContent='✓ Copied'; setTimeout(()=>cb.textContent='Copy',1500);}catch(e){} }; }
  let done=false;
  for(let i=0;i<(opts.max||600) && !done;i++){          // batch : jusqu'a 10 min (12 deploys a la suite)
    // Dialogue ferme : on continue (la fin du run est ce qui enregistre la version deployee), mais toutes
    // les 5 s au lieu de chaque seconde — une session SSH par interrogation.
    await new Promise(r=>setTimeout(r,H.$('#fmnat-out')?1000:5000));
    let st; try{ st=await H.fmGet('/api/features/server/native/status/'+encodeURIComponent(feature)); }catch(e){ continue; }
    const out=H.$('#fmnat-out'); if(out){ out.textContent=st.output||''; out.scrollTop=out.scrollHeight; }
    if(st.done){ done=true;
      const sp=H.$('#fmnat-spin'); if(sp)sp.style.display='none';
      // le batch isole chaque feature (|| true) : le code de sortie global ne dit pas tout -> on lit
      // la ligne recapitulative « echecs: » produite par le script.
      const txt=st.output||''; const m=/(?:failures|echecs):(.*)$/m.exec(txt);
      const failed=m?m[1].replace(/=+$/,'').trim():'';
      const bad=opts.byRc?st.rc!==0:(failed&&failed!=='none'&&failed!=='aucun');
      const msg=H.$('#fmnat-msg');
      if(opts.byRc){
        if(msg)msg.innerHTML=bad?('<b style="color:#d1242f">✖ '+H.esc(opts.failMsg||'failed')+' (exit '+H.esc(String(st.rc))+')</b>')
                               :'<b style="color:#2ea043">'+H.esc(opts.okMsg||'✔ done')+'</b>';
        H.toast(bad?'✖ '+(opts.failMsg||'failed'):(opts.okMsg||'✔ done'), bad?'error':'ok');
      }else{
      if(msg)msg.innerHTML=bad?('<b style="color:#d1242f">✖ failed for: '+H.esc(failed)+'</b>')
                             :'<b style="color:#2ea043">✔ all deployed — stack restarting (see Server Status)</b>';
      H.toast(bad?'✖ some features failed':'✔ all features deployed', bad?'error':'ok');
      }
    }
  }
  if(!done){ const msg=H.$('#fmnat-msg'); if(msg)msg.innerHTML='<span style="color:#b8860b">still running — check the server</span>'; }
}
/* Install files / Install data / Install all : un refus « appartient a une autre feature » (feature_overlaps.py)
   s affiche avec les deux noms et le fichier ; « Install anyway » rejoue avec force. Ensuite on montre l etat des
   features qui partagent ces cibles. */
export async function fmOverlapGate(r, retry){
  const ref=(r&&r.refused)||[];
  if(!ref.length) return r;
  const others=[...new Set(ref.flatMap(x=>x.others||[]))];
  const lst=ref.slice(0,30).map(x=>'<li><code>'+H.esc(x.target)+'</code> - '+H.esc(x.message)+'</li>').join('');
  const ok=await H.fmConfirm('Owned by another installed feature',
    '<p>Nothing was written for '+ref.length+' target(s): the version in place belongs to <b>'+others.map(H.esc).join(', ')+'</b>.</p>'
    +'<ul style="max-height:220px;overflow:auto;font-size:12px">'+lst+'</ul>'
    +'<p class="esub">Install anyway writes this feature\'s version: '+others.map(H.esc).join(', ')+' will need reinstall.</p>',
    'Install anyway (the other feature will need reinstall)');
  if(!ok){ H.toast('kept '+others.join(', ')+': '+ref.length+' target(s) not installed','warn'); return r; }
  return await retry();
}
export function fmShowShared(r){
  const kept=(r&&r.kept)||[], sh=(r&&r.shared)||[], ov=(r&&r.overridden)||[];
  kept.forEach(k=>H.toast('merged: '+k.message,'ok',{duration:9000}));
  ov.forEach(o=>H.toast('overwritten: '+o.message+' - reinstall '+(o.others||[]).join(', '),'warn',{duration:12000}));
  const bad=sh.filter(x=>!x.ok);
  if(bad.length) H.toast('features sharing these files now need install: '+bad.map(x=>x.name+' ('+[
      x.files_missing.length?x.files_missing.length+' file(s)':'', x.data_missing.length?x.data_missing.length+' record(s)':'',
      x.sequences_missing.length?x.sequences_missing.map(q=>q.rel+' seq '+q.codes.join('/')+' (in '+q.shipped_by.join(', ')+')').join(', '):'',
      x.error||''].filter(Boolean).join(', ')+')').join('; '),'warn',{duration:15000});
  else if(sh.length) H.toast('shared files checked: '+sh.map(x=>x.name).join(', ')+' still installed','ok');
}
export async function fmDeployNative(feature,script,action){
  action=action||'deploy';
  const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||18}" height="${s||18}" alt="" aria-hidden="true">`;
  const E=v=>H.esc(v==null?'':v);
  const old=document.getElementById('fx-dp'); if(old) old.remove();
  const ov=document.createElement('div'); ov.id='fx-dp'; ov.className='fx-lp';
  const verb=action==='revert'?'Revert':'Deploy';
  ov.innerHTML=`<div class="fx-lp-box fx-dp-box" role="dialog"><div class="fx-lp-h">${IC(action==='revert'?'restart':'deploy',22)} <b>${verb} ${E(feature)}</b><span class="fx-dim">${E(script)}</span>
    <button class="fx-x" data-dpclose title="close">${IC('close',16)}</button></div><div class="fx-dp-body"><div class="fx-dp-h">${IC('server_scan',18)} Checking the target machine…</div><div class="fx-skel"><div><i></i><i></i><i></i></div><div><i></i><i></i><i></i></div></div></div></div>`;
  document.body.appendChild(ov);
  let running=false;
  const close=async()=>{ if(running&&!await H.fmConfirm('Close this window?','<div>The deploy keeps running on the server; its log stays available on the feature card.</div>','Close')) return; ov.remove(); };
  ov.addEventListener('click',e=>{ if(e.target===ov||e.target.closest('[data-dpclose]')) close(); });
  const body=ov.querySelector('.fx-dp-body');
  let pf;
  try{ pf=await H.fmPost('/api/features/server/native/preflight',{feature,script,action}); }
  catch(e){ body.innerHTML=`<div class="fx-note fx-bad">${IC('status_error',16)} ${E(H.errMessage(e))}</div>`; return; }
  const mark=c=>c.ok===true?IC('status_success',18):(c.ok===false?IC('status_error',18):IC('status_warning',18));
  const m=pf.machine||{};
  body.innerHTML=`
    <div class="fx-dp-target">${IC('server',22)}<div><span><b>${E((pf.env||'').toUpperCase())}</b> · ${E(m.user||'?')}@${E(m.host||'?')}</span><small>kernel ${E(m.kernel||'?')} · python ${E(m.python||'?')}</small></div>
      <span class="fx-pill fx-${pf.ok?'ok':'bad'}">${IC(pf.ok?'ready':'not_ready',16)} ${pf.ok?'Ready to '+verb.toLowerCase():'Blocked'}</span></div>
    <div class="fx-dp-sec"><div class="fx-dp-h">${IC('checklist',18)} Pre-flight checks</div>
      ${pf.checks.map(c=>`<div class="fx-dp-chk${c.blocking?' blk':''}">${mark(c)}<b>${E(c.label)}</b><span>${E(c.detail)}</span></div>`).join('')}</div>
    ${pf.status_output?`<details class="fx-dp-sec"${pf.status_rc!==0?' open':''}><summary class="fx-dp-h">${IC('reverify',18)} Current state on the server (deploy.py status, exit ${E(pf.status_rc)})</summary><pre class="fx-dp-log">${E(pf.status_output)}</pre></details>`:''}
    <div class="fx-dp-sec"><div class="fx-dp-h">${IC('pipeline_connected',18)} What will run</div>
      <ol class="fx-dp-steps">${(pf.plan||[]).map(s=>`<li data-step="${E(s.key)}"><i></i><span>${E(s.label)}</span></li>`).join('')}</ol></div>
    <div class="fx-dp-verdict" hidden></div>
    <details class="fx-dp-sec fx-dp-out" hidden open><summary class="fx-dp-h">${IC('file_details',18)} Live output <button class="mini" data-dpcopy style="margin-left:auto">${IC('copy',14)} Copy</button></summary><pre class="fx-dp-log" id="fmnat-out"></pre></details>
    <div class="fx-lp-act"><button class="fx-btn gold" data-dprun${pf.ok?'':' disabled'}>${IC(action==='revert'?'restart':'deploy',18)} ${verb} now</button><button class="fx-btn" data-dpcancel>Cancel</button></div>`;
  ov.querySelector('[data-dpcancel]').onclick=close;
  ov.querySelector('[data-dpcopy]').onclick=async e=>{ e.preventDefault(); try{ await navigator.clipboard.writeText(ov.querySelector('#fmnat-out').textContent||''); H.toast('output copied','ok'); }catch(_){ } };
  const run=ov.querySelector('[data-dprun]');
  run.onclick=async()=>{
    const act=ov.querySelector('.fx-lp-act'); act.innerHTML=`<span class="fx-dim">${IC('history',16)} running on the server — you can close this window, the result is recorded anyway</span>`;
    ov.querySelector('.fx-dp-out').hidden=false; running=true;
    const steps=[...ov.querySelectorAll('.fx-dp-steps li')];
    const paint=(seen,outcome,done)=>{
      steps.forEach(li=>{ const k=li.dataset.step, i=seen.indexOf(k);
        li.className=i<0?'':(i<seen.length-1||done?'ok':'run');
        if(done&&outcome!=='ok'&&i===seen.length-1) li.className='bad';
        if(k==='restart'&&done&&outcome!=='ok') li.className='skip'; });
    };
    try{ const r=await H.fmPost('/api/features/server/native/deploy',{feature,script,action});
      if(r&&r.validating){ H.toast(r.message||'validated for prod, the deploy starts once the promotion lands','info',{duration:12000}); } }
    catch(e){ running=false; showVerdict(false,'Not started',H.errMessage(e)); return; }
    const out=ov.querySelector('#fmnat-out');
    for(let i=0;i<600;i++){
      await new Promise(r=>setTimeout(r,1000));
      if(!document.body.contains(ov)) return;
      let st; try{ st=await H.fmGet('/api/features/server/native/status/'+encodeURIComponent(feature)); }catch(e){ continue; }
      out.textContent=st.output||''; out.scrollTop=out.scrollHeight;
      paint(st.steps||[], st.outcome, st.done);
      if(st.done){ running=false;
        const rc=st.rc;
        if(st.died) showVerdict(false,'The deploy stopped without an exit code','The script died on the server before finishing (killed, SSH cut or shell error). Read the output above; nothing after the last step shown was run.');
        else if(rc===0) showVerdict(true,verb+' succeeded (exit 0)','The stack is restarting in the background — follow it in Server Status. The feature state is recorded.');
        else if(rc===3) showVerdict(null,'Clean refusal (exit 3)','This feature does not apply to this binary and wrote NO byte. Nothing is broken and the stack was not restarted.');
        else if(rc===97) showVerdict(false,'Feature files missing on the server (exit 97)','The upload did not land in /root/ee_native. Nothing was run.');
        else showVerdict(false,verb+' failed (exit '+rc+')','The stack was NOT restarted: the servers keep running their code in memory, the game stays up. Fix the cause shown in the output, then run again.');
        H.toast(rc===0?'✔ '+feature+' deployed':'✖ '+feature+' — exit '+rc, rc===0?'ok':'error');
        try{ const mod=await import('./feature_manager.js'); if(mod.fmRefreshServerOnly) mod.fmRefreshServerOnly(feature, true); }catch(_){ }
        return;
      }
    }
    running=false; showVerdict(null,'Still running after 10 minutes','Check Server Status; the result will be recorded when the script ends.');
  };
  function showVerdict(ok,title,text){
    const v=ov.querySelector('.fx-dp-verdict'); v.hidden=false;
    v.className='fx-dp-verdict fx-'+(ok===true?'ok':(ok===false?'bad':'warn'));
    v.innerHTML=`${IC(ok===true?'status_success':(ok===false?'status_error':'status_warning'),22)}<div><b>${E(title)}</b><span>${E(text)}</span></div>`;
    const act=ov.querySelector('.fx-lp-act'); act.innerHTML=`<button class="fx-btn" data-dpdone>Close</button>`;
    act.querySelector('[data-dpdone]').onclick=()=>ov.remove();
  }
}
export function fmShowPubKey(pub){
  H.showThemedDialog('Deploy key (public) — add to GitHub','<div class="esub">Add this PUBLIC key to <b>github.com/example/features → Settings → Deploy keys → Add</b> (read-only is enough). The private key is stored encrypted and ships with the tool (same key on every machine).</div><textarea readonly style="width:100%;height:70px;font-size:11px;margin-top:8px" onclick="this.select()">'+H.esc(pub||'(derive with: ssh-keygen -y -f feature_ee_deploy)')+'</textarea>');
}
export async function fmDeployDll(close, force){
  try{
    const body={}; if(close)body.close=true; if(force)body.force=true;
    const r=await H.fmPost('/api/features/client/deploy-dll', body);
    if(r.needs_confirm){
      const rows=(r.downgrade||[]).map(d=>{
        const lost=(d.down||[]).map(x=>x.feature+' '+x.from+' → '+x.to).concat((d.removed||[]).map(x=>x.feature+' '+x.from+' → removed'));
        return '<div style="margin-top:6px"><b>'+H.esc(d.label||d.dir)+'</b> ('+H.esc(d.file)+'): EDEN '+H.esc(d.client.eden||'?')+' built '+H.esc(d.client.built||'?')
          +' → would become EDEN '+H.esc(d.copy.eden||'?')+' built '+H.esc(d.copy.built||'?')
          +(lost.length?'<br><span style="color:#cf9b2a">'+H.esc(lost.join(', '))+'</span>':'')+'</div>';
      }).join('');
      H.showThemedDialog('Your client has a newer DLL',
        '<div class="esub">The DLL in your client is newer than the one Copy DLL would install (higher EDEN number or later build, often a build made from workspace). Copying would downgrade it.</div>'+rows+
        '<div style="text-align:right;margin-top:10px"><button class="mini gold" id="fm-dll-force">Downgrade anyway</button></div>');
      setTimeout(()=>{ const b=H.$('#fm-dll-force'); if(b)b.onclick=()=>{ const dlg=H.$('#intg-dlg'); if(dlg)dlg.remove(); fmDeployDll(close, true); }; },100);
      return;
    }
    if(r.needs_close){
      const names=(r.running||[]).map(x=>x.name+' (pid '+x.pid+')').join(', ');
      H.showThemedDialog('The game is running from this client',
        '<div class="esub">The DLL cannot be swapped cleanly while the game is open. These process(es) run from the configured client:<br><b>'+H.esc(names)+'</b></div>'+
        '<div style="text-align:right;margin-top:10px"><button class="mini gold" id="fm-dll-close">Close them &amp; deploy</button></div>');
      setTimeout(()=>{ const b=H.$('#fm-dll-close'); if(b)b.onclick=()=>{ const dlg=H.$('#intg-dlg'); if(dlg)dlg.remove(); fmDeployDll(true, force); }; },100);
      return;
    }
    /* ⛔ « DLL — copied » ne disait PAS OU. Un testeur qui garde aussi un client en clair
       croyait donc que le binaire y etait alle — il n'y allait pas, et rien ne le signalait
       (rapporte le 2026-08-18). On NOMME les clients servis, et on dit ce qui a ete ecarte :
       un dossier d'assets sans game_.exe ne charge aucun DLL, et le taire renvoie chercher
       le probleme du mauvais cote. */
    const ok=(r.written||[]).filter(w=>w.ok).map(w=>w.label);
    const skip=(r.skipped||[]).map(w=>w.label);
    H.toast('DLL — '+r.how+(ok.length?': '+ok.join(', '):'')
            +(skip.length?' · skipped '+skip.join(', ')+' (no game_.exe)':''),'ok');
    openFeatures();
  }catch(e){ H.toast(H.errMessage(e),'error'); }
}
export function fmImgFull(url){
  if(!/^https?:\/\//i.test(url||''))return;          // jamais un javascript:/data: pi\u00e9g\u00e9
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10000;display:flex;'
    +'align-items:center;justify-content:center;cursor:zoom-out';
  const im=document.createElement('img');
  im.src=url; im.style.cssText='max-width:96vw;max-height:96vh;object-fit:contain';
  ov.appendChild(im);
  ov.onclick=()=>ov.remove();
  document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){ov.remove();
    document.removeEventListener('keydown',esc);}});
  document.body.appendChild(ov);
}
function fmFullscreen(url){
  const prox='/api/features/preview-proxy?url='+encodeURIComponent(url);
  const isV=/\.(mp4|webm|mov)(\?|$)/i.test(url);
  const ov=document.createElement('div'); ov.id='fm-fs';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  ov.innerHTML=isV?`<video src="${prox}" autoplay loop controls style="max-width:96vw;max-height:96vh"></video>`:`<img src="${prox}" style="max-width:96vw;max-height:96vh;object-fit:contain">`;
  ov.onclick=()=>ov.remove(); document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){ov.remove();document.removeEventListener('keydown',esc);}});
  document.body.appendChild(ov);
}
export function fmWirePreview(main,list){
  main.querySelectorAll('[data-fmpv]').forEach(t=>t.onclick=()=>{ fm()._pv=+t.dataset.fmpv; fmSwapParts(fm().detail, ['fm-side-prev']); });
  const cm=main.querySelector('[data-fmfull]'); if(cm)cm.onclick=()=>fmFullscreen(cm.dataset.fmfull);
}
// ── INSTALL TOUT (client / serveur) ───────────────────────────────────────────────────────────────
// Remplace l'ancien bandeau « les features viennent du clone GitHub » : un avertissement qu'on ne peut
// pas actionner n'aide personne. Ici, deux gestes concrets. Demande admin 2026-08-01.
export function fmWireInstallAll(){
  const cb=H.$('#fm-install-all-client');
  if(cb)cb.onclick=()=>fmInstallClient(null, cb);
  const sb=H.$('#fm-install-all-server');
  if(sb)sb.onclick=()=>fmDeployServerPick(null, sb);
  const mb=H.$('#fm-mp-migrate');
  if(mb)mb.onclick=()=>fmMigrateMempatch(mb);
}
export async function fmMigrateMempatch(btn){
  const env=H.esc((fm().list||{}).env||'env');
  const lbl=btn.innerHTML; btn.disabled=true; btn.style.cursor='wait';
  btn.innerHTML='<span class="fmspin" style="width:11px;height:11px;vertical-align:-1px"></span> reading the binaries…';
  let p=null;
  try{ p=await H.fmGet('/api/features/server/mempatch/migrate'); }
  catch(e){ H.toast(H.errMessage(e),'error'); }
  finally{ btn.disabled=false; btn.style.cursor=''; btn.innerHTML=lbl; }
  if(!p) return;
  const bl=p.blockers||[], hard=p.blockers_if_dropped||[], unp=Object.keys(p.unported||{});
  const RAZ='text-transform:none;font-family:inherit;font-size:12px;letter-spacing:0;color:var(--ink);margin:0';
  const html=`<div class="esub" style="margin:0 0 6px">Target: <b>${env}</b> · base <code>${H.esc(p.base||'')}</code></div>
    <pre style="max-height:36vh;overflow:auto;font-size:10.5px;white-space:pre-wrap;text-align:left;background:rgba(0,0,0,.05);padding:8px;border-radius:6px">${H.esc((p.lines||[]).join('\n'))}</pre>
    ${bl.length?`<div style="${RAZ};color:#d1242f;text-align:left;margin-top:6px">${bl.map(H.esc).join('<br>')}</div>`:''}
    ${(unp.length&&!hard.length)?`<label style="${RAZ};display:flex;gap:6px;align-items:flex-start;cursor:pointer;margin-top:8px;text-align:left"><input type="checkbox" id="mpm-drop" style="width:auto;padding:0;margin:2px 0 0;flex:none"> Drop the bytes no manifest carries (${H.esc(unp.join(', '))}): these features STOP working on ${env}</label>`:''}
    <div class="esub" style="margin-top:8px;color:#cf9b2a;font-size:11.5px;text-align:left">${hard.length?'Refused: fix the blockers above first.':'The stack is stopped, ZoneServer/MissionServer become pristine binaries (environment settings kept), the manifests are installed, then restart_safe (~10 min). Previous binaries saved in /home/server/eden_mempatch_backup/&lt;stamp&gt;/bin.'}</div>`;
  if(hard.length){ await H.fmConfirm('Migrate to mempatch — '+(p.env||''), html, 'Close'); return; }
  const choix={drop:false};
  const pr=H.fmConfirm('Migrate to mempatch — '+(p.env||''), html, 'Migrate');
  setTimeout(()=>{
    const cbx=document.querySelector('#mpm-drop'); if(cbx) cbx.onchange=()=>{ choix.drop=cbx.checked; };
    const y=document.querySelector('#fmc-yes'); if(y) y.addEventListener('pointerdown',()=>{ const c=document.querySelector('#mpm-drop'); choix.drop=!!(c&&c.checked); });
  },0);
  if(!await pr) return;
  if(bl.length&&!choix.drop){ H.toast('refused: '+bl[0],'error'); return; }
  btn.disabled=true;
  try{
    const r=await H.fmPost('/api/features/server/mempatch/migrate?allow_unported='+(choix.drop?'1':'0'));
    H.toast('migration '+(r.stamp||'')+' started — rollback: '+(r.rollback||''),'info',{duration:12000});
    fmWatchNativeLog(r.feature||'__migrate__','Migrate to mempatch — '+(r.env||'')+' ('+(r.stamp||'')+')',
      {max:2400, byRc:true, okMsg:'✔ migrated — every feature runs in memory, binaries pristine', failMsg:'migration failed or not active everywhere — see the log (binaries put back on failure)'});
  }catch(e){ H.toast(H.errMessage(e),'error'); }
  finally{ btn.disabled=false; }
}
export async function fmInstallClient(names, cb){
    const sel=names&&names.length;
    if(!await H.fmConfirm(sel?'Install client assets':'Install all client assets',
      (sel?'Copy the files and data records of <b>'+names.map(H.esc).join(', ')+'</b>':'Copy <b>every</b> feature\'s files and data records')
      +' into <code>game_unpacked</code>, then <b>repack</b> the client.<br><br>'
      +'<span class="esub">Your local client only — nothing is sent to the server. Close the game first if it is running.</span>',
      sel?'Install '+names.length:'Install all'))return;
    const old=cb.innerHTML; cb.disabled=true; cb.style.cursor='wait';
    cb.innerHTML='<span class="fmspin" style="width:11px;height:11px;vertical-align:-1px"></span> installing…';
    try{
      const url='/api/features/client/install-all'+(sel?'?names='+encodeURIComponent(names.join(',')):'');
      let r=await H.fmPost(url);
      r=await fmOverlapGate(r,()=>H.fmPost(url+(url.includes('?')?'&':'?')+'force=1'));
      fmShowShared(r);
      const parts=[];
      if(r.files)parts.push(r.files+' file(s)');
      if(r.records)parts.push(r.records+' record(s)');
      if(r.replaced)parts.push(r.replaced+' fixed');
      const sum=parts.length?parts.join(', '):'nothing was missing';
      const blocked=r.blocked||[];
      if(fmPackedReady()&&!blocked.length){        // repack SYSTEMATIQUE (chirurgical), meme si rien n'a ete copie :
        cb.innerHTML='<span class="fmspin" style="width:11px;height:11px;vertical-align:-1px"></span> repacking…';
        await H.barRepack();        // le staging peut etre a jour alors que le PKG, lui, est perime.
      }
      H.showThemedDialog((r.errors&&r.errors.length)?'Installed with errors':(sel?'✔ Client assets installed':'✔ All client assets installed'),
        '<div class="esub">'+H.esc(sum)+(blocked.length?' — <b>not repacked</b>: race models missing for '+H.esc(blocked.join(', ')):'')+(r.staged&&!blocked.length?(fmPackedReady()?' — repacked.':' — <img src="/studio/icons/icons/24/packaging.png" srcset="/studio/icons/icons/24/packaging.png 1x, /studio/icons/icons/48/packaging.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> repack to apply.'):'')+'</div>'
        +((r.errors&&r.errors.length)?'<pre style="max-height:220px;overflow:auto;font-size:11px;white-space:pre-wrap;color:var(--crimson)">'+H.esc(r.errors.join('\n'))+'</pre>':'')
        +'<div style="max-height:240px;overflow:auto;margin-top:6px">'+(r.features||[]).map(f=>
            '<div class="fm-tgt"><code>'+H.esc(f.name)+'</code> <span style="opacity:.6">'
            +[f.copied.length?f.copied.length+' file(s)':'',f.installed.length?f.installed.length+' record(s)':'',f.replaced.length?f.replaced.length+' fixed':'',f.error?('<img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> '+H.esc(f.error)):''].filter(Boolean).join(' · ')
            +'</span></div>').join('')+'</div>');
      await openFeatures();
    }catch(e){ H.toast(H.errMessage(e),'error'); }
    finally{ cb.disabled=false; cb.style.cursor=''; cb.innerHTML=old; }
}
export async function fmDeployServerPick(preselect, sb){
    // ⭐ PLUS DE LIBERTE. Ce bouton faisait UNE chose : deployer ce qui est en retard, puis
    // redemarrer la pile. Enchainer deux features imposait donc d'attendre un redemarrage complet
    // entre les deux, et de couper les joueurs deux fois (demande de Nunez, 2026-08-12). On demande
    // maintenant QUOI deployer et SI l'on redemarre — le redemarrage devient un geste separe.
    const env=H.esc((fm().list||{}).env||'env');
    // ⭐ CHOISIR LES FEATURES, comme pour la construction du DLL (demande admin 2026-08-12). Les
    // cases viennent des cibles REELLES du deploiement (/deploy-targets), pas de la liste de l'ecran :
    // les deux different (features privees, features sans deploy.py), et une case qui ne correspond a
    // rien de deployable promettrait quelque chose qui n'arrivera pas.
    let cibles=[]; let err='';
    // La liste demande un aller-retour : sans repere visuel, le bouton parait inerte et on re-clique.
    const lbl0=sb.innerHTML; sb.disabled=true; sb.style.cursor='wait';
    sb.innerHTML='<span class="fmspin" style="width:11px;height:11px;vertical-align:-1px"></span> reading…';
    try{ cibles=((await H.fmGet('/api/features/server/deploy-targets'))||{}).targets||[]; }
    catch(e){ err=H.errMessage(e); }
    finally{ sb.disabled=false; sb.style.cursor=''; sb.innerHTML=lbl0; }
    const enRetard=cibles.filter(t=>!t.up_to_date);
    // ⛔ `.fld input{width:100%;padding:9px 12px}` (app.css) s'applique AUSSI aux cases a cocher et aux
    // radios : sans `width:auto`, chaque case devient un bloc pleine largeur, le libelle est ecrase
    // dans une colonne d'un caractere de large et tout parait centre. Et `.fld label` impose Cinzel
    // MAJUSCULES : c'est bon pour un intitule de section, illisible pour 20 lignes de liste. D'ou les
    // deux remises a zero explicites ci-dessous — vecu 2026-08-12, affichage entierement casse.
    const RAZ='text-transform:none;font-family:inherit;font-size:12px;letter-spacing:0;color:var(--ink);margin:0';
    const BOX='width:auto;padding:0;margin:0;flex:none';
    const ligne=t=>`<label style="${RAZ};display:flex;gap:7px;align-items:center;padding:1px 0;cursor:pointer">
          <input type="checkbox" class="ias-f" data-f="${H.esc(t.name)}"${t.blocked?' disabled':((preselect?preselect.includes(t.name):!t.up_to_date)?' checked':'')} style="${BOX}">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H.esc(t.name)}</span>
          <span style="opacity:.55;font-size:10px;white-space:nowrap">${H.esc(t.mode||'')}</span>
          <span style="opacity:.55;font-size:10px;white-space:nowrap" title="${H.esc(t.reason||'')}">${t.up_to_date?(t.mp_label&&t.mp_state!=='active'?H.esc(t.mp_label):'up to date'):(t.deployed?('v'+H.esc(t.deployed)+' → v'+H.esc(t.version||'?')):'not installed')}</span>
        </label>${t.reason?`<div style="${RAZ};font-size:10.5px;opacity:.65;margin:0 0 3px 22px">${H.esc(t.reason)}</div>`:''}${t.warn?`<div style="${RAZ};font-size:10.5px;color:#b8860b;margin:0 0 3px 22px">⚠ ${H.esc(t.warn)}</div>`:''}`;
    const liste=cibles.length? cibles.map(ligne).join('')
      : `<div style="${RAZ};color:var(--crimson)">could not list the deployable features${err?' — '+H.esc(err):''} · deploying will fall back to « everything out of date »</div>`;
    const html=`<div class="esub" style="margin:0 0 6px">Target: <b>${env}</b></div>
      <div class="fld" style="margin-bottom:8px"><label>Features to deploy
          <span style="${RAZ};font-size:11px;display:inline">— <a href="#" data-ias="out">out of date (${enRetard.length})</a> · <a href="#" data-ias="all">all (${cibles.length})</a> · <a href="#" data-ias="none">none</a></span>
        </label>
        <div id="ias-pick" style="max-height:32vh;overflow:auto;text-align:left;border:1px solid var(--edge);border-radius:6px;padding:5px 8px;background:#fbf5e3">${liste}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px">
          <span id="ias-count" style="${RAZ};font-size:11px;opacity:.7"></span>
          <label style="${RAZ};display:flex;gap:6px;align-items:center;cursor:pointer;font-size:11px">
            <input type="checkbox" id="ias-force"${preselect?' checked':''} style="${BOX}"> include up-to-date ones</label>
        </div>
      </div>
      <div class="fld" style="margin-bottom:6px"><label>After deploying</label>
        <div style="display:flex;gap:16px">
          <label style="${RAZ};display:flex;gap:6px;align-items:center;cursor:pointer"><input type="radio" name="iasr" value="1" checked style="${BOX}"> Restart once at the end</label>
          <label style="${RAZ};display:flex;gap:6px;align-items:center;cursor:pointer"><input type="radio" name="iasr" value="0" style="${BOX}"> Don't restart</label>
        </div>
      </div>
      <div class="esub" style="margin:0;color:#cf9b2a;font-size:11.5px">Patches only take effect after a restart.</div>`;
    // Le compteur et les raccourcis ne peuvent etre cables qu'une fois la modale DANS le document :
    // on attend un tick, la promesse de fmConfirm restant en cours.
    const coches=()=>[...document.querySelectorAll('#ias-pick .ias-f')].filter(c=>c.checked).map(c=>c.dataset.f);
    const choix={noms:[], rst:true, force:!!preselect};
    const fige=()=>{ if(!document.querySelector('#ias-pick')) return;
      choix.noms=coches();
      choix.rst=(document.querySelector('input[name="iasr"]:checked')||{}).value!=='0';
      choix.force=!!(document.querySelector('#ias-force')||{}).checked; };
    const majCompte=()=>{ fige(); const el=document.querySelector('#ias-count'); if(!el)return;
      const n=choix.noms.length, tot=document.querySelectorAll('#ias-pick .ias-f').length;
      el.textContent=tot?(n+' / '+tot+' feature(s) selected'):''; };
    const hors=preselect?preselect.filter(n=>!cibles.some(t=>t.name===n)):[];
    const html2=html+(hors.length?`<div class="esub" style="margin-top:6px">No server side to deploy for: ${hors.map(H.esc).join(', ')}</div>`:'');
    const p=H.fmConfirm(preselect?'Deploy selected features':'Install all server-side', html2, 'Deploy');
    setTimeout(()=>{
      document.querySelectorAll('#ias-pick .ias-f').forEach(c=>c.onchange=majCompte);
      document.querySelectorAll('input[name="iasr"], #ias-force').forEach(c=>c.onchange=fige);
      const oui=document.querySelector('#fmc-yes'); if(oui) oui.addEventListener('pointerdown',fige);
      document.querySelectorAll('[data-ias]').forEach(a=>a.onclick=ev=>{ ev.preventDefault();
        const m=a.dataset.ias;
        document.querySelectorAll('#ias-pick .ias-f').forEach(c=>{
          const t=cibles.find(x=>x.name===c.dataset.f)||{};
          c.checked = t.blocked ? false : (m==='all' ? true : m==='none' ? false : !t.up_to_date);
        });
        majCompte();
      });
      majCompte();
    },0);
    if(!await p)return;
    const noms=choix.noms;
    if(cibles.length&&!noms.length){ H.toast('no feature selected — nothing to deploy','warn'); return; }
    const rst=choix.rst;
    const quoi=choix.force?'all':'outdated';
    const oldLbl=sb.innerHTML;
    // ⛔ verrou jusqu'au lancement effectif : un 2e appel patcherait les MEMES binaires en parallele.
    sb.disabled=true; sb.style.cursor='progress';
    sb.innerHTML='<span class="fmspin" style="width:11px;height:11px;vertical-align:-1px"></span> deploying…';
    try{
      const qs='?all='+(quoi==='all'?'1':'0')+'&restart='+(rst?'1':'0')
              +(noms.length?'&names='+encodeURIComponent(noms.join(',')):'');
      const r=await H.fmPost('/api/features/server/deploy-all'+qs);
      if(r.validating){ H.toast(r.message||'validated for prod, the install starts once the promotion lands','info',{duration:12000}); return; }
      if((r.server_record_notes||[]).length)H.toast('server S_ records NOT added: '+r.server_record_notes.join('; ')+' (Install S_ items on the feature shows the details)','error',{duration:20000});
      if(r.restart_needed){ H.toast(r.message||'nothing to install — Restart the stack to apply the pending feature(s)','warn',{duration:9000}); return; }
      if(r.restart_only){ H.toast(r.message||'nothing to install, restarting the stack','info',{duration:9000});
        fmWatchNativeLog(r.feature||'__all__','Install all server-side — nothing to install, restarting the stack ('
          +(r.pending_restart||[]).length+' pending)'); return; }
      const sk=(r.skipped||[]).length;
      if((r.server_records||[]).length)H.toast('server S_ records added for '+r.server_records.join(', ')+' (applied by the restart)','ok',{duration:9000});
      if(sk)H.toast(''+sk+' feature(s) already up to date — skipped','info');
      if(!r.restart)H.toast('deployed WITHOUT restart — the servers still run their previous code','warn',{duration:9000});
      fmWatchNativeLog(r.feature||'__all__','Install all server-side — '+(r.count||0)+' to deploy'
        +(sk?', '+sk+' up to date':'')+(r.restart?'' : ' · no restart'));
    }catch(e){ H.toast(H.errMessage(e),'error'); }
    finally{ sb.disabled=false; sb.style.cursor=''; sb.innerHTML=oldLbl; }
}
// ── 🩺 DOCTEUR : ce que le manifeste ne verifie PAS ───────────────────────────────────────────────
// Ne dit PAS « installe » (le manifeste s'en charge) mais « est-ce que ca MARCHE en jeu ? » : le
// layout livre est-il celui que le client charge, les widgets du code existent-ils, le DLL qui a
// tourne porte-t-il la version de la source, les records data sont-ils dans le pkg. C'est ce qui
// manquait quand voice_chat et effect_filter etaient verts avec 0 widget en jeu (audit 2026-08-01).
const _DOC_ICON={fail:'✗',warn:'<img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /studio/icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true">',ok:'✓',na:'–'};
const _DOC_COL ={fail:'#d9242f',warn:'#b8860b',ok:'#2ea043',na:'#8a8175'};
export async function fmRenderDoctor(name){
  const box=H.$('#fm-doctor'); if(!box)return;
  box.innerHTML='<div class="esub" style="opacity:.55;padding:4px 0"><img src="/studio/icons/icons/24/ini_doctor.png" srcset="/studio/icons/icons/24/ini_doctor.png 1x, /studio/icons/icons/48/ini_doctor.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> running health checks…</div>';
  let d; try{ d=await H.fmGet('/api/features/doctor/'+encodeURIComponent(name)); }
  catch(e){ box.innerHTML='<div class="esub" style="color:var(--crimson)">doctor: '+H.esc(e.message)+'</div>'; return; }
  const shown=(d.checks||[]).filter(c=>c.level!=='ok');
  /* ⛔ TOUT CECI ETAIT UN PANNEAU. Un encadre vert « Health checks passed » quand tout va
     bien — donc du bruit permanent pour dire qu'il n'y a rien a dire — et un encadre ambre
     avec, pour chaque controle, son titre, son detail, ses preuves et son remede. Sur une
     feature qui partage un layout, ca faisait dix lignes qui repetaient ce que le panneau
     des conflits venait deja d'annoncer, juste au-dessus.
     Desormais : RIEN quand tout passe (le silence EST le resultat), une pastille sinon.
     Le detail entier — detail, preuves, remede — vit dans son infobulle. */
  if(!shown.length){ box.innerHTML=''; return; }
  const lignes=[];
  lignes.push(d.fail?(d.fail+' problem(s)'+(d.warn?' + '+d.warn+' warning(s)':'')):(d.warn+' warning(s)'));
  lignes.push('Beyond "installed": does it actually work in game?','');
  for(const c of shown){
    lignes.push((c.level==='fail'?'✗ ':'⚠ ')+c.title);
    if(c.detail)  lignes.push('   '+c.detail);
    if(c.evidence)lignes.push('   '+c.evidence);
    if(c.fix)     lignes.push('   → '+c.fix);
    lignes.push('');
  }
  const n=(d.fail||0)+(d.warn||0);
  box.innerHTML=fmChip(d.fail?'fail':'warn', n+' health check'+(n>1?'s':''), lignes);
}
