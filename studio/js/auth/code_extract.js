const RUN = /(?<!\d)(?<!\d[ \-])(?:\d{8}|\d{4}[ \-]\d{4}|\d{3}[ \-]\d{3}[ \-]\d{2})(?![ \-]?\d)/g;
const MAX_TEXT = 160;

export function extractCode(text, digits) {
  const n = digits || 8;
  if (typeof text !== 'string' || !text || text.length > MAX_TEXT) return null;
  const found = new Set();
  for (const m of text.matchAll(RUN)) {
    const d = m[0].replace(/\D/g, '');
    if (d.length === n) found.add(d);
  }
  return found.size === 1 ? [...found][0] : null;
}

export function groupCode(code) {
  return code.length === 8 ? code.slice(0, 4) + ' ' + code.slice(4) : code;
}
