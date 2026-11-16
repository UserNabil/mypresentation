/* ============================================================================
   FEATURE MANAGER — Report feedback card of the messages feature (GM+).

   Open player reports and staff sanctions of the ACTIVE env, read from the
   eden-messages CLI on the game server (/api/features/messages/feedback*):
   - Open reports: player, reports, distinct reporters, first / last; Snapshots
     shows the chat captured with each report; Sanction pre-fills the form.
   - Sanction: label (fixed list), duration 1 h .. 30 d, reason (staff only),
     Show the mark to players. Closes the open reports and thanks the reporters.
   - Active sanctions (+ Show ended), Revoke.
   ============================================================================ */
import { H } from './feature_manager_state.js';

const E=v=>H.esc(v==null?'':v);
const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||16}" height="${s||16}" alt="" aria-hidden="true">`;
const LABELS=['scammer','disruptive','spammer','harasser','cheater'];
const COLS_R='minmax(0,1fr) 80px 90px 150px 190px';
const COLS_S='60px minmax(0,1fr) 100px 70px 150px 150px 90px';
const ERR=e=>H.errMessage?H.errMessage(e):String(e&&e.message||e);

function when(t){
  const n=Number(t||0); if(!n) return '—';
  const d=new Date(n*1000);
  return d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

export function fmMsgFbHtml(name){
  if(name!=='messages'||!(H.can&&H.can('messages.moderate'))) return '';
  return `<section class="fx-card" id="fm-msgfb" data-fmmsgfb="1"><div class="fx-card-h">${IC('status_info',26)}<div class="fx-card-t"><h2>Report feedback</h2>
      <p>Players reported from Messages, and the staff warning marks ('Reported: scammer'…) shown before a name in the chat and in Messages to players with the Eden client. A sanction closes the open reports of that player and thanks each reporter anonymously a few minutes later.</p></div>
      <div class="fx-toolbar"><button class="mini" data-fmfbreload="1">Refresh</button></div></div>
    <div data-fmfbbody="1"><div class="fx-note">${IC('status_info')} Loading…</div></div></section>`;
}

function reportsHtml(rows){
  if(!rows.length) return `<div class="fx-note">${IC('status_success')} No open report in the last days.</div>`;
  return `<div class="fx-table"><div class="fx-thead" style="grid-template-columns:${COLS_R}"><span>Player</span><span>Reports</span><span>Reporters</span><span>First / last</span><span></span></div>
    ${rows.map(r=>`<div class="fx-frow" style="grid-template-columns:${COLS_R}"><span class="fx-fname"><code>${E(r.name||'?')}</code> <span class="esub">#${E(r.reported_char)}</span></span>
      <span>${E(r.reports)}</span><span>${E(r.reporters)}</span><span class="fx-fread">${E(when(r.first))}<br>${E(when(r.last))}</span>
      <span><button class="mini" data-fmfbsnap="${E(r.reported_char)}">Snapshots</button> <button class="mini gold" data-fmfbpick="${E(r.reported_char)}" data-fmfbname="${E(r.name||'')}">Sanction</button></span></div>
      <div data-fmfbsnapbox="${E(r.reported_char)}"></div>`).join('')}</div>`;
}

function formHtml(){
  return `<div class="fx-note" style="display:block">
    <b>Sanction</b> <span class="esub">(the reason stays with the staff; players only see the label)</span><br>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
      <input data-fmfbf="char" placeholder="Character id or exact name" maxlength="40" style="width:210px">
      <select data-fmfbf="label">${LABELS.map(l=>`<option value="${l}">${l}</option>`).join('')}</select>
      <input data-fmfbf="dur" type="number" min="1" max="720" value="24" style="width:70px">
      <select data-fmfbf="unit"><option value="1">hours</option><option value="24">days</option></select>
      <label style="display:inline-flex;gap:4px;align-items:center"><input data-fmfbf="mark" type="checkbox" checked> Show the mark to players</label>
    </div>
    <div data-fmfbtagwarn="1" class="fx-warn" style="display:none;margin-top:6px">${IC('status_warning')} This tag is part of the name; privilege-0 characters with a tag are marked like any player.</div>
    <textarea data-fmfbf="reason" placeholder="Reason (3 to 300 characters, staff only)" maxlength="300" rows="2" style="width:100%;margin-top:6px"></textarea>
    <div style="margin-top:6px"><button class="mini gold" data-fmfbadd="1">Sanction</button></div></div>`;
}

function sanctionsHtml(rows, all){
  const head=`<div style="display:flex;align-items:center;gap:10px;margin:12px 0 6px"><b>${all?'All sanctions':'Active sanctions'}</b>
    <label style="display:inline-flex;gap:4px;align-items:center;font-size:12.5px"><input type="checkbox" data-fmfball="1"${all?' checked':''}> Show ended</label></div>`;
  if(!rows.length) return head+`<div class="fx-note">${IC('status_info')} None.</div>`;
  return head+`<div class="fx-table"><div class="fx-thead" style="grid-template-columns:${COLS_S}"><span>Id</span><span>Player / reason</span><span>Label</span><span>Thanks</span><span>Created</span><span>Until</span><span></span></div>
    ${rows.map(s=>`<div class="fx-frow" style="grid-template-columns:${COLS_S}"><span>${E(s.id)}</span>
      <span class="fx-fname" style="display:block"><code>${E(s.name||'?')}</code> <span class="esub">#${E(s.char_id)}${s.marked?'':' · no mark'}</span><br><span class="esub">${E(s.reason||'')} — ${E(s.created_by||'')}</span></span>
      <span>${E(s.label||'')}</span><span>${E(s.delivered||0)}/${E(s.thanked||0)}</span><span class="fx-fread">${E(when(s.created))}</span>
      <span class="fx-fread">${s.revoked?'revoked '+E(when(s.revoked))+(s.revoked_by?' by '+E(s.revoked_by):''):E(when(s.until))}</span>
      <span>${s.active?`<button class="mini" data-fmfbrevoke="${E(s.id)}" data-fmfbname="${E(s.name||'')}">Revoke</button>`:'<span class="esub">ended</span>'}</span></div>`).join('')}</div>`;
}

async function load(card){
  const body=card.querySelector('[data-fmfbbody]'); if(!body) return;
  const all=!!card._fbAll;
  let rep, san;
  try{
    [rep, san]=await Promise.all([
      H.fmGet('/api/features/messages/feedback?view=reports'),
      H.fmGet('/api/features/messages/feedback?view='+(all?'list_all':'list'))]);
  }catch(e){
    if(card.isConnected) body.innerHTML=`<div class="fx-note fx-bad">${IC('status_error')} Report feedback: ${E(ERR(e))}</div>`;
    return;
  }
  if(!card.isConnected) return;
  const env=String(rep.env||san.env||'').toUpperCase();
  body.innerHTML=`<div class="fx-note">${IC('status_info')} Environment <b>${E(env)}</b> · ${(rep.reports||[]).length} reported player(s) · ${(san.sanctions||[]).filter(s=>s.active).length} active sanction(s)</div>
    <div style="margin:10px 0 6px"><b>Open reports</b></div>${reportsHtml(rep.reports||[])}${formHtml()}${sanctionsHtml(san.sanctions||[], all)}`;
  wire(card);
}

function wire(card){
  const f=k=>card.querySelector(`[data-fmfbf="${k}"]`);
  const durMax=()=>Number(f('unit').value||1)>=24?30:720;
  const syncDur=()=>{
    const d=f('dur'); if(!d) return;
    const mx=durMax(); d.max=String(mx);
    if(Number(d.value||0)>mx) d.value=String(mx);
  };
  const tagWarn=()=>{
    const w=card.querySelector('[data-fmfbtagwarn]'), c=f('char'); if(!w||!c) return;
    const v=(c.value||'').trim(), p=card._fbPick;
    const nm=(p&&p.id===v)?p.name:v;
    w.style.display=/^\[(GM|CM|GS)\]/i.test(nm||'')?'block':'none';
  };
  if(f('unit')) f('unit').onchange=syncDur;
  if(f('char')) f('char').oninput=tagWarn;
  syncDur(); tagWarn();
  card.querySelectorAll('[data-fmfbpick]').forEach(b=>b.onclick=()=>{
    const c=f('char'); if(c){ c.value=b.dataset.fmfbpick; c.focus(); }
    card._fbPick={id:b.dataset.fmfbpick, name:b.dataset.fmfbname||''};
    tagWarn();
    const r=f('reason'); if(r&&!r.value) r.focus();
  });
  card.querySelectorAll('[data-fmfbsnap]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.fmfbsnap, box=card.querySelector(`[data-fmfbsnapbox="${CSS.escape(id)}"]`); if(!box) return;
    if(box.innerHTML){ box.innerHTML=''; return; }
    box.innerHTML=`<div class="fx-fdet">Loading…</div>`;
    try{
      const r=await H.fmGet('/api/features/messages/feedback/snapshots?char='+encodeURIComponent(id));
      box.innerHTML=(r.reports||[]).map(x=>`<div class="fx-fsub" style="display:block"><b>#${E(x.id)}</b> · ${E(when(x.created))} · reporter #${E(x.reporter_char)}<pre style="white-space:pre-wrap;margin:4px 0 0;font-size:12px">${E(x.snapshot||'(no snapshot)')}</pre></div>`).join('')||'<div class="fx-fdet">No open report.</div>';
    }catch(e){ box.innerHTML=`<div class="fx-fsub fx-bad">${E(ERR(e))}</div>`; }
  });
  const add=card.querySelector('[data-fmfbadd]');
  if(add) add.onclick=async()=>{
    const ch=(f('char').value||'').trim(), label=f('label').value, mult=Number(f('unit').value||1);
    const hours=Math.round(Number(f('dur').value||0)*mult), reason=(f('reason').value||'').trim(), mark=!!f('mark').checked;
    if(!ch){ H.toast('Character id or exact name required','warn'); return; }
    if(!(hours>=1&&hours<=720)){ H.toast(mult>=24?'Duration must be between 1 and 30 days':'Duration must be between 1 and 720 hours','warn'); return; }
    if(reason.length<3){ H.toast('A reason of 3 to 300 characters is required','warn'); return; }
    const ok=await H.fmConfirm('Sanction',`Sanction <b>${E(ch)}</b> as <b>${E(label)}</b> for <b>${hours>=24&&hours%24===0?hours/24+' day(s)':hours+' hour(s)'}</b>?<br><br>`+
      (mark?`Players with the Eden client will see <b>Reported: ${E(label)}</b> before this name in the chat and in Messages until it ends.`:'No mark is shown to players.')+
      ` The open reports against this player are closed and each reporter is thanked anonymously.`,'Sanction');
    if(!ok) return;
    const run=async()=>{
      try{
        const r=await H.fmPost('/api/features/messages/feedback/sanction',{char:ch,label,hours,reason,mark});
        H.toast(`Sanction #${r.id}: ${r.name} (${r.label}), ${r.reports_closed} report(s) closed, ${r.reporters_thanked} reporter(s) thanked`,'ok');
      }catch(e){ H.toast(ERR(e),'error'); return; }
      await load(card);
    };
    return H.runBusy?H.runBusy(add, run):run();
  };
  card.querySelectorAll('[data-fmfbrevoke]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.fmfbrevoke;
    const ok=await H.fmConfirm('Revoke sanction',`Revoke sanction <b>#${E(id)}</b> of <b>${E(b.dataset.fmfbname||'')}</b>? The mark disappears for players at the next refresh; thank-you lines not delivered yet are cancelled. Closed reports stay closed.`,'Revoke');
    if(!ok) return;
    const run=async()=>{
      try{
        const r=await H.fmPost('/api/features/messages/feedback/revoke',{id:Number(id)});
        H.toast(`Revoked, ${r.thanks_cancelled||0} pending thank-you line(s) cancelled.`,'ok');
      }catch(e){ H.toast(ERR(e),'error'); return; }
      await load(card);
    };
    return H.runBusy?H.runBusy(b, run):run();
  });
  const all=card.querySelector('[data-fmfball]');
  if(all) all.onchange=()=>{ card._fbAll=!!all.checked; load(card); };
}

export function fmRenderMsgFb(card){
  if(!card) return;
  const r=card.querySelector('[data-fmfbreload]');
  if(r) r.onclick=()=>load(card);
  load(card);
}
