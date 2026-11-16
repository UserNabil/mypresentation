import { H } from './feature_manager_state.js';

const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||18}" height="${s||18}" alt="" aria-hidden="true">`;

export function fmProdCardHtml(name){
  if(!H.can('features.promote')) return '';
  return `<section class="fx-card fx-side-card" id="fm-card-prod" data-fmprodname="${H.esc(name)}">`
    +`<div class="fx-side-h">${IC('pipeline_connected',20)} <b>Environment pipeline</b></div>`
    +`<div class="fm-prod-body"><div class="fx-skel sm"><div><i></i><i></i><i></i></div></div></div></section>`;
}

const quand=v=>H.esc((v||'').replace('T',' ').replace('Z',' UTC'));

function step(label, state, sub){
  const ic={ok:'validated',warn:'status_warning',off:'unvalidated',na:'status_off'}[state]||'status_off';
  return `<div class="fx-step fx-s${state}"><span class="fx-step-dot">${IC(ic,22)}</span><b>${label}</b><small>${sub}</small></div>`;
}

function prodStateHtml(st){
  const p=st.preprod, q=st.prod;
  const pre=!p?['off','Not validated']:(!p.current?['warn','Code changed']:['ok','Validated']);
  const proOld=!!(q&&q.validated&&q.current===false);
  const pro=!q?['off','Not validated']:(q.validated?(proOld?['warn','Outdated']:['ok','Validated']):(q.baseline?['warn','Baseline']:['off','Listed']));
  const steps=step('Dev','ok','Always listed')+'<i class="fx-step-line"></i>'+step('Preprod',pre[0],pre[1])+'<i class="fx-step-line"></i>'+step('Prod',pro[0],pro[1]);
  const line=(k,s,label,txt)=>`<div class="fx-build"><span>${k}</span><span class="fx-pill fx-${s==='ok'?'ok':(s==='warn'?'warn':'na')}">${label}</span><small>${txt}</small></div>`;
  const preTxt=p?`by ${H.esc(p.validated_by||'?')} · ${quand(p.validated_at)}${p.current?'':' — revalidate after the code change'}`:'Validate from dev to show it in preprod.';
  const proTxt=q?(q.validated
      ?(proOld
        ?`<b>prod v${H.esc(q.version||'?')} · preprod v${H.esc(q.preprod_version||'?')}</b> — the code changed since this prod validation (by ${H.esc(q.validated_by||'?')} · ${quand(q.validated_at)}). Validate for prod again${p&&p.current===false?' once preprod is re-validated':''} to ship it.`
        :`v${H.esc(q.version||'?')} by ${H.esc(q.validated_by||'?')} · ${quand(q.validated_at)} — same code as preprod`)
      :(q.baseline?'Live before the branch system, ON in the prod DLL.':'Listed, not validated.')):'Validate from preprod before pushing to production.';
  let btn='';
  if(st.stage==='preprod')
    btn=`<button class="fx-btn gold" data-fmprodvalidate="1" title="Show this feature in the preprod environment (super-admin only). Any later code change hides it again until re-validated.">${IC('validated',18)} Validate for preprod</button>`;
  else if(st.stage==='prod')
    btn=`<button class="fx-btn gold" data-fmprodvalidate="1" title="Copy this feature from preprod to prod and rebuild the prod DLL with the validated features (super-admin only)">${IC('validated',18)} Validate for prod</button>`;
  if(st.unstage==='preprod'&&p)
    btn+=`<button class="fx-btn danger" data-fmprodunvalidate="1" title="Remove this feature from preprod (super-admin only)">Unvalidate</button>`;
  else if(st.unstage==='prod'&&q)
    btn+=`<button class="fx-btn danger" data-fmprodunvalidate="1" title="Remove this feature from prod; for client code the prod DLL is rebuilt without it (super-admin only)">Unvalidate</button>`;
  if(st.stage==='prod')
    btn+=`<label class="fx-toggle" title="Show what the promotion would do, without changing anything"><input type="checkbox" data-fmprodcheck="1"><i></i> Dry run</label>`;
  const runs=(st.runs||[]).slice(0,4).map(r=>r.error
    ?`<div class="fx-ev">${IC('status_warning',16)}<span>${H.esc(r.error)}</span></div>`
    :`<div class="fx-ev">${IC(r.conclusion==='success'?'status_success':(r.conclusion?'status_error':'history'),16)}<a href="${H.esc(r.url||'#')}" target="_blank" rel="noopener">${H.esc(r.title||'run')}</a><small>${H.esc((r.created_at||'').replace('T',' ').replace('Z',' UTC'))}</small></div>`).join('');
  return `<div class="fx-steps">${steps}</div>${line('Preprod',pre[0],pre[1],preTxt)}${line('Prod',pro[0],pro[1],proTxt)}`
    +(q?stabilityLine(q):'')
    +(btn?`<div class="fx-actrow">${btn}</div>`:'<p class="fx-dim">Validation happens from dev (for preprod) and from preprod (for prod).</p>')
    +(q?`<details class="fm-prodhist" data-fmprodhist="1"><summary>Prod versions &amp; rollback</summary><div class="fm-prodhist-body"><div class="fx-dim">loading…</div></div></details>`:'')
    +(runs?`<div class="fx-evh">Recent validation runs</div>${runs}`:'');
}

