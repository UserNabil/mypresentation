import { H, fm } from './feature_manager_state.js';

const S = { client: [], server: [] };

function row(kind, i, f) {
  const path = kind === 'client' ? f.dest : f.path;
  const hint = kind === 'client' ? 'destination in the client folder (sub-folders are created)' : 'path inside the server folder';
  return `<div class="fi-row" style="display:flex;gap:6px;align-items:center;margin:3px 0">
    <span class="esub" style="min-width:150px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${H.esc(f.file.name)}">${H.esc(f.file.name)} · ${(f.file.size / 1024).toFixed(0)} KB</span>
    <input data-fipath="${kind}:${i}" value="${H.esc(path)}" title="${hint}" style="flex:1;min-width:0">
    <button class="mini" data-fidel="${kind}:${i}" title="remove">✕</button></div>`;
}

function render() {
  const box = document.getElementById('fi-body');
  if (!box) return;
  box.querySelector('#fi-client').innerHTML = S.client.map((f, i) => row('client', i, f)).join('') || '<div class="esub">no client file</div>';
  box.querySelector('#fi-server').innerHTML = S.server.map((f, i) => row('server', i, f)).join('') || '<div class="esub">no server file</div>';
  box.querySelectorAll('[data-fipath]').forEach(inp => inp.oninput = () => {
    const [k, i] = inp.dataset.fipath.split(':');
    if (k === 'client') S.client[+i].dest = inp.value; else S.server[+i].path = inp.value;
  });
  box.querySelectorAll('[data-fidel]').forEach(b => b.onclick = () => {
    const [k, i] = b.dataset.fidel.split(':');
    S[k].splice(+i, 1);
    render();
  });
}

function addFiles(kind, list) {
  const sub = (document.getElementById('fi-client-dir') || {}).value || '';
  for (const file of list) {
    const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    if (kind === 'client') S.client.push({ file, dest: (sub ? sub.replace(/[\\/]+$/, '') + '/' : '') + rel });
    else S.server.push({ file, path: rel });
  }
  render();
}

function close() {
  const m = document.getElementById('fi-modal');
  if (m) m.remove();
}

async function submit(btn) {
  const v = id => (document.getElementById(id) || {}).value || '';
  const meta = {
    name: v('fi-name').trim(), title: v('fi-title').trim(), version: v('fi-version').trim(), desc: v('fi-desc').trim(),
    commands: { dry_run: v('fi-dry'), test: v('fi-test'), install: v('fi-install'), uninstall: v('fi-uninstall') },
    client: S.client.map(f => ({ dest: f.dest })), server: S.server.map(f => ({ path: f.path })),
    publish: document.getElementById('fi-publish').checked
  };
  const fd = new FormData();
  fd.append('meta', JSON.stringify(meta));
  S.client.forEach((f, i) => fd.append('client_' + i, f.file));
  S.server.forEach((f, i) => fd.append('server_' + i, f.file));
  const out = document.getElementById('fi-msg');
  btn.disabled = true;
  out.innerHTML = '<span class="fmspin"></span> importing…';
  try {
    const r = await fetch('/api/features/import', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || ('HTTP ' + r.status));
    close();
    H.toast('✔ ' + j.name + ' imported (' + j.files + ' files' + (j.commit ? ', feature_ee ' + j.commit : ', local only') + ')', 'ok', { duration: 8000 });
    const st = fm();
    st.sel = j.name;
    const mod = await import('./feature_manager.js');
    await mod.openFeatures();
  } catch (e) {
    out.innerHTML = '<span style="color:#d1242f">' + H.esc(e.message) + '</span>';
    btn.disabled = false;
  }
}

