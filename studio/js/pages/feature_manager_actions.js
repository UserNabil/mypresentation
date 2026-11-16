/* ============================================================================
   FEATURE MANAGER — cablages du detail : boutons d action, votes/commentaires
   de test, et le mode « testeur » (role GS/CM).

   Pieges consignes ici :
   - `root` peut etre le detail ENTIER ou UNE SEULE carte re-swappee : chaque
     handler doit donc prendre le nom de la feature dans `d.name` (chaque carte
     connait la sienne), jamais dans une variable de page.
   - Toutes les actions font une mise a jour CIBLEE (carte client OU serveur) et
     non un fmSelect complet : on reste ou l on est, sans rechargement.
   - Le rafraichissement apres Repack ne vient PAS d ici mais de barRepack()
     elle-meme (afterRepackRefresh dans index.html) : il couvre ainsi AUSSI la
     barre d actions et l auto-repack.
   - fmApplyRoleMode est IDEMPOTENT et doit rester appelable apres n importe
     quel rendu. Il strippe les controles GM/SA mais garde la checklist et
     l installation dans le client LOCAL du testeur (« Deploy DLL » = simple
     copie chez soi, donc PAS reserve aux managers).
   - Recliquer son propre vote le RETIRE (toggle -> vote=0).
   ============================================================================ */
import { H, fm } from './feature_manager_state.js';
import { openDllBuild } from './dll_build_modal.js';
import { openRecordsPreview } from './records_preview.js';
import { fmRenderDetail, fmSwapParts } from './feature_manager_detail.js';
import { fmDeployNative, fmRenderDoctor, fmImgFull, fmOverlapGate, fmShowShared } from './feature_manager_ops.js';
import { fmRenderBoEnv } from './feature_manager_boenv.js';
import { fmRenderMsgFb } from './feature_manager_msgfb.js';
import { fmRenderCrier } from './feature_manager_crier.js';
import { fmShowPullResult } from './feature_manager_dll.js';
import { fmTouchedBy } from './feature_manager_filters.js';
import { openFeatures, fmRefreshClientOnly, fmRefreshServerOnly,
         fmPackedReady, fmAutoRepackIfStaged, fmPaintRowFromList } from './feature_manager.js';