/* ⭐ STABLE = la version en prod a passe TOUS ses tests preprod au moment de sa promotion. Sinon elle y est
   entree sur decision SA (tests en echec, non re-votes depuis la derniere modification, ou absents) : c'est
   exactement ce qui fait partir en prod une derniere version non testee. Le dire ici, et permettre de
   revenir a une version stable, au lieu de le decouvrir par une regression en jeu. */
function stabilityLine(q){
  const rb=q.rolled_back_at?` · rolled back by ${H.esc(q.rolled_back_by||'?')} on ${quand(q.rolled_back_at)}${q.rolled_back_from&&q.rolled_back_from.version?' (was v'+H.esc(q.rolled_back_from.version)+')':''}`:'';
  if(q.stable===true) return `<div class="fx-build"><span>Stability</span><span class="fx-pill fx-ok">Stable</span><small>v${H.esc(q.version||'?')} passed its preprod tests (${H.esc(q.tests_status||'')})${rb}</small></div>`;
  if(q.stable===false) return `<div class="fx-build"><span>Stability</span><span class="fx-pill fx-warn">Untested</span><small>v${H.esc(q.version||'?')} went to prod without passing all its preprod tests: ${H.esc(q.tests_status||'?')}. Roll back to a stable version below, or get its tests voted in preprod.${rb}</small></div>`;
  return `<div class="fx-build"><span>Stability</span><span class="fx-pill fx-na">Unknown</span><small>${q.baseline?'baseline version, live before the branch system: never tested through the pipeline':'no test record for this version'}${rb}</small></div>`;
}

function historyHtml(h){
  const vs=h.versions||[];
  if(!vs.length) return '<div class="fx-dim">No earlier version of this feature on the prod branch.</div>';
  const stable=v=>v.stable===true?'<span class="fx-pill fx-ok">stable</span>':(v.stable===false?'<span class="fx-pill fx-warn">untested</span>':'<span class="fx-pill fx-na">unknown</span>');
  const lastStable=vs.find(v=>!v.current&&v.stable===true);
  const rows=vs.map(v=>`<div class="fm-prodver${v.current?' cur':''}">
      <b>v${H.esc(v.version||'?')}</b> ${stable(v)}${v.current?' <span class="fx-pill fx-na">in prod now</span>':''}${v.rolled_back?' <span class="fx-dim">(restored by a rollback)</span>':''}
      <small>${quand(v.date)} · ${H.esc(v.validated_by||'?')} · ${H.esc(v.tests_status||(v.baseline?'baseline':''))}</small>
      <small class="fx-dim">${H.esc(v.message||'')} · ${H.esc((v.commit||'').slice(0,10))}</small>
      ${v.current?'':`<button class="fx-btn${v.stable===true?' gold':''}" data-fmrollback="${H.esc(v.commit)}" data-fmrbver="${H.esc(v.version||'')}" data-fmrbstable="${v.stable===true?'1':(v.stable===false?'0':'')}">Roll back to v${H.esc(v.version||'?')}</button>`}
    </div>`).join('');
  return (lastStable?`<div class="fx-dim" style="margin-bottom:6px">Last stable version: <b>v${H.esc(lastStable.version||'?')}</b> (${quand(lastStable.date)}).</div>`
                    :'<div class="fx-dim" style="margin-bottom:6px">No earlier version passed all its preprod tests: a rollback brings back an older code, not a tested one.</div>')+rows;
}

