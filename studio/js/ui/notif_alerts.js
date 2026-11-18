export const WIN_MAX = 3;

export function planAlerts(items, ctx) {
  const list = (items || []).filter((it) => it && it.deliver);
  const wantToast = list.filter((it) => it.deliver.toast);
  const critical = wantToast.filter((it) => it.severity === 'critical');
  const rest = wantToast.filter((it) => it.severity !== 'critical');
  const toasts = critical.slice(0, WIN_MAX).map((it) => ({ item: it, sticky: true }));
  if (rest.length === 1) toasts.push({ item: rest[0], sticky: false });
  else if (rest.length > 1) toasts.push({ summary: rest.length, sticky: false });
  const canWin = !!ctx && !ctx.focused && ctx.permission === 'granted';
  const wantWin = canWin ? list.filter((it) => it.deliver.windows) : [];
  const windows = wantWin.length > WIN_MAX ? [{ summary: wantWin.length }] : wantWin.map((it) => ({ item: it }));
  return { toasts, windows };
}

export function createNotifAlerts(host) {
  let last = null;
  let busy = false;
  let permission = 'default';
  try {
    permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  } catch (e) {
    permission = 'unsupported';
  }

  function focused() {
    try {
      return !document.hidden && document.hasFocus();
    } catch (e) {
      return true;
    }
  }

  function typeOf(sev) {
    return sev === 'critical' || sev === 'error' ? 'error' : sev === 'warn' ? 'warn' : sev === 'ok' ? 'ok' : 'info';
  }

  function showToast(t) {
    if (t.summary) {
      host.toast(t.summary + ' new notifications', 'info', { action: { label: 'Open bell', fn: host.openBell } });
      return;
    }
    const it = t.item;
    host.toast(it.title, typeOf(it.severity), {
      sticky: t.sticky,
      details: it.body || undefined,
      action: it.link ? { label: 'Open', fn: () => host.openLink(it.link) } : { label: 'Open bell', fn: host.openBell },
    });
  }

  function showWindows(w) {
    try {
      if (w.summary) {
        const n = new Notification(w.summary + ' new notifications', { tag: 'eut-summary', icon: '/studio/favicon-128.png' });
        n.onclick = () => {
          window.focus();
          host.openBell();
          n.close();
        };
        return;
      }
      const it = w.item;
      const n = new Notification(it.title, { body: it.body || '', tag: it.group_key || 'eut-' + it.id, icon: '/studio/favicon-128.png' });
      n.onclick = () => {
        window.focus();
        if (it.link) host.openLink(it.link);
        else host.openBell();
        n.close();
      };
    } catch (e) {
      return;
    }
  }

  async function onBeat(j) {
    const latest = Number(j && j.notif_latest);
    if (!Number.isFinite(latest)) return;
    if (last === null) {
      last = latest;
      return;
    }
    if (latest <= last || busy) return;
    busy = true;
    try {
      const r = await fetch('/api/notif/new?since_id=' + last, { cache: 'no-store' });
      if (!r.ok) return;
      const res = await r.json();
      last = Math.max(latest, Number(res.latest) || 0);
      try {
        permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
      } catch (e) {
        permission = 'unsupported';
      }
      const plan = planAlerts(res.items, { focused: focused(), permission });
      plan.toasts.forEach(showToast);
      plan.windows.forEach(showWindows);
    } catch (e) {
      return;
    } finally {
      busy = false;
    }
  }

  return { onBeat, planAlerts };
}
