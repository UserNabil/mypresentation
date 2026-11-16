/* ============================================================================
   FEATURE MANAGER — back-office (eden-bo) line of the server card of polls and
   messages: what the BO serves for the active env, and Configure back-office.

   The deploy of the feature configures the BO by itself (dev/preprod, SA);
   the button re-runs it. PROD is never touched without the confirmation below.
   ============================================================================ */
import { H, fm } from './feature_manager_state.js';

const E=v=>H.esc(v==null?'':v);
const ICON={ok:'status_success',warn:'status_warning',bad:'status_error',na:'status_info'};
const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||16}" height="${s||16}" alt="" aria-hidden="true">`;

const BO_ENV_FEATURES=['polls','messages'];

export function fmBoEnvHtml(name){
  if(!BO_ENV_FEATURES.includes(name)) return '';
  return `<div class="fx-note" id="fm-boenv" data-fmboenv="${E(name)}">${IC('status_info')} Back-office: checking…</div>`;
}

function paint(el, st, err){
  const name=el.dataset.fmboenv;
  const lvl=err?'bad':(st.level||'na');
  const line=err?('Back-office: '+err):st.line;
  const last=st&&st.last;
  const when=last&&last.at?` <span class="esub">(last run ${E(last.at)}${last.by?' by '+E(last.by):''}${last.trigger?', '+E(last.trigger):''})</span>`:'';
  const btn=H.can('features.release')?` <button class="mini${lvl==='ok'?'':' gold'}" data-fmboenvgo="${E(name)}" title="Add this environment to the ${E(name)} back-office (database tested first, password kept on the back-office only)">Configure back-office</button>`:'';
  el.className='fx-note'+(lvl==='bad'?' fx-bad':'');
  el.innerHTML=`${IC(ICON[lvl]||ICON.na)} <span>${E(line)}</span>${when}${btn}`;
  const b=el.querySelector('[data-fmboenvgo]');
  if(b) b.onclick=()=>configure(el, st);
}

export async function fmRenderBoEnv(el){
  if(!el) return;
  const name=el.dataset.fmboenv;
  try{
    const st=await H.fmGet('/api/features/server/bo-env?feature='+encodeURIComponent(name));
    if(el.isConnected) paint(el, st, null);
  }catch(e){ if(el.isConnected) paint(el, {env:''}, H.errMessage?H.errMessage(e):String(e&&e.message||e)); }
}

async function configure(el, st){
  const name=el.dataset.fmboenv, env=String((st&&st.env)||(fm().list||{}).env||'').toLowerCase();
  const b=el.querySelector('[data-fmboenvgo]');
  let confirmProd=false;
  if(env==='prod'){
    const ok=await H.fmConfirm('PROD back-office',
      `Add <b>PROD</b> to the <b>${E(name)}</b> back-office (eden-bo)?<br><br>The back-office will connect to the PROD database `+
      `(fndb1 + fnmember) with the password of the PROD setup.ini, tested first, kept on the back-office only. `+
      `Players on PROD start using the back-office ${E(name)} service right away.`,'Configure PROD');
    if(!ok) return;
    confirmProd=true;
  }
  const run=async()=>{
    try{
      const r=await H.fmPost('/api/features/server/bo-env',{feature:name,confirm_prod:confirmProd});
      H.toast('Back-office: '+(r.message||'done'), r.ok?'ok':'warn');
    }catch(e){ H.toast(H.httpErr?H.httpErr(e):String(e&&e.message||e),'error'); }
    await fmRenderBoEnv(el);
  };
  if(b&&H.runBusy) return H.runBusy(b, run);
  return run();
}
