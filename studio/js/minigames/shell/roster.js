import { shuffle } from './rng.js';

export function lookalikes(list) {
  const count = new Map();
  for (const e of list) count.set(e.tone, (count.get(e.tone) || 0) + 1);
  return list.filter(e => count.get(e.tone) > 1).length;
}

export function pick(entries, r, n, opts = {}) {
  const tiers = opts.tiers || [1, 2, 3];
  const cap = opts.maxPerTone || Infinity;
  const twins = opts.twins || 0;
  const pool = shuffle(entries.filter(e => tiers.includes(e.tier)), r);
  const chosen = [];
  const perTone = new Map();
  const take = e => {
    chosen.push(e);
    perTone.set(e.tone, (perTone.get(e.tone) || 0) + 1);
  };
  if (twins > 0 && cap >= 2) {
    const groups = new Map();
    for (const e of pool) groups.set(e.tone, [...(groups.get(e.tone) || []), e]);
    let paired = 0;
    for (const g of groups.values()) {
      if (paired >= twins || chosen.length >= n) break;
      const k = Math.min(g.length, cap, n - chosen.length, Math.max(2, twins - paired));
      if (k < 2) continue;
      g.slice(0, k).forEach(take);
      paired += k;
    }
  }
  for (const e of pool) {
    if (chosen.length >= n) break;
    if (!chosen.includes(e) && (perTone.get(e.tone) || 0) < cap) take(e);
  }
  return chosen;
}

export function makeRoster(data, base) {
  const all = (data && data.entries) || [];
  const icon = (data && data.icon) || {};
  const byKey = Object.fromEntries(all.map(e => [e.key, e]));
  const fill = (tpl, e) => String(tpl || '').replace('{code}', encodeURIComponent(e.code));
  const iconUrl = e => fill(icon.url || '/api/icon?etype=monster&name={code}', e);
  const fallbackUrl = e => new URL(fill(icon.fallback || 'icons/{code}.png', e), base).href;
  function iconEl(entry, px = 56) {
    const box = document.createElement('span');
    box.className = 'mg-art';
    box.style.setProperty('--mg-art', px + 'px');
    if (!entry) {
      box.classList.add('is-miss');
      return box;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.width = icon.size || 64;
    img.height = icon.size || 64;
    img.addEventListener('error', () => {
      if (img.dataset.fallback || !icon.fallback) {
        box.classList.add('is-miss');
        box.dataset.initial = entry.name.slice(0, 1);
        img.remove();
        return;
      }
      img.dataset.fallback = '1';
      img.src = fallbackUrl(entry);
    });
    img.src = iconUrl(entry);
    box.appendChild(img);
    return box;
  }
  return {
    all,
    byKey,
    leads: all.filter(e => e.lead),
    iconUrl,
    fallbackUrl,
    iconEl,
    pick: (r, n, opts) => pick(all, r, n, opts)
  };
}

let loading = null;

export function loadRoster() {
  const base = new URL('../', import.meta.url);
  if (!loading) {
    loading = fetch(new URL('roster.json', base), { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : { entries: [] }))
      .catch(() => ({ entries: [] }))
      .then(data => makeRoster(data, base));
  }
  return loading;
}
