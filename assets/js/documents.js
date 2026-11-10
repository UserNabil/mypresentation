(function () {
  'use strict';
  var documents = window.PORTFOLIO_DOCUMENTS || [];
  var grid = document.getElementById('documentGrid');
  var dialog = document.getElementById('documentDialog');
  if (!grid || !dialog || !documents.length) return;

  function element(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value) node.textContent = value;
    return node;
  }
  function icon(name) {
    var node = element('i', 'fas fa-' + name);
    node.setAttribute('aria-hidden', 'true');
    return node;
  }
  function sizeLabel(bytes) {
    return bytes >= 1000000 ? (bytes / 1000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo' : Math.ceil(bytes / 1000) + ' Ko';
  }

  documents.forEach(function (doc, index) {
    var card = element('article', 'document-card');
    var cover = element('button', 'document-cover');
    cover.type = 'button';
    cover.dataset.document = doc.id;
    cover.dataset.kind = doc.id;
    cover.setAttribute('aria-label', 'Prévisualiser : ' + doc.title);
    var image = element('img');
    image.src = doc.pages[0].src;
    image.alt = '';
    image.loading = 'lazy';
    image.width = doc.pages[0].width;
    image.height = doc.pages[0].height;
    cover.append(element('span', 'document-index', '0' + (index + 1)), image, element('span', 'document-preview-label', 'Ouvrir l’aperçu ↗'));
    var content = element('div', 'document-card-content');
    content.append(element('h3', '', doc.title), element('p', 'document-description', doc.description), element('p', 'document-format', doc.format + ' · ' + sizeLabel(doc.size)));
    var actions = element('div', 'document-card-actions');
    var preview = element('button', 'doc-text-link', 'Aperçu');
    preview.type = 'button';
    preview.dataset.document = doc.id;
    preview.prepend(icon('eye'));
    preview.setAttribute('aria-label', 'Voir l’aperçu : ' + doc.title);
    var download = element('a', 'doc-text-link doc-download', 'PDF');
    download.href = doc.file;
    download.download = doc.filename;
    download.prepend(icon('arrow-down'));
    download.setAttribute('aria-label', 'Télécharger : ' + doc.title + ' (PDF)');
    actions.append(preview, download);
    content.append(actions);
    card.append(cover, content);
    grid.append(card);
  });

  var current = null;
  var pageIndex = 0;
  var previousFocus = null;
  var previousOverflow = '';
  var pageImage = document.getElementById('documentPage');
  var stage = document.getElementById('documentStage');
  var prev = document.getElementById('documentPrev');
  var next = document.getElementById('documentNext');
  var zoom = document.getElementById('documentZoom');
  var feedback = document.getElementById('documentFeedback');

  function setZoom(enabled) {
    stage.classList.toggle('is-zoomed', enabled);
    zoom.setAttribute('aria-pressed', String(enabled));
    zoom.querySelector('span').textContent = enabled ? 'Ajuster' : 'Agrandir';
    zoom.querySelector('i').className = 'fas fa-magnifying-glass-' + (enabled ? 'minus' : 'plus');
  }
  function showPage(index) {
    if (!current || index < 0 || index >= current.pages.length) return;
    pageIndex = index;
    var page = current.pages[index];
    pageImage.src = page.src;
    pageImage.width = page.width;
    pageImage.height = page.height;
    pageImage.alt = current.title + (current.id === 'carte' ? (index === 0 ? ' — recto' : ' — verso') : ' — page ' + (index + 1));
    document.getElementById('documentPageLabel').textContent = current.id === 'carte' ? (index === 0 ? 'Recto · 1 / 2' : 'Verso · 2 / 2') : 'Page ' + (index + 1) + ' / ' + current.pages.length;
    prev.disabled = index === 0;
    next.disabled = index === current.pages.length - 1;
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
  }
  function openDocument(id) {
    current = documents.find(function (doc) { return doc.id === id; });
    if (!current) return;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.getElementById('documentDialogTitle').textContent = current.title;
    var download = document.getElementById('documentDownload');
    download.href = current.file;
    download.download = current.filename;
    document.getElementById('documentOpen').href = current.file;
    feedback.textContent = '';
    stage.classList.toggle('is-card', id === 'carte');
    setZoom(false);
    showPage(0);
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    document.getElementById('documentClose').focus();
  }
  document.querySelectorAll('[data-document]').forEach(function (button) {
    button.addEventListener('click', function () { openDocument(button.dataset.document); });
  });
  document.getElementById('documentClose').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    var rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', function () {
    document.body.style.overflow = previousOverflow;
    if (previousFocus) previousFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showPage(pageIndex + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  prev.addEventListener('click', function () { showPage(pageIndex - 1); });
  next.addEventListener('click', function () { showPage(pageIndex + 1); });
  zoom.addEventListener('click', function () { setZoom(zoom.getAttribute('aria-pressed') !== 'true'); });

  document.getElementById('documentShare').addEventListener('click', async function () {
    var url = new URL(current.file, window.location.href).href;
    var title = current.title + ' — Nabil OULD-TERKI';
    try {
      if (navigator.share) {
        await navigator.share({ title: title, text: title, url: url });
        feedback.textContent = 'Document partagé.';
      } else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        feedback.textContent = 'Lien du PDF copié.';
      } else {
        // Selection fallback stays within the active dialog and its focus trap.
        var field = element('textarea');
        field.value = url;
        field.setAttribute('aria-label', 'Lien du PDF à copier');
        dialog.querySelector('.document-actions').append(field);
        field.select();
        var copied = document.execCommand('copy');
        if (copied) {
          field.remove();
          feedback.textContent = 'Lien du PDF copié.';
          document.getElementById('documentShare').focus();
        } else {
          feedback.textContent = 'Copiez le lien sélectionné.';
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') feedback.textContent = 'Utilisez « Ouvrir le PDF » pour partager son lien.';
    }
  });
})();