export function fmOpenImport() {
  if (!H.can('features.promote')) return;
  S.client = []; S.server = [];
  close();
  const m = document.createElement('div');
  m.id = 'fi-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(20,12,4,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
  const fld = (id, label, ph, extra) => `<div class="fld" style="margin:4px 0"><label for="${id}">${label}</label><input id="${id}" placeholder="${ph}" style="width:100%" ${extra || ''}></div>`;
  const cmd = (id, label, ph) => `<div class="fld" style="margin:4px 0"><label for="${id}">${label}</label><input id="${id}" placeholder="${ph}" style="width:100%;font-family:monospace;font-size:12px"></div>`;
  m.innerHTML = `<div id="fi-body" style="background:#efe4cb;border:2px solid #8a6d2e;border-radius:12px;max-width:760px;width:94%;max-height:88vh;overflow:auto;padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.4)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><h3 style="margin:0;flex:1">Import a feature</h3><button class="sbtn ghost" id="fi-x" style="padding:3px 10px">✕</button></div>
    <div class="esub" style="margin-bottom:8px">Super-admin only. The feature is created in features/&lt;name&gt; and published to feature_ee main, then it shows in the list like any other: Install on the Client tab, Dry run / Test / Deploy / Revert on the Server tab.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 120px;gap:8px">${fld('fi-name', 'Name', 'my_feature', 'pattern="[a-z][a-z0-9_]{2,40}"')}${fld('fi-title', 'Title', 'My Feature')}${fld('fi-version', 'Version', '1.0.0')}</div>
    <div class="fld" style="margin:4px 0"><label for="fi-desc">Description</label><textarea id="fi-desc" rows="2" style="width:100%"></textarea></div>
    <h4 style="margin:12px 0 4px">Client files</h4>
    <div class="esub">DLLs, assets, data… each file gets a destination path inside the client folder (folders that do not exist are created).</div>
    <div style="display:flex;gap:6px;align-items:center;margin:6px 0;flex-wrap:wrap">
      <input id="fi-client-dir" placeholder="destination folder for the next files (e.g. UIData/imagesets), empty = client root" style="flex:1;min-width:220px">
      <label class="sbtn" style="cursor:pointer">Add files<input type="file" id="fi-client-files" multiple hidden></label>
      <label class="sbtn" style="cursor:pointer">Add a folder<input type="file" id="fi-client-folder" webkitdirectory hidden></label>
    </div>
    <div id="fi-client"></div>
    <h4 style="margin:12px 0 4px">Server scripts</h4>
    <div class="esub">Uploaded to /root/ee_native/&lt;name&gt;/ on the server of the active environment. Commands run there with bash; $EDEN_BASE = server folder of the environment.</div>
    <div style="display:flex;gap:6px;margin:6px 0"><label class="sbtn" style="cursor:pointer">Add files<input type="file" id="fi-server-files" multiple hidden></label><label class="sbtn" style="cursor:pointer">Add a folder<input type="file" id="fi-server-folder" webkitdirectory hidden></label></div>
    <div id="fi-server"></div>
    ${cmd('fi-dry', 'Dry run command', 'python3 install.py --dry-run')}${cmd('fi-test', 'Test command (exit 0 = installed)', 'python3 install.py --check')}${cmd('fi-install', 'Install command', 'python3 install.py')}${cmd('fi-uninstall', 'Uninstall command', 'python3 install.py --revert')}
    <label style="display:flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" id="fi-publish" checked> Publish to feature_ee main (other devs get it with Pull latest features)</label>
    <div id="fi-msg" style="margin-top:8px;font-size:12px"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="sbtn ghost" id="fi-cancel">Cancel</button><button class="sbtn" id="fi-go">Import</button></div>
  </div>`;
  document.body.appendChild(m);
  const strip = (list) => {
    const arr = [...list];
    const root = arr.length && arr[0].webkitRelativePath ? arr[0].webkitRelativePath.split('/')[0] + '/' : '';
    return arr.map(f => { if (root && f.webkitRelativePath.startsWith(root)) Object.defineProperty(f, 'webkitRelativePath', { value: f.webkitRelativePath.slice(root.length) }); return f; });
  };
  m.querySelector('#fi-client-files').onchange = e => { addFiles('client', e.target.files); e.target.value = ''; };
  m.querySelector('#fi-client-folder').onchange = e => { addFiles('client', strip(e.target.files)); e.target.value = ''; };
  m.querySelector('#fi-server-files').onchange = e => { addFiles('server', e.target.files); e.target.value = ''; };
  m.querySelector('#fi-server-folder').onchange = e => { addFiles('server', strip(e.target.files)); e.target.value = ''; };
  m.querySelector('#fi-x').onclick = close;
  m.querySelector('#fi-cancel').onclick = close;
  m.querySelector('#fi-go').onclick = e => submit(e.currentTarget);
  render();
}

