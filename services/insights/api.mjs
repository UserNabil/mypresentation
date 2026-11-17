import { answerQuestion } from '../../assets/js/profile-assistant.mjs';
import profile from '../../content/profile.json' with { type: 'json' };

export const retentionDays = 90;
const types = new Set(['visit', 'section', 'reading', 'preview', 'download', 'contact']);
const targets = new Set(['home', 'work', 'about', 'skills', 'path', 'documents', 'contact', 'cv', 'portfolio', 'presentation', 'carte', 'kit', 'vcard', 'jeto', 'my-office', 'add-associes', ...profile.projects.map(item => item.id), ...profile.certifications.map(item => item.id)]);
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function constantEqual(a, b) {
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  return new Uint8Array(left).reduce((diff, byte, index) => diff | (byte ^ new Uint8Array(right)[index]), 0) === 0;
}
export async function cleanup(env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE created_at < ?').bind(now - retentionDays * 86400000),
    env.DB.prepare('DELETE FROM questions WHERE created_at < ?').bind(now - retentionDays * 86400000),
    env.DB.prepare('DELETE FROM limits WHERE expires_at < ?').bind(now)
  ]);
}
async function allowedRate(request, env, group) {
  if (!env.RATE_LIMIT_SECRET) return false;
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  // A rotating salted digest is used only for abuse limits, never in analytics.
  const input = `${env.RATE_LIMIT_SECRET}:${Math.floor(now / 600000)}:${ip}:${group}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bucket = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const result = await env.DB.prepare('INSERT INTO limits(bucket, count, expires_at) VALUES(?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count').bind(bucket, now + 1200000).first();
  return result.count <= (group === 'chat' ? 40 : group === 'admin' ? 30 : 120);
}
async function readJSON(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('Content-Type JSON requis.');
  if (Number(request.headers.get('Content-Length') || 0) > 20000) throw new Error('Requête trop volumineuse.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Corps JSON requis.');
  let size = 0; const chunks = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20000) { await reader.cancel(); throw new Error('Requête trop volumineuse.'); }
    chunks.push(value);
  }
  const data = new Uint8Array(size); let position = 0;
  for (const chunk of chunks) { data.set(chunk, position); position += chunk.length; }
  return JSON.parse(new TextDecoder().decode(data));
}
async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET') return response({ ready: Boolean(env.DB && env.ADMIN_TOKEN?.length >= 24 && env.RATE_LIMIT_SECRET?.length >= 24), retentionDays });
  if (!env.DB || !env.ADMIN_TOKEN || !env.RATE_LIMIT_SECRET) return response({ error: 'Service non configuré.' }, 503);
  if (url.pathname.startsWith('/api/admin/')) {
    if (!await allowedRate(request, env, 'admin')) return response({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, 429);
    if (!await constantEqual(request.headers.get('Authorization') || '', `Bearer ${env.ADMIN_TOKEN}`)) return response({ error: 'Clé administrateur incorrecte.' }, 401);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30));
    const since = Date.now() - days * 86400000;
    if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
      const [summary, sections, actions, daily, questions, topics] = await Promise.all([
        env.DB.prepare("SELECT COUNT(DISTINCT CASE WHEN kind = 'visit' THEN visit_id END) AS visits, COALESCE(SUM(CASE WHEN kind = 'reading' THEN seconds ELSE 0 END), 0) AS reading_seconds, SUM(CASE WHEN kind = 'download' THEN 1 ELSE 0 END) AS downloads FROM events WHERE created_at >= ?").bind(since).first(),
        env.DB.prepare("SELECT target, COUNT(DISTINCT CASE WHEN kind = 'section' THEN visit_id END) AS views, SUM(CASE WHEN kind = 'reading' THEN seconds ELSE 0 END) AS seconds FROM events WHERE created_at >= ? AND kind IN ('section', 'reading') GROUP BY target ORDER BY views DESC, seconds DESC").bind(since).all(),
        env.DB.prepare("SELECT kind, target, COUNT(*) AS count FROM events WHERE created_at >= ? AND kind IN ('preview','download','contact') GROUP BY kind, target ORDER BY count DESC LIMIT 40").bind(since).all(),
        env.DB.prepare("SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS date, COUNT(DISTINCT visit_id) AS visits FROM events WHERE created_at >= ? AND kind = 'visit' GROUP BY date ORDER BY date").bind(since).all(),
        env.DB.prepare('SELECT id, created_at, question, answer, answered FROM questions WHERE created_at >= ? ORDER BY created_at DESC LIMIT 100').bind(since).all(),
        env.DB.prepare('SELECT question, COUNT(*) AS count FROM questions WHERE created_at >= ? AND answered = 0 GROUP BY question ORDER BY count DESC LIMIT 10').bind(since).all()
      ]);
      const totals = await env.DB.prepare('SELECT COUNT(*) AS count, SUM(CASE WHEN answered = 0 THEN 1 ELSE 0 END) AS unanswered FROM questions WHERE created_at >= ?').bind(since).first();
      return response({ days, retentionDays, summary: { ...summary, questions: totals.count, unanswered: totals.unanswered || 0 }, sections: sections.results, actions: actions.results, daily: daily.results, questions: questions.results, gaps: topics.results });
    }
    if (url.pathname === '/api/admin/export' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id, created_at, question, answer, answered FROM questions WHERE created_at >= ? ORDER BY created_at DESC LIMIT 10000').bind(since).all();
      return response({ exported_at: new Date().toISOString(), questions: rows.results });
    }
    if (url.pathname === '/api/admin/questions' && request.method === 'DELETE') {
      const id = Number(url.searchParams.get('id'));
      if (!Number.isSafeInteger(id) || id < 1) return response({ error: 'Identifiant invalide.' }, 400);
      await env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(id).run();
      return response({ deleted: true });
    }
    return response({ error: 'Route inconnue.' }, 404);
  }
  if (request.method !== 'POST') return response({ error: 'Route inconnue.' }, 404);
  if (!['/api/chat', '/api/events'].includes(url.pathname)) return response({ error: 'Route inconnue.' }, 404);
  const body = await readJSON(request);
  if (!await allowedRate(request, env, url.pathname === '/api/chat' ? 'chat' : 'events')) return response({ error: 'Limite temporaire atteinte. Réessayez dans quelques minutes.' }, 429);
  if (url.pathname === '/api/chat') {
    if (typeof body.question !== 'string' || body.question.trim().length < 2 || body.question.length > 800) return response({ error: 'La question doit contenir entre 2 et 800 caractères.' }, 400);
    const result = answerQuestion(body.question, profile);
    let saved = false;
    if (body.saveQuestion === true) {
      // Mask obvious contact details; visitors are also asked not to enter private data.
      const clean = body.question.trim().replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail masqué]').replace(/(?:\+\d{1,3}[ .-]?)?(?:\d[ .-]?){9,14}\d/g, '[numéro masqué]');
      await env.DB.prepare('INSERT INTO questions(created_at, question, answer, answered) VALUES(?, ?, ?, ?)').bind(Date.now(), clean, result.answer, result.answered ? 1 : 0).run();
      saved = true;
    }
    return response({ ...result, saved });
  }
  if (body.consent !== true || typeof body.visit !== 'string' || !/^[a-f0-9-]{36}$/.test(body.visit) || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) return response({ error: 'Événements invalides ou mesure non autorisée.' }, 400);
  const valid = body.events.every(event => event && types.has(event.kind) && targets.has(event.target) && (event.seconds === undefined || (Number.isInteger(event.seconds) && event.seconds >= 0 && event.seconds <= 30)) && (event.kind !== 'reading' || event.seconds > 0));
  if (!valid) return response({ error: 'Événement non reconnu.' }, 400);
  await env.DB.batch(body.events.map(event => env.DB.prepare('INSERT INTO events(created_at, visit_id, kind, target, seconds) VALUES(?, ?, ?, ?, ?)').bind(Date.now(), body.visit, event.kind, event.target, event.kind === 'reading' ? event.seconds : 0)));
  return response({ accepted: body.events.length });
}

export async function handleRequest(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return response({ error: 'Origine non autorisée.' }, 403);
  let result;
  if (request.method === 'OPTIONS') result = new Response(null, { status: 204 });
  else {
    try { result = await handle(request, env); }
    catch (error) {
      // Do not log requests, questions or authorization headers.
      const invalid = error instanceof SyntaxError || /JSON requis|volumineuse/.test(error.message);
      result = response({ error: invalid ? 'Requête JSON invalide ou trop volumineuse.' : 'Service indisponible. Réessayez plus tard.' }, invalid ? 400 : 503);
    }
  }
  if (origin) { result.headers.set('Access-Control-Allow-Origin', origin); result.headers.set('Vary', 'Origin'); }
  result.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  result.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  return result;
}
