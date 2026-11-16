/* ============================================================================
   HISTORIQUE GIT DES DONNEES — la liste des commits du depot de donnees et le
   diff de celui qu'on choisit.

   Extrait de index.html (lot T1). Lecture SEULE : cette page n'ecrit nulle part,
   ce qui en fait l'une des plus sures a sortir en premier.

   Contrat d'appel (index.html) :
     initGitHistory({ $, esc, enc })
   ============================================================================ */

let H = null;

export function initGitHistory(host) {
  H = host;
  const open = H.$('#git-open'); if (open) open.onclick = () => openGitHistory();
  const close = H.$('#git-close'); if (close) close.onclick = () => H.$('#gitmodal').classList.remove('open');
}

export async function openGitHistory() {
  const { $, esc, enc } = H;
  $('#gitmodal').classList.add('open');
  $('#git-diff').innerHTML = '<div class="esub" style="padding:14px">Select a commit to see its diff.</div>';
  $('#git-list').innerHTML = '<div class="esub" style="padding:14px"><span class="spin"></span> loading…</div>';
  let j;
  try { j = await (await fetch('/api/git/history?limit=120')).json(); }
  catch (e) {
    $('#git-list').innerHTML = '<div class="esub" style="padding:14px;color:var(--crimson)">✗ '
      + esc(String(e && e.message || e)) + '</div>';
    return;
  }
  if (!j.available) {
    $('#git-list').innerHTML = '<div class="esub" style="padding:14px">Git history not initialized yet — '
      + 'make an edit and it will start tracking (git required).</div>';
    return;
  }
  if (!(j.commits || []).length) {
    $('#git-list').innerHTML = '<div class="esub" style="padding:14px">No edit recorded yet.</div>';
    return;
  }
  $('#git-list').innerHTML = j.commits.map(c => `<div class="chcard" data-gitc="${esc(c.hash)}" style="cursor:pointer">
    <div style="flex:1;min-width:0">
      <div class="chtitle">${(c.tags || []).map(t =>
    `<span class="chtag" style="color:#4a8a3a;border-color:#4a8a3a">✓ ${esc(t.replace('working/', ''))}</span>`).join('')}
        <b style="color:var(--ink)">${esc(c.subject)}</b></div>
      <div class="chmeta">${esc(c.hash)} · ${esc(c.author)} · ${esc(c.date)}</div></div></div>`).join('');
  $('#git-list').querySelectorAll('[data-gitc]').forEach(b => {
    b.onclick = async () => {
      $('#git-list').querySelectorAll('.chcard').forEach(x => x.classList.toggle('sel', x === b));
      $('#git-diff').innerHTML = '<div class="esub" style="padding:14px"><span class="spin"></span> loading diff…</div>';
      const d = await (await fetch('/api/git/show/' + enc(b.dataset.gitc))).json();
      $('#git-diff').innerHTML = `<pre style="margin:0;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word">${esc(d.diff || '(empty)')}</pre>`;
    };
  });
}
