const KEY = 'eut.notif.local.v1';
const MAX = 60;
const subs = new Set();
let seq = 0;
let items = [];

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(raw)) items = raw.filter((x) => x && x.id).slice(0, MAX);
  } catch (e) {
    items = [];
  }
  seq = items.reduce((m, x) => Math.max(m, Number(String(x.id).split(':').pop()) || 0), 0);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch (e) {
    return;
  }
}

function emit() {
  subs.forEach((fn) => {
    try {
      fn(items);
    } catch (e) {
      return;
    }
  });
  try {
    window.dispatchEvent(new CustomEvent('eut-local-notifs', { detail: items.length }));
  } catch (e) {
    return;
  }
}

export function addLocal(entry) {
  const stamp = new Date().toISOString().slice(0, 19);
  const it = {
    id: 'local:toast:' + ++seq,
    kind: 'local_toast',
    title: String(entry.title || '').slice(0, 200),
    body: String(entry.body || '').slice(0, 600),
    severity: entry.severity || 'info',
    category: 'system',
    ts: stamp,
    last_ts: stamp,
    read: false,
    count: 1,
    local: true,
    actions: [],
    link: '',
    from: '',
  };
  const dup = items.find((x) => !x.read && x.title === it.title && x.body === it.body);
  if (dup) {
    dup.count += 1;
    dup.last_ts = stamp;
  } else {
    items.unshift(it);
    items = items.slice(0, MAX);
  }
  save();
  emit();
  return it;
}

export function listLocal() {
  return items.slice();
}

export function unreadLocal() {
  return items.filter((x) => !x.read).length;
}

export function markLocalRead(id) {
  const it = items.find((x) => x.id === id);
  if (it) it.read = true;
  save();
  emit();
}

export function markAllLocalRead() {
  items.forEach((x) => {
    x.read = true;
  });
  save();
  emit();
}

export function removeLocal(id) {
  items = items.filter((x) => x.id !== id);
  save();
  emit();
}

export function subscribeLocal(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

load();
try {
  window.eutLocalNotifs = { list: listLocal, unread: unreadLocal, markRead: markLocalRead, markAllRead: markAllLocalRead, remove: removeLocal, subscribe: subscribeLocal };
} catch (e) {
  seq = seq + 0;
}
