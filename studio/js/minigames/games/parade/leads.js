export function createLeadPicker(ctx) {
  const leads = ctx.roster.leads.length ? ctx.roster.leads : ctx.roster.all.slice(0, 6);
  const keys = leads.map(e => e.key);
  let value = ctx.pref.get('lead', keys[0]);
  if (!keys.includes(value)) value = keys[0] || 'chick';

  function element() {
    const box = document.createElement('div');
    box.className = 'mg-pp-leads';
    const head = document.createElement('p');
    head.className = 'mg-pp-leads-t';
    head.id = 'mg-pp-leads-t';
    const label = document.createElement('span');
    label.textContent = 'Lead pet';
    const name = document.createElement('b');
    head.append(label, name);
    const row = document.createElement('div');
    row.className = 'mg-pp-leads-row';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-labelledby', 'mg-pp-leads-t');
    const buttons = leads.map(entry => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mg-pp-lead-b';
      b.dataset.lead = entry.key;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', entry.name);
      b.title = entry.name;
      b.appendChild(ctx.iconEl(entry, 40));
      b.addEventListener('click', () => select(entry.key, true));
      row.appendChild(b);
      return b;
    });

    function select(key, focus) {
      value = key;
      ctx.pref.set('lead', key);
      const entry = ctx.roster.byKey[key];
      name.textContent = entry ? entry.name : key;
      buttons.forEach(b => {
        const on = b.dataset.lead === key;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus({ preventScroll: true });
      });
    }

    row.addEventListener('keydown', e => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const i = keys.indexOf(value);
      select(keys[(i + step + keys.length) % keys.length], true);
    });
    select(value, false);
    box.append(head, row);
    return box;
  }

  return {
    value: () => value,
    element
  };
}
