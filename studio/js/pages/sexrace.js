/* ============================================================================
   SEX / RACE CHANGE — page de changement de sexe et de race d'un personnage.

   Extrait de static/index.html (protocole docs/WORK_SPLIT.md). La page est
   autonome : elle ne partage aucun etat avec le reste du fichier.

   ⛔ Contrat d'hote — AUCUN global n'est lu depuis ce module. Tout arrive par
   l'objet passe a initSexRace() :
     $           selecteur (document.querySelector)
     esc         echappement HTML
     enc         encodeURIComponent (query de recherche)
     toast       notification
     uiConfirm   confirmation modale (async -> bool)
     can         test de permission ('char.sexrace', 'char.sexrace.apply')

   Pieges consignes ici pour ne pas les reperdre :
   - Le trait heroique est PRESERVE : instantane puis restauration dans UNE
     transaction atomique cote back. Le « trait par defaut » de la nouvelle
     paire race/sexe est affiche a titre indicatif — il n'est PAS applique.
   - Certaines races sont a corps unique (`genderless`) : le sexe est alors
     IMPOSE. Le select est rempli avec la seule valeur possible et desactive ;
     ne jamais deduire le sexe de l'ancienne valeur du champ.
   - Les paires valides ne sont pas 1/0 partout : Humain = 1/0, Halfkin = 9/8.
     D'ou `valid_pairs` renvoye par le back plutot qu'un couple code en dur.
   - Le journal peut contenir des entrees de rollback/disconnect SANS
     before/after : ne jamais supposer la forme, sinon la liste plante.
   - `SEXRACE.timer` est un setInterval de suivi de tache : il est coupe a
     chaque ouverture de la page, sinon deux sondages se superposent.
   ============================================================================ */

let H=null;
let SEXRACE={opts:null,sel:null,timer:null};

export function initSexRace(host){ H=host; }

export async function openSexRace(){
  const {$,esc,can}=H;
  const c=$('#content');if(!c)return;
  if(!can('char.sexrace')){c.innerHTML='<div class="empty">⟡ Sex / Race change requires GM or above ⟡</div>';return;}
  if(SEXRACE.timer){clearInterval(SEXRACE.timer);SEXRACE.timer=null;}
  SEXRACE.sel=null;
  c.innerHTML=`<div class="sexracepage" style="max-width:1080px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
      <h2 style="margin:0"><img src="/studio/icons/icons/24/sex_race.png" srcset="/studio/icons/icons/24/sex_race.png 1x, /icons/icons/48/sex_race.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Sex / Race Change</h2>
      <span class="hc-badge" style="background:#6a2b4d;color:#fff;padding:2px 8px;border-radius:9px;font-size:11px">GM+ · apply: CM · DEV</span>
    </div>
    <div class="esub" style="margin:0 0 12px">Change a character's sex and/or race. The heroic trait (and its advanced abilities, permanent enchants, familiars) is <b>preserved</b>. Equipment is mailed back to the player; appearance is reset. Use <b>Preview</b> (read-only) to see the exact impact before <b>Apply</b>.</div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <input id="sr-q" placeholder="Search character by name, id or account…" style="flex:1;padding:8px;border-radius:7px;border:1px solid rgba(122,92,30,.3);font-size:13px">
      <button id="sr-search" class="sbtn" style="padding:8px 16px"><img src="/studio/icons/icons/24/search.png" srcset="/studio/icons/icons/24/search.png 1x, /icons/icons/64/search.png 2x" class="ui-icon" width="24" height="24" alt=""> Search</button>
    </div>
    <div id="sr-results" class="esub" style="margin:0 0 12px;max-height:200px;overflow:auto"></div>
    <div id="sr-panel"></div>
    <div style="margin-top:18px">
      <div class="esub" style="margin:0 0 6px;display:flex;align-items:center;gap:8px">Apply history
        <button id="sr-reload-log" class="sbtn ghost" style="padding:2px 8px;font-size:11px"><img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /icons/icons/64/refresh.png 2x" class="ui-icon" width="24" height="24" alt=""></button></div>
      <div id="sr-log" class="esub" style="margin:0;max-height:200px;overflow:auto"></div>
    </div>
  </div>`;
  let j;try{j=await(await fetch('/api/sexrace/options')).json();}catch(e){j=null;}
  if(!j||j.ok===false){$('#sr-panel').innerHTML='<div class="empty">'+esc((j&&j.detail)||'options unreachable (are you CM?)')+'</div>';return;}
  SEXRACE.opts=j;
  $('#sr-search').onclick=srSearch;
  $('#sr-q').onkeydown=e=>{if(e.key==='Enter')srSearch();};
  $('#sr-reload-log').onclick=srLoadLog;
  srLoadLog();
}