async function loadHistory(card, name){
  const box=card.querySelector('.fm-prodhist-body'); if(!box) return;
  try{
    const h=await H.fmGet('/api/features/prod/'+encodeURIComponent(name)+'/history');
    box.innerHTML=historyHtml(h);
    box.querySelectorAll('[data-fmrollback]').forEach(b=>{ b.onclick=()=>rollback(card, name, b.dataset.fmrollback, b.dataset.fmrbver, b.dataset.fmrbstable, h.current); });
  }catch(e){ box.innerHTML=`<span style="color:#d1242f">${H.esc(H.errMessage?H.errMessage(e):e.message)}</span>`; }
}

async function rollback(card, name, commit, ver, stable, cur){
  const warn=stable==='1'?'':`<br><br>⚠️ This version did <b>not</b> pass all its preprod tests either${stable===''?' (no test record)':''}.`;
  let dry=false;
  const asked=H.fmConfirm('Roll back '+name+' in prod',
    `Put <b>${H.esc(name)} v${H.esc(ver||'?')}</b> back in production${cur&&cur.version?' instead of v'+H.esc(cur.version):''}?<br><br>`
    +'• the promote-prod run restores its folder as it was on the prod branch at commit <b>'+H.esc(commit.slice(0,10))+'</b><br>'
    +'• prod_features.json records you as the author of the rollback and the version it replaces<br>'
    +'• if it has client code, the run first checks that the prod DLL still builds (WndProc rule, registry.c/build.bat), then rebuilds it; nothing is pushed when a check fails<br>'
    +'• server side: redeploy it from the prod environment to apply the older server version'+warn
    +'<div class="fx-actrow"><label class="fx-toggle" style="margin-left:0" title="Run the checks without changing anything"><input type="checkbox" id="fmrb-dry"><i></i> Dry run</label></div>',
    'Roll back');
  const box=H.$('#fmrb-dry'), yes=H.$('#fmc-yes');
  if(box) box.onchange=()=>{ dry=box.checked; if(yes) yes.textContent=dry?'Dry run':'Roll back'; };
  if(!await asked) return;
  const label=dry?'Rollback dry run':'Rollback';
  launchRun(`${label} — ${name} → v${ver||'?'}`, '/api/features/prod/'+encodeURIComponent(name)+'/rollback'+(dry?'?dry_run=true':''), {to:commit}, label);
}

async function refresh(card, name){
  const body=card.querySelector('.fm-prod-body');
  try{
    const st=await H.fmGet('/api/features/prod/'+encodeURIComponent(name));
    body.innerHTML=prodStateHtml(st);
    wireButtons(card, name, st);
  }catch(e){
    body.innerHTML=`<span style="color:#d1242f">${H.esc(e.message)}</span>`;
  }
}

