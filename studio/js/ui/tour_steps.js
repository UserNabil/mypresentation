const s = (sel, title, body) => ({ sel, title, body });

export const TOUR_NAMES = {
  dashboard: 'Dashboard', features: 'Features', content: 'Content', people: 'People', health: 'Health',
  options: 'Options', community: 'Community', gamesys: 'Game systems', altar: 'Altar', gm: 'GM commands',
  launch: 'Launch', packaging: 'Packaging', server: 'Server status', clientcfg: 'Client configuration', shell: 'The tool',
};

export const TOURS = {
  dashboard: [
    s('#dash-react .dm-greet', 'Hi, I am Bee!', 'This is your home page. Let me show you around.'),
    s('#dash-react .dm-kpis', 'All good?', 'Four cards: servers, players, deploys and game data.'),
    s('#dash-react .dm-servers', 'Servers', 'Every game server and its state. Green means up.'),
    s('#dash-react .dm-quick', 'Quick actions', 'Big jobs in one click, like packing or a restart.'),
    s('#dash-react .dm-act', 'What changed', 'The latest changes made by the team.'),
    s('#rail-scroll', 'All pages', 'Every page lives in this menu. Open a family to see more.'),
    s('header .searchbox', 'Search', 'Find any creature, item or spell. Try Ctrl+K.'),
    s('#mx-launch', 'Play', 'Start the game to try your changes.'),
  ],
  features: [
    s('#fm-react-root .fmr-listbox', 'All features', 'One card per feature. A tick means it is installed.'),
    s('#fm-react-root .fmr-search', 'Find one', 'Type a name to find a feature fast.'),
    s('[data-tour="fm-filters"]', 'Filter and sort', 'Show only some states, or change the order.'),
    s('[data-tour="fm-sync"]', 'Sync my client', 'Get every update in one click.'),
    s('#fm-react-root .fmr-gitline', 'New from the team', 'New features wait here. Pull to get them.'),
    s('[data-tour="fm-tools"]', 'Help', 'Rescan, video guides and how-to notes.'),
    s('#fm-react-root [aria-label="Feature detail"]', 'Details', 'Pick a feature to see its parts, tests and buttons.'),
  ],
  content: [
    s('#content-react .ct-seg', 'Pick a type', 'Creatures, items or NPCs.'),
    s('#content-react .ct-search', 'Search', 'Type a name or an ID.'),
    s('[data-tour="ct-filters"]', 'Filters', 'Show only one map, rank, weakness or level.'),
    s('[data-tour="ct-sort"]', 'Sort', 'Change the order of the list.'),
    s('#content-react .ct-list', 'The list', 'Click a row to open it.'),
    s('#content-react .ct-pane', 'The record', 'Its values show here. Change them, then save.'),
    s('#content-react .ct-new', 'Make a new one', 'Start a brand new record.'),
  ],
  people: [
    s('#people-react .pp-list', 'The team', 'Everyone who can use the tool.'),
    s('#people-react .pp-search', 'Find someone', 'Search by account or by character.'),
    s('#people-react .pp-primary', 'Add person', 'Give a new person access.'),
    s('#people-react .pp-dhead', 'Their card', 'Name and role of the person you picked.'),
    s('#people-react .pp-side .pp-section', 'Pages', 'Turn pages on or off for this person.'),
    s('#people-react .pp-env', 'Environment', 'Access is set per server. Switch it in the top bar.'),
  ],
  health: [
    s('#health-react .hl-kpis', 'Big numbers', 'Crashes, bad exits and crash-free play. Click one to filter.'),
    s('#health-react .hl-tools', 'Time and server', 'Pick the period and the server. Refresh here.'),
    s('#health-react [aria-label="Reports per day"]', 'Per day', 'See on which days problems happen.'),
    s('#health-react [aria-label="Crash families"]', 'Crash families', 'Crashes grouped by cause. Click one to list them.'),
    s('#health-react .hl-listcard', 'Reports', 'Every report. Open one to read it.'),
    s('#health-react .hl-bo', 'Where reports come from', 'A green dot means the back-office answers.'),
  ],
  options: [
    s('#options-react .op-seg', 'Which server', 'Pick Dev, Preprod or Prod to edit.'),
    s('#options-react .op-tabs', 'Sections', 'Client, servers, database and tools.'),
    s('#options-react .op-grid', 'Settings', 'Folders and links. A pencil edits a password.'),
    s('#options-react .op-rail', 'Connections', 'Live check of the servers and the database.'),
    s('#options-react .op-bar', 'Save', 'Nothing changes until you press Save.'),
  ],
  community: [
    s('#rail-scroll .rl-fam[data-fam="production"] .rl-kids-in', 'Sections', 'Emojis, sounds, polls, altar and the event each have their own page here.'),
    s('#community-react .ph-title', 'This page', 'The title says which section is open.'),
    s('#community-react .cm-chipsrow', 'At a glance', 'What is open and what waits for you.'),
    s('#community-react .cm-tools', 'Filter', 'Show only what you need, or add a new one.'),
    s('#community-react .cm-plist', 'Polls', 'Click a poll to see the votes or edit it.'),
    s('#community-react .cm-alist', 'Requests', 'Altar changes asked by the team. Open one to review it.'),
    s('#community-react .cm-menuwrap', 'More', 'Extra actions live in this menu.'),
  ],
  gamesys: [
    s('#gamesystems-react .gs-seg', 'Sections', 'Currencies, Card Duel and Classes.'),
    s('#gamesystems-react .gs-env', 'Server', 'This page works on this server.'),
    s('[data-tour="gs-restart"]', 'Restart', 'Restart the servers so changes go live.'),
    s('[data-tour="gs-repack"]', 'Repack', 'Put your changes in the game client.'),
    s('#gamesystems-react .gs-find', 'Find', 'Search a shop or a coin.'),
    s('#gamesystems-react .gs-chiprow', 'Card Duel', 'Overview, rules, cards, archive and a test duel.'),
    s('#gamesystems-react .gs-cls-tools', 'Pick a race', 'Show the classes of one race.'),
    s('#gamesystems-react .gs-cls-list', 'Classes', 'Click a class to open it.'),
    s('#gamesystems-react .gs-cls-detail', 'Class sheet', 'Its levels, skills and stats.'),
  ],
  altar: [
    s('#altar-react .al-seg', 'Pick an altar', 'Crystal, Star, Diamond, Eden or Gem.'),
    s('#altar-react .al-left', 'Prizes', 'Each box is a prize and its odds. Click to change it.'),
    s('#altar-react .al-right', 'Test bag', 'Try pulls with a real account. Nothing is saved.'),
    s('#altar-react .al-actions', 'Send it', 'Ask for a review, or deploy if you are a GM.'),
    s('[data-tour="al-sim"]', 'Many pulls', 'Run lots of pulls and check the odds.'),
    s('[data-tour="al-tools"]', 'Tools', 'Fill and balance the altar.'),
  ],
  gm: [
    s('#gmmodal .gmv-search', 'Search', 'Type what you want to do.'),
    s('#gmmodal .gmv-rail', 'Groups', 'All, favourites or recent commands.'),
    s('#gmmodal .gmv-scroll', 'Commands', 'Click one to see how it works.'),
    s('#gmmodal .gmv-side', 'Command card', 'Fill the blanks, then copy it into the game chat.'),
    s('#gmmodal .gmv-more', 'More', 'Show more groups.'),
    s('#gm-count', 'Count', 'How many commands match.'),
  ],
  launch: [
    s('#launchModal .lv-env', 'Where', 'Pick the server to play on.'),
    s('#launchModal .lv-count', 'How many', 'Open one game window or more.'),
    s('#launchModal .lv-line', 'Ready?', 'Each check turns green when it is fine.'),
    s('#launchModal .lv-note', 'Notes', 'Problems show here. Some have a Fix button.'),
    s('#launchModal .lv-play', 'Play', 'Click to start the game.'),
    s('#lv-settings', 'Settings', 'Window size, frame rate and quality.'),
  ],
  packaging: [
    s('#pk-kids .g-quest', 'Packaging', 'Three steps: take files out, edit, put them back.'),
    s('#pk-kids .g-obj:has([data-act="depack"])', '1. Depack', 'Take the game files out so you can edit them.'),
    s('#pk-kids .g-obj:has([data-act="pack"])', '2. Pack', 'Put all your changes back in the game.'),
    s('#pk-kids .g-obj:has([data-act="repack"])', '3. Repack', 'Pick only some files to put back.'),
    s('#pkg-close', 'Close', 'Close this when you are done.'),
  ],
  server: [
    s('#srv-grid', 'Servers', 'Each box is one server. Green is up.'),
    s('#srv-overall', 'Summary', 'How many servers are up right now.'),
    s('#srv-restart-btn', 'Restart', 'A safe restart. It fixes itself if a server fails.'),
    s('#srv-restore-btn', 'Clean data', 'Go back to the clean copy, then restart.'),
    s('#srv-baseline-btn', 'Save as clean copy', 'Make the data of today the clean copy.'),
    s('#srv-journal-btn', 'Replay my edits', 'Put your saved edits back on the server.'),
    s('#srv-refresh', 'Refresh', 'Check again now.'),
  ],
  clientcfg: [
    s('#qc-env', 'Which server', 'These settings are for this environment.'),
    s('#cs-files', 'Game files', 'RFG archives: the tool reads the game directly. Unpacked folder: the old full copy.'),
    s('#cs-block', 'New tester', 'Pick a folder and install the game there.'),
    s('#qc-fields .fld:has([data-k="client_root"])', 'Game data', 'The unpacked files (Unpacked folder mode only).'),
    s('#qc-fields .fld:has([data-k="client_packed"])', 'Game folder', 'Where the game runs. Get the latest client here.'),
    s('#qc-fields .fld:has([data-k="launcher_path"])', 'Launcher', 'The program that starts the game.'),
    s('#qc-save', 'Save', 'Keep your changes.'),
  ],
  shell: [
    s('#rail-scroll', 'All pages', 'Every page lives in this menu.'),
    s('header .searchbox', 'Search', 'Find any creature, item or spell. Try Ctrl+K.'),
    s('#mx-env', 'Server', 'Dev, Preprod or Prod. Click to switch.'),
    s('#mx-launch', 'Play', 'Start the game to try your changes.'),
    s('#pack-dial', 'Pack', 'Put your changes in the game files.'),
    s('#mx-user', 'You', 'Your account, the theme and this bee.'),
  ],
};