async function srSearch(){
  const {$,esc,enc}=H;
  const q=$('#sr-q').value.trim();const box=$('#sr-results');
  if(!q){box.innerHTML='';return;}
  box.innerHTML='searching…';
  let j;try{j=await(await fetch('/api/sexrace/search?q='+enc(q))).json();}catch(e){j=null;}
  if(!j||j.ok===false){box.innerHTML='<span style="color:var(--crimson)">'+esc((j&&j.detail)||'search failed')+'</span>';return;}
  if(!j.results.length){box.innerHTML='<i>no character found</i>';return;}
  box.innerHTML=j.results.map(r=>`<div class="sr-row" data-id="${r.id}" style="cursor:pointer;padding:5px 8px;border-radius:6px;border:1px solid rgba(122,92,30,.18);margin-bottom:4px">
    <b>${esc(r.name)}</b> <span class="esub" style="margin:0">#${r.id}</span> · ${esc(r.race)} ${esc(r.gender)} · trait <b>${esc(r.heroic_trait)}</b> · Lv${r.level} · acct ${esc(r.account)}</div>`).join('');
  box.querySelectorAll('.sr-row').forEach(el=>el.onclick=()=>srSelect(srInt(el.dataset.id)));
}

function srInt(v){const n=parseInt(v,10);return isNaN(n)?0:n;}

function srSelect(id){
  const {$,esc,can}=H;
  SEXRACE.sel=id;
  const o=SEXRACE.opts;
  const races=o.races.map(r=>`<option value="${r.id}">${esc(r.name)}${r.genderless?' (single body)':''}</option>`).join('');
  $('#sr-panel').innerHTML=`<div class="sr-card" style="background:rgba(106,43,77,.06);border:1px solid rgba(106,43,77,.25);border-radius:10px;padding:14px">
    <div class="esub" style="margin:0 0 8px">Selected character <b>#${id}</b> — choose a new race / gender, then <b>Preview</b>.</div>
    <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">
      <label class="esub" style="margin:0">New race<br><select id="sr-race" style="padding:6px;border-radius:6px;font-size:13px">${races}</select></label>
      <label class="esub" style="margin:0" id="sr-gender-wrap">New gender<br><select id="sr-gender" style="padding:6px;border-radius:6px;font-size:13px">
        <option value="1">Male</option><option value="0">Female</option></select></label>
      <button id="sr-preview" class="sbtn" style="padding:8px 16px"><img src="/studio/icons/icons/24/preview.png" srcset="/studio/icons/icons/24/preview.png 1x, /icons/icons/64/preview.png 2x" class="ui-icon" width="24" height="24" alt=""> Preview (read-only)</button>
      ${can('char.sexrace.apply')?`<button id="sr-rollback2" class="sbtn ghost" style="padding:8px 16px;display:none"><img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Roll back last change</button>`:''}
    </div>
    <div id="sr-impact" style="margin-top:14px"></div>
  </div>`;
  $('#sr-race').onchange=srRaceChanged;
  $('#sr-preview').onclick=srPreview;
  srRaceChanged();
  // show a rollback button immediately if this character has a recorded change (no preview needed)
  if($('#sr-rollback2')){
    fetch('/api/sexrace/rollback-info/'+id).then(r=>r.json()).then(ri=>{
      if(ri.can_rollback){const b=$('#sr-rollback2');if(b){b.style.display='';
        b.title='Restore the original race/gender/trait (from change #'+ri.change_id+')';
        b.onclick=()=>srRollback(ri);}}
    }).catch(()=>{});
  }
}

function srRaceChanged(){
  const {$,esc}=H;
  const o=SEXRACE.opts;const rid=srInt($('#sr-race').value);
  const r=o.races.find(x=>x.id===rid);const w=$('#sr-gender-wrap');const sel=$('#sr-gender');
  if(r&&r.genderless){
    // single body model — gender forced; show the forced value, hide the choice
    const g=o.genderless_gender[String(rid)];
    sel.innerHTML=`<option value="${g}">${esc(o.genders[String(g)]||'forced')} (forced by race)</option>`;
    sel.disabled=true;w.style.opacity=.6;
  }else{
    // bi-gender: Human uses 1/0, Halfkin uses 9/8
    const pairs=o.valid_pairs.filter(p=>p.race_id===rid);
    sel.innerHTML=pairs.map(p=>`<option value="${p.gender_id}">${esc(o.genders[String(p.gender_id)]||p.gender_id)}</option>`).join('');
    sel.disabled=false;w.style.opacity=1;
  }
}

