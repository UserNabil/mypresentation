(function () {
  var STORE = 'eut_window_key';
  var key = null;
  try {
    var m = /(?:^#|&)eutw=([A-Za-z0-9_-]{16,128})/.exec(location.hash || '');
    if (m) {
      sessionStorage.setItem(STORE, m[1]);
      var rest = (location.hash || '').replace(/(^#|&)eutw=[^&]*/, '$1').replace(/^#&/, '#');
      history.replaceState(history.state, '', location.pathname + location.search + (rest === '#' ? '' : rest));
    }
    key = sessionStorage.getItem(STORE);
  } catch (e) {}
  window.__EUT_WINDOW_KEY__ = key || '';
  if (!key || !window.fetch || window.fetch.__eutWindow) return;
  var nativeFetch = window.fetch;
  var wrapped = function (input, init) {
    try {
      var raw = typeof input === 'string' ? input : (input && input.url) || String(input);
      var u = new URL(raw, location.href);
      if (u.origin === location.origin && u.pathname.indexOf('/api/') === 0) {
        init = Object.assign({}, init || {});
        var h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || undefined);
        h.set('X-EUT-Window', key);
        init.headers = h;
      }
    } catch (e) {}
    return nativeFetch.call(this, input, init);
  };
  wrapped.__eutWindow = true;
  window.fetch = wrapped;
})();
