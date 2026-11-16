/* ============================================================================
   core/format.js — value -> display string. Pure functions, no DOM, no state.

   NEW code, except fmtBytes which is the implementation already in
   index.html:6859 (kept identical so both can coexist during the migration —
   the index.html copy is removed when the 3D-viewer section is extracted).

   These functions return TEXT. Never put their output through innerHTML.
   ============================================================================ */

/** 1234 -> "1 234" (thin-space grouping, locale-independent). */
export function fmtNum(n) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Byte count -> "512 B" / "1.4 KB" / "2.35 MB". Same rules as index.html:6859. */
export function fmtBytes(n) {
  n = +n || 0;
  return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
}

/** Milliseconds -> "820 ms" / "3.4 s" / "2 min 05 s". */
export function fmtDuration(ms) {
  const v = Math.max(0, +ms || 0);
  if (v < 1000) return Math.round(v) + ' ms';
  if (v < 60000) return (v / 1000).toFixed(1) + ' s';
  const m = Math.floor(v / 60000), s = Math.round((v % 60000) / 1000);
  return m + ' min ' + String(s).padStart(2, '0') + ' s';
}

/** Date | number | ISO string -> "2026-08-06 14:32" in local time, '—' if unusable. */
export function fmtDate(d) {
  const t = d instanceof Date ? d : new Date(d);
  if (isNaN(+t)) return '—';
  const p = n => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
}

/** Date-ish -> "just now" / "5 min ago" / "3 h ago" / "2 d ago". */
export function ago(d) {
  const t = d instanceof Date ? d : new Date(d);
  if (isNaN(+t)) return '—';
  const s = (Date.now() - +t) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}

/** plural(1,'file') -> "1 file"; plural(3,'file') -> "3 files"; custom plural supported. */
export function plural(n, word, many) {
  const v = +n || 0;
  return fmtNum(v) + ' ' + (v === 1 ? word : (many || word + 's'));
}

/** Shortens to `max` characters with a single ellipsis. */
export function truncate(s, max = 60) {
  const v = s == null ? '' : String(s);
  return v.length <= max ? v : v.slice(0, Math.max(0, max - 1)) + '…';
}

/** "some_field_name" / "some-field" -> "Some field name". */
export function titleCase(s) {
  const v = (s == null ? '' : String(s)).replace(/[_-]+/g, ' ').trim();
  return v ? v[0].toUpperCase() + v.slice(1) : '';
}