async function srPreview(){
  const {$,esc,can}=H;
  if(!SEXRACE.sel)return;
  const race=srInt($('#sr-race').value),gender=srInt($('#sr-gender').value);
  const box=$('#sr-impact');box.innerHTML='computing impact (read-only)…';
  let j;try{j=await(await fetch(`/api/sexrace/preview/${SEXRACE.sel}?race=${race}&gender=${gender}`)).json();}catch(e){j=null;}
  if(!j||j.ok===false){box.innerHTML='<span style="color:var(--crimson)"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> '+esc((j&&j.detail)||'preview failed')+'</span>';return;}
  const cur=j.current,tgt=j.target,pre=j.preserved,mig=j.migrated;
  const traitKept=`<b style="color:#2e7d32">${esc(pre.heroic_trait)}</b> (preserved)`;
  box.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div><div class="esub" style="margin:0 0 4px;font-weight:600">Current</div>
      Race: <b>${esc(cur.race)}</b> · Gender: <b>${esc(cur.gender)}</b><br>
      Heroic trait: <b>${esc(cur.heroic_trait)}</b> · Lv${cur.level} · AA ${cur.aa_point}<br>
      ${j.online?'<span style="color:var(--crimson)"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> character is ONLINE — will be disconnected</span>':'<span class="esub" style="margin:0">offline</span>'}</div>
    <div><div class="esub" style="margin:0 0 4px;font-weight:600">After change</div>
      Race: <b>${esc(tgt.race)}</b> · Gender: <b>${esc(tgt.gender)}</b>${tgt.forced_gender?' <span class="esub" style="margin:0">(forced by race)</span>':''}<br>
      Heroic trait: ${traitKept}<br>
      Default trait for this pair would be ${esc(tgt.default_trait_name)} — but we KEEP the current one.</div>
  </div>
  <div style="margin-top:12px;border-top:1px solid rgba(122,92,30,.2);padding-top:10px">
    <div class="esub" style="margin:0 0 4px;font-weight:600">Preserved (snapshot → restore, inside one atomic transaction)</div>
    Heroic trait <b>${esc(pre.heroic_trait)}</b> · AA point ${pre.aa_point} · advanced abilities ${pre.advanced_ability_rows} ·
    permanent enchants ${pre.permanent_enchant_rows}${pre.permanent_enchants.length?' ['+pre.permanent_enchants.join(', ')+']':''} ·
    class AA rows ${pre.class_aa_rows} · familiars ${pre.elf_rows}
    <div class="esub" style="margin:8px 0 4px;font-weight:600">Migrated / reset</div>
    Equipment mailed back: <b>${mig.equipment_to_mail}</b> item(s) · appearance reset · closet / fast-dress reset · <b style="color:#2e7d32">spell book &amp; hero trait kept</b> · denormalised gender copies updated.${mig.racial_craft?`<br>Racial craft: ${esc(mig.racial_craft)}.`:''}
  </div>
  <details style="margin-top:10px"><summary class="esub" style="cursor:pointer">Read-only SELECTs used (proof: no write)</summary>
    <pre style="white-space:pre-wrap;font-size:11px;background:rgba(0,0,0,.04);padding:8px;border-radius:6px">${esc(Object.values(j.queries).join('\n'))}</pre></details>
  <div style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    ${can('char.sexrace.apply')
      ? `<button id="sr-apply" class="sbtn" style="padding:9px 20px;background:var(--crimson,#8a2030)"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Apply change</button>
    <button id="sr-rollback" class="sbtn ghost" style="padding:9px 16px;display:none"><img src="/studio/icons/icons/24/undo.png" srcset="/studio/icons/icons/24/undo.png 1x, /icons/icons/48/undo.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Roll back last change</button>
    ${j.online?`<button id="sr-disconnect" class="sbtn ghost" style="padding:9px 16px"><img src="/studio/icons/icons/24/logout.png" srcset="/studio/icons/icons/24/logout.png 1x, /icons/icons/48/logout.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Disconnect / clean session</button>`:''}
    <span class="esub" style="margin:0">This rewrites the character${j.online?'. Disconnect it first if it shows ONLINE.':'.'}</span>`
      : `<button class="sbtn" style="padding:9px 20px;opacity:.5;cursor:not-allowed" disabled><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> Apply — CM only</button>
    <span class="esub" style="margin:0">Preview is GM+; only a CM can Apply (server-side enforced).</span>`}
  </div>
  <div id="sr-progress" style="display:none;margin-top:12px">
    <div class="esub" id="sr-pmsg" style="margin:0 0 5px">starting…</div>
    <div style="height:10px;background:rgba(122,92,30,.15);border-radius:6px;overflow:hidden"><div id="sr-pbar" style="height:100%;width:5%;background:linear-gradient(90deg,#6a2b4d,#b05a8a);transition:width .4s"></div></div>
  </div>
  <div id="sr-result" style="margin-top:10px"></div>`;
  if($('#sr-apply'))$('#sr-apply').onclick=()=>srApply(race,gender,j);
  if($('#sr-disconnect'))$('#sr-disconnect').onclick=()=>srDisconnect();
  // show the rollback button if this character has a previously-applied change on record
  if($('#sr-rollback')&&SEXRACE.sel){
    fetch('/api/sexrace/rollback-info/'+SEXRACE.sel).then(r=>r.json()).then(ri=>{
      if(ri.can_rollback){const b=$('#sr-rollback');if(b){b.style.display='';b.onclick=()=>srRollback(ri);}}
    }).catch(()=>{});
  }
}

async function srRollback(ri){
  const {$,esc,toast,uiConfirm}=H;
  if(!await uiConfirm('Restore the original race/gender/heroic trait of '+esc(ri.char_name||('#'+SEXRACE.sel))+' (from before change #'+ri.change_id+'). Mailed equipment stays in the mailbox. This restarts the game servers.','Roll back the sex/race change?','Roll back'))return;
  const btn=$('#sr-rollback');if(btn)btn.disabled=true;
  $('#sr-progress').style.display='';$('#sr-pmsg').textContent='rolling back…';$('#sr-pbar').style.width='30%';
  try{
    const r=await fetch('/api/sexrace/rollback/'+SEXRACE.sel,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});
    const j=await r.json().catch(()=>({}));
    $('#sr-pbar').style.width='100%';
    if(r.ok){$('#sr-pmsg').textContent='done';$('#sr-result').innerHTML='<div style="color:#4a8a3a">✓ Rolled back — original race/gender/trait restored · servers boot='+esc(j.boot||'?')+'</div>';toast('change rolled back','ok');}
    else{$('#sr-pmsg').textContent='failed';$('#sr-result').innerHTML='<div style="color:var(--crimson)">✗ '+esc(j.detail||j.error||'rollback failed')+'</div>';}
  }catch(e){$('#sr-result').innerHTML='<div style="color:var(--crimson)">✗ '+esc(String(e.message||e))+'</div>';}
  if(btn)btn.disabled=false;
}

