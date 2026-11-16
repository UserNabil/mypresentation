/* ============================================================================
   FEATURE MANAGER — Town crier news card of the living_aven feature (GM+).

   Staff news items of the Aven News Board (Secretary Waver) on the ACTIVE env, edited
   through the eden-towncrier CLI on the game server (/api/features/living_aven/news*):
   - List: id, text, then one line "added · until (or no end) · cried · by"; Edit, Delete.
     Three columns sized to the card (not to the window): nothing is clipped at any width.
   - Add: English text 3..180 printable ASCII, days 0..365 (default 14, 0 = no end),
     Cried by the crier (default on). Players see it within the minute.
   - Edit: the form takes the item (days = days left); Save adds the new text, then
     deletes the old id (the service has no edit command: new id, added now). The server
     refuses the edit when the old id is gone or the board is full (50 items).
   - Clear all, Board preview (what players read, refreshed with the list), Fireworks test.
   ============================================================================ */
import { H } from './feature_manager_state.js';

const E=v=>H.esc(v==null?'':v);
const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||16}" height="${s||16}" alt="" aria-hidden="true">`;
const COLS='36px minmax(0,1fr) 66px';
const ERR=e=>H.errMessage?H.errMessage(e):String(e&&e.message||e);
const TEXT_MIN=3, TEXT_MAX=180, DAYS_MAX=365;
const ROOT='/api/features/living_aven/news';