async function follow(runId, label){
  const out=H.$('#fmprod-out'), msg=H.$('#fmprod-msg'), spin=H.$('#fmprod-spin');
  for(let i=0;i<240;i++){
    await new Promise(r=>setTimeout(r,5000));
    let r; try{ r=await H.fmGet('/api/features/prod/run/'+runId); }catch(e){ continue; }
    if(out) out.textContent=(r.jobs||[]).map(j=>`${j.name}: ${j.conclusion||j.status}\n`
      +(j.steps||[]).map(s=>`   ${s.conclusion==='success'?'✔':s.conclusion==='failure'?'✖':s.status==='in_progress'?'…':'·'} ${s.name}`).join('\n')).join('\n\n');
    const pj=(r.jobs||[]).find(j=>j.name==='promote'), bj=(r.jobs||[]).find(j=>j.name==='build-dll');
    if(r.status!=='completed'&&pj&&pj.conclusion==='success'&&msg&&!follow._told){
      follow._told=runId;
      msg.innerHTML=`<b style="color:#2ea043">✔ ${H.esc(label)}: prod branch updated</b> — ${bj&&bj.status!=='completed'?'the prod DLL is building on GitHub (2-3 min), you can close this window':'finishing'} · <a href="${H.esc(r.url)}" target="_blank" rel="noopener">GitHub run</a>`;
      refreshOpenCard();
    }
    if(r.status==='completed'){
      follow._told=null;
      if(spin) spin.style.display='none';
      const ok=r.conclusion==='success';
      const dllKo=!ok&&pj&&pj.conclusion==='success'&&bj&&bj.conclusion==='failure';
      if(msg) msg.innerHTML=ok?`<b style="color:#2ea043">✔ ${H.esc(label)} done</b> — <a href="${H.esc(r.url)}" target="_blank" rel="noopener">GitHub run</a>`
                               :dllKo?`<b style="color:#2ea043">✔ prod branch updated</b> · <b style="color:#d1242f">✖ prod DLL build failed</b>: the prod branch keeps its previous DLL — <a href="${H.esc(r.url)}" target="_blank" rel="noopener">open the run log</a>`
                               :`<b style="color:#d1242f">✖ ${H.esc(r.conclusion)}</b> — <a href="${H.esc(r.url)}" target="_blank" rel="noopener">open the run log</a>`;
      H.toast(ok?`✔ ${label} done`:`✖ ${label} failed`, ok?'ok':'err');
      return ok;
    }
  }
  if(msg) msg.innerHTML='<span style="color:#b8860b">still running after 20 min — check GitHub Actions</span>';
  return false;
}

async function launchRun(title, url, body, label, after){
  H.showThemedDialog(title,
    '<div class="fmload"><span class="fmspin" id="fmprod-spin"></span> <span id="fmprod-msg">starting the promote-prod workflow…</span></div>'
    +'<pre id="fmprod-out" style="max-height:340px;overflow:auto;font-size:11px;white-space:pre-wrap;margin-top:8px;background:rgba(0,0,0,.05);padding:8px;border-radius:6px"></pre>');
  try{
    const res=await H.fmPost(url, body||{});
    if(res&&res.ok===false) throw new Error(res.error||'nothing was started');
    const run=res&&res.run;
    const msg=H.$('#fmprod-msg');
    if(after) after(res);
    if(!run){ if(msg) msg.innerHTML='workflow started — its run is not visible yet, follow it on GitHub Actions'; return; }
    if(msg) msg.innerHTML=`running on GitHub — <a href="${H.esc(run.url)}" target="_blank" rel="noopener">open</a>`;
    await follow(run.id, label);
    refreshOpenCard();
  }catch(e){
    const msg=H.$('#fmprod-msg'); if(msg) msg.innerHTML=`<span style="color:#d1242f">${H.esc(e.message)}</span>`;
    const sp=H.$('#fmprod-spin'); if(sp) sp.style.display='none';
  }
}

async function launch(card, name, dry, verbe){
  verbe=verbe||'validate';
  const label=dry?'Dry run':(verbe==='unvalidate'?'Removal from prod':'Prod validation');
  return launchRun(`${label} — ${name}`, '/api/features/prod/'+encodeURIComponent(name)+'/'+verbe+(dry?'?dry_run=true':''), {}, label);
}

function refreshOpenCard(){
  const card=document.querySelector('#fm-card-prod');
  if(card&&card.dataset.fmprodname&&H.can('features.promote')) refresh(card, card.dataset.fmprodname);
}

export function fmBatchStage(){
  if(!H.can('features.promote')) return null;
  const env=String(((H.me&&H.me())||{}).active_env||'dev').toLowerCase();
  return {dev:'preprod', preprod:'prod'}[env]||null;
}

const evRow=(ic,n,txt)=>`<div class="fx-ev">${IC(ic,16)}<b>${H.esc(n)}</b><small style="white-space:normal">${H.esc(txt||'')}</small></div>`;

function hitText(b){
  const h=(b.hits||[])[0];
  if(!h) return '';
  return ` · ${h.path}:${h.line} — ${h.label}${b.count>1?` (+${b.count-1} more)`:''}`;
}