async function srDisconnect(){
  const {$,esc,toast,uiConfirm}=H;
  if(!SEXRACE.sel)return;
  if(!await uiConfirm('Disconnect the player and clean the session for this character\'s account, so a deferred change can be applied without restarting the servers. If the player is GENUINELY still in-game right now, use a full server restart instead.','Disconnect / clean session?','Disconnect'))return;
  const btn=$('#sr-disconnect');if(btn)btn.disabled=true;
  $('#sr-result').innerHTML='<span class="esub">cleaning session…</span>';
  try{
    const r=await fetch('/api/sexrace/disconnect/'+SEXRACE.sel,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.ok){
      $('#sr-result').innerHTML='<div style="color:#4a8a3a">✓ '+(j.offline_ok?'Character is now OFFLINE. ':'')+esc(j.note||'session cleaned')+'</div>';
      toast(j.offline_ok?'✔ character offline':'✔ session cleaned','ok');
      srPreview();   // refresh the preview so the ONLINE warning clears
    }else{$('#sr-result').innerHTML='<div style="color:var(--crimson)">✗ '+esc(j.detail||j.error||'disconnect failed')+'</div>';}
  }catch(e){$('#sr-result').innerHTML='<div style="color:var(--crimson)">✗ '+esc(String(e.message||e))+'</div>';}
  if(btn)btn.disabled=false;
}

async function srApply(race,gender,impact){
  const {$,esc,uiConfirm}=H;
  if(!SEXRACE.sel)return;
  const name=impact.name||('#'+SEXRACE.sel);
  if(!await uiConfirm(`${impact.current.race} ${impact.current.gender} → ${impact.target.race} ${impact.target.gender}. Heroic trait "${impact.preserved.heroic_trait}" is PRESERVED. ${impact.migrated.equipment_to_mail} equipped item(s) will be mailed back. This rewrites the character and RESTARTS the game servers.`,`Apply sex/race change to ${name}?`,'Apply change'))return;
  const btn=$('#sr-apply');if(btn)btn.disabled=true;
  $('#sr-progress').style.display='';
  let j;try{j=await(await fetch('/api/sexrace/apply/'+SEXRACE.sel,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({race,gender,confirm:true})})).json();}catch(e){j=null;}
  if(!j||j.ok===false){$('#sr-result').innerHTML='<span style="color:var(--crimson)"><img src="/studio/icons/icons/24/warning.png" srcset="/studio/icons/icons/24/warning.png 1x, /icons/icons/48/warning.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> '+esc((j&&j.detail)||'apply failed')+'</span>';if(btn)btn.disabled=false;return;}
  srPollApply();
}

