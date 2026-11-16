/* ============================================================================
   LES BLOCS DE MESURE DU DASHBOARD.

   Tout vient de /api/home, en UN appel. Regle tenue partout : `null` du serveur
   => « — » a l'ecran, jamais une valeur plausible. Deux cases sont vides par
   HONNETETE et le disent dans leur infobulle :
     * AFK players       — le serveur de jeu n'expose aucun signal d'inactivite
                           (la presence est lue sur les sockets ouvertes).
     * Players over time — l'outil echantillonne depuis maintenant ; la courbe
                           est vide au premier demarrage, puis se remplit.
   ============================================================================ */

import { esc } from '../core/dom.js';

const num = n => (n == null ? '—' : Number(n).toLocaleString('en-US'));

function dur(sec) {
  if (sec == null) return '—';
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ago(iso) {
  if (!iso) return '';
  const t = typeof iso === 'number' ? iso * 1000 : Date.parse(String(iso).length <= 19 ? iso + 'Z' : iso);
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

const hhmm = ts => { const d = new Date(ts * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/* ======================== LES CHIFFRES DE TETE ==============================
   Refonte 2026-08-14 : chaque carte du haut porte desormais une illustration et
   UN chiffre lisible de loin. Ces quatre fonctions ne mesurent RIEN de nouveau —
   elles resument ce que la carte detaille deja juste en dessous, a partir de la
   MEME reponse /api/home. Aucune source parallele, donc aucun risque que la
   vignette et le detail se contredisent.

   Elles rendent { v, s, cls } : la valeur, sa legende, et l'accent eventuel.
   `v` est du HTML (il porte parfois un <i> d'unite) ; `s` est du texte echappe.
   La regle du fichier tient : rien du serveur => « — », jamais un zero plausible.
   ------------------------------------------------------------------------- */

export function headHealth(h) {
  const l = h.servers || [];
  const up = l.filter(p => p.up).length;
  if (!l.length) return { v: '—', s: 'no server configured' };
  /* La base compte comme un service dans le detail ; on la compte aussi ici,
     sinon l'en-tete annonce « 4/4 » pendant que la ligne Database est rouge. */
  const db = h.database || {};
  const tot = l.length + (db.ok === undefined ? 0 : 1);
  const ok = up + (db.ok ? 1 : 0);
  return { v: `${ok}<i>/${tot}</i>`, s: ok === tot ? 'all services up' : `${tot - ok} service${tot - ok > 1 ? 's' : ''} down`,
    cls: ok === tot ? 'ok' : 'bad' };
}

export function headPlayers(p) {
  return { v: num(p.online), s: p.peak != null ? `peak today ${num(p.peak)}` : 'connected right now',
    cls: p.online ? 'ok' : '' };
}

export function headData(counts) {
  /* Somme des seules lignes REELLEMENT comptees (voir DATA_ROWS). Une cle absente
     ne vaut pas zero : elle sort du total, et le total le dit en legende. */
  const vals = DATA_ROWS.map(([k]) => counts[k]).filter(v => v != null);
  if (!vals.length) return { v: '—', s: 'no catalogue loaded' };
  const tot = vals.reduce((a, b) => a + Number(b), 0);
  return { v: num(tot), s: `across ${vals.length} catalogue${vals.length > 1 ? 's' : ''}` };
}

export function headDeploy(d, env) {
  /* Un nom de paquet n'est pas un chiffre : il passe en petit, sinon il deborde
     ou se fait tronquer au milieu — et un numero de version tronque MENT. */
  if (d.package) return { v: esc(d.package), s: d.deploy_at ? 'published ' + ago(d.deploy_at) : 'latest package', cls: 'txt' };
  return { v: esc(String(env || '—').toUpperCase()), s: 'nothing published yet', cls: 'txt' };
}

/* -------------------------------------------------------- Server Health -- */

export function paintHealth(h, canRestart, uptime) {
  const ligne = (nom, up, droite) => `<div class="dq-svc">
      <span class="s-dot ${up === null ? '' : up ? 'ok' : 'bad'}"></span>
      <span class="s-nm">${esc(nom)}</span>
      <span class="s-st ${up === null ? '' : up ? 'ok' : 'bad'}">${up === null ? 'n/a' : up ? 'Online' : 'Offline'}</span>
      <span class="s-ms">${droite || ''}</span></div>`;
  const rows = (h.servers || []).map(p => ligne(p.name || '?', !!p.up, p.port ? ':' + esc(p.port) : ''));
  const db = h.database || {};
  rows.push(ligne('Database', !!db.ok, db.latency_ms != null ? esc(db.latency_ms) + ' ms' : ''));
  /* `discord === null` = HORS DE PORTEE pour ce role (SA seulement), pas « en panne ».
     Afficher un point rouge la ou on n'a pas le droit de regarder ferait croire a un incident. */
  if (h.discord !== undefined) rows.push(ligne('Discord Bot', h.discord === null ? null : !!h.discord, ''));
  const up = (h.servers || []).filter(p => p.up).length, tot = (h.servers || []).length;
  /* L'uptime vivait dans une rangee « System information » qui n'affichait plus que ca
     d'utile. Il appartient a cette carte : c'est une mesure de sante, pas une propriete
     du tool. Meme infobulle, meme source (system.uptime). */
  return `<div class="dq-list">${rows.join('') || '<span class="dq-bad">no server configured</span>'}</div>
    <div class="dq-note">${up}/${tot || '?'} services up${db.host ? ' · ' + esc(db.host) : ''}
      ${uptime != null ? `· <span title="Since the oldest game server still up">up ${esc(dur(uptime))}</span>` : ''}
      ${canRestart ? '· <span class="dq-link" data-go="restart">View full status →</span>' : ''}</div>`;
}

/* ------------------------------------------------------- Players & World -- */

export function paintPlayers(p) {
  const tuile = (v, k, cls, tip) => `<div class="dq-m"${tip ? ` title="${esc(tip)}"` : ''}>
      <span class="m-v ${cls || ''}">${v}</span><span class="m-k">${esc(k)}</span></div>`;
  const pct = (p.online && p.afk != null) ? Math.round(p.afk / p.online * 100) + '%' : '';
  return `<div class="dq-mx four">
      ${tuile(num(p.online), 'Players online', p.online ? 'ok' : '', 'Counted from live sockets')}
      ${tuile(num(p.peak), p.peak_at ? 'Peak today · ' + hhmm(p.peak_at) : 'Peak today', '',
    p.peak == null ? p.series_note
      : 'Highest sample SINCE MIDNIGHT. The range under the curve covers the last 24 h, so it can be higher if the busiest moment was yesterday evening.')}
      ${/* « — » sans explication passe pour une panne. On dit que la mesure n'existe pas. */''}
      ${tuile(p.afk == null ? '<span class="m-na">n/a</span>' : num(p.afk),
      'AFK players' + (pct ? ' · ' + pct : ''), '', p.afk_note)}
      ${tuile(num(p.channels), 'Channels', '', 'Zone servers currently up')}
    </div>
    ${sparkline(p.series || [], p.series_note, p.since)}`;
}

/** Courbe 24 h en SVG pur (aucune bibliotheque : la page doit rester autonome).
    Moins de deux points = on l'ecrit, on ne trace pas une ligne inventee. */
function sparkline(serie, note, since) {
  if (!serie || serie.length < 2) {
    /* « pas assez de mesures » est une impasse : ca ne dit ni pourquoi, ni combien de temps.
       Cet historique n'existait pas avant — il se construit depuis le premier echantillon, et
       repart de zero a chaque changement d'environnement. On le DIT. */
    const n = serie ? serie.length : 0;
    return `<div class="dq-spark empty" title="${esc(note || '')}">
      <span>Players over time (24 h)<br><b>${n}</b> sample${n === 1 ? '' : 's'} so far —
      ${since ? 'measuring since ' + hhmm(since) : 'measuring starts now'}, one every 30 s.
      The curve appears from the 2nd.</span></div>`;
  }
  /* ⛔ L'AXE PARTAIT DE ZERO. Avec 300 a 342 joueurs, la courbe se collait au bord haut
     et le remplissage couvrait toute la boite : un rectangle plein, illisible — on ne
     voyait NI la variation NI le niveau. On cadre desormais sur la PLAGE des donnees.

     ⚠ Une base non nulle exagere les ecarts : 3 joueurs d'amplitude peuvent ressembler a
     un effondrement. C'est pourquoi le minimum et le maximum sont ECRITS sur l'axe — sans
     eux, le graphe ment par cadrage. */
  const W = 100, H = 34, t0 = serie[0][0], t1 = serie[serie.length - 1][0] || t0 + 1;
  const vals = serie.map(p => p[1]);
  const vmax = Math.max(...vals), vmin = Math.min(...vals);
  const marge = Math.max(1, Math.round((vmax - vmin) * 0.15));
  const hi = vmax + marge, lo = Math.max(0, vmin - marge);
  const y = v => (H - ((v - lo) / ((hi - lo) || 1)) * H).toFixed(2);
  const x = t => ((t - t0) / ((t1 - t0) || 1) * W).toFixed(2);
  const pts = serie.map(p => `${x(p[0])},${y(p[1])}`).join(' ');

  /* Le jour change-t-il dans la fenetre ? Sinon « 21:01 → 16:30 » se lit a l'envers. */
  const jour = ts => new Date(ts * 1000).getDate();
  const traverse = jour(t0) !== jour(t1);

  return `<div class="dq-spark">
    <div class="sp-h"><span>Players over time (24 h)</span>
      <b title="Lowest and highest sample of the last 24 h. « Peak today » above only counts since midnight — the two differ when the busiest moment was yesterday evening.">${num(vmin)}–${num(vmax)}</b></div>
    <div class="sp-plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="${y(vmax)}" x2="${W}" y2="${y(vmax)}" stroke="rgba(154,106,43,.25)"
          stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>
        <polygon points="${x(t0)},${H} ${pts} ${x(t1)},${H}" fill="rgba(154,106,43,.13)" stroke="none"/>
        <polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="1.4"
          vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      </svg>
      <span class="sp-hi">${num(vmax)}</span><span class="sp-lo">${num(vmin)}</span>
    </div>
    <div class="sp-x"><span>${hhmm(t0)}${traverse ? ' <i>prev. day</i>' : ''}</span>
      <span>${num(serie.length)} samples</span><span>${hhmm(t1)}</span></div></div>`;
}

/* ------------------------------------------------------------ Deployment -- */

export function paintDeploy(d, env, canDeploy, canRollback) {
  const ligne = (k, v, tip) => `<div class="dq-kv"${tip ? ` title="${esc(tip)}"` : ''}>
      <span class="kv-k">${esc(k)}</span><span class="kv-v">${v}</span></div>`;
  return `<div class="dq-list">
      ${ligne('Current environment', `<b class="env-v">${esc(String(env || '—').toUpperCase())}</b>`)}
      ${ligne('Latest package', d.package ? esc(d.package) : '—',
    d.package ? 'Last version.json published for this environment' : 'Nothing published from this tool yet')}
      ${ligne('Last deploy', d.deploy_at ? `${esc(ago(d.deploy_at))}${d.actor ? ' · ' + esc(d.actor) : ''}` : '—',
      'Newest entry of the shared action journal, category "deploy"')}
      ${ligne('Rollback', d.rollback ? `${num(d.rollback)} snapshot${d.rollback > 1 ? 's' : ''}` : 'none',
        'Snapshots you can restore')}
    </div>
    <div class="dq-note">
      ${canDeploy ? '<span class="dq-link" data-go="deploy">Open Deploy Center →</span>' : ''}
      ${canRollback ? '<span class="dq-link" data-go="rollback">rollback</span>' : ''}
      ${!canDeploy && !canRollback ? 'Deployment needs Game Master access.' : ''}</div>`;
}

/* -------------------------------------------------------- Database / data -- */

/* Les libelles suivent la maquette, mais chaque ligne est adossee a un compteur QUI EXISTE
   (les cles de engine.ENTITIES). « Quests » et « Guilds » n'en ont pas : elles vivent
   respectivement dans un index construit a la demande et dans la base du jeu — les mettre ici
   aurait affiche « — » en permanence. On montre a la place deux volumes reellement comptes. */
const DATA_ROWS = [
  ['monster', 'Creatures', 'creatures'], ['item', 'Items', 'bag'],
  ['spell', 'Spells', 'spellbook'], ['enchant', 'Enchants', 'enchants'],
  ['npc', 'NPCs', 'party'], ['title', 'Titles', 'medal'],
  ['achievement', 'Achievements', 'crown'], ['dialogue', 'Dialogues', 'comment'],
];

export function paintData(counts, iconMarkup) {
  const rows = DATA_ROWS.map(([k, lbl, ic]) => `<div class="dq-kv">
      <span class="kv-k">${iconMarkup(ic, 24)}${esc(lbl)}</span>
      <span class="kv-v">${num(counts[k])}</span></div>`).join('');
  return `<div class="dq-list">${rows}</div>
    <div class="dq-note"><span class="dq-link" data-go="creatures">Open Database Manager →</span></div>`;
}

/* ------------------------------------------------------------ environnements -- */

/* Les trois environnements tenaient une RANGEE ENTIERE en bas de page pour trois mots.
   Ils sont devenus des pastilles posees a cote du titre « Overview » : meme action
   (un clic bascule), meme information (laquelle est active), un dixieme de la place.
   Elles restent ecrites en toutes lettres — la couleur de la banniere seule ne
   suffirait pas a fonder une decision de deploiement. */
export function paintEnvs(envs) {
  return (envs || []).map(e => `<button class="envchip${e.active ? ' on' : ''}${e.configured ? '' : ' off'}"
      data-env="${esc(e.name)}" title="${e.configured ? (e.active ? 'Active environment' : 'Switch to this environment — reloads all data') : 'Not configured yet'}">
      ${esc(String(e.name).toUpperCase())}</button>`).join('');
}