const TESTS={
  failed:{label:'Preprod tests voted broken', icon:'status_error', color:'#d1242f',
    title:'⚠ Will be validated — preprod tests voted BROKEN',
    help:'A tester voted at least one of their preprod tests broken on their current code. They go to prod only on your explicit decision below.',
    ack:n=>`I validate the <b>${n}</b> feature${n>1?'s':''} whose preprod tests were <b>voted broken</b> on their current code.`},
  none:{label:'No preprod test', icon:'status_warning', color:'#b8860b',
    title:'⚠ Will be validated — no preprod test',
    help:'No preprod test is defined for them: nothing was checked in preprod through the test checklist.',
    ack:n=>`I validate the <b>${n}</b> feature${n>1?'s':''} that ${n>1?'have':'has'} <b>no preprod test</b>.`},
  silent:{label:'Preprod tests not re-voted', icon:'status_warning', color:'#b8860b',
    title:'⚠ Will be validated — tests not re-voted',
    help:'Their preprod tests have no broken vote, but not all of them were voted again after their last code change.',
    ack:n=>`I validate the <b>${n}</b> feature${n>1?'s':''} whose preprod tests were <b>not re-voted</b> since their last code change.`}
};
const TEST_KINDS=['failed','none','silent'];
const TEST_FIELDS={failed:'confirm_broken', none:'confirm_untested', silent:'confirm_tests'};
const testKind=r=>r&&r.tests_warning?(TESTS[r.tests_state]?r.tests_state:'silent'):'';

function gateBlocked(g){
  return !!(g&&g.build&&!g.error&&((g.blockers||[]).length+(g.incoming||[]).length+(g.other||[]).length));
}

const BLOCKED_TITLE='The prod DLL would not build: the promote-prod run stops before promoting anything. Include the old versions or fix the blockers on main first (Dry run stays available).';

function gateHtml(g){
  if(!g) return '';
  if(g.error) return `<div class="fx-evh">Prod DLL build check</div>`+evRow('status_warning','Unavailable',g.error+' — the CI run still checks before building');
  if(!g.build) return '';
  const bl=g.blockers||[], inc=g.incoming||[], oth=g.other||[], n=bl.length+inc.length+oth.length;
  const skipped=(g.unscanned||[]).length?`<small class="fx-dim" style="display:block">${g.unscanned.length} generated data file(s) over 2 MB are left to the CI check.</small>`:'';
  if(!n) return `<div class="fx-ev">${IC('status_success',16)}<span>Prod DLL build check: no WndProc/IME violation in the prod tree after this validation.</span></div>`+skipped;
  let h=`<div class="fx-evh" style="color:#d1242f">Build blockers — the prod DLL will not build (${n})</div>`
    +'<small class="fx-dim" style="display:block;margin-bottom:4px">check_wndproc (WndProc/IME rule, blocking in CI) rejects these folders of the prod tree after this validation.</small>';
  h+=bl.map(b=>evRow(b.includable?'status_warning':'status_error', b.name,
    (b.includable?b.note+(b.tests_warning?' · tests: '+b.tests_warning:''):(b.reason||'cannot be included'))+hitText(b))).join('');
  h+=inc.concat(oth).map(b=>evRow('status_error', b.name, (b.reason||'')+hitText(b))).join('');
  const inclu=(g.include||[]).length, reste=n-inclu;
  h+='<small style="display:block;margin-top:4px;color:#d1242f"><b>Validate is disabled</b>: the promote-prod run stops before promoting anything while the prod DLL cannot build, so prod is never listed without its DLL. '
    +(inclu?(reste?`Include the ${inclu} old version${inclu>1?'s':''} below, and fix the other ${reste} on main first.`:'Include the old versions below to validate them together.'):'Fix them on main and validate them for preprod first.')+'</small>';
  if(inclu)
    h+=`<div class="fx-actrow"><button class="fx-btn gold" id="fmb-include" type="button" title="Add the current preprod versions of these features to the validation">Include them in this batch (${inclu})</button></div>`;
  return h+skipped;
}

