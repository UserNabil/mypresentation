/* ============================================================================
   DIAGNOSTICS — controles d'integrite des donnees (references cassees,
   corruption de structure) + application des correctifs proposes.

   Extrait de index.html (lot doctor-diag).

   ⚠ DIAG (le dernier resultat de /api/diagnostics) etait declare tout en haut
   d'index.html avec un commentaire « declared so strict-mode module doesn't
   ReferenceError » : il n'etait pourtant lu QUE par les quatre fonctions
   ci-dessous. Il devient donc un etat PRIVE du module. Il n'est pas cosmetique :
   diagFix/diagFixAll relisent DIAG.groups pour retrouver le descripteur `fix`
   a partir des data-attributs du DOM — si DIAG et le HTML rendu divergent, on
   applique un correctif sur la MAUVAISE ligne. C'est pourquoi chaque fix se
   termine par openDiag(true) : refresh force, jamais le cache.

   ⚠ diagFixAll poste UN SEUL batch a /api/diagnostics/fix_all : la version
   « N POST » relisait/reecrivait le fichier serveur N fois (5 Mo a chaque tour).
   Ne pas la retablir.

   Contrat d'appel (index.html) :
     initDiagnostics({ $, esc, toast, confirm, guard, showOverlay, hideOverlay, openEntity })
   ============================================================================ */

let H = null;
let DIAG = null;   // dernier resultat de /api/diagnostics (prive au module)

export function initDiagnostics(host) {
  H = host;
  const $ = H.$;
  const btn = $('#btn-diag'); if (btn) btn.onclick = () => openDiag();
  $('#diag-close').onclick = () => $('#diag').classList.remove('open');
  $('#diag-rerun').onclick = () => openDiag(true);
}

export async function openDiag(refresh) {
  const { $, esc, guard, showOverlay, hideOverlay } = H;
  if (!guard('integrity.view', 'Diagnostics')) return;
  $('#diag').classList.add('open'); showOverlay('Running integrity checks…');
  let r;
  // chaque etage d'erreur a son propre message : « rien ne s'affiche » etait
  // indiscernable d'un 403 de role, d'un JSON casse ou d'un bug de rendu.
  try { r = await fetch('/api/diagnostics' + (refresh ? '?refresh=1' : '')); }
  catch (e) { hideOverlay(); $('#diag-body').innerHTML = '<div class="esub" style="padding:20px">✗ Could not reach the diagnostics endpoint: ' + esc(String(e && e.message || e)) + '</div>'; return; }
  if (!r.ok) {
    hideOverlay(); let d = ''; try { d = (await r.json()).detail || ''; } catch { }
    $('#diag-body').innerHTML = '<div class="esub" style="padding:20px">✗ diagnostics returned HTTP ' + r.status + (d ? ' — ' + esc(d) : '') + (r.status === 403 ? ' (your role cannot view diagnostics)' : '') + '</div>'; return;
  }
  try { DIAG = await r.json(); }
  catch (e) { hideOverlay(); $('#diag-body').innerHTML = '<div class="esub" style="padding:20px">✗ diagnostics response was not valid JSON: ' + esc(String(e && e.message || e)) + '</div>'; return; }
  hideOverlay();
  try { renderDiag(); }
  catch (e) { $('#diag-body').innerHTML = '<div class="esub" style="padding:20px">✗ diagnostics render error: ' + esc(String(e && e.stack || e)) + '</div>'; }
}

