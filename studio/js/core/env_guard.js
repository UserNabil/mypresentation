(function () {
  if (window.__edenEnvGuard || !window.fetch) return;
  var KEY = 'eden_active_env';
  var RELOAD_KEY = 'eden_env_reload_at';
  var SWITCH = '/api/environments/active';
  var g = { page: null, target: null, switching: false, changed: null };
  window.__edenEnvGuard = g;
  try {
    var last = localStorage.getItem(KEY);
    if (/^[a-z]{2,16}$/.test(last || '')) g.page = last;
  } catch (e) {}

  function store(env) {
    try { localStorage.setItem(KEY, env); } catch (e) {}
  }

  function typing() {
    var a = document.activeElement;
    if (!a) return false;
    var tag = (a.tagName || '').toLowerCase();
    return (tag === 'textarea' || (tag === 'input' && /^(text|search|email|number|password|url|)$/i.test(a.type || '')) || a.isContentEditable) && !!(a.value || a.textContent);
  }

  function reload() {
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (e) {}
    location.reload();
  }

  function overlay(env) {
    if (document.getElementById('eden-env-guard')) return;
    var d = document.createElement('div');
    d.id = 'eden-env-guard';
    d.setAttribute('role', 'alertdialog');
    d.setAttribute('aria-live', 'assertive');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,12,16,.72);font:15px/1.4 system-ui,sans-serif';
    var box = document.createElement('div');
    box.style.cssText = 'max-width:420px;width:100%;border-radius:12px;padding:20px;background:var(--bg,#fff);color:var(--ink,#111);box-shadow:0 12px 40px rgba(0,0,0,.35)';
    var h = document.createElement('div');
    h.style.cssText = 'font-weight:600;font-size:17px;margin-bottom:8px';
    h.textContent = 'Environment is now ' + env.toUpperCase();
    var p = document.createElement('div');
    p.style.cssText = 'margin-bottom:16px;opacity:.85';
    p.textContent = 'This page still shows ' + String(g.page || '').toUpperCase() + '. Actions are blocked until it reloads.';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Reload now';
    b.style.cssText = 'padding:8px 16px;border-radius:8px;border:0;cursor:pointer;background:var(--accent,#2563eb);color:#fff;font:inherit';
    b.onclick = reload;
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(b);
    d.appendChild(box);
    (document.body || document.documentElement).appendChild(d);
    try { b.focus(); } catch (e) {}
  }

  function changed(env) {
    if (g.changed === env) return;
    g.changed = env;
    store(env);
    try { window.dispatchEvent(new CustomEvent('eden:env-changed', { detail: { from: g.page, to: env } })); } catch (e) {}
    var recent = 0;
    try { recent = Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch (e) {}
    if (!typing() && !(recent >= 0 && recent < 4000)) {
      reload();
      return;
    }
    if (document.body) overlay(env);
    else document.addEventListener('DOMContentLoaded', function () { overlay(env); });
  }

  function seen(env, src) {
    if (!env) return 'ok';
    if (g.switching) return 'drop';
    if (src === 'switch') {
      g.switching = true;
      g.target = env;
      store(env);
      return 'ok';
    }
    if (g.page === null) {
      g.page = env;
      store(env);
      return 'ok';
    }
    if (env === g.page && !g.changed) {
      store(env);
      return 'ok';
    }
    changed(env);
    return 'drop';
  }

  function refusal(msg, env) {
    var body = JSON.stringify({ detail: msg, env_mismatch: true, page_env: g.page, active_env: env || g.changed || g.target });
    return new Response(body, { status: 409, headers: { 'Content-Type': 'application/json', 'X-Eden-Env': env || '' } });
  }

  g.seen = seen;
  g.blocked = function () { return !!(g.switching || g.changed); };

  var nativeFetch = window.fetch;
  var wrapped = function (input, init) {
    var path = '';
    var method = 'GET';
    try {
      var raw = typeof input === 'string' ? input : (input && input.url) || String(input);
      var u = new URL(raw, location.href);
      if (u.origin === location.origin && u.pathname.indexOf('/api/') === 0) path = u.pathname;
      method = String((init && init.method) || (input && typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    } catch (e) {}
    if (!path) return nativeFetch.call(this, input, init);
    var isSwitch = path === SWITCH;
    var free = isSwitch || path.indexOf('/api/auth/') === 0;
    var mutating = !/^(GET|HEAD|OPTIONS)$/.test(method);
    if (mutating && !free && g.blocked()) {
      return Promise.resolve(refusal('The environment changed: reload the page before acting.'));
    }
    if (mutating && g.page) {
      try {
        init = Object.assign({}, init || {});
        var h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || undefined);
        h.set('X-Eden-Env', g.page);
        init.headers = h;
      } catch (e) {}
    }
    return nativeFetch.call(this, input, init).then(function (res) {
      var env = '';
      try { env = (res.headers.get('X-Eden-Env') || '').toLowerCase(); } catch (e) {}
      if (!env) return res;
      if (isSwitch) {
        if (res.ok) seen(env, 'switch');
        return res;
      }
      if (path.indexOf('/api/auth/') === 0 && g.page !== env) return res;
      if (seen(env, 'api') === 'drop') {
        return refusal('This response belongs to ' + env.toUpperCase() + ' but the page shows ' + String(g.page || '').toUpperCase() + '.', env);
      }
      return res;
    });
  };
  wrapped.__eutWindow = window.fetch.__eutWindow;
  wrapped.__edenEnv = true;
  window.fetch = wrapped;

  window.addEventListener('storage', function (ev) {
    if (ev.key !== KEY || !ev.newValue || g.switching || g.page === null) return;
    if (ev.newValue !== g.page) changed(ev.newValue);
  });
})();
