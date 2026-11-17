/* Terminal interactif — s'ouvre dans une MODALE par-dessus le CV (le CV reste intact).
   Lanceur discret dans la nav + raccourci clavier (touche "²"/"`" ou Ctrl+K).
   100% maison, contenu réel lu dans la page. Désactivé à l'impression. */
(function () {
  'use strict';
  ready(function () { injectCSS(); addLauncher(); });

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function getVar(n, fb) { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; }

  /* ---------- contenu réel ---------- */
  function scrape() {
    var d = {};
    d.name = txt($('.brand')) || 'Nabil OULD-TERKI';
    d.role = txt($('.hero-role')) || 'Ingénieur Full Stack';
    d.lede = txt($('.hero-lede'));
    d.status = txt($('.avail'));
    d.stats = $$('.stats .stat').map(function (s) { return { n: txt($('.n', s)), l: txt($('.l', s)) }; });
    d.skills = $$('.skill-proof').map(function (s) { return { name: txt($('h3', s)), cat: txt($('.doc-eyebrow', s)) }; });
    d.tags = $$('.stack-tags .chip').map(txt);
    d.projects = $$('.project').map(function (p) {
      var link = $('a.p-link', p) || $('[data-prev-url]', p);
      return { title: txt($('h3', p)), tags: $$('.p-tags span', p).map(txt), url: link ? (link.getAttribute('href') || link.getAttribute('data-prev-url')) : '' };
    });
    d.xp = $$('.tl-item').map(function (t) { return { when: txt($('.tl-when', t)), role: txt($('.tl-role', t)), org: txt($('.tl-org', t)) }; });
    d.email = ($('a[href^="mailto:"]') ? $('a[href^="mailto:"]').getAttribute('href').replace('mailto:', '') : 'n.ouldterki@gmail.com');
    d.phone = ($('a[href^="tel:"]') ? $('a[href^="tel:"]').getAttribute('href').replace('tel:', '') : '');
    d.socials = $$('.socials a').map(function (a) { return { label: a.getAttribute('title') || 'Lien', url: a.href }; });
    return d;
  }

  /* ---------- styles ---------- */
  function injectCSS() {
    var css = `
    .cvt-launch{border:1px solid var(--line);background:transparent;color:var(--muted);font-family:var(--ff-mono,monospace);
      font-size:.78rem;border-radius:7px;padding:.3rem .55rem;cursor:pointer;line-height:1;transition:all .2s}
    .cvt-launch:hover{border-color:var(--accent);color:var(--accent)}
    .cvt-overlay{position:fixed;inset:0;z-index:3600;display:none;place-items:center;padding:clamp(.6rem,3vw,1.5rem)}
    .cvt-overlay.on{display:grid}
    .cvt-back{position:absolute;inset:0;background:color-mix(in srgb, #000 55%, transparent);backdrop-filter:blur(3px)}
    .cvt-win{position:relative;width:min(760px,96vw);height:min(560px,82vh);background:#0b0f0c;border:1px solid #1d2a22;border-radius:12px;
      display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.55);
      opacity:0;transform:translateY(14px) scale(.98);transition:.28s cubic-bezier(.22,1,.36,1)}
    .cvt-overlay.on .cvt-win{opacity:1;transform:none}
    .cvt-bar{display:flex;align-items:center;gap:.7rem;padding:.6rem .85rem;background:#11180f;border-bottom:1px solid #1d2a22;flex-shrink:0}
    .cvt-dots{display:flex;gap:.4rem}
    .cvt-dots i{width:11px;height:11px;border-radius:50%;background:#2a3a30;display:block}
    .cvt-dots i:first-child{background:var(--accent,#ff5a3c)}
    .cvt-ttl{font-family:var(--ff-mono,monospace);font-size:.72rem;color:#7f8f84}
    .cvt-x{margin-left:auto;background:none;border:none;color:#7f8f84;font-size:1rem;cursor:pointer;width:26px;height:26px;border-radius:6px}
    .cvt-x:hover{color:var(--accent,#ff5a3c)}
    .cvt-screen{flex:1;overflow:auto;padding:1rem 1.1rem;font-family:var(--ff-mono,monospace);font-size:13.5px;line-height:1.65;color:#d7e4da}
    .cvt-screen a{color:#7ad1a4}
    .cvt-screen .g{color:#5fd38a}.cvt-screen .a{color:var(--accent,#ff5a3c)}.cvt-screen .m{color:#7f8f84}
    .cvt-line{white-space:pre-wrap;word-break:break-word}
    .cvt-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.7rem 0 .3rem}
    .cvt-chip{font-family:var(--ff-mono,monospace);font-size:.72rem;border:1px solid #24342a;color:#9fd;background:transparent;border-radius:20px;padding:.26rem .66rem;cursor:pointer}
    .cvt-chip:hover{border-color:#5fd38a;color:#bfe}
    .cvt-prompt{display:flex;gap:.5rem;align-items:center;margin-top:.25rem}
    .cvt-prompt .ps{color:#5fd38a;white-space:nowrap}
    .cvt-inp{flex:1;background:transparent;border:none;color:#eaf3ee;font:inherit;outline:none;caret-color:var(--accent,#ff5a3c)}
    @media print{.cvt-launch,.cvt-overlay{display:none !important}}
    `;
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }

  /* ---------- lanceur (nav + raccourci) ---------- */
  var overlay;
  function addLauncher() {
    var links = $('#navLinks');
    var btn = document.createElement('button');
    btn.className = 'cvt-launch'; btn.type = 'button'; btn.title = 'Terminal interactif (²)'; btn.innerHTML = '&gt;_';
    btn.addEventListener('click', open);
    if (links) {
      var themeLi = links.querySelector('.theme-btn') ? links.querySelector('.theme-btn').closest('li') : null;
      var li = document.createElement('li'); li.appendChild(btn);
      if (themeLi) links.insertBefore(li, themeLi); else links.appendChild(li);
    } else { btn.style.cssText = 'position:fixed;top:14px;right:70px;z-index:1600'; document.body.appendChild(btn); }
    document.addEventListener('keydown', function (e) {
      var t = e.target.tagName, typing = t === 'INPUT' || t === 'TEXTAREA';
      if (!typing && (e.key === '²' || e.key === '`')) { e.preventDefault(); toggle(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle(); }
    });
  }
  function toggle() { if (overlay && overlay.classList.contains('on')) close(); else open(); }
  function open() { if (!overlay) build(); overlay.classList.add('on'); document.body.style.overflow = 'hidden'; setTimeout(function () { var i = $('.cvt-inp', overlay); i && i.focus(); }, 180); }
  function close() { if (!overlay) return; overlay.classList.remove('on'); document.body.style.overflow = ''; }

  /* ---------- construction + logique ---------- */
  function build() {
    var d = scrape();
    overlay = document.createElement('div'); overlay.className = 'cvt-overlay';
    overlay.innerHTML = '<div class="cvt-back" data-close></div>'
      + '<div class="cvt-win"><div class="cvt-bar"><span class="cvt-dots"><i></i><i></i><i></i></span>'
      + '<span class="cvt-ttl">visiteur@nabil-cv — bash</span><button class="cvt-x" data-close aria-label="Fermer">✕</button></div>'
      + '<div class="cvt-screen"><div class="cvt-out"></div><div class="cvt-chips"></div>'
      + '<div class="cvt-prompt"><span class="ps">visiteur@nabil-cv:~$</span><input class="cvt-inp" aria-label="commande" autocomplete="off" spellcheck="false"></div></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('on')) close(); });

    var screen = $('.cvt-screen', overlay), out = $('.cvt-out', overlay), chips = $('.cvt-chips', overlay), inp = $('.cvt-inp', overlay);
    var hist = [], hi = 0;
    function print(html, cls) { var l = document.createElement('div'); l.className = 'cvt-line' + (cls ? ' ' + cls : ''); l.innerHTML = html; out.appendChild(l); screen.scrollTop = screen.scrollHeight; }
    function typeLines(lines, done) { var i = 0; (function n() { if (i >= lines.length) { done && done(); return; } print(lines[i]); i++; setTimeout(n, 70); })(); }

    var CMDS = {
      help: function () { return ['Commandes : <span class="g">about</span>, <span class="g">skills</span>, <span class="g">projects</span>, <span class="g">xp</span>, <span class="g">contact</span>, <span class="g">cv</span>, <span class="g">clear</span>', '<span class="m">Tape une commande, ou clique une pastille. "exit" pour fermer.</span>']; },
      about: function () { return [d.name + ' — <span class="a">' + esc(d.role) + '</span>', d.status, d.lede]; },
      whoami: function () { return CMDS.about(); },
      skills: function () { return d.skills.map(function (s) { return '<span class="g">▸</span> <span class="a">' + esc(s.name) + '</span> <span class="m">— ' + esc(s.cat) + '</span>'; }).concat(d.tags.length ? ['', '<span class="m"># ' + esc(d.tags.join(', ')) + '</span>'] : []); },
      projects: function () { return d.projects.map(function (p, i) { return '<span class="a">[' + (i + 1) + ']</span> <span class="g">' + esc(p.title) + '</span> <span class="m">· ' + esc(p.tags.slice(0, 3).join(', ')) + '</span>' + (p.url ? ' <a href="' + p.url + '" target="_blank" rel="noopener">↗</a>' : ''); }); },
      ls: function () { return CMDS.projects(); },
      xp: function () { return d.xp.map(function (x) { return '<span class="a">' + esc(x.when) + '</span> — <span class="g">' + esc(x.role) + '</span> @ ' + esc(x.org); }); },
      parcours: function () { return CMDS.xp(); },
      contact: function () { return ['email   : <a href="mailto:' + d.email + '">' + d.email + '</a>', d.phone ? 'tél     : ' + esc(d.phone) : '', 'réseaux : ' + d.socials.map(function (s) { return '<a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>'; }).join(' · ')].filter(Boolean); },
      cv: function () { var b = $('[data-document="cv"]'); if (b) { setTimeout(function () { close(); b.click(); }, 350); } return ['ouverture du CV…']; },
      clear: function () { out.innerHTML = ''; return []; },
      sudo: function () { return ['<span class="a">Permission refusée.</span> <span class="m">Nabil n’a pas besoin des droits root pour livrer en prod.</span>']; },
      hire: function () { return ['<span class="g">Excellente décision.</span> → <a href="mailto:' + d.email + '">' + d.email + '</a>']; },
      coffee: function () { return ['<span class="m">☕ brewing… prêt à discuter d’une opportunité.</span>']; },
      date: function () { return [new Date().toLocaleString('fr-FR')]; }
    };
    var ALIASES = { exit: 'close', quit: 'close', q: 'close', 'rm': 'sudo', 'rm -rf': 'sudo', man: 'help', '?': 'help' };

    function run(raw) {
      var line = raw.trim(); if (!line) return;
      print('<span class="ps g">visiteur@nabil-cv:~$</span> ' + esc(raw));
      hist.push(raw); hi = hist.length;
      var cmd = (ALIASES[line.toLowerCase()] || line.toLowerCase().split(' ')[0]);
      if (cmd === 'close') { setTimeout(close, 150); return; }
      if (cmd === 'echo') { print(esc(line.slice(5))); return; }
      var fn = CMDS[cmd];
      if (fn) { var r = fn(); if (r && r.length) typeLines(r); }
      else print('<span class="a">' + esc(cmd) + '</span>: command not found — tape <span class="g">help</span>');
    }
    ['about', 'skills', 'projects', 'xp', 'contact', 'cv', 'help'].forEach(function (c) {
      var b = document.createElement('button'); b.className = 'cvt-chip'; b.textContent = c;
      b.addEventListener('click', function () { run(c); inp.focus(); }); chips.appendChild(b);
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { run(inp.value); inp.value = ''; }
      else if (e.key === 'ArrowUp') { if (hi > 0) { hi--; inp.value = hist[hi] || ''; } e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (hi < hist.length) { hi++; inp.value = hist[hi] || ''; } e.preventDefault(); }
    });
    screen.addEventListener('click', function (e) { if (e.target.tagName !== 'A') inp.focus(); });
    typeLines(['<span class="m"># bienvenue sur le CV de ' + esc(d.name) + ' — mode terminal</span>', 'tape <span class="g">help</span> pour explorer.'], function () { inp.focus(); });
  }
})();
