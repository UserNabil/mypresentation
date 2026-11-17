// Front-end de l'assistant + mesure d'audience.
// Réutilise le widget #cbot de la page, répond via le moteur partagé
// profile-assistant.mjs (sourcé sur content/profile.json), loggue les
// questions sur /api/chat et les événements de visite sur /api/events.
import { answerQuestion } from './profile-assistant.mjs';

const API = (window.PORTFOLIO_INSIGHTS && window.PORTFOLIO_INSIGHTS.apiBase) || '';
const cbot = document.getElementById('cbot');
if (cbot) init();

async function init() {
  const el = {
    msgs: document.getElementById('cbotMsgs'),
    chips: document.getElementById('cbotChips'),
    form: document.getElementById('cbotInput'),
    text: document.getElementById('cbotText'),
    launch: document.getElementById('cbotLaunch'),
    min: document.getElementById('cbotMin')
  };

  // Profil (pour les réponses instantanées et le repli hors-ligne).
  let profile = null;
  try {
    const res = await fetch(new URL('../../content/profile.json', import.meta.url));
    if (res.ok) profile = await res.json();
  } catch { /* le serveur reste le repli */ }

  const SUGGESTIONS = [
    ['Disponibilité', 'Es-tu disponible pour une opportunité ?'],
    ['Compétences', 'Quelles sont tes compétences ?'],
    ['Réalisations', 'Quels projets as-tu réalisés ?'],
    ['Parcours', 'Quel est ton parcours ?'],
    ['Contact', 'Comment te contacter ?']
  ];

  let greeted = false;
  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  const scroll = () => { el.msgs.scrollTop = el.msgs.scrollHeight; };

  function addMsg(text, who, links) {
    const m = document.createElement('div');
    m.className = 'cbot-msg ' + (who || 'bot');
    m.innerHTML = (who === 'me' ? esc(text) : esc(text).replace(/\n/g, '<br>'));
    el.msgs.appendChild(m);
    if (links && links.length) {
      const row = document.createElement('div');
      row.className = 'cbot-chips';
      row.style.padding = '.5rem 0 0';
      links.forEach(link => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cbot-chip'; b.textContent = link.label;
        b.addEventListener('click', () => followLink(link.url));
        row.appendChild(b);
      });
      m.appendChild(row);
    }
    scroll();
    return m;
  }

  function followLink(url) {
    if (!url) return;
    if (url.charAt(0) === '#') {
      const node = document.querySelector(url);
      if (node) { closeChat(); node.scrollIntoView({ behavior: 'smooth' }); }
    } else if (url.startsWith('mailto:') || url.startsWith('tel:')) {
      location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  function setSuggestions() {
    el.chips.innerHTML = '';
    SUGGESTIONS.forEach(([label, question]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cbot-chip'; b.textContent = label;
      b.addEventListener('click', () => handle(question));
      el.chips.appendChild(b);
    });
  }

  function typing(done) {
    const t = document.createElement('div');
    t.className = 'cbot-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    el.msgs.appendChild(t); scroll();
    setTimeout(() => { t.remove(); done(); }, 450);
  }

  async function resolve(question) {
    // Priorité au serveur (il loggue la question) ; repli local si indisponible.
    if (API) {
      try {
        const res = await fetch(API + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, saveQuestion: true })
        });
        if (res.ok) return await res.json();
      } catch { /* repli local */ }
    }
    if (profile) { try { return answerQuestion(question, profile); } catch { /* repli contact */ } }
    return { answer: "Pour une réponse précise, contactez Nabil : n.ouldterki@gmail.com.", answered: false, links: [{ label: 'Envoyer un e-mail', url: 'mailto:n.ouldterki@gmail.com' }] };
  }

  function handle(question) {
    question = (question || '').trim();
    if (!question) return;
    addMsg(question, 'me');
    typing(async () => {
      const r = await resolve(question);
      addMsg(r.answer || '…', 'bot', r.links);
      setSuggestions();
    });
  }

  function greet() {
    if (greeted) return; greeted = true;
    addMsg("Bonjour 👋 Je suis l'assistant de Nabil. Pose ta question, ou choisis un sujet :", 'bot');
    setSuggestions();
  }
  function openChat() { cbot.classList.add('open'); greet(); setTimeout(() => el.text.focus(), 300); }
  function closeChat() { cbot.classList.remove('open'); }

  el.launch.addEventListener('click', () => cbot.classList.contains('open') ? closeChat() : openChat());
  el.min.addEventListener('click', closeChat);
  el.form.addEventListener('submit', e => { e.preventDefault(); const v = el.text.value; el.text.value = ''; handle(v); });

  // ---- Mesure d'audience (consentie) ----
  if (API) initInsights(profile);
}