function batchSummaryHtml(pv){
  const ok=pv.ready||[], all=pv.refused||[];
  const sure=ok.filter(r=>!r.tests_warning);
  const ko=all.filter(r=>r.kind!=='skip'), skip=all.filter(r=>r.kind==='skip');
  let h='';
  if(sure.length) h+=`<div class="fx-evh">Will be validated (${sure.length})</div>`+sure.map(r=>evRow('status_success',r.name,r.note)).join('');
  for(const k of TEST_KINDS){
    const rows=ok.filter(r=>testKind(r)===k), t=TESTS[k];
    if(!rows.length) continue;
    h+=`<div class="fx-evh" style="color:${t.color}">${t.title} (${rows.length})</div>`
      +`<small class="fx-dim" style="display:block;margin-bottom:4px">${t.help} The run records their test status in prod_features.json, the run log and the commit.</small>`
      +rows.map(r=>evRow(t.icon,r.name,r.tests_warning)).join('');
  }
  if(ko.length) h+=`<div class="fx-evh">Refused (${ko.length})</div>`+ko.map(r=>evRow('status_error',r.name,r.reason)).join('');
  if(skip.length) h+=`<div class="fx-evh">Skipped — nothing to do (${skip.length})</div>`+skip.map(r=>evRow('status_off',r.name,r.reason)).join('');
  return `<div style="max-height:320px;overflow:auto;margin-top:6px">${h}</div>`+gateHtml(pv.gate);
}

const BATCH_INTRO={
  preprod:'• <b>one commit</b> on main records you as the validator of each feature in preprod_features.json<br>'
    +'• they become visible and deployable in the <b>preprod</b> environment<br>'
    +'• a later change to a feature folder hides that feature again until it is validated again',
  prod:'• <b>one promote-prod run</b> copies them from the <b>preprod</b> branch to <b>prod</b><br>'
    +'• prod_features.json records you as the validator; the prod DLL is rebuilt <b>once</b> if any has client code<br>'
    +'• you decide on preprod tests: a feature whose tests were voted broken, not re-voted, or never defined goes through only with your confirmation for its group; its test status is recorded in the run log and commit<br>'
    +'• if the prod DLL would not build, the run stops <b>before</b> promoting anything'
};

export async function fmBatchValidate(names, btn, onDone){
  const stage=fmBatchStage(); if(!stage) return;
  names=[...new Set(names||[])].sort(); if(!names.length) return;
  let pv=null;
  await H.runBusy(btn, async()=>{
    try{ pv=await H.fmPost('/api/features/promote-batch/preview',{names}); }
    catch(e){ H.toast('✖ '+H.errMessage(e),'err'); }
  });
  if(!pv) return;
  if(!pv.stage){ H.toast('Nothing to validate from the '+(pv.env||'prod')+' environment','warn'); return; }
  const target=pv.stage, ok=pv.ready||[];
  const title=`Validate for ${target} (${ok.length}/${names.length})`;
  if(!ok.length){
    H.showThemedDialog(title, `<div class="esub">None of the selected features can be validated for ${target}.</div>`+batchSummaryHtml(pv));
    return;
  }
  const count={};
  if(target==='prod') ok.forEach(r=>{ const k=testKind(r); if(k) count[k]=(count[k]||0)+1; });
  const kinds=TEST_KINDS.filter(k=>count[k]);
  const ack=kinds.map(k=>`<label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:13px;cursor:pointer"><input type="checkbox" data-fmback="${k}" style="margin-top:2px"> <span>${TESTS[k].ack(count[k])}</span></label>`).join('');
  const blocked=target==='prod'&&gateBlocked(pv.gate);
  let dry=false, include=false;
  const acked={};
  const asked=H.fmConfirm(title, BATCH_INTRO[target]+batchSummaryHtml(pv)+ack
    +(target==='prod'?'<div class="fx-actrow"><label class="fx-toggle" style="margin-left:0" title="Run the promotion without changing anything and read what it would do"><input type="checkbox" id="fmb-dry"><i></i> Dry run</label></div>':''),
    'Validate '+ok.length);
  const yes=H.$('#fmc-yes'), dryBox=H.$('#fmb-dry'), incBtn=H.$('#fmb-include');
  const sync=()=>{
    if(!yes) return;
    yes.textContent=dry?'Dry run':'Validate '+ok.length;
    const missing=kinds.filter(k=>!acked[k]);
    yes.disabled=!dry&&(blocked||missing.length>0);
    yes.title=!yes.disabled?'':(blocked?BLOCKED_TITLE:'Tick the confirmation for: '+missing.map(k=>TESTS[k].label.toLowerCase()).join(', '));
  };
  if(dryBox) dryBox.onchange=()=>{ dry=dryBox.checked; sync(); };
  document.querySelectorAll('[data-fmback]').forEach(b=>{ b.onchange=()=>{ acked[b.dataset.fmback]=b.checked; sync(); }; });
  if(incBtn) incBtn.onclick=()=>{ include=true; const no=H.$('#fmc-no'); if(no) no.click(); };
  sync();
  const go=await asked;
  if(include){ fmBatchValidate([...names, ...((pv.gate&&pv.gate.include)||[])], btn, onDone); return; }
  if(!go) return;
  const sel=ok.map(r=>r.name);
  if(target==='preprod'){
    await H.runBusy(btn, async()=>{
      try{
        const r=await H.fmPost('/api/features/promote-batch/validate',{names:sel});
        if(r.ok===false){
          H.showThemedDialog('Validate for preprod', '<div class="esub">Nothing was validated: the check changed since the preview.</div>'+batchSummaryHtml(r));
          return;
        }
        const n=Object.keys(r.entries||{}).length;
        H.toast(`✔ ${n} feature${n>1?'s':''} validated for preprod in one commit`,'ok');
        if(onDone) onDone(r);
      }catch(e){ H.toast('✖ '+H.errMessage(e),'err'); }
    });
    refreshOpenCard();
    return;
  }
  const label=dry?'Dry run':'Prod validation';
  const body={names:sel};
  TEST_KINDS.forEach(k=>{ body[TEST_FIELDS[k]]=!!acked[k]; });
  launchRun(`${label} — ${sel.length} feature${sel.length>1?'s':''}`,
    '/api/features/promote-batch/validate'+(dry?'?dry_run=true':''), body, label,
    r=>{ if(!dry&&onDone) onDone(r); });
}