function srPollApply(){
  const {$,esc,toast}=H;
  if(SEXRACE.timer)clearInterval(SEXRACE.timer);
  SEXRACE.timer=setInterval(async()=>{
    let j;try{j=await(await fetch('/api/sexrace/status/'+SEXRACE.sel)).json();}catch(e){return;}
    if(!j||!j.job)return;
    const job=j.job;
    $('#sr-pmsg').textContent=job.msg||'';
    $('#sr-pbar').style.width=Math.max(5,Math.round((job.step/(job.total||5))*100))+'%';
    if(job.done){
      clearInterval(SEXRACE.timer);SEXRACE.timer=null;
      const btn=$('#sr-apply');if(btn)btn.disabled=false;
      if(job.error){$('#sr-result').innerHTML='<span style="color:var(--crimson)">✖ '+esc(job.error)+'</span>';toast('✖ Sex/Race change failed','error');}
      else{const r=job.result;$('#sr-result').innerHTML=`<div style="color:#2e7d32">✔ Committed: ${esc(r.before.race)} ${esc(r.before.gender)} → ${esc(r.after.race)} ${esc(r.after.gender)} · trait <b>${esc(r.after.heroic_trait)}</b> ${r.trait_preserved?'(preserved)':'(CHANGED!)'} · ${r.equipment_mailed} item(s) mailed · servers boot=${esc((r.boot&&r.boot.verdict)||'?')}</div>`;
        toast('Sex/Race change committed','ok');srLoadLog();}
    }
  },1500);
}

async function srLoadLog(more){
  const {$,esc}=H;
  const box=$('#sr-log');if(!box)return;
  const off=more?(SEXRACE.logOffset||0):0;
  if(!more){box.textContent='loading…';SEXRACE.logOffset=0;SEXRACE.logHtml='';}
  let j;try{j=await(await fetch('/api/sexrace/log?limit=25&offset='+off)).json();}catch(e){j=null;}
  if(!j||j.ok===false){box.innerHTML='<i>'+esc((j&&j.detail)||'no log')+'</i>';return;}
  const entries=j.entries||[];
  if(!entries.length&&!more){box.innerHTML='<i>no change applied yet</i>';return;}
  // defensive: rollback/disconnect entries may omit before/after — never assume the shape.
  const rows=entries.map(e=>{
    const b=e.before||{},a=e.after||{};
    const move=(b.race||a.race)?`${esc(b.race||'?')} ${esc(b.gender||'')} → ${esc(a.race||'?')} ${esc(a.gender||'')}`:'';
    const trait=(b.heroic_trait||a.heroic_trait)?` · trait ${esc(b.heroic_trait||'?')}→${esc(a.heroic_trait||'?')}`:'';
    return `<div style="padding:4px 8px;border-bottom:1px solid rgba(122,92,30,.12)">
      <span class="esub" style="margin:0">${esc(e.ts||'')}</span> · <b>${esc(e.actor||'?')}</b> · <b>${esc(e.char_name||'?')}</b> #${esc(e.char_id||'')} ·
      <span class="hc-badge" style="background:#444;color:#fff;padding:1px 6px;border-radius:8px;font-size:10px">${esc(e.phase||'?')}</span>
      ${move}${trait}${e.note?' · '+esc(e.note):''}</div>`;
  }).join('');
  SEXRACE.logHtml=(more?(SEXRACE.logHtml||''):'')+rows;
  SEXRACE.logOffset=off+entries.length;
  const footer=j.has_more
    ? `<div style="padding:8px;text-align:center"><button id="sr-logmore" class="sbtn ghost" style="padding:6px 14px">Load more (${SEXRACE.logOffset}/${j.total})</button></div>`
    : `<div class="esub" style="padding:6px 8px;text-align:center">${j.total||SEXRACE.logOffset} change(s)</div>`;
  box.innerHTML=SEXRACE.logHtml+footer;
  if($('#sr-logmore'))$('#sr-logmore').onclick=()=>srLoadLog(true);
}
