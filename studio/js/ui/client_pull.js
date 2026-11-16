let H = null;

export function initClientPull(host) {
  H = host;
}

export async function doClientPull() {
  const { toast, showOverlay, hideOverlay, errMessage } = H;
  showOverlay('Fetching the client manifest from the prod CDN…');
  try {
    const r = await fetch('/api/client/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ which: 'latest' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { hideOverlay(); toast('' + (j.detail || 'pull failed'), 'error'); return; }
    let done = false;
    while (!done) {
      await new Promise(s => setTimeout(s, 800));
      const st = await (await fetch('/api/client/pull/status')).json().catch(() => ({}));
      if (st.phase === 'scan') showOverlay('Comparing your client with the prod version…');
      else if (st.total) showOverlay('Downloading updated files… ' + st.done + '/' + st.total);
      if (st.finished || st.error) {
        done = true;
        hideOverlay();
        if (st.error) { toast('' + st.error, 'error'); }
        else {
          const R = st.result || {};
          toast('client up to date (v' + (R.version || '?') + ') — ' + (R.downloaded || 0) + ' downloaded, '
            + (R.up_to_date || 0) + ' already current' + (R.skipped ? ', ' + R.skipped + ' user setting(s) kept' : ''), 'ok', 7000);
          if (R.errors && R.errors.length) toast('' + R.errors.length + ' file(s) failed — see console', 'warn');
        }
      }
    }
  } catch (e) { hideOverlay(); toast(errMessage(e), 'error'); }
}