function subHtml(x, mine) {
  const pl = x.payload || {}, c = pl.commands || {};
  const files = (x.files || []).map(f => `<div class="esub">${f.side === 'client' ? 'client →' : 'server →'} <code>${H.esc(f.target || '')}</code> · ${(f.size / 1024).toFixed(0)} KB</div>`).join('');
  const cmds = Object.keys(c).filter(k => (c[k] || '').trim()).map(k => `<div class="esub">${H.esc(k)}: <code>${H.esc(c[k])}</code></div>`).join('');
  const del = [...(pl.delete_client || []).map(d => 'client ' + d), ...(pl.delete_server || []).map(d => 'server ' + d)];
  const tests = pl.tests && ((pl.tests.add || []).length || (pl.tests.remove || []).length)
    ? `<div class="esub">tests (${H.esc(pl.tests.env || 'preprod')}): +${(pl.tests.add || []).length} / -${(pl.tests.remove || []).length}</div>` : '';
  const st = x.status === 'pending' ? '#b8860b' : (x.status === 'approved' ? '#2ea043' : '#d1242f');
  const act = x.status === 'pending' && mine
    ? `<div style="display:flex;gap:6px;margin-top:6px"><input data-subnote="${x.id}" placeholder="note for the author (optional)" style="flex:1"><button class="mini gold" data-subok="${x.id}">Approve</button><button class="mini" data-subko="${x.id}" style="color:#d1242f">Reject</button></div>` : '';
  return `<div style="border:1px solid var(--edge);border-radius:8px;padding:8px 10px;margin:6px 0">
    <div><b>${H.esc(x.kind)} ${H.esc(x.name || '')}</b> <span style="color:${st};font-weight:700">${H.esc(x.status)}</span>
    <span class="esub"> · by ${H.esc(x.user)} · ${H.esc((x.created_at || '').replace('T', ' ').slice(0, 16))}${pl.version ? ' · v' + H.esc(pl.version) : ''}</span></div>
    ${pl.changelog ? `<div class="esub">changelog: ${H.esc(pl.changelog)}</div>` : ''}${pl.desc ? `<div class="esub">${H.esc(pl.desc)}</div>` : ''}
    ${files}${del.length ? `<div class="esub" style="color:#d1242f">delete: ${H.esc(del.join(', '))}</div>` : ''}${cmds}${tests}
    ${x.note ? `<div class="esub">note: ${H.esc(x.note)}</div>` : ''}${x.result && x.result.commit ? `<div class="esub">published: feature_ee ${H.esc(x.result.commit)}</div>` : ''}
    ${act}</div>`;
}

export async function fmOpenSubmissions() {
  if (!H.can('features.promote')) return;
  let j;
  try { j = await (await fetch('/api/agent-submissions')).json(); } catch (e) { H.toast(H.errMessage(e), 'error'); return; }
  const list = (j.submissions || []);
  const pend = list.filter(x => x.status === 'pending');
  const sync = j.you_approve ? `<div style="text-align:right;margin-bottom:6px"><button class="mini" id="sub-sync" title="copy the super-admin accounts (password hashes only) to the online API so their agents can log in">Enable super-admin accounts for the API</button></div>` : '';
  const html = sync + `<div class="esub" style="margin-bottom:6px">Features sent by AI agents through the API. Nothing is published before an approval by <b>${H.esc(j.approver)}</b>${j.you_approve ? ' (you)' : ''}.</div>
    ${pend.length ? '<h4 style="margin:6px 0">Pending</h4>' + pend.map(x => subHtml(x, j.you_approve)).join('') : '<div class="esub">no pending submission</div>'}
    ${list.length > pend.length ? '<h4 style="margin:10px 0 4px">History</h4>' + list.filter(x => x.status !== 'pending').slice(0, 30).map(x => subHtml(x, false)).join('') : ''}`;
  H.showThemedDialog('API submissions (' + pend.length + ' pending)', html);
  const go = async (b, approve) => {
    const id = approve ? b.dataset.subok : b.dataset.subko;
    const note = (document.querySelector('[data-subnote="' + id + '"]') || {}).value || '';
    if (!await H.fmConfirm(approve ? 'Approve' : 'Reject', approve ? 'Publish this submission to feature_ee main?' : 'Reject this submission?', approve ? 'Approve' : 'Reject')) return;
    return H.runBusy(b, async () => {
      try {
        const r = await H.fmPost('/api/agent-submissions/decide', { id, approve, note });
        H.toast(r.status + (r.result && r.result.commit ? ' · feature_ee ' + r.result.commit : ''), 'ok');
        fmOpenSubmissions();
        const mod = await import('./feature_manager.js');
        mod.openFeatures();
      } catch (e) { H.toast(H.errMessage(e), 'error'); }
    });
  };
  const sb = document.getElementById('sub-sync');
  if (sb) sb.onclick = () => H.runBusy(sb, async () => {
    try { const r = await H.fmPost('/api/agent-submissions/sync-accounts', {}); H.toast('API enabled for: ' + (r.accounts || []).join(', '), 'ok', { duration: 8000 }); }
    catch (e) { H.toast(H.errMessage(e), 'error'); }
  });
  document.querySelectorAll('[data-subok]').forEach(b => b.onclick = () => go(b, true));
  document.querySelectorAll('[data-subko]').forEach(b => b.onclick = () => go(b, false));
}