function when(t){
  const n=Number(t||0); if(!n) return '—';
  const d=new Date(n*1000);
  return d.toLocaleDateString([], {day:'2-digit',month:'2-digit',year:'2-digit'})+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

function items(n){ return `${n} staff news item${n===1?'':'s'}`; }

function crierTextProblem(text){
  const t=String(text||'').split(/\s+/).filter(Boolean).join(' ');
  if(t.length<TEXT_MIN||t.length>TEXT_MAX) return `A news item needs ${TEXT_MIN} to ${TEXT_MAX} characters.`;
  if(!/^[\x20-\x7e]*$/.test(t)) return 'English text only: printable ASCII characters (no accents, emoji or Chinese).';
  return '';
}

export function fmCrierHtml(name){
  if(name!=='living_aven'||!(H.can&&H.can('living_aven.news'))) return '';
  return `<section class="fx-card" id="fm-crier" data-fmcrier="1"><div class="fx-card-h">${IC('status_info',26)}<div class="fx-card-t"><h2>Town crier news</h2>
      <p>Staff news items of the Aven News Board: talk to Secretary Waver in Aven (or type /news) to read them; a cried item is also called out in the chat near her. Players see a change within the minute.</p></div>
      <div class="fx-toolbar"><button class="mini" data-fmcrreload="1">Refresh</button> <button class="mini" data-fmcrboard="1">Board preview</button> <button class="mini" data-fmcrfx="1">Fireworks test</button></div></div>
    <div data-fmcrbody="1"><div class="fx-note">${IC('status_info')} Loading…</div></div><div data-fmcrboardbox="1"></div></section>`;
}

function metaLine(n, now){
  const until=Number(n.until||0), gone=until&&until<=now;
  const parts=[`added ${when(n.at)}`, until?`${gone?'expired':'until'} ${when(until)}`:'no end', n.cry===false?'not cried':'cried'];
  if(n.by) parts.push(`by ${n.by}`);
  return parts.map(E).join(' · ');
}

function listHtml(list){
  if(!list.length) return `<div class="fx-note">${IC('status_info')} No staff news.</div>`;
  const now=Date.now()/1000;
  return `<div class="fx-table" style="overflow-x:auto"><div class="fx-thead" style="grid-template-columns:${COLS}"><span>Id</span><span>News item</span><span></span></div>
    ${list.map(n=>`<div class="fx-frow" style="grid-template-columns:${COLS};align-items:start"><span>#${E(n.id)}</span>
      <span style="min-width:0"><span class="fx-fname" style="display:block;white-space:normal;overflow-wrap:anywhere">${E(n.text||'')}</span>
      <span class="esub" style="display:block;margin-top:3px;overflow-wrap:anywhere">${metaLine(n, now)}</span></span>
      <span style="display:flex;flex-direction:column;gap:4px"><button class="mini" data-fmcredit="${E(n.id)}">Edit</button><button class="mini" data-fmcrdel="${E(n.id)}">Delete</button></span></div>`).join('')}</div>`;
}

function formHtml(){
  return `<div class="fx-note" style="display:block;margin-top:10px">
    <b data-fmcrtitle="1">Add a news item</b> <span class="esub">(English, ${TEXT_MIN} to ${TEXT_MAX} characters)</span>
    <textarea data-fmcrf="text" maxlength="${TEXT_MAX}" rows="3" placeholder="Example: The Weekly Jackpot draw is on Saturday at 21:00 at the Aven fountain." style="display:block;width:100%;margin-top:6px;resize:vertical;line-height:1.35;font-family:inherit"></textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
      <span data-fmcrcount="1" class="esub">0 / ${TEXT_MAX}</span>
      <label style="display:inline-flex;gap:4px;align-items:center">Days <input data-fmcrf="days" type="number" min="0" max="${DAYS_MAX}" value="14" style="width:70px"></label>
      <span class="esub">0 = no end</span>
      <label style="display:inline-flex;gap:4px;align-items:center"><input data-fmcrf="cry" type="checkbox" checked> Cried by the crier</label>
      <button class="mini gold" data-fmcradd="1">Add</button>
      <button class="mini" data-fmcrcancel="1" style="display:none">Cancel edit</button>
      <button class="mini" data-fmcrclear="1">Clear all</button>
    </div></div>`;
}

async function load(card){
  const body=card.querySelector('[data-fmcrbody]'); if(!body) return;
  let r;
  try{ r=await H.fmGet(ROOT); }
  catch(e){ if(card.isConnected) body.innerHTML=`<div class="fx-note fx-bad">${IC('status_error')} Town crier news: ${E(ERR(e))}</div>`; return; }
  if(!card.isConnected) return;
  card._crEnv=String(r.env||'').toUpperCase();
  const list=r.items||[];
  card._crItems=list; card._crEdit=null;
  body.innerHTML=`<div class="fx-note">${IC('status_info')} Environment <b>${E(card._crEnv)}</b> · ${items(list.length)}</div>${listHtml(list)}${formHtml()}`;
  wire(card);
  const box=card.querySelector('[data-fmcrboardbox]');
  if(box&&box.innerHTML) fillBoard(card);
}

function setEdit(card, n){
  const f=k=>card.querySelector(`[data-fmcrf="${k}"]`);
  const add=card.querySelector('[data-fmcradd]'), cancel=card.querySelector('[data-fmcrcancel]'), title=card.querySelector('[data-fmcrtitle]');
  if(!f('text')||!f('days')||!f('cry')) return;
  card._crEdit=n?Number(n.id):null;
  if(n){
    const until=Number(n.until||0), left=until?Math.ceil((until-Date.now()/1000)/86400):0;
    f('text').value=n.text||''; f('days').value=String(until?(left>0?Math.min(left,DAYS_MAX):14):0); f('cry').checked=n.cry!==false;
  }else{ f('text').value=''; f('days').value='14'; f('cry').checked=true; }
  if(add) add.textContent=n?`Save #${n.id}`:'Add';
  if(cancel) cancel.style.display=n?'':'none';
  if(title) title.textContent=n?`Edit news item #${n.id}`:'Add a news item';
  f('text').dispatchEvent(new Event('input'));
  if(n) f('text').focus();
}

function editToast(eid, r){
  const nid=r.id||'?', why=r.old_error?` (${r.old_error})`:'';
  if(r.old_status==='deleted') return [`News item #${eid} replaced by #${nid}`,'ok'];
  if(r.old_status==='already_gone') return [`News item #${nid} added; #${eid} had already been removed${why}, nothing to clean`,'warn'];
  return [`News item #${nid} added, but the removal of #${eid} was not confirmed${why}: check the list and delete #${eid} if it is still there`,'warn'];
}

function wire(card){
  const f=k=>card.querySelector(`[data-fmcrf="${k}"]`);
  const count=()=>{ const c=card.querySelector('[data-fmcrcount]'), t=f('text'); if(c&&t) c.textContent=`${t.value.length} / ${TEXT_MAX}`; };
  if(f('text')) f('text').oninput=count;
  count();
  card.querySelectorAll('[data-fmcredit]').forEach(b=>b.onclick=()=>{
    const n=(card._crItems||[]).find(x=>String(x.id)===b.dataset.fmcredit); if(n) setEdit(card, n);
  });
  const cancel=card.querySelector('[data-fmcrcancel]');
  if(cancel) cancel.onclick=()=>setEdit(card, null);
  const add=card.querySelector('[data-fmcradd]');
  if(add) add.onclick=async()=>{
    const text=(f('text').value||'').trim(), days=Number(f('days').value===''?14:f('days').value), cry=!!f('cry').checked;
    const bad=crierTextProblem(text); if(bad){ H.toast(bad,'warn'); return; }
    if(!(Number.isInteger(days)&&days>=0&&days<=DAYS_MAX)){ H.toast(`Days must be between 0 (no end) and ${DAYS_MAX}`,'warn'); return; }
    const eid=card._crEdit;
    const span=days?` for <b>${days} day(s)</b>`:' with <b>no end</b>', how=cry?', cried by the crier':', not cried';
    const ok=eid
      ?await H.fmConfirm('Save news item',`Replace news item <b>#${E(eid)}</b> on <b>${E(card._crEnv)}</b> with this text${span}${how}? The new item gets a new number and today's date.<br><br><i>${E(text)}</i>`,'Save')
      :await H.fmConfirm('Add a news item',`Add this news item on <b>${E(card._crEnv)}</b>${span}${how}?<br><br><i>${E(text)}</i>`,'Add');
    if(!ok) return;
    const run=async()=>{
      try{
        if(eid){
          const r=await H.fmPost(ROOT+'/edit',{id:eid,text,days,cry});
          const [msg,kind]=editToast(eid, r); H.toast(msg, kind);
        }else{
          const r=await H.fmPost(ROOT+'/add',{text,days,cry}); H.toast(`News item #${r.id||'?'} added`,'ok');
        }
      }catch(e){ H.toast(ERR(e),'error'); return; }
      await load(card);
    };
    return H.runBusy?H.runBusy(add, run):run();
  };
  card.querySelectorAll('[data-fmcrdel]').forEach(b=>b.onclick=async()=>{
    const id=Number(b.dataset.fmcrdel);
    const ok=await H.fmConfirm('Delete news item',`Delete news item <b>#${E(id)}</b> on <b>${E(card._crEnv)}</b>? It leaves the board within the minute.`,'Delete');
    if(!ok) return;
    const run=async()=>{
      try{ await H.fmPost(ROOT+'/del',{id}); H.toast(`News item #${id} deleted`,'ok'); }
      catch(e){ H.toast(ERR(e),'error'); return; }
      await load(card);
    };
    return H.runBusy?H.runBusy(b, run):run();
  });
  const clr=card.querySelector('[data-fmcrclear]');
  if(clr) clr.onclick=async()=>{
    const ok=await H.fmConfirm('Clear all news items',`Remove <b>every</b> staff news item on <b>${E(card._crEnv)}</b>? Records and event results stay on the board.`,'Clear all');
    if(!ok) return;
    const run=async()=>{
      try{ await H.fmPost(ROOT+'/clear',{}); H.toast('All staff news items removed','ok'); }
      catch(e){ H.toast(ERR(e),'error'); return; }
      await load(card);
    };
    return H.runBusy?H.runBusy(clr, run):run();
  };
}

async function fillBoard(card){
  const box=card.querySelector('[data-fmcrboardbox]'); if(!box) return;
  box.innerHTML=`<div class="fx-fdet">Loading…</div>`;
  try{
    const r=await H.fmGet(ROOT+'/board');
    if(card.isConnected) box.innerHTML=`<div class="fx-note" style="display:block"><b>Board preview</b> <span class="esub">(revision ${E(r.rev==null?'?':r.rev)}, what players read)</span><pre style="white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 0;font-size:12px">${E((r.rows||[]).map(x=>x.kind+'  '+x.text).join('\n')||'(empty board)')}</pre></div>`;
  }catch(e){ if(card.isConnected) box.innerHTML=`<div class="fx-note fx-bad">${IC('status_error')} ${E(ERR(e))}</div>`; }
}

async function showBoard(card, btn){
  const box=card.querySelector('[data-fmcrboardbox]'); if(!box) return;
  if(box.innerHTML){ box.innerHTML=''; return; }
  const run=()=>fillBoard(card);
  return H.runBusy?H.runBusy(btn, run):run();
}

async function fireworks(card, btn){
  const env=card._crEnv||'';
  const ok=await H.fmConfirm('Fireworks test',`Show the fireworks over the crier once on every channel of <b>${E(env)}</b>? Players near her see them.`,'Fireworks');
  if(!ok) return;
  const run=async()=>{
    try{
      const r=await H.fmPost(ROOT+'/fireworks',{});
      const chans=(r.channels||[]).map(c=>`Ch${c.channel}: ${c.answer}`).join(', ')||'no channel answered';
      H.toast(`Fireworks ${r.ok?'shown':'not shown everywhere'}: ${chans}`, r.ok?'ok':'warn');
    }catch(e){ H.toast(ERR(e),'error'); }
  };
  return H.runBusy?H.runBusy(btn, run):run();
}

export function fmRenderCrier(card){
  if(!card) return;
  const r=card.querySelector('[data-fmcrreload]'); if(r) r.onclick=()=>load(card);
  const b=card.querySelector('[data-fmcrboard]'); if(b) b.onclick=()=>showBoard(card, b);
  const x=card.querySelector('[data-fmcrfx]'); if(x) x.onclick=()=>fireworks(card, x);
  load(card);
}
