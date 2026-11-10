(function () {
  'use strict';
  var dialog = document.getElementById('caseDialog');
  if (!dialog) return;
  var studies = Array.from(dialog.querySelectorAll('[data-case-content]'));
  var current = null;
  var previousFocus = null;
  var previousOverflow = '';
  var close = document.getElementById('caseClose');
  var feedback = document.getElementById('caseFeedback');

  function openCase(id) {
    var study = studies.find(function (item) { return item.dataset.caseContent === id; });
    if (!study) return;
    if (!dialog.open) {
      previousFocus = document.activeElement;
      previousOverflow = document.body.style.overflow;
    }
    current = study;
    var oldField = dialog.querySelector('.case-link-field');
    if (oldField) oldField.remove();
    studies.forEach(function (item) { item.hidden = item !== study; });
    document.getElementById('caseDialogTitle').textContent = study.dataset.caseTitle;
    document.getElementById('caseScroll').scrollTop = 0;
    feedback.textContent = '';
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';
    close.focus();
  }

  document.querySelectorAll('[data-case]').forEach(function (button) {
    button.addEventListener('click', function () { openCase(button.dataset.case); });
  });
  close.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    var rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', function () {
    document.body.style.overflow = previousOverflow;
    if (previousFocus) previousFocus.focus({ preventScroll: true });
  });
  document.getElementById('caseShare').addEventListener('click', async function () {
    if (!current) return;
    var url = new URL('#case-' + current.dataset.caseContent, window.location.href).href;
    try {
      await navigator.clipboard.writeText(url);
      feedback.textContent = 'Lien de l’étude copié.';
    } catch (error) {
      feedback.textContent = '';
      var field = dialog.querySelector('.case-link-field');
      if (!field) {
        field = document.createElement('input');
        field.className = 'case-link-field';
        field.setAttribute('aria-label', 'Lien de l’étude à copier');
        dialog.querySelector('.case-actions').appendChild(field);
      }
      field.value = url;
      field.focus();
      field.select();
      feedback.textContent = 'Copiez le lien sélectionné.';
    }
  });

  function readCaseHash() {
    var match = /^#case-([a-z-]+)$/.exec(window.location.hash);
    if (match) openCase(match[1]);
    else if (dialog.open) dialog.close();
  }
  window.addEventListener('hashchange', readCaseHash);
  readCaseHash();
})();
