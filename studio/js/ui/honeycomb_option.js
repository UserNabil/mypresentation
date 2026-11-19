export function optionRow(panel, api) {
  if (panel.querySelector('[data-cardfx-row]')) return;
  const row = document.createElement('div');
  row.className = 'op-arow';
  row.setAttribute('data-cardfx-row', '');
  row.innerHTML = '<span class="op-albl">Card effects</span><div class="op-swatches" role="radiogroup" aria-label="Card effects"></div>';
  const group = row.lastChild;
  const buttons = [[true, 'On'], [false, 'Off']].map(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.textContent = label;
    b.addEventListener('click', () => api.set(value));
    group.appendChild(b);
    return [b, value];
  });
  const sync = () => {
    buttons.forEach(([b, value]) => {
      const on = api.enabled === value;
      b.className = 'op-swatch plain' + (on ? ' on' : '');
      b.setAttribute('aria-checked', String(on));
    });
  };
  sync();
  window.addEventListener('ui-cardfx', sync);
  const note = panel.querySelector('.op-muted');
  if (note) panel.insertBefore(row, note);
  else panel.appendChild(row);
}
