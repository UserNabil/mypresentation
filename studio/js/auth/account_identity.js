import { $, esc } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { extractCode, groupCode } from './code_extract.js';

const G_LOGO = '<svg class="gsi-logo" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">'
  + '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
  + '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
  + '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'
  + '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>'
  + '</svg>';
const IC_USER = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
const IC_SHIELD = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>';
const IC_MAIL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/></svg>';
const LATER_MS = 7 * 86400 * 1000;
const POLL_MS = 1000;
const POLL_MAX_MS = 200 * 1000;

function q(url) { return url + (url.includes('?') ? '&' : '?') + '__quiet=1'; }

async function api(method, url, body) {
  try {
    const r = await fetch(q(url), { method, headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { detail: 'the tool is not answering' } };
  }
}

function node(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function store(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { }
  return null;
}

function session(k, v) {
  try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (_) { }
  return null;
}

export function initAccountIdentity(bridge) {
  const state = { cfg: {}, job: null, timer: null, view: null, env: null, busy: false, waiting: false,
    mail: { on: false, id: null, env: null, digits: 8, busy: false, offer: null } };
  window.addEventListener('focus', () => { if (state.mail.on && state.mail.id && $('#lgm-s2') && !$('#lgm-s2').hidden) clipOffer(); });

  function poll(id, onStage, onDone) {
    const started = Date.now();
    state.job = id;
    const tick = async () => {
      if (state.job !== id) return;
      const r = await api('GET', '/api/auth/google/status/' + encodeURIComponent(id));
      if (state.job !== id) return;
      if (!r.ok) { state.job = null; onDone({ state: 'error', message: r.data.detail || 'Google sign-in failed' }); return; }
      if (r.data.state === 'pending') {
        if (Date.now() - started > POLL_MAX_MS) { state.job = null; onDone({ state: 'error', message: 'the Google sign-in took too long, start again' }); return; }
        onStage(r.data.stage);
        state.timer = setTimeout(tick, POLL_MS);
        return;
      }
      state.job = null;
      onDone(r.data);
    };
    state.timer = setTimeout(tick, 400);
  }

  function stopPoll() {
    const id = state.job;
    state.job = null;
    clearTimeout(state.timer);
    if (id) api('POST', '/api/auth/google/cancel/' + encodeURIComponent(id));
  }

  function stageText(stage) {
    return stage === 'server' ? 'Checking with the server…' : 'Continue in your browser…';
  }

  function lgEnv() {
    const me = bridge.getMe() || {};
    return bridge.loginEnv() || me.active_env || 'dev';
  }

  function mountLogin() {
    const form = $('#lg-form');
    if (!form || $('#lg-google-box')) return;
    form.after(node(`<div class="lg-google" id="lg-google-box" hidden>
      <div class="lg-or"><span>or</span></div>
      <div class="lg-alts">
        <button type="button" class="lgm-btn" id="lg-email" hidden>${IC_MAIL}<span>Sign in with e-mail</span></button>
        <button type="button" class="gsi-btn" id="lg-google" hidden>${G_LOGO}<span>Sign in with Google</span></button>
      </div>
      <div class="lg-gwait" id="lg-gwait" hidden><span class="aid-spin" aria-hidden="true"></span><span id="lg-gwait-t"></span><button type="button" class="sbtn ghost xs" id="lg-gcancel">Cancel</button></div>
    </div>`));
    $('#lg-google-box').after(node(`<div class="lgm" id="lgm" hidden>
      <div class="lgm-step" id="lgm-s1">
        <div class="lgm-head"><span class="lgm-ic">${IC_MAIL}</span><div><div class="lgm-t">Sign in with e-mail</div><div class="lgm-d" id="lgm-d1"></div></div></div>
        <label class="lgm-l" for="lgm-email">E-mail</label>
        <input id="lgm-email" class="lgm-in" type="email" autocomplete="email" spellcheck="false" placeholder="name@example.com">
        <button type="button" class="sbtn lgm-main" id="lgm-send">Send me a code</button>
      </div>
      <div class="lgm-step" id="lgm-s2" hidden>
        <div class="lgm-head"><span class="lgm-ic">${IC_MAIL}</span><div><div class="lgm-t">Check your e-mail</div><div class="lgm-d" id="lgm-d2"></div></div></div>
        <div class="lgm-lrow"><label class="lgm-l" for="lgm-code">Code</label><button type="button" class="lgm-link" id="lgm-paste">Paste</button></div>
        <input id="lgm-code" class="lgm-in lgm-code" inputmode="numeric" autocomplete="one-time-code" maxlength="14" spellcheck="false" placeholder="Code">
        <button type="button" class="lgm-chip" id="lgm-chip" hidden></button>
        <button type="button" class="sbtn lgm-main" id="lgm-verify">Sign in</button>
        <div class="lgm-links"><button type="button" class="lgm-link" id="lgm-resend">Send a new code</button><button type="button" class="lgm-link" id="lgm-other">Use another e-mail</button></div>
      </div>
      <div class="lgm-err" id="lgm-err" role="alert"></div>
      <button type="button" class="lgm-link lgm-back" id="lgm-back">Back to the other sign-in options</button>
    </div>`));
    $('#lg-google').onclick = startLogin;
    $('#lg-gcancel').onclick = () => { stopPoll(); loginWaiting(false); };
    $('#lg-email').onclick = () => mailMode(true);
    $('#lgm-back').onclick = () => mailMode(false);
    $('#lgm-send').onclick = () => mailSend(false);
    $('#lgm-resend').onclick = () => mailSend(true);
    $('#lgm-other').onclick = () => mailStep(1);
    $('#lgm-verify').onclick = mailVerify;
    $('#lgm-paste').onclick = mailPaste;
    $('#lgm-chip').onclick = () => { const c = state.mail.offer; if (c) mailFill(c); };
    $('#lgm-code').addEventListener('paste', e => {
      const c = extractCode((e.clipboardData && e.clipboardData.getData('text')) || '', state.mail.digits);
      if (c) { e.preventDefault(); mailFill(c); }
    });
    $('#lgm-email').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mailSend(false); } });
    $('#lgm-code').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mailVerify(); } });
    $('#lgm-code').addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g, '').slice(0, state.mail.digits || 8);
      if (v !== e.target.value) e.target.value = v;
      if (v) setOffer(null);
      if (v.length === (state.mail.digits || 8) && !state.mail.busy) mailVerify();
    });
    const seg = $('#lg-envseg');
    if (seg) seg.addEventListener('click', () => setTimeout(() => { if (state.mail.on && state.mail.env !== lgEnv()) mailStep(1); refreshLogin(); }, 0));
    const gate = $('#loginGate');
    if (gate) new MutationObserver(() => { if (gate.classList.contains('on')) refreshLogin(); else mailMode(false); }).observe(gate, { attributes: true, attributeFilter: ['class'] });
    refreshLogin();
  }

  async function refreshLogin() {
    const box = $('#lg-google-box');
    if (!box) return;
    const env = lgEnv();
    const known = state.cfg[env];
    if (known === undefined || (known && known.retryAt && Date.now() >= known.retryAt)) {
      state.cfg[env] = null;
      const r = await api('GET', '/api/auth/google/config?env=' + encodeURIComponent(env));
      const c = r.ok ? { google: !!r.data.enabled, email: !!r.data.email } : { google: false, email: false };
      if (!c.google && !c.email) {
        c.retryAt = Date.now() + 8000;
        setTimeout(() => { if (lgEnv() === env) refreshLogin(); }, 8500);
      }
      state.cfg[env] = c;
    }
    if (lgEnv() !== env) return;
    const c = state.cfg[env] || {};
    $('#lg-google').hidden = !c.google || !!state.waiting;
    $('#lg-email').hidden = !c.email || !!state.waiting;
    box.hidden = !(c.google || c.email) || state.mail.on;
    if (state.mail.on && !c.email && c !== null && state.cfg[env] !== null) mailMode(false);
  }

  function mailErr(text) {
    const e = $('#lgm-err');
    if (e) e.textContent = text || '';
  }

  function mailMode(on) {
    const lgm = $('#lgm');
    if (!lgm) return;
    state.mail.on = !!on;
    const form = $('#lg-form');
    if (form) form.querySelectorAll(':scope > .fld:not(:first-child), #lg-go').forEach(el => { el.hidden = !!on; el.style.display = on ? 'none' : ''; });
    const card = form ? form.closest('.lg-card') : null;
    if (card) card.classList.toggle('lg-by-mail', !!on);
    const hint = $('#lg-hint');
    if (hint) hint.hidden = !!on;
    lgm.hidden = !on;
    if (on) {
      const err = $('#lg-err');
      if (err) { err.textContent = ''; err.style.color = ''; }
      mailStep(1);
      const u = $('#lg-user');
      const em = $('#lgm-email');
      if (u && em && !em.value && u.value.includes('@')) em.value = u.value.trim();
      setTimeout(() => em && em.focus(), 0);
    } else {
      state.mail.id = null;
      mailErr('');
    }
    refreshLogin();
  }

  function mailStep(n) {
    if (!$('#lgm')) return;
    $('#lgm-s1').hidden = n !== 1;
    $('#lgm-s2').hidden = n !== 2;
    mailErr('');
    setOffer(null);
    if (n === 1) {
      state.mail.id = null;
      $('#lgm-d1').textContent = 'We send a one-time code to the address linked to your account on ' + lgEnv() + '.';
      setTimeout(() => $('#lgm-email').focus(), 0);
    } else {
      $('#lgm-code').value = '';
      setTimeout(() => $('#lgm-code').focus(), 0);
    }
  }

  function mailBusy(on, btn, text) {
    state.mail.busy = !!on;
    ['#lgm-send', '#lgm-verify', '#lgm-resend', '#lgm-other', '#lgm-back'].forEach(id => { const b = $(id); if (b) b.disabled = !!on; });
    if (btn) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.textContent = on ? text : btn.dataset.label;
      btn.classList.toggle('loading', !!on);
    }
  }

  async function mailSend(again) {
    if (state.mail.busy) return;
    const email = $('#lgm-email').value.trim();
    if (!email || !email.includes('@')) { mailErr('Type the e-mail address linked to your account.'); $('#lgm-email').focus(); return; }
    const env = lgEnv();
    const btn = again ? $('#lgm-resend') : $('#lgm-send');
    mailErr('');
    mailBusy(true, btn, 'Sending…');
    const r = await api('POST', '/api/auth/email/start', { env, email, accent: document.documentElement.dataset.accent || 'gold' });
    mailBusy(false, btn);
    if (!r.ok) { mailErr(r.data.detail || 'The code could not be sent.'); return; }
    state.mail.id = r.data.id;
    state.mail.env = env;
    state.mail.digits = r.data.digits || 8;
    $('#lgm-code').placeholder = state.mail.digits + ' digits';
    $('#lgm-d2').textContent = 'If ' + (r.data.sent_to || email) + ' is linked to an account on ' + env + ', a ' + state.mail.digits + '-digit code is on its way. It expires in 10 minutes.';
    mailStep(2);
    if (again) toast('A new code is on its way', 'ok');
    setTimeout(clipOffer, 400);
  }

  function mailFill(code) {
    const inp = $('#lgm-code');
    setOffer(null);
    inp.value = code;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
  }

  function setOffer(code) {
    state.mail.offer = code || null;
    const chip = $('#lgm-chip');
    if (!chip) return;
    chip.hidden = !code;
    chip.textContent = code ? 'Use ' + groupCode(code) : '';
  }

  async function clipOffer() {
    if (!state.mail.id || $('#lgm-s2').hidden) { setOffer(null); return; }
    const id = state.mail.id;
    const r = await api('GET', '/api/auth/email/clipboard?id=' + encodeURIComponent(id));
    if (state.mail.id !== id || $('#lgm-s2').hidden) return;
    setOffer(r.ok && r.data && typeof r.data.code === 'string' ? r.data.code : null);
  }

  async function mailPaste() {
    let c = null;
    try { c = extractCode(await navigator.clipboard.readText(), state.mail.digits); } catch (_) { }
    if (!c) { await clipOffer(); c = state.mail.offer; }
    if (c) mailFill(c); else mailErr('No ' + (state.mail.digits || 8) + '-digit code found on the clipboard.');
  }

  async function mailVerify() {
    if (state.mail.busy) return;
    const code = $('#lgm-code').value.replace(/\D/g, '');
    if (code.length < (state.mail.digits || 8)) { mailErr('Type the ' + (state.mail.digits || 8) + '-digit code from the e-mail.'); $('#lgm-code').focus(); return; }
    if (!state.mail.id) { mailStep(1); return; }
    const btn = $('#lgm-verify');
    mailErr('');
    mailBusy(true, btn, 'Checking…');
    const remember = !!($('#lg-remember') && $('#lg-remember').checked);
    const r = await api('POST', '/api/auth/email/verify', { id: state.mail.id, code, remember });
    if (!r.ok) {
      mailBusy(false, btn);
      if (r.status === 404) { mailStep(1); mailErr(r.data.detail || 'This code has expired: ask for a new one.'); return; }
      mailErr(r.data.detail || 'This code is wrong or has expired.');
      $('#lgm-code').select();
      return;
    }
    btn.textContent = 'Signed in, loading…';
    try { await bridge.signedIn(r.data, 'email'); } finally { mailBusy(false, btn); mailMode(false); }
  }

  function loginWaiting(on, text) {
    const w = $('#lg-gwait');
    state.waiting = !!on;
    if (w) w.hidden = !on;
    if (on && $('#lg-gwait-t')) $('#lg-gwait-t').textContent = text || stageText('browser');
    refreshLogin();
  }

  async function startLogin() {
    const err = $('#lg-err');
    if (err) { err.textContent = ''; err.style.color = ''; }
    const env = lgEnv();
    const remember = !!($('#lg-remember') && $('#lg-remember').checked);
    loginWaiting(true, 'Opening your browser…');
    const r = await api('POST', '/api/auth/google/start', { env, remember });
    if (!r.ok) { loginWaiting(false); if (err) err.textContent = r.data.detail || 'Google sign-in failed'; return; }
    poll(r.data.id, stage => loginWaiting(true, stageText(stage)), async st => {
      if (st.state === 'ok' && st.me) {
        if ($('#lg-gwait-t')) $('#lg-gwait-t').textContent = 'Signed in, loading…';
        try { await bridge.signedIn(st.me, 'google'); } finally { loginWaiting(false); }
        return;
      }
      loginWaiting(false);
      if (err) err.textContent = st.state === 'done' ? 'This sign-in was already used, start again.' : (st.message || 'Google sign-in failed');
    });
  }

  function mountModal() {
    if ($('#aidModal')) return;
    document.body.appendChild(node(`<div class="modal" id="aidModal" role="dialog" aria-modal="true" aria-labelledby="aid-title"><div class="sheet aid-sheet">
      <h2 id="aid-title"><span class="aid-hic">${IC_USER}</span> Account</h2>
      <div class="body aid-body">
        <div class="aid-who"><span class="aid-acct" id="aid-account">—</span><div class="aid-envs" id="aid-envs" role="tablist" aria-label="Environment"></div></div>
        <div class="aid-msg" id="aid-msg" hidden></div>
        <section class="aid-sec">
          <div class="aid-row"><div class="aid-txt"><div class="aid-t">E-mail</div><div class="aid-d">Signs you in with a one-time code once it is verified (by Google or by an admin).</div></div><span class="aid-pill" id="aid-email-pill"></span></div>
          <div class="aid-inline"><input id="aid-email" type="email" autocomplete="email" spellcheck="false" placeholder="name@example.com" aria-label="E-mail"><button type="button" class="sbtn ghost" id="aid-email-save">Save</button></div>
        </section>
        <section class="aid-sec">
          <div class="aid-row"><div class="aid-txt"><div class="aid-t">Google</div><div class="aid-d" id="aid-g-d"></div></div><span class="aid-pill" id="aid-g-pill"></span></div>
          <div class="aid-inline" id="aid-g-act"><input id="aid-g-pass" type="password" autocomplete="current-password" placeholder="Current password" aria-label="Current password"><button type="button" class="gsi-btn compact" id="aid-g-link">${G_LOGO}<span>Link Google</span></button><button type="button" class="sbtn ghost" id="aid-g-unlink">Unlink</button></div>
        </section>
        <section class="aid-sec">
          <div class="aid-row"><div class="aid-txt"><div class="aid-t">Password sign-in</div><div class="aid-d">This only affects Reforged Studio. Your game password still works in the game.</div></div><span class="aid-pill" id="aid-p-pill"></span></div>
          <div class="aid-inline" id="aid-p-act"><button type="button" class="sbtn ghost" id="aid-p-btn">Turn off</button><span class="aid-note" id="aid-p-note"></span></div>
          <div class="aid-confirm" id="aid-p-confirm" hidden><div>Turn off password sign-in? You will sign in to Reforged Studio with Google or with an e-mail code. Google asks you to confirm once more.</div><div class="aid-confirm-b"><button type="button" class="sbtn ghost" id="aid-p-no">Cancel</button><button type="button" class="sbtn" id="aid-p-yes">Turn off</button></div></div>
        </section>
        <details class="aid-sec aid-adm" id="aid-admin" hidden>
          <summary class="aid-t">Another account</summary>
          <div class="aid-d">For a teammate: restore a lost sign-in, or turn password sign-in off once their e-mail is verified. Logged with your name.</div>
          <div class="aid-inline aid-adm-row"><input id="aid-a-acct" autocomplete="off" spellcheck="false" placeholder="Account name" aria-label="Account name"><select id="aid-a-action" aria-label="Action"><option value="password_on">Turn password sign-in back on</option><option value="password_off">Turn password sign-in off</option><option value="unlink">Unlink Google</option><option value="clear_email">Clear the e-mail</option></select><button type="button" class="sbtn ghost" id="aid-a-go">Apply</button></div>
        </details>
        <div class="aid-wait" id="aid-wait" hidden><span class="aid-spin" aria-hidden="true"></span><span id="aid-wait-t"></span><button type="button" class="sbtn ghost xs" id="aid-wait-x">Cancel</button></div>
      </div>
      <div class="foot"><button type="button" class="sbtn ghost" id="aid-close">Close</button></div>
    </div></div>`));
    $('#aid-close').onclick = closeModal;
    $('#aidModal').addEventListener('mousedown', e => { if (e.target.id === 'aidModal') closeModal(); });
    $('#aid-email-save').onclick = saveEmail;
    $('#aid-email').addEventListener('keydown', e => { if (e.key === 'Enter') saveEmail(); });
    $('#aid-g-link').onclick = linkGoogle;
    $('#aid-g-unlink').onclick = unlinkGoogle;
    $('#aid-p-btn').onclick = () => {
      const v = state.view || {};
      if (v.password_login) { $('#aid-p-confirm').hidden = false; $('#aid-p-act').hidden = true; } else passwordSignin(true);
    };
    $('#aid-p-no').onclick = () => { $('#aid-p-confirm').hidden = true; $('#aid-p-act').hidden = false; };
    $('#aid-p-yes').onclick = () => { $('#aid-p-confirm').hidden = true; $('#aid-p-act').hidden = false; passwordSignin(false); };
    $('#aid-a-go').onclick = adminApply;
    $('#aid-wait-x').onclick = () => { stopPoll(); waiting(false); };
  }

  function msg(text, kind) {
    const m = $('#aid-msg');
    if (!m) return;
    m.hidden = !text;
    m.textContent = text || '';
    m.className = 'aid-msg' + (kind ? ' ' + kind : '');
  }

  function waiting(on, text) {
    const w = $('#aid-wait');
    if (!w) return;
    w.hidden = !on;
    state.busy = !!on;
    if (on) $('#aid-wait-t').textContent = text || stageText('browser');
    document.querySelectorAll('#aidModal .aid-sec button, #aidModal .aid-sec input, #aidModal .aid-sec select').forEach(b => { b.disabled = !!on; });
  }

  function pill(id, text, kind) {
    const p = $(id);
    if (!p) return;
    p.textContent = text || '';
    p.className = 'aid-pill' + (kind ? ' ' + kind : '');
    p.hidden = !text;
  }

  function render(v) {
    state.view = v;
    const me = bridge.getMe() || {};
    $('#aid-account').textContent = v.account || me.username || '—';
    const envs = (v.envs && v.envs.length ? v.envs : [state.env]);
    $('#aid-envs').innerHTML = envs.map(e => `<button type="button" role="tab" class="aid-env${e === state.env ? ' on' : ''}" aria-selected="${e === state.env}" data-env="${esc(e)}">${esc(e)}</button>`).join('');
    $('#aid-envs').hidden = envs.length < 2;
    document.querySelectorAll('#aid-envs .aid-env').forEach(b => { b.onclick = () => { if (!state.busy && b.dataset.env !== state.env) load(b.dataset.env); }; });
    const em = $('#aid-email');
    if (document.activeElement !== em) em.value = v.email || '';
    if (!v.email) pill('#aid-email-pill', v.prelinked ? 'Set by an admin' : 'Not set', v.prelinked ? 'info' : '');
    else if (v.email_state === 'google') pill('#aid-email-pill', 'Verified by Google', 'ok');
    else if (v.email_state === 'verified') pill('#aid-email-pill', 'Verified', 'ok');
    else if (v.email_state === 'admin') pill('#aid-email-pill', 'Verified by an admin', 'ok');
    else pill('#aid-email-pill', 'Not verified', 'warn');
    const gd = $('#aid-g-d'), pass = $('#aid-g-pass'), link = $('#aid-g-link'), unlink = $('#aid-g-unlink');
    if (!v.google_available) {
      pill('#aid-g-pill', 'Not available', '');
      gd.textContent = 'Google sign-in is not set up on this server yet.';
      $('#aid-g-act').hidden = true;
    } else if (v.google_linked) {
      pill('#aid-g-pill', 'Linked', 'ok');
      gd.textContent = 'Linked to ' + (v.google_email_masked || 'your Google account') + '. You can use Sign in with Google.';
      $('#aid-g-act').hidden = !v.password_login;
      pass.hidden = !v.password_login;
      link.hidden = true;
      unlink.hidden = !v.password_login;
      if (!v.password_login) gd.textContent += ' Turn password sign-in back on to change or unlink it.';
    } else {
      pill('#aid-g-pill', 'Not linked', '');
      gd.textContent = v.prelinked ? 'An admin prepared a link for you: Sign in with Google once, or type your password and link now.'
        : 'Type your current password, then pick your Google account in the browser.';
      $('#aid-g-act').hidden = false;
      pass.hidden = false;
      link.hidden = false;
      unlink.hidden = true;
    }
    pill('#aid-p-pill', v.password_login ? 'On' : 'Off', v.password_login ? '' : 'ok');
    const pb = $('#aid-p-btn'), pn = $('#aid-p-note');
    pb.textContent = v.password_login ? 'Turn off' : 'Turn back on';
    pb.className = v.password_login ? 'sbtn ghost' : 'sbtn';
    const canGoogle = !!(v.google_available && v.google_linked);
    pb.disabled = !canGoogle;
    const mailOk = ['google', 'verified', 'admin'].includes(v.email_state) || !!v.prelinked;
    pn.textContent = canGoogle ? (v.password_login ? 'Recommended: a password can be guessed or leaked.' : 'Google confirms the change.')
      : (mailOk ? 'Your e-mail is verified: an admin turns password sign-in off for you.' : 'Link Google, or send your e-mail to the admin on Discord.');
    $('#aid-admin').hidden = !v.is_sa;
  }

  async function load(env, refresh) {
    state.env = env;
    msg('');
    const r = await api('GET', '/api/auth/identity?env=' + encodeURIComponent(env) + (refresh ? '&refresh=1' : ''));
    if (!r.ok) {
      render({ account: (bridge.getMe() || {}).username, envs: [env], google_available: false, password_login: true });
      msg(r.data.detail || 'Your account details could not be read.', 'bad');
      return null;
    }
    render(r.data);
    return r.data;
  }

  function openModal(focus) {
    mountModal();
    const me = bridge.getMe() || {};
    $('#aidModal').classList.add('open');
    waiting(false);
    $('#aid-p-confirm').hidden = true;
    $('#aid-p-act').hidden = false;
    $('#aid-g-pass').value = '';
    load(state.env && state.view ? state.env : (me.active_env || 'dev'), true).then(v => {
      if (!v) return;
      if (focus === 'link' && !$('#aid-g-pass').hidden) $('#aid-g-pass').focus();
      if (focus === 'password' && v.google_linked && v.password_login) { $('#aid-p-confirm').hidden = false; $('#aid-p-act').hidden = true; }
    });
  }

  function closeModal() {
    if (state.busy) stopPoll();
    waiting(false);
    const m = $('#aidModal');
    if (m) m.classList.remove('open');
  }

  async function saveEmail() {
    const email = $('#aid-email').value.trim();
    msg('');
    const r = await api('POST', '/api/auth/identity/email', { email, env: state.env });
    if (!r.ok) { msg(r.data.detail || 'The e-mail could not be saved.', 'bad'); return; }
    render(Object.assign({}, state.view, r.data));
    toast(email ? 'E-mail saved' : 'E-mail removed', 'ok');
  }

  function runJob(start, body, doneText) {
    msg('');
    waiting(true, 'Opening your browser…');
    api('POST', start, body).then(r => {
      if (!r.ok) { waiting(false); msg(r.data.detail || 'Google sign-in failed', 'bad'); return; }
      poll(r.data.id, stage => waiting(true, stageText(stage)), st => {
        waiting(false);
        if (st.state === 'ok' && st.identity) {
          render(Object.assign({}, state.view, st.identity));
          msg(doneText, 'ok');
          toast(doneText, 'ok');
          return;
        }
        msg(st.message || 'Google sign-in failed', 'bad');
      });
    });
  }

  function linkGoogle() {
    const pw = $('#aid-g-pass').value;
    if (!pw) { msg('Type your current password first.', 'bad'); $('#aid-g-pass').focus(); return; }
    $('#aid-g-pass').value = '';
    runJob('/api/auth/google/link', { env: state.env, password: pw }, 'Google is linked: you can now use Sign in with Google.');
  }

  async function unlinkGoogle() {
    const pw = $('#aid-g-pass').value;
    if (!pw) { msg('Type your current password to unlink Google.', 'bad'); $('#aid-g-pass').focus(); return; }
    $('#aid-g-pass').value = '';
    const r = await api('POST', '/api/auth/google/unlink', { env: state.env, password: pw });
    if (!r.ok) { msg(r.data.detail || 'Google could not be unlinked.', 'bad'); return; }
    render(Object.assign({}, state.view, r.data));
    msg('Google is unlinked.', 'ok');
  }

  function passwordSignin(enabled) {
    runJob('/api/auth/password-signin', { env: state.env, enabled },
      enabled ? 'Password sign-in is back on.' : 'Password sign-in is off: use Sign in with Google from now on.');
  }

  async function adminApply() {
    const account = $('#aid-a-acct').value.trim();
    if (!account) { msg('Type the account name.', 'bad'); return; }
    const action = $('#aid-a-action').value;
    const r = await api('POST', '/api/auth/identity/admin', { env: state.env, account, action });
    if (!r.ok) { msg(r.data.detail || 'The change was refused.', 'bad'); return; }
    msg('Done for ' + account + '.', 'ok');
  }

  function mountBanner() {
    if ($('#aidBanner')) return;
    document.body.appendChild(node(`<div class="aid-banner" id="aidBanner" role="region" aria-labelledby="aid-bn-t" hidden>
      <div class="aid-bn-ic">${IC_SHIELD}</div>
      <div class="aid-bn-txt"><div class="aid-bn-t" id="aid-bn-t">Security update: password sign-in is going away</div>
        <p class="aid-bn-p">To protect your account, you will sign in with your e-mail and a one-time code (or with Google). Send your e-mail address to the admin on Discord so we can link it to your account. Password sign-in will then be turned off.</p></div>
      <div class="aid-bn-b"><button type="button" class="sbtn ghost" id="aid-bn-later">Later</button><button type="button" class="sbtn" id="aid-bn-go">Open account settings</button></div>
    </div>`));
  }

  function hideBanner() {
    const b = $('#aidBanner');
    if (b) b.hidden = true;
  }

  async function maybePrompt(tries) {
    const me = bridge.getMe() || {};
    if (!me.authenticated) { if ((tries || 0) < 4) setTimeout(() => maybePrompt((tries || 0) + 1), 2500); return; }
    const env = me.active_env || 'dev';
    const r = await api('GET', '/api/auth/identity?env=' + encodeURIComponent(env));
    if (!r.ok) return;
    const v = r.data;
    if (v.signed_in_with !== 'password' || v.password_login === false || !v.email_code_available) { hideBanner(); return; }
    const linked = !!(v.google_linked || v.prelinked || ['google', 'verified', 'admin'].includes(v.email_state));
    const key = 'aid.later.' + (v.account || me.username || '').toLowerCase() + '.banner' + (linked ? '.linked' : '');
    if (Number(store(key) || 0) > Date.now() || session(key) === '1') return;
    mountBanner();
    const b = $('#aidBanner');
    $('#aid-bn-t').textContent = linked ? 'You are all set: use your e-mail code or Google next time'
      : 'Security update: password sign-in is going away';
    b.querySelector('.aid-bn-p').textContent = linked
      ? 'Your account is already linked' + (v.google_linked ? ' to Google' : ' to your e-mail') + '. Next time, sign in with '
        + (v.google_linked ? 'Google' : 'your e-mail and a one-time code') + ' instead of your password. Password sign-in will be turned off soon; nothing else to do.'
      : 'To protect your account, you will sign in with your e-mail and a one-time code (or with Google). Send your e-mail address to the admin on Discord so we can link it to your account. Password sign-in will then be turned off.';
    $('#aid-bn-go').textContent = linked ? 'OK' : 'Open account settings';
    $('#aid-bn-later').onclick = () => { store(key, String(Date.now() + LATER_MS)); hideBanner(); };
    $('#aid-bn-go').onclick = linked
      ? () => { store(key, String(Date.now() + 30 * 864e5)); hideBanner(); }
      : () => { session(key, '1'); hideBanner(); openModal(); };
    b.hidden = false;
  }

  function wireMenu() {
    const b = $('#um-account');
    if (b) b.onclick = () => { try { bridge.closeSettings(); } catch (_) { } openModal(); };
  }

  function mountRegister() {
    const modal = $('#accountsModal');
    if (!modal || $('#aid-reg')) return;
    const body = modal.querySelector('.body');
    if (!body) return;
    body.prepend(node(`<section class="aid-sec aid-reg" id="aid-reg" hidden>
      <div class="aid-row"><div class="aid-txt"><div class="aid-t">Sign-in e-mail</div><div class="aid-d" id="aid-r-d"></div></div><span class="aid-pill info" id="aid-r-env"></span></div>
      <div class="aid-inline"><input id="aid-r-acct" autocomplete="off" spellcheck="false" placeholder="Account name" aria-label="Account name"><input id="aid-r-mail" type="email" autocomplete="off" spellcheck="false" placeholder="name@example.com" aria-label="E-mail"><button type="button" class="sbtn" id="aid-r-go">Register</button></div>
      <div class="aid-msg" id="aid-r-msg" hidden></div>
    </section>`));
    $('#aid-r-go').onclick = registerEmail;
    $('#aid-r-mail').addEventListener('keydown', e => { if (e.key === 'Enter') registerEmail(); });
    new MutationObserver(() => { if (modal.classList.contains('open')) renderRegister(); }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    renderRegister();
  }

  function renderRegister() {
    const sec = $('#aid-reg');
    if (!sec) return;
    const me = bridge.getMe() || {};
    const env = me.active_env || 'dev';
    sec.hidden = !(me.is_sa || me.role === 'SA');
    $('#aid-r-env').textContent = env;
    $('#aid-r-d').textContent = 'When a teammate sends you their e-mail on Discord, register it here: they can then sign in on ' + env + ' with a one-time code. Logged with your name.';
  }

  function regMsg(text, kind) {
    const m = $('#aid-r-msg');
    if (!m) return;
    m.hidden = !text;
    m.textContent = text || '';
    m.className = 'aid-msg' + (kind ? ' ' + kind : '');
  }

  async function registerEmail() {
    const account = $('#aid-r-acct').value.trim();
    const email = $('#aid-r-mail').value.trim();
    if (!account || !email || !email.includes('@')) { regMsg('Type the exact account name and the e-mail address.', 'bad'); return; }
    const env = (bridge.getMe() || {}).active_env || 'dev';
    const btn = $('#aid-r-go');
    btn.disabled = true;
    regMsg('');
    const r = await api('POST', '/api/auth/identity/admin', { env, account, action: 'set_email', email });
    btn.disabled = false;
    if (!r.ok) { regMsg(r.data.detail || 'The e-mail could not be registered.', 'bad'); return; }
    $('#aid-r-mail').value = '';
    regMsg(account + ' can now sign in on ' + env + ' with a code sent to ' + (r.data.email_masked || 'this address') + '.', 'ok');
  }

  function boot() {
    mountLogin();
    wireMenu();
    mountRegister();
    if (session('aid.prompt') === '1') session('aid.prompt', null);
    setTimeout(() => maybePrompt(0), 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);

  return {
    beforeReload(how) { if (how === 'password') session('aid.prompt', '1'); },
    afterSignIn(how) { if (how === 'password') setTimeout(() => maybePrompt(0), 1500); else hideBanner(); },
    open: openModal,
    prompt: maybePrompt,
  };
}