const MODALS = { gmmodal: 'gm', launchModal: 'launch', pkgmodal: 'packaging', restartmodal: 'server' };
const ROOTS = [
  ['#dash-react', 'dashboard'], ['#fm-react-root', 'features'], ['#content-react', 'content'], ['#people-react', 'people'],
  ['#health-react', 'health'], ['#options-react', 'options'], ['#community-react', 'community'],
  ['#gamesystems-react', 'gamesys'], ['#altar-react', 'altar'],
];

function shown(n) {
  if (!n || !n.isConnected) return false;
  const r = n.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return false;
  const cs = getComputedStyle(n);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity !== 0;
}

export function openDialog(doc = document) {
  const classic = [...doc.querySelectorAll('.modal.open')].filter(m => m.id !== 'confirmModal' && m.id !== 'promptModal' && shown(m));
  const react = [...doc.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')].filter(d => !d.closest('.tour-bubble') && shown(d));
  const all = classic.concat(react);
  return all.length ? all[all.length - 1] : null;
}

const TXT = n => (n && n.textContent || '').replace(/\s+/g, ' ').trim();

export function dialogTour(d) {
  const mark = (n, i) => { n.setAttribute('data-tour-auto', String(i)); return '[data-tour-auto="' + i + '"]'; };
  doc0().querySelectorAll('[data-tour-auto]').forEach(n => n.removeAttribute('data-tour-auto'));
  const out = [];
  let i = 0;
  const head = d.querySelector('h1, h2, h3, [data-slot="dialog-title"], .sheet > h2');
  const title = TXT(head).slice(0, 60) || 'This window';
  out.push(s(mark(head || d, i++), title, 'This window is open, so I explain it first.'));
  const fields = [...d.querySelectorAll('input:not([type="hidden"]), select, textarea')].filter(shown).slice(0, 4);
  for (const f of fields) {
    const lab = (f.id && d.querySelector('label[for="' + f.id + '"]')) || f.closest('label') || f.closest('.fld, .field, div')?.querySelector('label');
    const name = TXT(lab).slice(0, 40) || f.getAttribute('placeholder') || f.getAttribute('aria-label') || 'Field';
    out.push(s(mark(f, i++), name, f.type === 'password' ? 'Type it here. It stays hidden.' : 'Fill this in.'));
  }
  const btns = [...d.querySelectorAll('button')].filter(b => shown(b) && TXT(b) && !/^(close|×|✕)$/i.test(TXT(b)));
  const main = btns.find(b => /primary|sbtn|gold|default/.test(b.className) || b.getAttribute('data-variant') === 'default') || btns[btns.length - 1];
  if (main) out.push(s(mark(main, i++), TXT(main).slice(0, 40), 'When you are ready, press this.'));
  const x = d.querySelector('.mx-close, [aria-label*="Close" i], .close, .x');
  if (x && shown(x)) out.push(s(mark(x, i++), 'Close', 'Changed your mind? Close the window here.'));
  return out;
}

function doc0() { return document; }

export function detectContext(doc = document) {
  const top = openDialog(doc);
  if (top) {
    if (MODALS[top.id]) return MODALS[top.id];
    if (top.id === 'quickcfg') {
      const t = doc.getElementById('qc-title');
      if (t && /^client/i.test(t.textContent.trim())) return 'clientcfg';
    }
    return 'dialog';
  }
  const host = doc.getElementById('content');
  for (const [sel, k] of ROOTS) if (host && host.querySelector(':scope > ' + sel)) return k;
  return 'shell';
}
