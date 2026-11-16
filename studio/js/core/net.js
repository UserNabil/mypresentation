/* ============================================================================
   NET — one place where every API call goes through.

   Three problems this fixes, all of them reported from real use:

   1. CHAINED / DUPLICATE CALLS. Clicking twice fired the request twice. Worse,
      two identical writes could interleave (repack + repack, deploy + deploy).
      `wireBusy` guarded 70 hand-listed buttons that exist AT BOOT — anything
      built inside a modal was unguarded, and every new button had to be added
      to that list by hand or it shipped unprotected.
      Here: an in-flight request is DEDUPED by (method + url + body). A second
      identical call gets the SAME promise instead of hitting the server again.

   2. SILENT / VAGUE ERRORS. Handlers did `if(!r.ok) show('failed')`, throwing
      away the status and the server's own `detail` — the one line that says
      WHY. Here every failure is turned into a precise, actionable message and
      recorded, so a problem can be traced after the fact.

   3. BUTTONS THAT STAY DEAD OR STAY SPINNING. A button is now tied to the
      requests its own click started, and is restored when they settle —
      success OR failure.

   ⚠️ The wrapper must NOT change fetch's contract: callers keep doing
   `const r = await fetch(u); if(!r.ok) …`. That is why deduped callers each
   get `response.clone()` — a Response body can only be read ONCE, so handing
   the same object to two callers would make the second one fail on .json().
   ========================================================================== */

const MAX_LOG = 200;
export const HANDLED = 'X-Eden-Handled';
const _log = [];                 // ring buffer, newest last
const _inflight = new Map();     // key -> { promise, started }
let _clicked = null;             // button being clicked right now (capture phase)
let _onError = null;             // injected reporter (toast)
let _onWarning = null;           // injected reporter for a write that did not reach every layer

/* ------------------------------------------------------------------ log --- */

export function netLog() { return _log.slice(); }

function record(entry) {
  _log.push(entry);
  if (_log.length > MAX_LOG) _log.shift();
}

/** Human message for a failed response — never "failed". */
async function describe(res, url, method) {
  const where = `${method || 'GET'} ${url}`;
  let detail = '';
  try {
    const txt = await res.clone().text();
    if (txt) {
      try {
        const j = JSON.parse(txt);
        detail = j.detail || j.error || j.message || '';
        /* FastAPI validation errors are an ARRAY of objects; printing the raw
           array gives "[object Object]" — useless exactly when it matters. */
        if (Array.isArray(detail)) {
          detail = detail.map(d => {
            const loc = Array.isArray(d.loc) ? d.loc.join('.') : d.loc;
            return `${loc || '?'}: ${d.msg || d.type || ''}`;
          }).join(' · ');
        } else if (detail && typeof detail === 'object') {
          detail = JSON.stringify(detail);
        }
        if (!detail) detail = txt.slice(0, 200);
      } catch (e) { detail = txt.slice(0, 200); }
    }
  } catch (e) { /* body already consumed or unreadable — the status still tells us something */ }

  const byStatus = {
    401: 'You are not logged in (the session expired).',
    403: 'Your role is not allowed to do this.',
    404: 'This endpoint does not exist on the server — the tool and the backend are out of sync.',
    409: 'Another operation of the same kind is already running.',
    422: 'The server rejected the parameters.',
    500: 'The server crashed on this call.',
    502: 'The backend is unreachable.',
    503: 'The backend is starting up or busy.',
  };
  const head = byStatus[res.status] || `The server answered HTTP ${res.status}.`;
  return detail ? `${head} — ${detail}  [${where}]` : `${head}  [${where}]`;
}

/* --------------------------------------------------------- busy buttons --- */

function busyOn(b) {
  if (!b || b._netBusy) return;
  b._netBusy = 1;
  b.dataset.netBusy = '1';
  b.setAttribute('aria-busy', 'true');
  if ('disabled' in b) { b._netWasDisabled = b.disabled; b.disabled = true; }
}

function busyOff(b) {
  if (!b || !b._netBusy) return;
  b._netBusy = 0;
  delete b.dataset.netBusy;
  b.removeAttribute('aria-busy');
  if ('disabled' in b) b.disabled = !!b._netWasDisabled;
}

/* ------------------------------------------------------------- install --- */