function initInsights(profile) {
  const KEY = 'insights.consent';
  let consent = null;
  try { consent = localStorage.getItem(KEY); } catch {}

  const ALLOWED = new Set(['home', 'work', 'about', 'skills', 'path', 'documents', 'contact', 'cv', 'portfolio', 'presentation', 'carte', 'kit', 'vcard', 'jeto', 'my-office', 'add-associes']);
  if (profile) {
    (profile.projects || []).forEach(p => ALLOWED.add(p.id));
    (profile.certifications || []).forEach(c => ALLOWED.add(c.id));
  }

  let visit = null;
  try { visit = sessionStorage.getItem('insights.visit'); } catch {}
  if (!visit) { visit = (crypto.randomUUID ? crypto.randomUUID() : fallbackUuid()); try { sessionStorage.setItem('insights.visit', visit); } catch {} }

  const queue = [];
  const push = (kind, target, seconds) => {
    if (consent !== 'yes' || !ALLOWED.has(target)) return;
    if (kind === 'reading' && !(seconds > 0)) return;
    queue.push(seconds ? { kind, target, seconds: Math.min(30, seconds) } : { kind, target });
    if (queue.length >= 20) flush();
  };
  function flush(beacon) {
    if (consent !== 'yes' || !queue.length) return;
    const batch = queue.splice(0, 20);
    const payload = JSON.stringify({ consent: true, visit, events: batch });
    try {
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(API + '/api/events', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(API + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
    } catch {}
  }

  // Sections + temps de lecture
  const SECTIONS = { top: 'home', work: 'work', about: 'about', skills: 'skills', path: 'path', documents: 'documents', contact: 'contact' };
  const seenSection = new Set();
  const visible = new Map(); // target -> ratio
  const reading = new Map(); // target -> seconds accumulés
  function startTracking() {
    push('visit', 'home');
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const target = SECTIONS[e.target.id];
        if (!target) return;
        if (e.isIntersecting && e.intersectionRatio >= 0.4) {
          visible.set(target, e.intersectionRatio);
          if (!seenSection.has(target)) { seenSection.add(target); push('section', target); }
        } else {
          visible.delete(target);
        }
      });
    }, { threshold: [0, 0.4, 0.75] });
    Object.keys(SECTIONS).forEach(id => { const n = document.getElementById(id); if (n) io.observe(n); });

    // Compte 1s pour la section la plus visible, tant que l'onglet est actif.
    setInterval(() => {
      if (document.hidden || !visible.size) return;
      let best = null, ratio = 0;
      visible.forEach((r, t) => { if (r > ratio) { ratio = r; best = t; } });
      if (best) reading.set(best, (reading.get(best) || 0) + 1);
    }, 1000);

    // Envoie le temps de lecture régulièrement (paquets <= 30s par section).
    setInterval(() => {
      reading.forEach((sec, target) => { if (sec > 0) { push('reading', target, sec); reading.set(target, 0); } });
      flush();
    }, 10000);

    // Actions : téléchargements, aperçus de projets, contact.
    document.addEventListener('click', e => {
      const doc = e.target.closest('[data-document]');
      if (doc) { push('download', normalizeDoc(doc.getAttribute('data-document'))); flush(); return; }
      const prev = e.target.closest('[data-prev-type]');
      if (prev) { const card = prev.closest('[id^="project-"]'); if (card) push('preview', card.id.replace('project-', '')); flush(); return; }
      const link = e.target.closest('a[href^="mailto:"], a[href^="tel:"]');
      if (link) { push('contact', 'contact'); flush(); return; }
    }, true);

    window.addEventListener('visibilitychange', () => { if (document.hidden) { reading.forEach((sec, t) => { if (sec > 0) { push('reading', t, sec); reading.set(t, 0); } }); flush(true); } });
    window.addEventListener('pagehide', () => { reading.forEach((sec, t) => { if (sec > 0) { push('reading', t, sec); reading.set(t, 0); } }); flush(true); });
  }

  function normalizeDoc(v) { v = (v || '').toLowerCase(); return ALLOWED.has(v) ? v : 'documents'; }
  function fallbackUuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }

  if (consent === 'yes') { startTracking(); return; }
  if (consent === 'no') return;

  // Bannière de consentement discrète.
  const bar = document.createElement('div');
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', "Mesure d'audience");
  bar.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2400;max-width:320px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:.9rem 1rem;box-shadow:0 16px 48px rgba(0,0,0,.22);font-family:var(--ff-body);font-size:.82rem;line-height:1.45;';
  bar.innerHTML = "Ce site mesure son audience de façon <strong>anonyme</strong> pour s'améliorer. Aucune donnée personnelle.<div style='display:flex;gap:.5rem;margin-top:.7rem'><button data-yes style='flex:1;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:.5rem;font-family:var(--ff-mono);font-size:.74rem;cursor:pointer'>Accepter</button><button data-no style='flex:1;background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:8px;padding:.5rem;font-family:var(--ff-mono);font-size:.74rem;cursor:pointer'>Refuser</button></div>";
  document.body.appendChild(bar);
  bar.querySelector('[data-yes]').addEventListener('click', () => { consent = 'yes'; try { localStorage.setItem(KEY, 'yes'); } catch {} bar.remove(); startTracking(); });
  bar.querySelector('[data-no]').addEventListener('click', () => { consent = 'no'; try { localStorage.setItem(KEY, 'no'); } catch {} bar.remove(); });
}