function singleCheckHtml(pv, name){
  if(!pv) return '';
  const r=(pv.ready||[]).find(x=>x.name===name), x=(pv.refused||[]).find(y=>y.name===name);
  let h='';
  if(r&&r.tests_warning){ const t=TESTS[testKind(r)]; h+=evRow(t.icon,t.label,r.tests_warning+' — it goes to prod on your decision'); }
  else if(r) h+=evRow('status_success','Preprod tests',r.note);
  else if(x&&x.kind==='skip') h+=evRow('status_off','Already in prod',x.reason+': a new run only rebuilds the prod DLL when it has client code');
  else if(x) h+=evRow('status_warning','Note',x.reason);
  const g=gateHtml(pv.gate);
  return (h||g)?`<div style="margin-top:10px">${h}${g}</div>`:'';
}

async function validatePreprod(card, name){
  if(!await H.fmConfirm('Validate for preprod',
    `Validate <b>${H.esc(name)}</b> for preprod?<br><br>`
    +`• it becomes visible and deployable in the <b>preprod</b> environment<br>`
    +`• preprod_features.json (on main) records you as the validator and pins the current code<br>`
    +`• any later change to its folder hides it from preprod until validated again`,
    'Validate')) return;
  try{
    await H.fmPost('/api/features/prod/'+encodeURIComponent(name)+'/validate',{});
    H.toast('✔ '+name+' validated for preprod','ok');
  }catch(e){ H.toast('✖ '+e.message,'err'); }
  refresh(card, name);
}

async function unvalidate(card, name, st){
  const cible=st.unstage;
  const suite=cible==='preprod'
    ?'• it disappears from the <b>preprod</b> environment at once (list and server deploys)<br>• validate it again from dev when it is complete'
    :'• it disappears from the <b>prod</b> environment<br>• if it has client code, the <b>prod DLL is rebuilt without it</b>'
      +(st.prod&&st.prod.baseline?'<br>• ⚠️ it is a <b>baseline</b> feature, live in prod today: players lose it at the next DLL publish':'');
  if(!await H.fmConfirm('Unvalidate for '+cible, `Remove <b>${H.esc(name)}</b> from <b>${cible}</b>?<br><br>${suite}`, 'Unvalidate')) return;
  if(cible==='prod'){ launch(card, name, false, 'unvalidate'); return; }
  try{
    const r=await H.fmPost('/api/features/prod/'+encodeURIComponent(name)+'/unvalidate',{});
    H.toast(r.removed?'✔ '+name+' removed from preprod':name+' was not validated for preprod', r.removed?'ok':'warn');
  }catch(e){ H.toast('✖ '+e.message,'err'); }
  refresh(card, name);
}