export function installNet(opts) {
  if (window.__netInstalled) return;
  window.__netInstalled = true;
  _onError = (opts && opts.onError) || null;
  _onWarning = (opts && opts.onWarning) || null;
  const raw = window.fetch.bind(window);

  /* Capture phase: we learn WHICH control was clicked before its handler runs,
     so the requests that handler starts can be attributed to it. */
  document.addEventListener('click', ev => {
    const b = ev.target && ev.target.closest
      ? ev.target.closest('button,.sbtn,.hmi,.rl-leaf,.rl-top,[data-act]')
      : null;
    _clicked = b || null;
    /* Cleared on the next macrotask: anything the handler fires synchronously
       (or in its first await) is still attributed to this click. */
    setTimeout(() => { _clicked = null; }, 0);
  }, true);

  window.fetch = function (input, init) {
    const url = (typeof input === 'string') ? input : (input && input.url) || String(input);
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const body = (init && typeof init.body === 'string') ? init.body : '';
    const owner = _clicked;
    const started = Date.now();
    const hd = init && init.headers;
    const handled = !!(hd && (typeof hd.get === 'function' ? hd.get(HANDLED) : hd[HANDLED]));

    /* Only /api traffic is managed. Static assets, logo.mp4, icons… go straight
       through: deduping them would be pointless and could break media loading. */
    if (url.indexOf('/api/') === -1) return raw(input, init);

    /* ⛔ UNE SONDE FACULTATIVE NE DOIT PAS CRIER. Certaines routes sont interrogees « au cas
       ou » — un avancement, une capacite optionnelle : sur un backend plus ancien elles
       repondent 404, ce qui est une REPONSE, pas un incident. Sans cette porte de sortie, une
       sonde interrogee toutes les 300 ms empilait un bandeau d'erreur toutes les 300 ms
       (« the tool and the backend are out of sync » en boucle, signale le 2026-08-18).
       Le marqueur est dans l'URL : c'est la seule chose que `fetch(url)` transporte sans
       obliger chaque appelant a passer un objet d'options. Il est retire avant l'envoi. */
    if (url.indexOf('__quiet=1') !== -1) {
      const propre = url.replace(/[?&]__quiet=1/, m => (m[0] === '?' ? '?' : '')).replace(/[?&]$/, '');
      input = (typeof input === 'string') ? propre : new Request(propre, input);
      return raw(input, init);                     // ni mutualisation, ni journal, ni bandeau
    }

    const key = `${method} ${url} ${body}`;
    const running = _inflight.get(key);
    if (running) {
      /* ⭐ THE anti-chaining guard. A second identical call — double click, a
         re-render that re-triggers a load, two widgets asking for the same
         thing — joins the call already in flight instead of issuing a new one.
         `.clone()` because a Response body is single-use. */
      record({ t: started, method, url, status: 'joined', ms: 0 });
      return running.promise.then(r => r.clone());
    }
    /* ⛔ PIEGE CORRIGE LE 2026-08-14 — « Response body is already used ».
       La version precedente rendait la reponse ORIGINALE au premier appelant et un
       `.clone()` aux suivants. Or un clone doit etre pris AVANT que le corps ne soit
       lu : si le premier appelant gagne la course et fait `.json()`, le `.clone()` du
       second leve, et comme les deux appelants sont des fonctions `async`, ca part en
       rejet de promesse NON GERE — invisible a l'ecran, invisible dans le try/catch
       de l'appelant. Symptome vecu : la modale de gestion des comptes ne s'ouvrait
       pas, sans le moindre message (`loadGameStaff()` et `openAccounts()` demandent
       tous deux /api/accounts dans le meme tick).
       Correctif : la reponse d'origine reste PRIVEE et n'est jamais lue par personne ;
       tout le monde — premier appelant compris — recoit un clone. Cloner une reponse
       intacte reussit toujours, quel que soit l'ordre de lecture.
       ⚠️ Contrepartie assumee : le corps reste tamponne jusqu'au ramassage du clone
       non lu. Negligeable ici (les reponses /api sont du JSON) ; les binaires du tool
       ne passent pas par fetch() mais par l'attribut src des images. */

    if (owner) busyOn(owner);

    const p = raw(input, init).then(async res => {
      const ms = Date.now() - started;
      if (!res.ok) {
        const msg = await describe(res, url, method);
        record({ t: started, method, url, status: res.status, ms, msg });
        /* 401 is not an incident: the session simply expired, and the login
           screen already says so. Shouting about it trains people to ignore
           the toasts that DO matter. */
        /* 503 pendant le warm-up (« starting ») : le backend repond, il n'est juste pas
           pret — les pages re-sondent toutes seules ; un bandeau par appel a chaque
           lancement du tool crie pour rien (signale le 2026-11-02). */
        const warming = res.status === 503 && /start/i.test(msg);
        if (_onError && res.status !== 401 && !handled && !warming) _onError(msg, res.status);
      } else {
        record({ t: started, method, url, status: res.status, ms });
        /* ⛔ A SUCCESSFUL write can still have stopped half-way: saved in the
           client files but NOT in the server S_*.ini (weapon 28796, 2026-09-30:
           four edits answered "ok" and never reached the server). The backend
           says so in `server_warning`; it is shown here, once, for EVERY caller
           of every write route, so no page can swallow it. POST only: reads
           never carry it, and their bodies can be large. */
        if (_onWarning && method === 'POST' &&
            (res.headers.get('content-type') || '').indexOf('json') !== -1) {
          try {
            const j = await res.clone().json();
            if (j && typeof j.server_warning === 'string' && j.server_warning) _onWarning(j.server_warning);
          } catch (e) { /* not JSON after all — nothing to report */ }
        }
      }
      return res;
    }).catch(err => {
      const ms = Date.now() - started;
      /* An aborted request is a DELIBERATE cancellation (a newer search took
         over). Reporting it as an error would be a lie. */
      const aborted = err && (err.name === 'AbortError');
      const msg = aborted
        ? `Request cancelled  [${method} ${url}]`
        : `Could not reach the backend — ${err && err.message ? err.message : err}  [${method} ${url}]`;
      record({ t: started, method, url, status: aborted ? 'abort' : 'network', ms, msg });
      if (_onError && !aborted && !handled) _onError(msg, 0);
      throw err;
    }).finally(() => {
      _inflight.delete(key);
      if (owner) busyOff(owner);
    });

    _inflight.set(key, { promise: p, started });
    return p.then(r => r.clone());        /* voir le bloc ⛔ ci-dessus */
  };
}