export function fmWireReadiness(main, name){
  const re=async(p,b)=>{ try{ const r=await H.fmPost(p,Object.assign({name},b)); const f=(fm().list&&fm().list.features||[]).find(x=>x.name===name); if(f){ f.readiness={ready:r.ready,defined:r.defined,done:r.done,total:r.total,by:fmTouchedBy(r)}; fmPaintRowFromList(f); } if(fm().sel!==name||!fm().detail||fm().detail.name!==name) return; fm().detail.readiness=r; fmSwapParts(fm().detail, ['fm-tests','fm-hero','fm-tabs','fm-ov-facts','fm-side-ready']); }
                        catch(e){ H.toast(H.errMessage(e),'error'); } };
  // VOTE ↑/↓ : recliquer son propre vote le RETIRE (toggle → vote=0).
  main.querySelectorAll('[data-fmvote]').forEach(b=>b.onclick=()=>{
    const already=b.classList.contains('on'); const v=already?0:(+b.dataset.v);
    re('/api/features/tests/vote',{index:+b.dataset.fmvote,vote:v});
  });
  const va=main.querySelector('#fmt-voteall');
  if(va) va.onclick=()=>{ va.disabled=true; re('/api/features/tests/vote-all',{}); };
  // COMMENTAIRE : envoyer (texte + image optionnelle). L'image en attente est stockée par test dans _pendImg.
  const _pendImg={};   // {idx: url}
  const showPrev=(idx)=>{ const el=main.querySelector('[data-fmcprev="'+idx+'"]'); if(!el)return;
    el.innerHTML=_pendImg[idx]?`<img src="${_pendImg[idx]}" class="fm-cprev-t"><button class="fm-cprev-x" title="remove">✕</button>`:'';
    const x=el.querySelector('.fm-cprev-x'); if(x)x.onclick=()=>{ delete _pendImg[idx]; showPrev(idx); }; };
  const uploadImg=async(idx,file)=>{
    if(!file||!file.type.startsWith('image/')){ H.toast('only images can be attached','warn'); return; }
    if(file.size>5*1024*1024){ H.toast('image too large (max 5 MB)','warn'); return; }
    const fd=new FormData(); fd.append('file',file);
    const el=main.querySelector('[data-fmcprev="'+idx+'"]'); if(el)el.innerHTML='<span class="esub">uploading…</span>';
    try{ const r=await fetch('/api/features/tests/comment/image',{method:'POST',body:fd}); const j=await r.json();
      if(r.ok&&j.url){ _pendImg[idx]=j.url; showPrev(idx); } else { H.toast('upload failed: '+(j.detail||''),'error'); showPrev(idx); }
    }catch(e){ H.toast('upload failed','error'); showPrev(idx); }
  };
  const sendCmt=(idx,inp)=>{ const v=(inp.value||'').trim(); const img=_pendImg[idx]||''; if(!v&&!img)return;
    inp.value=''; delete _pendImg[idx]; showPrev(idx); re('/api/features/tests/comment',{index:idx,body:v,image:img}); };
  main.querySelectorAll('[data-fmcsend]').forEach(b=>b.onclick=()=>{ const idx=+b.dataset.fmcsend; const inp=main.querySelector('[data-fmcadd="'+idx+'"]'); if(inp)sendCmt(idx,inp); });
  main.querySelectorAll('[data-fmcadd]').forEach(inp=>{
    const idx=+inp.dataset.fmcadd;
    inp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); sendCmt(idx,inp); } };
    // COLLER une image directement dans l'input (Ctrl+V d'une capture)
    inp.onpaste=(e)=>{ const it=[...(e.clipboardData&&e.clipboardData.items||[])].find(x=>x.type.startsWith('image/'));
      if(it){ e.preventDefault(); uploadImg(idx, it.getAsFile()); } };
  });
  // bouton 📎 : ouvrir un sélecteur de fichier
  main.querySelectorAll('[data-fmcimg]').forEach(b=>b.onclick=()=>{ const idx=+b.dataset.fmcimg;
    const fi=document.createElement('input'); fi.type='file'; fi.accept='image/*';
    fi.onchange=()=>{ if(fi.files[0]) uploadImg(idx, fi.files[0]); }; fi.click(); });
  main.querySelectorAll('[data-fmimgfull]').forEach(im=>im.onclick=()=>fmImgFull(im.dataset.fmimgfull));
  main.querySelectorAll('[data-fmcdel]').forEach(b=>b.onclick=()=>re('/api/features/tests/comment/delete',{comment_id:+b.dataset.fmcdel}));
  main.querySelectorAll('[data-fmtdel]').forEach(b=>b.onclick=()=>re('/api/features/tests/remove',{index:+b.dataset.fmtdel}));
  const inp=H.$('#fmt-in'), add=H.$('#fmt-add');
  const doAdd=()=>{ const v=(inp.value||'').trim(); if(!v)return; inp.value=''; re('/api/features/tests/add',{item:v}); };
  if(add)add.onclick=doAdd;
  if(inp)inp.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); doAdd(); } };
}
// Câble les handlers des boutons d'action du détail, dans `root` (le détail entier OU une seule carte
// re-swappée). Toutes les actions font une MISE À JOUR CIBLÉE (carte client OU serveur) et NON un
// fmSelect complet → on reste où on est, pas de rechargement de toute la feature. Le nom de la feature
// vient de `d.name` (chaque carte connaît sa feature). setBusy() met un loader sur le bouton cliqué.
export function fmWireDetailButtons(root, d){
  // le docteur se peuple en arriere-plan (3 s max) : la carte s'affiche sans l'attendre
  if(d&&d.name&&root.querySelector('#fm-doctor')) fmRenderDoctor(d.name);
  root.querySelectorAll('[data-fmboenv]').forEach(el=>fmRenderBoEnv(el));
  root.querySelectorAll('[data-fmmsgfb]').forEach(el=>fmRenderMsgFb(el));
  root.querySelectorAll('[data-fmcrier]').forEach(el=>fmRenderCrier(el));
  const nm0=(d&&d.name)||fm().sel;
  const setBusy=(b,on)=>{ if(!b)return; if(on){ b._html=b.innerHTML; b.disabled=true; b.innerHTML='<span class="fmspin"></span> '+(b.textContent||'').trim(); } else { b.disabled=false; if(b._html!=null)b.innerHTML=b._html; } };
  const ps=root.querySelector('#fmprev-save'); if(ps)ps.onclick=async()=>{ const raw=(root.querySelector('#fmprev-in')||{}).value||''; const entered=raw.split(/[\r\n,]+/).map(x=>x.trim()).filter(x=>/^(https?:|data:)/i.test(x)); setBusy(ps,true); try{ const r=await H.fmPost('/api/features/preview',{name:nm0,urls:raw}); fm()._pv=0; if(fm().detail&&fm().detail.name===nm0){ fm().detail.preview=r.urls; fmSwapParts(fm().detail, ['fm-side-prev','fm-hero']); } const dropped=entered.length-(r.urls||[]).length; H.toast(''+ (r.urls||[]).length +' preview(s) saved'+(dropped>0?' ('+dropped+' duplicate(s) skipped)':''),'ok'); }catch(e){ H.toast(H.errMessage(e),'error'); }finally{ setBusy(ps,false); } };
  root.querySelectorAll('[data-fmnative]').forEach(b=>b.onclick=()=>fmDeployNative(b.dataset.fmnative,b.dataset.fmscript));
  root.querySelectorAll('[data-fmimprun]').forEach(b=>b.onclick=async()=>{
    const act=b.dataset.fmimprun, nm=b.dataset.fmimpname, env=String((fm().list||{}).env||'').toLowerCase();
    if(env==='prod'&&!await H.fmConfirm('Run on PROD',`Run the <b>${act==='dryrun'?'dry-run':'test'}</b> command of <b>${H.esc(nm)}</b> on the <b>PROD</b> server?`,'Run')) return;
    return H.runBusy(b,async()=>{ try{ const r=await H.fmPost('/api/features/import/run',{name:nm,action:act});
      H.showThemedDialog((act==='dryrun'?'Dry run':'Test')+' — '+nm+(r.ok?' — OK':' — FAILED'),`<div class="esub">base: ${H.esc(r.base||'')}</div><pre style="max-height:420px;overflow:auto;font-size:11px;white-space:pre-wrap;background:rgba(0,0,0,.05);padding:8px;border-radius:6px">${H.esc(r.output||'')}</pre>`);
      if(act==='status') await fmRefreshServerOnly(nm);
    }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  // « Pull latest features » depuis la carte serveur (arbre de features incomplet → pas d'entrée de deploy)
  root.querySelectorAll('[data-fmgitpull]').forEach(b=>b.onclick=async()=>{ return H.runBusy(b,async()=>{ H.toast('pulling latest features…','ok'); try{ const r=await H.fmPost('/api/features/git/pull'); fmShowPullResult(r); if(r.ok)await openFeatures(); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  root.querySelectorAll('[data-fmnativerevert]').forEach(b=>b.onclick=async()=>{ const nm=b.dataset.fmnativerevert; if(!await H.fmConfirm('Revert server patch','Run <b>'+H.esc(b.dataset.fmscript)+' revert</b> on <b>'+H.esc((fm().list||{}).env||'env')+'</b> (restore the binary backups)?','Revert'))return; fmDeployNative(nm,b.dataset.fmscript,'revert'); });
  root.querySelectorAll('[data-fmmpkill]').forEach(b=>b.onclick=async()=>{ const nm=b.dataset.fmmpkill, off=b.dataset.fmmpoff==='1', shipped=b.dataset.fmmpshipped==='1', env=H.esc((fm().list||{}).env||'env');
    if(!await H.fmConfirm(off?'Kill switch':'Enable again',off?('Disable <b>'+H.esc(nm)+'</b> on <b>'+env+'</b>? Its servers skip it from their next start (restart the whole stack to apply). No binary is touched and the manifest stays installed.'):(shipped?('Enable <b>'+H.esc(nm)+'</b> on <b>'+env+'</b>? Its delivered manifest ships <code>enabled: false</code>: it is turned on for these exact bytes (a later manifest with other bytes stays off until Enable). Applied at the next start of its servers.'):('Enable <b>'+H.esc(nm)+'</b> again on <b>'+env+'</b>? It is applied at the next start of its servers.')),off?'Disable':'Enable'))return;
    return H.runBusy(b,async()=>{ try{ const r=await H.fmPost('/api/features/server/mempatch/kill',{feature:nm,disable:off,reason:off?'disabled from Reforged Studio':''}); H.toast(r.message||'done','ok'); await fmRefreshServerOnly(nm, true); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  root.querySelectorAll('[data-fmsrvdata]').forEach(b=>b.onclick=async()=>{ return H.runBusy(b,async()=>{ try{ const r=await H.fmPost('/api/features/server/install-data',{name:b.dataset.fmsrvdata}); const msg=r.installed.length?('✔ added '+r.installed.length+' S_ item(s) — restart the server'):((r.deploy_only)?('🚀 '+r.deploy_only+' — use Deploy above'):((r.missing_source||[]).length?'⚠ feature ships no server record for: '+r.missing_source.join(', '):(r.errors&&r.errors.length?r.errors[0]:(r.note||'nothing to add')))); H.toast(msg, r.installed.length?'ok':'warn'); await fmRefreshServerOnly(b.dataset.fmsrvdata); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  root.querySelectorAll('[data-fmsrvrestart]').forEach(b=>b.onclick=async()=>{ if(!await H.fmConfirm('↻ Restart the game servers','Restart the server stack on <b>'+H.esc((fm().list||{}).env||'the active env')+'</b> (safe restart) to load the data?','Restart'))return; return H.runBusy(b,async()=>{ H.toast('restarting the server…','ok'); try{ const r=await H.fmPost('/api/features/server/restart'); H.showThemedDialog(r.ok?'✔ Server restarted':'✖ Restart issue','<div class="esub">'+H.esc(r.message||'')+'</div>'); await fmRefreshServerOnly(nm0); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  root.querySelectorAll('[data-fmon],[data-fmoff]').forEach(b=>b.onclick=async()=>{ const on=!!b.dataset.fmon,nm=b.dataset.fmon||b.dataset.fmoff; return H.runBusy(b,async()=>{ try{ await H.fmPost('/api/features/client/toggle',{name:nm,enable:on}); H.toast(''+nm+(on?' enabled':' disabled')+' — restart the game to apply','ok'); await fmRefreshClientOnly(nm); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  root.querySelectorAll('[data-fmreverify]').forEach(b=>b.onclick=async()=>{ const scope=b.dataset.fmscope||'client'; setBusy(b,true); try{ if(scope==='server') await fmRefreshServerOnly(nm0, true); else await fmRefreshClientOnly(nm0); }catch(_){}finally{ setBusy(b,false); } });
  root.querySelectorAll('[data-fmreinstall]').forEach(b=>b.onclick=async()=>{ return H.runBusy(b,async()=>{ try{ const nmr=b.dataset.fmreinstall; let r=await H.fmPost('/api/features/client/reinstall',{name:nmr}); r=await fmOverlapGate(r,()=>H.fmPost('/api/features/client/reinstall',{name:nmr,force:true})); fmShowShared(r); const staged=(r.copied||[]).length>0; H.toast(staged?('✔ reinstalled '+r.copied.length+' file(s)'+(fmPackedReady()?'':' — repack game_unpacked to apply')):(r.note||'nothing to copy'),'ok'); await fmRefreshClientOnly(b.dataset.fmreinstall); await fmAutoRepackIfStaged(staged); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  root.querySelectorAll('[data-fminstalldata]').forEach(b=>b.onclick=async()=>{ return H.runBusy(b,async()=>{ try{ const nmd=b.dataset.fminstalldata; let r=await H.fmPost('/api/features/client/install-data',{name:nmd}); r=await fmOverlapGate(r,()=>H.fmPost('/api/features/client/install-data',{name:nmd,force:true})); fmShowShared(r); const nAdd=(r.installed||[]).length, nRep=(r.replaced||[]).length, nRes=(r.restored||[]).length; const staged=(nAdd||nRep||nRes)>0; const parts=[]; if(nAdd)parts.push('added '+nAdd); if(nRep)parts.push('fixed '+nRep+' wrong'); if(nRes)parts.push('put back '+nRes+' native'); const msg=parts.length?('✔ '+parts.join(', ')+' record(s)'+(fmPackedReady()?'':' — 📦 repack game_unpacked to apply')):((r.missing_source||[]).length?'⚠ feature ships no record for: '+r.missing_source.join(', '):(r.errors&&r.errors.length?r.errors[0]:'nothing to do')); H.toast(msg, staged?'ok':'err'); await fmRefreshClientOnly(b.dataset.fminstalldata); await fmAutoRepackIfStaged(staged); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  // « Copy DLL » = chez soi, « Deploy DLL » = vers le CDN (les joueurs). Deux gestes separes :
  // on teste en local, on publie quand c'est valide.
  // Un deploiement ECRASE les fichiers en place : sans trace de l'etat precedent, un asset remplace
  // par erreur est perdu. On archive le manifeste publie (chemin + taille + hash de chaque fichier).
  // Le client publie est DEBALLE : « Repack » injecte dans le pkg LOCAL, ceci met les assets EN LIGNE.
  // Deux gestes complementaires, d'ou les deux boutons cote a cote.
  // Quand le deploiement SSH echoue (lien coupe, droits, serveur derriere un rebond), le dev n'avait
  // aucune porte de sortie : il devait reconstituer les commandes en lisant le code des patchers. Le
  // script est genere a partir des MEMES patchers que le deploiement automatique, sauvegarde comprise.
  // Apercu des records : ce que « installe » ne dit pas — combien de champs, et si le compte
  // correspond a ce que le fichier declare.
  root.querySelectorAll('[data-fmrecords]').forEach(b=>b.onclick=async()=>{
    try{ await openRecordsPreview({esc:H.esc,toast:H.toast,errMessage:H.errMessage}, b.dataset.fmrecords); }
    catch(e){ H.toast('preview failed: '+H.errMessage(e),'error'); }
  });
  root.querySelectorAll('[data-fmsrvscript]').forEach(b=>b.onclick=async()=>{
    setBusy(b,true);
    try{
      const r=await(await fetch('/api/features/server/manual-script?name='
        +encodeURIComponent(b.dataset.fmsrvscript))).json();
      await navigator.clipboard.writeText(r.script||'');
      H.toast('✓ install script copied — paste it in the server terminal '
        +'(stop the game servers first)','ok',{duration:9000});
    }catch(e){ H.toast('could not build the script: '+H.esc(e.message||e),'error',{sticky:true}); }
    setBusy(b,false);
  });
  root.querySelectorAll('[data-fmpubassets]').forEach(b=>b.onclick=async()=>{
    const rfg=!!(d&&d.client&&d.client.rfg_client);
    if(rfg){
      if(!await H.fmConfirm('Hand-off zip (RFG)','Your game uses RFG archives (client 8.x): its CDN belongs to the RFG team and nothing is uploaded.<br>'
        +'Repack your game, then zip the client files of <b>'+H.esc(nm0)+'</b> (UIData/..., data/db/...) for the RFG team?','Build the zip'))return;
      setBusy(b,true);
      try{ const r=await H.fmPost('/api/features/client/publish-assets',{name:nm0});
        H.toast((r.ok?'✓ ':'')+(r.handoff_files||[]).length+' file(s) zipped for the RFG team: '+H.esc(r.handoff||'')
          +((r.not_in_pkg||[]).length?' · '+r.not_in_pkg.length+' not in your game yet (see the console)':'')
          +' · nothing uploaded',(r.not_in_pkg||[]).length?'warn':'ok',{sticky:true});
        if((r.not_in_pkg||[]).length)console.warn('[hand-off]',{not_in_game:r.not_in_pkg,repacked:r.repacked});
      }catch(e){ H.toast('hand-off failed: '+H.errMessage(e),'error',{sticky:true}); }
      setBusy(b,false);
      return;
    }
    if(!await H.fmConfirm('⚠ Publish assets','Upload <b>'+H.esc(nm0)+'</b> assets to the CDN of '
      +'<b>'+H.esc((fm().list||{}).env||'current')+'</b>?<br>Players read them on their next launch.',
      'Publish'))return;
    setBusy(b,true);
    // Le transfert dure plusieurs minutes (plusieurs Go) : sans avancement, le bouton semble
    // « tourner en boucle ». On sonde l'etat cote serveur pendant l'envoi.
    let _pt=setInterval(async()=>{ try{
      const p=await(await fetch('/api/features/client/publish-progress')).json();
      if(p&&p.running&&p.total)b.textContent='Deploying '+p.done+'/'+p.total+'…';
    }catch(_){ } },1500);
    try{ const r=await H.fmPost('/api/features/client/publish-assets',{name:nm0});
      // On ne dit « publie » que si la VERIFICATION en ligne le confirme, et que le pkg contient
      // bien les assets. Annoncer un succes non verifie, c'est ce qui a laisse passer les 3 layouts
      // d'auto_altar : publies en apparence, absents en pratique.
      const bad=(r.mismatched||[]).length, nopkg=(r.not_in_pkg||[]).length;
      if(bad||nopkg){
        H.toast('published '+r.sent.length+' file(s), but '
          +(bad?bad+' not verified online':'')+(bad&&nopkg?' and ':'')
          +(nopkg?nopkg+' missing from the pkg (repack did not include them)':'')
          +' — open the console for the list','warn',{sticky:true});
        console.warn('[deploy]', {mismatched:r.mismatched, not_in_pkg:r.not_in_pkg});
      }else{
        H.toast('✓ '+r.sent.length+' file(s) published and verified on '+H.esc(r.env)
          +((r.unchanged||[]).length?(' · '+r.unchanged.length+' already up to date'):'')
          ,'ok',{duration:8000});
      }
    }catch(e){ H.toast('publish failed: '+H.errMessage(e),'error',{sticky:true}); }
    clearInterval(_pt); b.textContent='Deploy to CDN';
    setBusy(b,false);
  });
  const snp=H.$('#fm-snap-assets');
  if(snp)snp.onclick=async()=>{
    setBusy(snp,true);
    try{ const r=await H.fmPost('/api/client-deploy/snapshot',{label:'manual'});
      H.toast('snapshot saved · '+H.esc(r.files)+' file(s) recorded · '+H.esc(r.key),'ok',{duration:8000});
    }catch(e){ H.toast('snapshot failed: '+H.esc(e.message),'error',{sticky:true}); }
    setBusy(snp,false);
  };
  // « Deploy DLL » n'envoie plus un binaire pris tel quel : il OUVRE le choix de ce qu'il contient,
  // construit, puis publie. On voit donc ce qu'on livre avant de le livrer — c'est ce qui manquait
  // quand un build « emoji seulement » a failli partir en prod a la place du build complet.
  const pub=H.$('#fm-publish-dll');
  if(pub)pub.onclick=async()=>{
    setBusy(pub,true);
    try{
      await openDllBuild({$:H.$,esc:H.esc,toast:H.toast,fmConfirm:H.fmConfirm,
                          fmPost:H.fmPost,errMessage:H.errMessage});
    }catch(e){ H.toast('cannot open the build panel: '+H.errMessage(e),'error',{sticky:true}); }
    setBusy(pub,false);
  };
  root.querySelectorAll('[data-fmcleanloose]').forEach(b=>b.onclick=async()=>{ return H.runBusy(b,async()=>{ try{ const r=await H.fmPost('/api/features/client/clean-loose',{name:b.dataset.fmcleanloose}); H.toast(r.removed.length?('removed '+r.removed.length+' loose shadow(s) — game now reads the pkg (launch via game_.exe)'):(r.note||'nothing to clean'), r.removed.length?'ok':'err'); await fmRefreshClientOnly(b.dataset.fmcleanloose); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  root.querySelectorAll('[data-fmbinpatch]').forEach(b=>b.onclick=async()=>{ const act=b.dataset.fmact||'deploy'; return H.runBusy(b,async()=>{ try{ const r=await H.fmPost('/api/features/client/binpatch',{name:b.dataset.fmbinpatch,action:act}); if(r.ok){ H.toast('game_.exe '+(act==='revert'?'reverted':'patched')+' — relaunch via game_.exe (NOT Launcher.exe)','ok'); } else { H.toast(r.error||(r.running?'close the game first (exe locked)':'patch failed'),'error'); } await fmRefreshClientOnly(b.dataset.fmbinpatch); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  // RUNTIME PAYLOAD (chat_translator: proxy DLL + overlay + offline model, ~950 MB). Install is a
  // BACKGROUND job on the back-end — a request could never carry it — so the click starts the job and
  // fmPollPayload drives the progress bar until it ends. Refreshing the card only at the END keeps the
  // targeted-refresh rule (a card that re-renders mid-download would kill its own progress bar).
  root.querySelectorAll('[data-fmpayload]').forEach(b=>b.onclick=async()=>{
    const name=b.dataset.fmpayload, act=b.dataset.fmact||'install';
    if(act==='revert'&&!await H.fmConfirm('Remove runtime','Remove the installed runtime of <b>'+H.esc(name)+'</b> from your client?<br>The DLL that was there before is restored from its backup.','Remove'))return;
    return H.runBusy(b,async()=>{
      try{
        const r=await H.fmPost('/api/features/client/payload',{name,action:act});
        if(!r.ok){ H.toast(r.error||(r.running?'close the game first (the DLL is locked)':'failed'),'error',{sticky:true}); return; }
        if(act==='revert'){ H.toast('runtime removed ('+(r.removed||0)+' file(s), '+(r.restored||0)+' restored)','ok'); await fmRefreshClientOnly(name); return; }
        H.toast(r.source==='local'?'installing from the local folder…':'downloading the runtime from the CDN…','ok');
        fmPollPayload(name);
      }catch(e){ H.toast(H.httpErr(e),'error'); }
    });
  });
  root.querySelectorAll('[data-fmplverify]').forEach(b=>b.onclick=async()=>{
    const name=b.dataset.fmplverify;
    return H.runBusy(b,async()=>{
      try{
        H.toast('re-hashing every installed file — this takes a while on a gigabyte…','info');
        const st=await H.fmGet('/api/features/client/payload/status?name='+encodeURIComponent(name)+'&verify=1');
        H.toast(st.applied?('bytes verified: '+st.files+' file(s) match the manifest'):
                ((st.missing||0)+' missing, '+(st.stale||0)+' corrupted/out of date — re-install to fix'),
                st.applied?'ok':'error');
        await fmRefreshClientOnly(name);
      }catch(e){ H.toast(H.httpErr(e),'error'); }
    });
  });
  // `await` + bouton occupé : seul handler de la carte qui n'en avait pas (tous ses voisins en ont).
  // Sans lui, rien n'empêchait de recliquer pendant le repack. Le rafraîchissement de la carte, lui,
  // vient de H.barRepack() elle-même (afterRepackRefresh) — donc il couvre AUSSI la barre et l'auto-repack.
  root.querySelectorAll('[data-fmrepack]').forEach(b=>b.onclick=async()=>{
    if(H.isRepacking()){H.toast('repack already running…','info');return;}
    if(typeof H.barRepack!=='function'){H.toast('repack unavailable','error');return;}
    try{ b.disabled=true; await H.barRepack(); }finally{ try{ b.disabled=false; }catch(_){} }
  });
  root.querySelectorAll('[data-fmclean]').forEach(b=>b.onclick=async()=>{ const comp=b.dataset.fmclean; if(!await H.fmConfirm('⚙ Clean install','CLEAN install <b>'+H.esc(comp)+'</b> on <b>'+H.esc((fm().list||{}).env||'')+'</b>?<br>This STOPS the game servers, patches, then restarts them.','Stop, patch &amp; restart'))return; return H.runBusy(b,async()=>{ H.toast('clean install: stop → patch → restart…','ok'); try{ const r=await H.fmPost('/api/features/server/clean-install',{component:comp}); const rep=(r.steps||[]).map(st=>(st.ok?'✔ ':'✖ ')+st.step).join('  '); H.showThemedDialog((r.ok?'✔ ':'✖ ')+comp+' — clean install','<div class="esub">'+rep+'</div>'+(r.steps||[]).map(st=>'<div style="margin-top:6px"><b>'+st.step+'</b><pre style="max-height:160px;overflow:auto;font-size:10px;white-space:pre-wrap">'+H.esc(st.out||'')+'</pre></div>').join('')); await fmRefreshServerOnly(nm0); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  root.querySelectorAll('[data-fmsrv]').forEach(b=>b.onclick=async()=>{ const comp=b.dataset.fmsrv,act=b.dataset.fmact; if(act==='uninstall'&&!await H.fmConfirm('Uninstall','Uninstall <b>'+H.esc(comp)+'</b> on <b>'+H.esc((fm().list||{}).env||'')+'</b>?','Uninstall'))return; return H.runBusy(b,async()=>{ try{ const r=await H.fmPost('/api/features/server/action',{component:comp,action:act}); if(act!=='status')H.showThemedDialog((r.ok?'✔ ':'✖ ')+comp+' — '+act,'<pre style="max-height:380px;overflow:auto;font-size:11px;white-space:pre-wrap">'+H.esc(r.output||'')+'</pre>'); await fmRefreshServerOnly(nm0); }catch(e){ H.toast(H.httpErr(e),'error'); } }); });
  fmApplyRoleMode(root);
  // An install started in a previous render (page re-opened, card re-swapped) is still running on the
  // back-end: pick its progress bar back up instead of showing a frozen card.
  const plc=root.querySelector('[data-fmplcard]');
  if(plc)fmPollPayload(plc.dataset.fmplcard,{resumeOnly:true});
}

/* Progress of a runtime-payload install. Polls the job state and paints the bar in place; the card
   itself is only re-rendered once the job is over. `resumeOnly` = attach to a job already running,
   and stay silent if there is none (called on every render). */
let _plPoll=null;
export function fmPollPayload(name,opts){
  const resumeOnly=!!(opts&&opts.resumeOnly);
  if(_plPoll){ clearInterval(_plPoll); _plPoll=null; }
  const bar=document.getElementById('fm-pl-prog'), log=document.getElementById('fm-pl-log');
  if(!bar)return;
  const paint=(j)=>{
    const pct=Math.max(0,Math.min(100,j.pct||0));
    bar.style.display='';
    const i=bar.querySelector('i'); if(i)i.style.width=pct+'%';
    const t=bar.querySelector('.pkgpct');
    const mb=v=>Math.round((v||0)/1048576)+' MB';
    if(t)t.textContent=pct+'%  '+(j.phase||'')+(j.files_todo?('  '+(j.files_done||0)+'/'+j.files_todo+' files'):'')
                        +(j.total_bytes?('  '+mb(j.done_bytes)+' / '+mb(j.total_bytes)):'');
    if(log&&(j.log||[]).length){ log.style.display=''; log.textContent=(j.log||[]).slice(-6).join('\n'); }
  };
  let first=true;
  const tick=async()=>{
    try{
      const st=await H.fmGet('/api/features/client/payload/status?name='+encodeURIComponent(name));
      const j=st.job;
      if(!j||(!j.running&&first)){ if(resumeOnly){ clearInterval(_plPoll); _plPoll=null; } return; }
      first=false;
      paint(j);
      if(!j.running){
        clearInterval(_plPoll); _plPoll=null;
        H.toast(j.ok?'runtime installed — launch the game via game_.exe':(j.error||'install failed'),
                j.ok?'ok':'error',{sticky:!j.ok});
        await fmRefreshClientOnly(name);
      }
    }catch(e){ clearInterval(_plPoll); _plPoll=null; H.toast(H.httpErr(e),'error'); }
  };
  _plPoll=setInterval(tick,1200);
  tick();
}
// Feature Manager role mode — a non-manager (GS/CM tester) may READ the list + tick the test
// checklist, but sees NO management control. Remove every action button/editor from the rendered
// detail so nothing is even clickable (the server also enforces 403). The readiness checklist and its
// checkboxes are left intact (ticking a test is GS+). Idempotent, safe to call after any render.
export function fmApplyRoleMode(root){
  if(H.can('features.manage'))return;                 // GM/SA: full controls, nothing to strip
  const scope=root||document;
  // A TESTER (GS/CM) MAY install a feature's assets into THEIR OWN client + repack, so they can test
  // in-game — those controls stay. What they may NOT do (GM only): SERVER deploy/uninstall/restart,
  // client BINARY patch, enable/disable a DLL feature, and DEFINING the test plan.
  // « Deploy DLL » N'EST PAS manager-only : c'est une simple COPIE du d3d9.dll dans le répertoire client
  // LOCAL du testeur (comme Pack/Depack), donc accessible à TOUT LE MONDE (GS+). On ne le strippe plus.
  // So strip only the manager-only controls; keep install-data / reinstall / clean-loose / repack / deploy-dll.
  const canInstall=H.can('client.install');            // GS+ (true for every logged-in staff role here)
  const STRIP=['[data-fmnative]','[data-fmnativerevert]','[data-fmmpkill]','[data-fmsrvdata]','[data-fmsrvrestart]',
    '[data-fmon]','[data-fmoff]','[data-fmbinpatch]','[data-fmclean]','[data-fmsrv]',
    '#fmprev-save','[data-fmtdel]','.fm-ractrow'];
  if(!canInstall)                                     // (defensive) if somehow not allowed, strip these too
    STRIP.push('[data-fmreinstall]','[data-fminstalldata]','[data-fmcleanloose]','[data-fmrepack]',
               '[data-fmpayload]','[data-fmplverify]');
  scope.querySelectorAll(STRIP.join(',')).forEach(el=>{
    (el.closest('.fm-prevedit-wrap')||el).remove();
  });
  // once, add a small "tester" note at the top of the detail pane
  const det=scope.querySelector('.fm-detail');
  if(det&&!det.querySelector('.fm-testernote')){
    const n=document.createElement('div');
    n.className='fm-testernote esub';
    n.style.cssText='margin:2px 0 10px;padding:6px 10px;border:1px solid var(--edge);border-radius:6px;background:rgba(122,92,30,.06)';
    n.innerHTML='🧪 Tester view — vote 👍/👎 on each test and leave comments, and install this feature\'s assets into YOUR client + repack to test it in-game. Server deploy / binary patch is done by a Game Master.';
    det.insertBefore(n, det.firstChild.nextSibling);
  }
}