function wireButtons(card, name, st){
  const hist=card.querySelector('[data-fmprodhist]');
  if(hist) hist.ontoggle=()=>{ if(hist.open&&!hist.dataset.loaded){ hist.dataset.loaded='1'; loadHistory(card, name); } };
  const u=card.querySelector('[data-fmprodunvalidate]');
  if(u) u.onclick=()=>unvalidate(card, name, st);
  const v=card.querySelector('[data-fmprodvalidate]');
  if(v && st.stage==='preprod'){ v.onclick=()=>validatePreprod(card, name); return; }
  if(v) v.onclick=async()=>{
    const dry=card.querySelector('[data-fmprodcheck]');
    if(dry&&dry.checked){ launch(card, name, true); return; }
    const p=st.prod||{};
    const again=p.validated?'<br><br>It is already in prod — this pushes the current preprod version.':'';
    let pv=null;
    await H.runBusy(v, async()=>{
      try{ pv=await H.fmPost('/api/features/promote-batch/preview',{names:[name], single:true}); }
      catch(e){ pv={gate:{error:H.errMessage(e)}}; }
    });
    let include=false;
    const asked=H.fmConfirm('Validate for prod',
      `Validate <b>${H.esc(name)}</b> for production?<br><br>`
      +`• its folder is copied from the <b>preprod</b> branch to <b>prod</b><br>`
      +`• prod_features.json records you as the validator<br>`
      +`• if it has client code, the prod DLL is rebuilt with the validated features only${again}`
      +singleCheckHtml(pv, name),
      'Validate');
    const incBtn=H.$('#fmb-include'), yes=H.$('#fmc-yes');
    if(incBtn) incBtn.onclick=()=>{ include=true; const no=H.$('#fmc-no'); if(no) no.click(); };
    if(yes&&gateBlocked(pv&&pv.gate)){ yes.disabled=true; yes.title=BLOCKED_TITLE; }
    const go=await asked;
    if(include){ fmBatchValidate([name, ...((pv.gate&&pv.gate.include)||[])], v, ()=>refresh(card, name)); return; }
    if(!go) return;
    launch(card, name, false);
  };

}

export function fmWireProd(root, name){
  const card=(root||document).querySelector('#fm-card-prod');
  if(!card||!H.can('features.promote')) return;
  refresh(card, name);
}

export async function fmBatchUnvalidate(names, onDone){
  if(!H.can('features.promote')) return;
  names=[...new Set(names||[])].sort(); if(!names.length) return;
  const env=String(((H.me&&H.me())||{}).active_env||'dev').toLowerCase();
  const cible={dev:'preprod', preprod:'prod', prod:'prod'}[env]||'prod';
  const suite=cible==='preprod'
    ?'• they disappear from the <b>preprod</b> environment at once'
    :'• they disappear from the <b>prod</b> environment in ONE promote-prod run<br>• if they have client code, the <b>prod DLL must be rebuilt without them</b>';
  if(!await H.fmConfirm('Unvalidate for '+cible, `Remove <b>${names.length}</b> feature${names.length>1?'s':''} from <b>${cible}</b>?<br><br>${names.map(H.esc).join(', ')}<br><br>${suite}`, 'Unvalidate')) return;
  if(cible==='prod'){ launchRun(`Removal from prod — ${names.length} feature${names.length>1?'s':''}`, '/api/features/unvalidate-batch', {names}, 'Removal from prod', onDone); return; }
  try{
    const r=await H.fmPost('/api/features/unvalidate-batch',{names});
    H.toast('✔ removed from preprod: '+((r.removed||[]).join(', ')||'none'),'ok');
    if(onDone) onDone();
  }catch(e){ H.toast('✖ '+H.errMessage(e),'err'); }
}