function renderDiag() {
  const { $, esc, openEntity } = H;
  const s = DIAG.summary || { error: 0, warning: 0, info: 0 };
  const ck = DIAG.checked || {};
  $('#diag-sum').textContent = `checked ${ck.monster || 0} monsters · ${ck.item || 0} items · ${ck.spell || 0} spells`;
  DIAG.groups = DIAG.groups || [];
  let h = `<div class="dsum">
    <div class="dcard error"><div class="n">${s.error}</div><div class="l">Errors (block boot)</div></div>
    <div class="dcard warning"><div class="n">${s.warning}</div><div class="l">Warnings</div></div>
    <div class="dcard info"><div class="n">${s.info}</div><div class="l">Info</div></div></div>`;
  if (!DIAG.groups.some(g => g.count)) h += '<div class="esub" style="padding:20px;text-align:center">✓ No issues found — data looks consistent.</div>';
  for (const g of DIAG.groups) {
    if (!g.count) continue; const fixable = g.issues.some(i => i.fix);
    // data-ix indexe g.issues (la page n'affiche qu'un PREMIER lot) : c'est cet
    // index-la que diagFix relit, jamais une position dans le DOM.
    h += `<div class="dgroup" data-key="${g.key}">
      <div class="dghead"><span class="dsev ${g.severity}">${g.severity}</span>
        <span class="dgl">${esc(g.label)}</span><span class="dgc">${g.count}</span>
        ${fixable ? `<span class="dgfixall" data-fixall="${g.key}">Fix all shown</span>` : ''}<span class="chev">▸</span></div>
      <div class="dgbody">${g.issues.map((i, ix) => `<div class="dirow">
          ${i.id ? `<span class="dlink" data-e="${i.etype}" data-id="${i.id}">${esc(i.etype)} #${i.id}</span>` : `<span class="dlink" style="color:var(--faint);cursor:default">${esc(i.etype || 'check')}</span>`}
          <span class="dmsg">${esc(i.msg)}</span>
          ${i.fix ? `<span class="dfix" data-gk="${g.key}" data-ix="${ix}">Fix</span>` : ''}</div>`).join('')}
        ${g.count > g.issues.length ? `<div class="dmore">… and ${g.count - g.issues.length} more (showing first ${g.issues.length})</div>` : ''}
      </div></div>`;
  }
  $('#diag-body').innerHTML = h;
  // le clic sur l'entete plie/deplie, SAUF s'il vient du bouton « Fix all shown »
  $('#diag-body').querySelectorAll('.dghead').forEach(hd => hd.onclick = ev => { if (ev.target.closest('.dgfixall')) return; hd.closest('.dgroup').classList.toggle('open'); });
  $('#diag-body').querySelectorAll('.dlink[data-e]').forEach(l => l.onclick = () => { $('#diag').classList.remove('open'); openEntity(l.dataset.e, +l.dataset.id); });
  $('#diag-body').querySelectorAll('.dfix').forEach(b => b.onclick = () => diagFix(b.dataset.gk, +b.dataset.ix));
  $('#diag-body').querySelectorAll('.dgfixall').forEach(b => b.onclick = () => diagFixAll(b.dataset.fixall));
}

async function diagFix(gk, ix) {
  const { toast, showOverlay, hideOverlay } = H;
  const g = DIAG.groups.find(x => x.key === gk); const fix = g.issues[ix].fix; if (!fix) return;
  showOverlay('Fixing…');
  const r = await fetch('/api/diagnostics/fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fix) });
  hideOverlay();
  if (r.ok) { toast('fixed (revert in History)'); openDiag(true); }
  else { const j = await r.json(); toast('' + (j.detail || 'failed')); }
}

async function diagFixAll(gk) {
  const { toast, confirm: uiConfirm, showOverlay, hideOverlay } = H;
  const g = DIAG.groups.find(x => x.key === gk); const fixes = g.issues.filter(i => i.fix).map(i => i.fix); if (!fixes.length) return;
  if (!await uiConfirm(`Apply ${fixes.length} fix(es) for "${g.label}"?\nEach change is backed up — revert in History.`, 'Fix all', 'Fix all')) return;
  showOverlay(`Applying ${fixes.length} fixes…`);
  // UN seul appel batch : 1 lecture + 1 ecriture par fichier serveur (au lieu de N POST × download/upload 5 Mo)
  let res = {}; try { const r = await fetch('/api/diagnostics/fix_all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fixes }) }); res = await r.json().catch(() => ({})); } catch (e) { }
  hideOverlay();
  toast(res.applied != null ? `✔ ${res.applied} fix(es) applied${res.failed ? (', ' + res.failed + ' failed') : ''} (revert in History)` : '✔ fixes applied', 'ok');
  openDiag(true);
}
