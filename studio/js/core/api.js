/* ============================================================================
   core/api.js — the single HTTP client for the FastAPI back-end.

   NEW code. Nothing in index.html has been rewired to it yet: the audit counted
   346 `fetch(` and FIVE competing helpers (AUDIT §2.3) —
       fetchMe()  index.html:2711     try/catch, sets ME=null
       fmGet/fmPost index.html:8458   throw new Error(detail || 'HTTP nnn')
       getJSON()  index.html:12903    swallows the error, returns a fallback
       ccJSON()   index.html:13815    throws a STRING -> e.message is undefined (B9)
       (nothing)  ×135                `await (await fetch(…)).json()` inline
   Converting those 346 call sites in one go is exactly the kind of change that
   took the tool down twice today. This module is the destination; each page is
   migrated to it as that page is extracted, and only then.

   The contract, for every helper below:
     • resolves with the parsed JSON body on 2xx;
     • throws an ApiError (a real Error — `e.message` is always a string) on a
       non-2xx status, on a network failure and on an unparseable body;
     • `e.status` is the HTTP status (0 for a network failure), `e.detail` is
       the FastAPI `detail` field when the server sent one, `e.body` the parsed
       body when there was one.
   ============================================================================ */

/** Error thrown by every api.* helper. `message` is ALWAYS a string (unlike ccJSON, B9). */
export class ApiError extends Error {
  constructor(message, status, body, url) {
    super(String(message == null ? 'request failed' : message));
    this.name = 'ApiError';
    this.status = status || 0;
    this.body = body;
    this.detail = body && typeof body === 'object' ? body.detail : undefined;
    this.url = url;
  }
  /** True for a failure that happened before the server answered. */
  get isNetwork() { return this.status === 0; }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request(method, url, body, opts = {}) {
  let r;
  const init = { method, ...opts };
  if (body !== undefined) { init.headers = { ...JSON_HEADERS, ...(opts.headers || {}) }; init.body = typeof body === 'string' ? body : JSON.stringify(body); }
  try {
    r = await fetch(url, init);
  } catch (e) {
    throw new ApiError((e && e.message) || 'network error', 0, null, url);
  }
  const txt = await r.text().catch(() => '');
  let parsed = null;
  if (txt) { try { parsed = JSON.parse(txt); } catch (_) { parsed = null; } }
  if (!r.ok) {
    const msg = (parsed && (parsed.detail || parsed.message || parsed.error)) || ('HTTP ' + r.status);
    throw new ApiError(msg, r.status, parsed, url);
  }
  if (parsed === null && txt) throw new ApiError('malformed JSON response', r.status, txt, url);
  return parsed === null ? {} : parsed;
}

export const api = {
  /** GET url -> parsed JSON, or throws ApiError. */
  get: (url, opts) => request('GET', url, undefined, opts),
  /** POST url with a JSON body (defaults to {}) -> parsed JSON, or throws ApiError. */
  post: (url, body, opts) => request('POST', url, body === undefined ? {} : body, opts),
  put: (url, body, opts) => request('PUT', url, body === undefined ? {} : body, opts),
  del: (url, opts) => request('DELETE', url, undefined, opts),

  /**
   * Forgiving read: never throws, returns `fallback` on any failure.
   * Same contract as the legacy getJSON() (index.html:12903) — use it only for
   * decorative data whose absence must not interrupt the user.
   */
  async getOr(url, fallback, opts) { try { return await request('GET', url, undefined, opts); } catch (_) { return fallback; } },
};

/** Turns any thrown value into a message string fit for toast()/errorState(). */
export function errMessage(e) {
  if (e == null) return 'unknown error';
  if (typeof e === 'string') return e;                 // ccJSON throws strings (B9)
  return e.message || String(e);
}
