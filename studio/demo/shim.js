(function () {
  'use strict';
  var SELF = document.currentScript;
  var BASE = new URL('../', SELF.src).pathname;
  var DATA = BASE + 'demo/data/';
  var NativeXHR = window.XMLHttpRequest;
  var nativeFetch = window.fetch.bind(window);
  var SKEY = 'eden.demo.state.v1';

  function loadJSON(url) {
    var x = new NativeXHR();
    x.open('GET', url, false);
    x.send();
    if (x.status < 200 || x.status >= 300) return {};
    try { return JSON.parse(x.responseText); } catch (e) { return {}; }
  }

  var FX = loadJSON(DATA + 'api.json');
  var ROWS = FX.__rows || {};
  var PATHIDX = {};
  Object.keys(FX).forEach(function (k) {
    if (k.charAt(0) !== '/') return;
    var p = k.split('?')[0];
    (PATHIDX[p] = PATHIDX[p] || []).push(k);
  });

  var ST = { user: 'demo', edits: {}, journal: [], jobs: {}, kv: {}, pw: 'demo', notifRead: false, done: {}, seq: 9000 };
  try {
    var raw = sessionStorage.getItem(SKEY);
    if (raw) ST = Object.assign(ST, JSON.parse(raw));
  } catch (e) { }
  ST.user = 'demo';
  function save() { try { sessionStorage.setItem(SKEY, JSON.stringify(ST)); } catch (e) { } }

  var T0 = Date.now();
  var NOW = function () { return Date.now(); };
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function nextId() { ST.seq += 1; return ST.seq; }
  function isoNow() { return new Date().toISOString().replace('T', ' ').replace('Z', '+00'); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function normPath(u) {
    var url;
    try { url = new URL(u, location.href); } catch (e) { return null; }
    if (url.origin !== location.origin) return null;
    var p = url.pathname;
    if (p.indexOf(BASE) === 0) p = '/' + p.slice(BASE.length);
    return { path: p, search: url.searchParams, raw: url };
  }

  function sortedKey(path, sp) {
    var arr = [];
    sp.forEach(function (v, k) { arr.push([k, v]); });
    arr.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; });
    if (!arr.length) return path;
    return path + '?' + arr.map(function (p) { return encodeURIComponent(p[0]).replace(/%20/g, '+') + '=' + encodeURIComponent(p[1]).replace(/%20/g, '+'); }).join('&');
  }

  function fxGet(path, sp) {
    var k = sortedKey(path, sp);
    if (FX[k]) return FX[k];
    var cand = PATHIDX[path];
    if (cand && cand.length) {
      var best = cand[0], bs = -1;
      cand.forEach(function (c) {
        var q = new URLSearchParams(c.split('?')[1] || '');
        var s = 0;
        q.forEach(function (v, kk) { if (sp.get(kk) === v) s += 2; else if (sp.has(kk)) s += 1; });
        if (s > bs) { bs = s; best = c; }
      });
      return FX[best];
    }
    return null;
  }

  function ok(b) { return [200, b]; }
  var DEMO_ACCOUNT = 'demo';

  function meBody() {
    var base = fxGet('/api/auth/me', new URLSearchParams());
    if (!base) base = { action_min: {} };
    var b = clone(base[2] || base);
    if (!ST.user) {
      return { authenticated: false, active_env: 'dev', envs: ['dev', 'preprod', 'prod'], action_min: b.action_min || {} };
    }
    b.authenticated = true;
    b.username = DEMO_ACCOUNT;
    b.roles = { dev: 'SA', preprod: 'SA', prod: 'SA' };
    b.role = 'SA';
    b.is_sa = true;
    b.is_cm = true;
    b.source = 'local';
    b.must_change = false;
    b.active_env = 'dev';
    delete b.signin_reason;
    return b;
  }

  var JOBS = {
    pkg: { dur: 9000 },
    default: { dur: 5000 }
  };

  function startJob(name, dur, extra) {
    ST.jobs[name] = Object.assign({ t0: NOW(), dur: dur || 5000 }, extra || {});
    save();
  }
  function jobState(name) {
    var j = ST.jobs[name];
    if (!j) return null;
    var el = NOW() - j.t0;
    var pct = Math.min(1, el / j.dur);
    return { j: j, pct: pct, done: pct >= 1, el: el };
  }

  function pkgStatus(key) {
    var s = jobState('pkg:' + key);
    if (!s) return { running: false, finished: false, live: {} };
    if (!s.done) {
      var tot = 18420, tb = 2147483648;
      return {
        running: true, finished: false,
        live: {
          phase: 'write', phase_label: key === 'depack' ? 'Extracting archive' : key === 'pack' ? 'Packing archive' : 'Repacking changed files',
          files_total: tot, files_done: Math.round(tot * s.pct), bytes_total: tb, bytes_done: Math.round(tb * s.pct),
          rate_bps: 91000000, eta_s: Math.round((1 - s.pct) * s.j.dur / 1000), folder: ['data/db', 'uidata', 'item', 'monster/model'][Math.floor(s.pct * 4) % 4]
        }
      };
    }
    var files = [
      { path: 'data/db/c_item.ini', status: 'written', kind: 'changed', bytes: 5351239 },
      { path: 'data/db/c_monster.ini', status: 'written', kind: 'changed', bytes: 2207352 },
      { path: 'uidata/layouts/OptionControlUIVer2.layout', status: 'written', kind: 'changed', bytes: 48211 },
      { path: 'item/Q00134.dds', status: 'written', kind: 'added', bytes: 87424 },
      { path: 'item/Q00133.dds', status: 'written', kind: 'added', bytes: 87424 }
    ];
    return {
      running: false, finished: true, error: null, errors: [], elapsed: Math.round(s.j.dur / 100) / 10,
      report: { files: files, written: files.length, added: 2, modified: 3, total_files: 18420, bytes: 2147483648, backups: 5, verified: true },
      verify: { counts: { ok: 18420, missing: 0, different: 0, unreadable: 0, stale: 0 }, content_checked: 5, trusted: 18415, elapsed: 3.2, folders: [], problems: [], index_mismatch: [] },
      result: 'ok', ok: true
    };
  }

  function featureNames() {
    var pg = FX['/api/features/page'];
    var b = pg && (pg[2] || pg);
    var list = b && b.list && (b.list.items || b.list.features || b.list.rows);
    return list || [];
  }

  function noteJournal(cat, action, target, detail) {
    ST.journal.unshift({ ts: isoNow(), actor: DEMO_ACCOUNT, role: 'SA', category: cat, action: action, target: target || '', detail: detail || {}, ok: true, id: String(nextId()) });
    ST.journal = ST.journal.slice(0, 60);
    save();
  }

  function applyEditsToDetail(d, key) {
    var e = ST.edits[key];
    if (!e) return d;
    d = clone(d);
    if (e.name != null) { d.name_en = e.name; d.name = e.name; }
    if (e.disp_desc != null) d.disp_desc = e.disp_desc;
    if (e.fields) {
      (d.fields || []).forEach(function (f) { if (e.fields[f.i] !== undefined) f.value = e.fields[f.i]; });
    }
    return d;
  }

  function searchRows(sp) {
    var q = (sp.get('q') || '').trim().toLowerCase();
    var types = (sp.get('types') || 'item').split(',');
    var limit = parseInt(sp.get('limit') || '300', 10) || 300;
    var out = [];
    types.forEach(function (t) {
      (ROWS[t] || []).forEach(function (r) {
        var rr = r;
        var ed = ST.edits[t + '/' + r.id];
        if (ed && ed.name != null) { rr = clone(r); rr.name = ed.name; rr.name_en = ed.name; }
        if (!q) { out.push(rr); return; }
        var hay = (String(rr.name || '') + ' ' + String(rr.big5 || '') + ' ' + rr.id + ' ' + String(rr.code || '')).toLowerCase();
        if (q.charAt(0) === '#' ? String(rr.id) === q.slice(1) : hay.indexOf(q) >= 0) out.push(rr);
      });
    });
    var srt = sp.get('sort');
    if (srt === 'name') out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return out.slice(0, limit);
  }

  function searchCounts(sp) {
    var q = (sp.get('q') || '').trim().toLowerCase();
    var by = {}, total = 0;
    Object.keys(ROWS).forEach(function (t) {
      var n = 0;
      ROWS[t].forEach(function (r) {
        if (!q || (String(r.name) + ' ' + r.id).toLowerCase().indexOf(q) >= 0) n++;
      });
      if (n) { by[t] = n; total += n; }
    });
    return { by_type: by, total: total, capped: false };
  }

  var GET_ROUTES = [
    [/^\/api\/auth\/me$/, function () { return ok(meBody()); }],
    [/^\/api\/app-context$/, function () {
      var m = meBody();
      var base = fxGet('/api/app-context', new URLSearchParams());
      var b = clone((base && (base[2] || base)) || {});
      Object.keys(m).forEach(function (k) { b[k] = m[k]; });
      return ok(b);
    }],
    [/^\/api\/features\/server\/native\/status\/([^/]+)$/, function (c) {
      var s = jobState('native:' + c.m[1]);
      if (!s) return ok({ running: false, done: true, rc: 0, output: '', outcome: 'ok', steps: [] });
      var lines = ['[1/6] connecting to the DEV game servers', '[2/6] checking the running binaries (read-only)', '[3/6] building the memory patch (mempatch.json)', '[4/6] writing S_*.ini records', '[5/6] applying the patch in memory (no binary rewritten)', '[6/6] verifying the result'];
      var n = Math.min(lines.length, Math.floor(s.pct * (lines.length + 0.5)) + 1);
      var out = lines.slice(0, n).join('\n');
      if (!s.done) return ok({ running: true, done: false, rc: null, output: out, steps: lines.slice(0, n) });
      return ok({ running: false, done: true, rc: 0, output: out + '\nDone: feature deployed (simulated).', outcome: 'ok', steps: lines });
    }],
    [/^\/api\/features\/server\/bo-env$/, function (c) { return ok({ applicable: false, configured: true, env: 'dev', summary: 'No back-office entry for this feature.', items: [] }); }],
    [/^\/api\/update\/check$/, function () { return ok({ ok: true, update_available: false, up_to_date: true, current: '2.278.0', latest: '2.278.0', code_update_available: false }); }],
    [/^\/api\/server\/fingerprint$/, function (c) { return ok({ file: c.q.get('file'), fp: '9f3c1a7e5b20d4c8' }); }],
    [/^\/api\/assets3d\/gb\/available$/, function () { return ok({ ok: false, reason: 'The 3D preview needs the local render service, which is not part of the demo.' }); }],
    [/^\/api\/search$/, function (c) { return ok(searchRows(c.q)); }],
    [/^\/api\/search\/counts$/, function (c) { return ok(searchCounts(c.q)); }],
    [/^\/api\/entity\/([a-z_]+)\/(\d+)$/, function (c) {
      var k = c.m[1] + '/' + c.m[2];
      var f = FX[c.path];
      if (!f) return [404, { detail: 'This record is not part of the demo snapshot.' }];
      return ok(applyEditsToDetail(f[2], k));
    }],
    [/^\/api\/pkg\/(pack|repack|depack|verify)\/status$/, function (c) { return ok(pkgStatus(c.m[1])); }],
    [/^\/api\/pkg\/repack\/preview\/status$/, function () {
      var s = jobState('pkg:preview');
      if (!s) return ok({ running: false, finished: false, live: {} });
      if (!s.done) return ok({ running: true, finished: false, live: { phase: 'scan', phase_label: 'Scanning folders', files_total: 18420, files_done: Math.round(18420 * s.pct) } });
      var f = [
        { path: 'data/db/c_item.ini', kind: 'changed', bytes: 5351239, folder: 'data/db' },
        { path: 'data/db/c_monster.ini', kind: 'changed', bytes: 2207352, folder: 'data/db' },
        { path: 'uidata/layouts/OptionControlUIVer2.layout', kind: 'changed', bytes: 48211, folder: 'uidata/layouts' },
        { path: 'item/Q00134.dds', kind: 'added', bytes: 87424, folder: 'item' }
      ];
      return ok({ running: false, finished: true, error: null, files: f, total: 4, changed: 3, added: 1, deep: false, summary: { changed: 3, added: 1, removed: 0, unchanged: 18416 }, folders: [{ folder: 'data/db', changed: 2, added: 0 }, { folder: 'uidata/layouts', changed: 1, added: 0 }, { folder: 'item', changed: 0, added: 1 }] });
    }],
    [/^\/api\/audit\/journal$/, function (c) {
      var f = fxGet(c.path, c.q);
      var b = clone(f ? f[2] : { entries: [] });
      b.entries = ST.journal.concat(b.entries || []).slice(0, parseInt(c.q.get('limit') || '40', 10) || 40);
      return ok(b);
    }],
    [/^\/api\/audit\/timeline$/, function (c) {
      var f = fxGet(c.path, c.q);
      var b = clone(f ? f[2] : { rows: [] });
      var add = ST.journal.map(function (e) {
        return { type: 'change', id: Number(e.id), ts: e.ts.slice(0, 19), action: e.action, target: e.target, details: e.category + ' ' + e.action + (e.target ? ' ' + e.target : ''), author: DEMO_ACCOUNT, rolled_back: false, has_backups: false, server: true, client: true, git: null };
      });
      b.rows = add.concat(b.rows || []);
      return ok(b);
    }]
  ];

  function pushed(name) { return ST.kv['feat:' + name] || {}; }

  function jobEntry(prefix) {
    var id = prefix + '-' + nextId();
    return id;
  }

  function saveEntity(body) {
    var edits = (body && body.edits) || [];
    var results = [];
    edits.forEach(function (e) {
      var key = e.etype + '/' + e.id;
      var cur = ST.edits[key] || (ST.edits[key] = { fields: {} });
      if (e.kind === 'name') cur.name = e.value;
      else if (e.kind === 'disp_desc') cur.disp_desc = e.value;
      else if (e.kind === 'field') cur.fields[e.field_index] = String(e.value);
      results.push({ target: e.etype + ' #' + e.id, ok: true, client: 'saved (simulated)', server: 'saved (simulated)' });
      noteJournal('content', 'edit ' + e.etype, '#' + e.id, { kind: e.kind, simulated: true });
    });
    save();
    return { ok: true, results: results, layers: { client: 'simulated', server: 'simulated', db: 'simulated' }, repack_required: true, restart_required: false };
  }

  var POST_ROUTES = [
    [/^\/api\/features\/server\/native\/preflight$/, function (c) {
      return ok({ ok: true, env: 'dev', machine: { user: 'demo-admin', host: 'DEMO-PC' }, checks: [
        { label: 'Server reachable', detail: 'node-01.demo.invalid answers in 41 ms', ok: true },
        { label: 'Source is committed', detail: 'features/' + (c.body && c.body.feature) + ' matches the shared repository', ok: true },
        { label: 'Memory patch available', detail: 'mempatch.json generated, 0 binary written to disk', ok: true },
        { label: 'No other deploy running', detail: 'lock free', ok: true }
      ], plan: [{ key: 'data', label: 'Write S_*.ini records' }, { key: 'mempatch', label: 'Apply the patch in memory' }, { key: 'verify', label: 'Verify' }], status_output: '' });
    }],
    [/^\/api\/features\/server\/native\/deploy$/, function (c) {
      var f = (c.body && c.body.feature) || 'feature';
      startJob('native:' + f, 7000);
      ST.kv['feat:' + f] = Object.assign(pushed(f), { server: true });
      noteJournal('features', (c.body && c.body.action === 'revert' ? 'revert' : 'deploy') + ' on DEV servers', f, { simulated: true });
      return ok({ ok: true });
    }],
    [/^\/api\/auth\/login$/, function (c) {
      var u = String((c.body && c.body.username) || '').trim();
      var p = String((c.body && c.body.password) || '');
      if (u.toLowerCase() === 'demo' && p === ST.pw) {
        ST.user = DEMO_ACCOUNT; save();
        var b = meBody(); b.switch_to = null; b.login_env = 'dev';
        return ok(b);
      }
      return [401, { detail: 'Wrong username or password. This demo accepts demo / demo.' }];
    }],
    [/^\/api\/environments\/active$/, function () { return [403, { detail: 'Switching environment is disabled in the demo.' }]; }],
    [/^\/api\/auth\/logout$/, function () { setTimeout(function () { location.reload(); }, 60); return ok({ ok: true }); }],
    [/^\/api\/auth\/password$/, function (c) {
      var o = String((c.body && c.body.old_password) || ''), n = String((c.body && c.body.new_password) || '');
      if (o !== ST.pw) return [401, { detail: 'The current password is not right.' }];
      if (n.length < 4 || n.length > 20 || /\s/.test(n)) return [400, { detail: 'Use 4 to 20 characters: letters, digits and standard symbols, no spaces.' }];
      ST.pwChanged = true; save();
      noteJournal('session', 'password change', DEMO_ACCOUNT, { env: 'dev', simulated: true });
      return ok({ ok: true, game: true, env: 'dev' });
    }],
    [/^\/api\/save$/, function (c) { return ok(saveEntity(c.body)); }],
    [/^\/api\/pkg\/(pack|repack|depack)$/, function (c) { startJob('pkg:' + c.m[1], 9000); noteJournal('packaging', c.m[1], 'game client', { simulated: true }); return ok({ ok: true, started: true }); }],
    [/^\/api\/pkg\/repack\/preview\/start$/, function () { startJob('pkg:preview', 3500); return ok({ ok: true, started: true }); }],
    [/^\/api\/features\/client\/install-all$/, function (c) {
      var names = (c.q.get('names') || '').split(',').filter(Boolean);
      names.forEach(function (n) { ST.kv['feat:' + n] = Object.assign(pushed(n), { client: true }); });
      save();
      noteJournal('features', 'install on client', names.join(', '), { simulated: true });
      return ok({ files: 24 * names.length, records: 6 * names.length, replaced: 3, staged: false, errors: [], refused: [] });
    }],
    [/^\/api\/features\/client\/deploy-dll$/, function () {
      noteJournal('features', 'deploy dll', 'version.dll', { simulated: true });
      return ok({ needs_confirm: false, needs_close: false, downgrade: [], running: [], written: [{ files: ['version.dll'] }], how: 'simulated' });
    }]
  ];

  function genericMutation(method, c) {
    var seg = c.path.replace(/^\/api\//, '').split('/').slice(0, 4).join(' ').replace(/[-_]/g, ' ');
    noteJournal('action', method.toLowerCase() + ' ' + seg, '', { simulated: true });
    return [200, { ok: true, simulated: true, status: 'done', message: 'Done (simulated in the demo)', job_id: 'demo-' + nextId() }];
  }

  var LATENCY = { get: 90, mut: 650 };
  var HEAVY = /(deploy|install|publish|build|restart|promote|release|reset|pull|sync|import|clean|validate|rollback|snapshot|migrate|regenerate|apply)/;
  function labelOf(path) {
    var parts = path.replace(/^\/api\//, '').split('/').filter(function (x) { return x && !/^\d+$/.test(x); }).slice(0, 3);
    return parts.join(' ').replace(/[-_]/g, ' ');
  }
  var busyTimer = null;
  function busy(label, ms) {
    var pill = document.getElementById('demo-pill');
    if (!pill) return;
    var bar = pill.querySelector('.dp-bar');
    var txt = pill.querySelector('.dp-txt');
    if (!bar || !txt) return;
    if (!pill.dataset.idle) pill.dataset.idle = txt.textContent;
    txt.textContent = 'Simulating ' + label + '...';
    pill.classList.add('busy');
    var t0 = Date.now();
    clearInterval(busyTimer);
    busyTimer = setInterval(function () {
      var p = Math.min(1, (Date.now() - t0) / ms);
      bar.style.width = (p * 100).toFixed(0) + '%';
      if (p >= 1) {
        clearInterval(busyTimer);
        setTimeout(function () { pill.classList.remove('busy'); bar.style.width = '0'; txt.textContent = pill.dataset.idle; }, 350);
      }
    }, 60);
  }

  function handle(method, u, bodyText) {
    var n = normPath(u);
    if (!n) return null;
    if (n.path.indexOf('/api/') !== 0 && n.path !== '/api') return null;
    var body = null;
    if (bodyText) { try { body = JSON.parse(bodyText); } catch (e) { body = bodyText; } }
    var ctx = { path: n.path, q: n.search, body: body, m: null };
    if (method !== 'GET') window.__demoCalls.push(method + ' ' + n.path + ' ' + (typeof bodyText === 'string' ? bodyText.slice(0, 80) : ''));
    var gated = !/^\/api\/(auth\/(me|login|logout|crests)|ready|version|app-context)/.test(n.path);
    if (gated && !ST.user) return Promise.resolve([401, { detail: 'Not signed in' }]);
    var routes = method === 'GET' || method === 'HEAD' ? GET_ROUTES : POST_ROUTES;
    var i, r, m;
    for (i = 0; i < routes.length; i++) {
      r = routes[i];
      m = r[0].exec(n.path);
      if (m) {
        ctx.m = m; var out = r[1](ctx);
        var rms = method === 'GET' ? LATENCY.get : (/^\/api\/(pkg|features\/client\/(install|deploy))/.test(n.path) ? 1400 : LATENCY.mut);
        if (method !== 'GET' && /^\/api\/(pkg|features\/client)/.test(n.path)) busy(labelOf(n.path), rms + 6000 * (/^\/api\/pkg\/(pack|repack|depack)$/.test(n.path) ? 1 : 0));
        return sleep(rms).then(function () { return out; });
      }
    }
    if (method === 'GET' || method === 'HEAD') {
      var f = fxGet(n.path, n.search);
      if (f) return sleep(LATENCY.get).then(function () { return [f[0], f[2], f[1]]; });
      if (window.__demoMiss) window.__demoMiss.push(n.path + n.raw.search);
      if (/\/(status|progress)$/.test(n.path)) return Promise.resolve([200, { running: false, finished: true, ok: true, error: null, done: 1, total: 1 }]);
      return Promise.resolve([404, { detail: 'Not part of the demo snapshot' }]);
    }
    var res = genericMutation(method, ctx);
    var heavy = HEAVY.test(n.path);
    var ms = heavy ? 2600 + (n.path.length % 5) * 300 : LATENCY.mut;
    if (heavy) busy(labelOf(n.path), ms);
    return sleep(ms).then(function () { return res; });
  }
  window.__demoMiss = [];
  window.__demoCalls = [];

  function toResponse(a) {
    var status = a[0], b = a[1], ct = a[2] || 'application/json';
    var text = typeof b === 'string' ? b : JSON.stringify(b);
    return new Response(text, { status: status, headers: { 'Content-Type': ct } });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
    var bodyText = init && init.body;
    var p = normPath(url);
    if (p && p.path.indexOf('/api/') === 0 && MEDIA[sortedKey(p.path, p.search)]) {
      return nativeFetch(mediaFor(url), init);
    }
    if (p && p.path.indexOf('/api/') === 0) {
      var h = handle(method, url, typeof bodyText === 'string' ? bodyText : null);
      if (h) return h.then(toResponse);
    }
    if (p && p.path.indexOf('/api/') !== 0 && location.pathname.indexOf(BASE) === 0 && p.raw.pathname.indexOf(BASE) !== 0 && /^\/(css|js|icons|img|fonts|vendor|app|race|cursors|demo)\//.test(p.raw.pathname)) {
      return nativeFetch(BASE + p.raw.pathname.slice(1) + p.raw.search, init);
    }
    return nativeFetch(input, init);
  };


  var MEDIA = loadJSON(DATA + 'media.json');
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  function mediaFor(u) {
    var n = normPath(u);
    if (!n || n.path.indexOf('/api/') !== 0) return null;
    var k = sortedKey(n.path, n.search);
    var f = MEDIA[k];
    if (!f) {
      var q = new URLSearchParams(n.raw.search);
      var keep = new URLSearchParams();
      ['etype', 'name'].forEach(function (x) { if (q.has(x)) keep.set(x, q.get(x)); });
      f = MEDIA[sortedKey(n.path, keep)];
    }
    return f ? BASE + 'demo/' + f : BLANK;
  }
  var API_URL_RX = /((?:src|poster)\s*=\s*["']|url\(\s*["']?)((?:\/studio)?\/api\/[^"')\s]+)/g;
  function fixHtml(h) {
    if (typeof h !== 'string' || h.indexOf('/api/') < 0) return h;
    return h.replace(API_URL_RX, function (m, pre, u) { return pre + (mediaFor(u.replace(/&amp;/g, '&')) || u); });
  }
  var imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (imgDesc && imgDesc.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true, enumerable: imgDesc.enumerable, get: imgDesc.get,
      set: function (v) { var m = typeof v === 'string' ? mediaFor(v) : null; imgDesc.set.call(this, m || v); }
    });
  }
  var origSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) {
    if ((n === 'src' || n === 'poster' || n === 'href') && typeof v === 'string' && v.indexOf('/api/') >= 0 && /^(IMG|SOURCE|VIDEO|IMAGE|LINK)$/i.test(this.tagName)) {
      var m = mediaFor(v);
      if (m) v = m;
    }
    return origSet.call(this, n, v);
  };
  var ihDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (ihDesc && ihDesc.set) {
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true, enumerable: ihDesc.enumerable, get: ihDesc.get,
      set: function (v) { ihDesc.set.call(this, fixHtml(v)); }
    });
  }
  var ohDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
  if (ohDesc && ohDesc.set) {
    Object.defineProperty(Element.prototype, 'outerHTML', {
      configurable: true, enumerable: ohDesc.enumerable, get: ohDesc.get,
      set: function (v) { ohDesc.set.call(this, fixHtml(v)); }
    });
  }
  var iah = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (pos, h) { return iah.call(this, pos, fixHtml(h)); };
  var ccf = Range.prototype.createContextualFragment;
  Range.prototype.createContextualFragment = function (h) { return ccf.call(this, fixHtml(h)); };

  function QuietES() {
    this.readyState = 0; this.url = ''; this.onopen = this.onmessage = this.onerror = null;
  }
  QuietES.prototype.addEventListener = function () { };
  QuietES.prototype.removeEventListener = function () { };
  QuietES.prototype.close = function () { };
  window.EventSource = QuietES;

  function QuietWS() { this.readyState = 3; }
  QuietWS.prototype.send = function () { };
  QuietWS.prototype.close = function () { };
  QuietWS.prototype.addEventListener = function () { };
  window.WebSocket = QuietWS;

  window.__demo = { state: function () { return ST; }, reset: function () { try { sessionStorage.removeItem(SKEY); } catch (e) { } location.reload(); } };

  function banner() {
    if (document.getElementById('demo-pill')) return;
    var d = document.createElement('div');
    d.id = 'demo-pill';
    d.setAttribute('role', 'status');
    d.innerHTML = '<span class="dp-dot"></span><span class="dp-txt">Interactive demo &middot; every action is simulated in your browser</span><i class="dp-bar"></i><button type="button" aria-label="Reset demo" title="Reset the demo data">Reset</button>';
    var st = document.createElement('style');
    st.textContent = '#demo-pill{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:8px;padding:5px 6px 5px 12px;border-radius:999px;font:500 12px/1.2 Inter,system-ui,sans-serif;background:rgba(24,24,27,.86);color:#f4f4f5;box-shadow:0 4px 18px rgba(0,0,0,.22);backdrop-filter:blur(6px);pointer-events:auto;max-width:calc(100vw - 24px)}#demo-pill .dp-dot{width:7px;height:7px;border-radius:50%;background:#f0b429;flex:none}#demo-pill button{font:inherit;border:0;border-radius:999px;padding:3px 10px;background:rgba(255,255,255,.14);color:inherit;cursor:pointer}#demo-pill button:hover{background:rgba(255,255,255,.26)}#demo-pill{overflow:hidden}#demo-pill .dp-bar{position:absolute;left:0;bottom:0;height:3px;width:0;background:#f0b429;transition:width .12s linear}#demo-pill.busy .dp-dot{animation:dpp 1s infinite}@keyframes dpp{50%{opacity:.25}}@media (max-width:640px){#demo-pill .dp-txt{display:none}}';
    document.head.appendChild(st);
    document.body.appendChild(d);
    d.querySelector('button').onclick = function () { window.__demo.reset(); };
  }
  function loginTouch() {
    var h = document.getElementById('lg-hint');
    if (h && !h.dataset.demo) {
      h.dataset.demo = '1';
      h.innerHTML = 'This is a public demo of the studio. Sign in with <b>demo</b> / <b>demo</b>. <a href="#" id="lg-fill" style="text-decoration:underline">Fill it in</a>';
      var a = document.getElementById('lg-fill');
      if (a) a.onclick = function (e) {
        e.preventDefault();
        var u = document.getElementById('lg-user'), p = document.getElementById('lg-pass');
        if (u) { u.value = 'demo'; u.dispatchEvent(new Event('input', { bubbles: true })); }
        if (p) { p.value = 'demo'; p.dispatchEvent(new Event('input', { bubbles: true })); }
      };
    }
  }
  function ready() {
    banner();
    var st = document.createElement('style');
    st.textContent = '#lg-envseg .lg-env[data-env="preprod"],#lg-envseg .lg-env[data-env="prod"]{display:none!important}';
    document.head.appendChild(st);
    loginTouch();
    new MutationObserver(loginTouch).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
