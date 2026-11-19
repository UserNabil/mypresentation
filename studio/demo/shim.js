(function () {
  'use strict';
  var SELF = document.currentScript;
  var BASE = new URL('../', SELF.src).pathname;
  var DATA = BASE + 'demo/data/';
  var NativeXHR = window.XMLHttpRequest;
  var nativeFetch = window.fetch.bind(window);
  var SKEY = 'eden.demo.state.v1';
  try { if (localStorage.getItem('tour.hint.off') === null) localStorage.setItem('tour.hint.off', '1'); } catch (e) { }

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

  var ASSIST_HELP = { intents: [
    { id: 'open_page', kind: 'read', title: 'Open a page', examples: ['open crashes', 'ouvre la page des objets'] },
    { id: 'search', kind: 'read', title: 'Find game data', examples: ['find item dragon scale'] },
    { id: 'feature_status', kind: 'read', title: 'Feature status', examples: ['status of chat_emoji'] },
    { id: 'feature_tests', kind: 'read', title: 'Feature tests', examples: ['tests of golem_race'] },
    { id: 'gm_command', kind: 'read', title: 'GM command', examples: ['gm command ban'] },
    { id: 'servers_status', kind: 'read', title: 'Servers', examples: ['are the servers up'] },
    { id: 'install_feature', kind: 'write', title: 'Deploy a feature', examples: ['deploy chat_emoji on dev'] }
  ], languages: ['en', 'fr'], writes_need_confirmation: true, prod: 'read-only' };

  var AS = loadJSON(DATA + 'assistant.json');
  var AS_RX = {};
  Object.keys(AS.rx || {}).forEach(function (k) { AS_RX[k] = AS.rx[k].map(function (p) { return new RegExp(p); }); });
  var AS_SET = {};
  Object.keys(AS.sets || {}).forEach(function (k) { AS_SET[k] = {}; AS.sets[k].forEach(function (w) { AS_SET[k][w] = 1; }); });
  var AS_TYPES = AS.types || {};

  function afold(t) {
    var s = String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return s.replace(/[^a-z0-9_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function aany(name, t) { return (AS_RX[name] || []).some(function (r) { return r.test(t); }); }
  function afree(folded, drop, keepInner) {
    var out = [], pending = [];
    folded.split(' ').forEach(function (t) {
      if (!t) return;
      if (keepInner && AS_SET.CONNECTORS[t] && !drop[t]) { if (out.length) pending.push(t); return; }
      if (AS_SET.STOP[t] || AS_TYPES[t] || drop[t]) { pending = []; return; }
      out = out.concat(pending); pending = []; out.push(t);
    });
    return out.join(' ');
  }
  function aslots(q) {
    var raw = String(q || '').slice(0, 500), f = afold(raw), padded = ' ' + f + ' ';
    var s = { raw: raw, f: f, env: null, features: [], page: null, etype: null, number: null };
    if (/\bpre ?prod\w*|\bpre production\b/.test(f)) s.env = 'preprod';
    else if (/\bprod\b|\bproduction\b|\bprd\b/.test(f)) s.env = 'prod';
    else if (/\bdev\b|\bdevelop\w*|\bdevs\b/.test(f)) s.env = 'dev';
    (AS.features || []).forEach(function (n) {
      var l = afold(n);
      if ([l, l.replace(/_/g, ' '), l.replace(/_/g, '')].some(function (v) { return v && padded.indexOf(' ' + v + ' ') >= 0; })) s.features.push(n);
    });
    if (!s.features.length) {
      var parts = {};
      (AS.features || []).forEach(function (n) { afold(n).split('_').forEach(function (p) { if (p.length >= 5) (parts[p] = parts[p] || []).push(n); }); });
      f.split(' ').some(function (t) { if (parts[t] && parts[t].length === 1) { s.features = [parts[t][0]]; return true; } return false; });
    }
    var best = 0;
    (AS.pages || []).forEach(function (p) {
      var names = [afold(p.id), afold(p.label)].concat(((AS.synonyms || {})[p.id] || []).map(afold));
      names.forEach(function (n) { if (n && padded.indexOf(' ' + n + ' ') >= 0 && n.length > best) { best = n.length; s.page = p; } });
    });
    f.split(' ').some(function (t) { if (AS_TYPES[t]) { s.etype = AS_TYPES[t]; return true; } return false; });
    var m = /\b(?:item|objet|creature|monster|monstre|npc|pnj|quest|quete|spell|sort|map|carte|id)\s*#?\s*(\d{1,9})\b|#(\d{1,9})\b/.exec(raw.toLowerCase());
    if (m) s.number = parseInt(m[1] || m[2], 10);
    return s;
  }
  function apageWord(f) { return /\b(page|ecran|screen|tab|onglet)\b/.test(f); }
  function ascore(s) {
    var f = s.f, sc = {}, pw = apageWord(f), verb = aany('OPEN_RX', f), where = aany('WHERE_RX', f), install = aany('INSTALL_RX', f);
    sc.help = aany('HELP_RX', f) ? 0.9 : 0;
    var o = 0;
    if (s.page) { if (verb || (where && pw)) o = 0.8 + (pw ? 0.12 : 0); else if (f.split(' ').length <= 3 && s.number == null) o = 0.55; }
    else if (s.number == null && !s.features.length) {
      if ((verb || where) && pw) o = 0.85; else if (verb && !s.etype && afree(f, AS_SET.OPEN_DROP)) o = 0.7;
    }
    sc.open = o;
    var se = 0, free = afree(f, AS_SET.SEARCH_DROP, true);
    if (s.number != null) se = (s.etype || /\bid\b|#/.test(s.raw.toLowerCase())) ? 0.9 : 0;
    else if (pw && (s.page || verb)) se = 0.3;
    else if (aany('SEARCH_RX', f)) se = (s.features.length && !s.etype) ? 0.3 : (free ? 0.8 : (s.etype ? 0.55 : 0.2));
    else if (s.etype && free) se = 0.6;
    sc.search = se;
    sc.status = s.features.length ? (aany('STATUS_RX', f) ? 0.86 : 0.58) : 0;
    sc.tests = aany('TESTS_RX', f) ? (s.features.length ? 0.9 : 0.82) : 0;
    var raw = s.raw.trim().toLowerCase(), g = 0;
    if (/^\/\w+/.test(raw)) g = 0.88;
    else if (aany('GM_RX', f)) g = afree(f, AS_SET.GM_DROP) ? 0.82 : 0.6;
    sc.gm = g;
    var sv = 0;
    if (!aany('SERVER_RX', f)) { if (aany('GAME_RX', f) && aany('GAME_STATE_RX', f) && !aany('RESTART_RX', f)) sv = 0.86; }
    else if (!(s.features.length && !aany('SERVER_STATE_RX', f))) sv = aany('SERVER_STATE_RX', f) ? 0.86 : 0.62;
    sc.servers = sv;
    sc.restart = (install || !aany('RESTART_RX', f)) ? 0 : (aany('RESTART_TARGET_RX', f) ? 0.95 : 0);
    sc.thanks = aany('THANKS_RX', f) ? 0.9 : 0;
    sc.features_list = (s.features.length || install) ? 0 : ((aany('LIST_RX', f) && /\bfeatures?\b/.test(f) && !pw) ? 0.88 : 0);
    sc.crashes = aany('CRASH_RX', f) ? (aany('RECENT_RX', f) ? 0.9 : 0.7) : 0;
    sc.notifs = aany('NOTIF_RX', f) ? 0.82 : 0;
    var pl = 0;
    if (!install) {
      if (aany('PULL_BARE_RX', f)) pl = 0.85;
      else if (aany('PULL_VERB_RX', f) && aany('PULL_NOUN_RX', f) && !s.features.length) pl = 0.93;
    }
    sc.pull = pl;
    sc.install = install ? (s.features.length ? 0.94 : 0.5) : 0;
    return sc;
  }
  function areply(r) { return ok(clone(r)); }
  function asearch(s) {
    var q = s.number != null ? '#' + s.number : afree(s.f, AS_SET.SEARCH_DROP, true);
    if (!q) return ok({ text: 'What should I look for? Try: find item dragon scale, or find npc blacksmith.', cards: [], actions: [], intent: 'search', confidence: 0.55 });
    var types = s.etype ? s.etype[1] : ['item', 'monster', 'npc'], rows = [];
    types.forEach(function (t) {
      (ROWS[t] || []).forEach(function (r) {
        var hay = (String(r.name || '') + ' ' + r.id).toLowerCase();
        if (q.charAt(0) === '#' ? String(r.id) === q.slice(1) : q.split(' ').every(function (w) { return hay.indexOf(w) >= 0; })) rows.push({ name: r.name, id: r.id, etype: t });
      });
    });
    rows = rows.slice(0, 8);
    if (!rows.length) return ok({ text: 'No ' + (s.etype ? s.etype[0] + 's' : 'anything') + ' found for "' + q + '".', cards: [], actions: [], intent: 'search', confidence: 0.8 });
    return ok({
      text: 'Found ' + rows.length + ' result' + (rows.length === 1 ? '' : 's') + ' for "' + q + '".',
      cards: rows.map(function (r) { return { title: r.name || ('#' + r.id), subtitle: (AS.type_label[r.etype] || r.etype) + ' #' + r.id, href: '#entity/' + r.etype + '/' + r.id }; }),
      actions: [], intent: 'search', confidence: 0.8
    });
  }
  function agm(s) {
    var m = /^\/(\w+)/.exec(s.raw.trim().toLowerCase());
    var term = m ? m[1] : afree(s.f, Object.assign({ how: 1, comment: 1, 'do': 1, faire: 1, to: 1, joueur: 1, player: 1 }, AS_SET.GM_DROP));
    term = term.split(' ').map(function (t) { return (AS.aliases || {})[t] || t; }).join(' ');
    if (!term) return areply(AS.replies.gm_all);
    var terms = term.split(' '), scored = [];
    (AS.gm || []).forEach(function (c) {
      var sc = 0;
      terms.forEach(function (t) {
        if (t === c.name) sc += 10; else if (c.name.indexOf(t) === 0) sc += 6; else if (c.name.indexOf(t) >= 0) sc += 4; else if (c.note.split(' ').indexOf(t) >= 0) sc += 2;
      });
      if (sc) scored.push([sc, c]);
    });
    scored.sort(function (a, b) { return b[0] - a[0]; });
    if (!scored.length) return ok({ text: 'No GM command matches "' + term + '".', cards: [], actions: [], intent: 'gm_command', confidence: 0.82 });
    return ok({
      text: scored.length + ' GM command' + (scored.length === 1 ? '' : 's') + ' match "' + term + '".',
      cards: scored.slice(0, 8).map(function (x) { return { title: x[1].title, subtitle: x[1].sub, href: '#page/gmcmds' }; }),
      actions: [], intent: 'gm_command', confidence: 0.82
    });
  }
  function assistantAsk(body) {
    var R = AS.replies;
    if (!R) return ok({ text: 'The assistant is not available in this snapshot.', cards: [], actions: [], intent: 'unmatched', confidence: 0 });
    var q = String((body && body.q) || '').trim();
    if (!q) return areply(R.help);
    var an = body && body.answer;
    var fx = R.doctor_fixes || {};
    if (an && an.slot === 'fix') return areply(fx[an.value] || (an.env === 'preprod' ? R.doctor_preprod : R.doctor));
    if (an && an.slot === 'client_folder' && R.doctor_folder) return areply(R.doctor_folder);
    var dq = /\b(check|verify|diagnose|repair|fix|scan)\b.*\b(client|setup|install|game)\b|\b(client|setup)\b.*\b(check|broken|problem)/i;
    if (R.doctor && dq.test(q)) return areply(/\bpreprod\b/i.test(q) && R.doctor_preprod ? R.doctor_preprod : R.doctor);
    if (R.doctor_ask && /\b(which|find|where|locate|configure|set|change)\b.*\b(game folder|client folder|folder)\b|\bwhere is my (client|game)\b|^(my )?game folder$/i.test(q)) return areply(R.doctor_ask);
    var s = aslots(q), sc = ascore(s), best = 'unmatched', bv = 0.5 - 1e-9;
    ['help', 'open', 'search', 'status', 'tests', 'gm', 'servers', 'crashes', 'notifs', 'features_list', 'restart', 'thanks', 'pull', 'install'].forEach(function (k) { if (sc[k] > bv) { bv = sc[k]; best = k; } });
    var fe = s.features[0], F = fe && AS.feat[fe];
    switch (best) {
      case 'help': return areply(R.help);
      case 'open':
        if (s.page) return areply(AS.open[s.page.id]);
        return ok({
          text: 'I could not find that page. Closest pages you can open: Dashboard, Features, Items, Creatures, NPCs.',
          cards: ['dashboard', 'features', 'items', 'creatures', 'npcs'].map(function (id) { return { title: id.charAt(0).toUpperCase() + id.slice(1), subtitle: 'Page', href: '#page/' + id }; }),
          actions: [], intent: 'open_page', confidence: 0.7
        });
      case 'search': return asearch(s);
      case 'status': return areply(F.status);
      case 'tests':
        if (F) return areply(F.tests);
        return areply(/\b(thumbs? down|thumb down|pouces? (bas|rouge)|negati\w+|fail\w*|echec\w*|ko)\b/.test(s.f) ? R.tests_thumbs : R.tests_all);
      case 'gm': return agm(s);
      case 'servers': return areply(s.env === 'prod' ? R.servers_prod : s.env === 'preprod' ? R.servers_preprod : R.servers);
      case 'crashes': return areply(R.crashes);
      case 'notifs': return areply(R.notifs);
      case 'features_list': return areply(/\b(installed|installees?|installe)\b/.test(s.f) ? R.features_installed : R.features_all);
      case 'restart': return areply(R.restart);
      case 'thanks': return areply(R.thanks);
      case 'pull': return areply(s.env === 'prod' ? R.pull_prod : s.env === 'preprod' ? R.install_preprod : R.pull);
      case 'install':
        if (!F) return areply(R.install_none);
        return areply(s.env === 'prod' ? R.install_prod : s.env === 'preprod' ? R.install_preprod : F.deploy);
    }
    return areply(R.unmatched);
  }
  function assistantConfirm(body) {
    var t = String((body && body.token) || ''), m = /^demo-deploy:(.+)$/.exec(t);
    var fm = /^demo-fix:(.+)$/.exec(t), done = AS.replies.doctor_fixed || {};
    if (fm && done[fm[1]]) { noteJournal('assistant', 'client fix ' + fm[1], 'client folder', { simulated: true }); return areply(done[fm[1]]); }
    if (m) {
      noteJournal('assistant', 'deploy ' + m[1] + ' on DEV', m[1], { simulated: true });
      return ok({ text: 'Deploy of ' + m[1] + ' on DEV finished (simulated in the demo, nothing was changed).', cards: [{ title: m[1], subtitle: 'Server up to date', href: '#page/features?feature=' + m[1] }], actions: [], intent: 'install_feature', confidence: 1 });
    }
    noteJournal('assistant', 'pull features', 'features repository', { simulated: true });
    return ok({ text: 'Features pulled (simulated in the demo, nothing was changed).', cards: [], actions: [{ label: 'Open Features', kind: 'navigate', href: '#page/features' }], intent: 'pull_features', confidence: 1 });
  }

  var GET_ROUTES = [
    [/^\/api\/launch\/preflight$/, function (c) {
      var env = /preprod/.test(JSON.stringify(c.q)) ? 'preprod' : /prod/.test(JSON.stringify(c.q)) ? 'prod' : 'dev';
      if (env === 'dev') { var f = fxGet(c.path, c.q); if (f) return ok(f[2]); }
      return ok({ env: env, checks: [
        { id: 'launcher', state: 'ok', label: 'Launcher ready', detail: 'Launcher.exe found', fix: null },
        { id: 'dll', state: 'warn', label: 'Client DLL is old', detail: 'client 2.3.0, available 2.4.0', fix: null },
        { id: 'server', state: 'ok', label: 'Server answers', detail: '', fix: null }] });
    }],
    [/^\/api\/ui\/prefs$/, function () { return ok({ auto_update: false }); }],
    [/^\/api\/assistant\/help$/, function () { return ok(ASSIST_HELP); }],
    [/^\/api\/notif\/local$/, function () { return ok({ items: [] }); }],
    [/^\/api\/notif\/new$/, function () { return ok({ items: [], latest: 0 }); }],
    [/^\/api\/auth\/me$/, function () { return ok(meBody()); }],
    [/^\/api\/features\/server\/deploy-targets$/, function () {
      var names = [];
      Object.keys(FX).forEach(function (k) { var m = /^\/api\/features\/detail\/([a-z0-9_]+)\/server\?nowait=1$/.exec(k); if (m && m[1].charAt(0) !== '_' && names.indexOf(m[1]) < 0) names.push(m[1]); });
      names.sort();
      return ok({ targets: names.map(function (n, i) { var up = !!pushed(n).server || i % 9 !== 2; return { name: n, deployed: true, version: '', up_to_date: up, mode: 'in memory', reason: up ? 'same bytes as the repo manifest' : 'newer manifest in the repo', warn: '', blocked: false }; }) });
    }],
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
    [/^\/api\/locale\/([a-z_]+)\/(\d+)$/, function (c) {
      var f = FX['/api/entity/' + c.m[1] + '/' + c.m[2]];
      var d = f && f[2];
      if (!d) return ok({ etype: c.m[1], id: Number(c.m[2]), variants: [] });
      return ok({ etype: c.m[1], id: Number(c.m[2]), variants: [
        { locale: 'big5', label: 'Big5 (in-game/c_)', value: d.name_big5 || '', source: d.client_file || 'c_' + c.m[1] + '.ini', field: 1 },
        { locale: 'en', label: 'English (t_)', value: d.name_en || '', source: d.text_file || 't_' + c.m[1] + '.ini', field: 1 }
      ] });
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
    [/^\/api\/ui\/prefs$/, function () { return ok({ ok: true }); }],
    [/^\/api\/assistant\/ask$/, function (c) { return assistantAsk(c.body); }],
    [/^\/api\/assistant\/confirm$/, function (c) { return assistantConfirm(c.body); }],
    [/^\/api\/features\/server\/deploy-all$/, function (c) {
      var q = c.q || new URLSearchParams(); var names = String((q.get && q.get('names')) || '').split(',').filter(Boolean);
      names.forEach(function (f) { ST.kv['feat:' + f] = Object.assign(pushed(f), { server: true }); });
      noteJournal('features', 'deploy on DEV servers', names.join(', ') || 'all out of date', { simulated: true });
      return ok({ ok: true, count: names.length, message: 'Deployed ' + (names.length || 'the out-of-date') + ' feature(s) on DEV and restarted once (simulated)' });
    }],
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

  var PILL_CSS = '#demo-pill{position:relative;overflow:hidden;box-sizing:border-box;display:flex;align-items:center;gap:8px;min-width:0;padding:4px 4px 4px 10px;border:1px solid var(--ui-line,#e6e7ea);border-radius:999px;font:500 12px/1.2 Inter,system-ui,sans-serif;background:var(--ui-surface-2,#f5f6f7);color:var(--ui-muted,#6b6f76)}'
    + '#demo-pill.dp-in{flex:1 0 100%;order:-1}#demo-pill.dp-float{position:fixed;left:12px;bottom:12px;z-index:2147483000;max-width:calc(100vw - 24px)}'
    + '#demo-pill .dp-dot{width:7px;height:7px;border-radius:50%;background:var(--ui-accent,#edb83d);flex:none}'
    + '#demo-pill .dp-txt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '#demo-pill button{flex:none;font:inherit;border:0;border-radius:999px;padding:3px 10px;background:var(--ui-surface,#fff);color:var(--ui-ink,#1a1a1c);cursor:pointer}'
    + '#demo-pill button:hover{background:var(--ui-accent-soft,#fcf3dc)}'
    + '#demo-pill .dp-bar{position:absolute;left:0;bottom:0;height:2px;width:0;background:var(--ui-accent,#edb83d);transition:width .12s linear}'
    + '#demo-pill.busy .dp-dot{animation:dpp 1s infinite}@keyframes dpp{50%{opacity:.25}}'
    + '#rail-foot{flex-wrap:wrap}main.rail-min #demo-pill{flex:none;width:16px;height:16px;padding:0;justify-content:center;margin:0 auto 4px;border:0;background:none}main.rail-min #demo-pill :is(.dp-txt,button,.dp-bar){display:none}';
  function mountPill() {
    var d = document.getElementById('demo-pill');
    if (!d) return;
    var foot = document.getElementById('rail-foot');
    var inRail = !!(foot && foot.offsetParent !== null);
    if (inRail && d.parentNode !== foot) { foot.insertBefore(d, foot.firstChild); d.className = 'dp-in'; }
    else if (!inRail && d.parentNode !== document.body) { document.body.appendChild(d); d.className = 'dp-float'; }
  }
  function banner() {
    if (document.getElementById('demo-pill')) return;
    var d = document.createElement('div');
    d.id = 'demo-pill';
    d.setAttribute('role', 'status');
    d.title = 'Interactive demo: every action is simulated in your browser';
    d.innerHTML = '<span class="dp-dot"></span><span class="dp-txt">Interactive demo</span><i class="dp-bar"></i><button type="button" aria-label="Reset demo" title="Reset the demo data">Reset</button>';
    var st = document.createElement('style');
    st.textContent = PILL_CSS;
    document.head.appendChild(st);
    document.body.appendChild(d);
    d.className = 'dp-float';
    d.querySelector('button').onclick = function () { window.__demo.reset(); };
    mountPill();
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
    new MutationObserver(function () { loginTouch(); mountPill(); }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
