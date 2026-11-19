const GAME_IDS = ['recall', 'parade', 'link'];

export const PLACEHOLDERS = {
  recall: { name: 'Bestiary Recall', icon: 'brain', pitch: 'Flip two cards, find the twin beasts, clear the bestiary before the hourglass runs out.' },
  parade: { name: 'Pet Parade', icon: 'paw-print', pitch: 'Lead a growing parade of Eden pets around the arena without bumping into walls or your own line.' },
  link: { name: 'Beast Link', icon: 'link', pitch: 'Link twin beasts with a path of at most two turns and clear the field before time runs out.' }
};

const cache = new Map();

export function loadGame(id) {
  if (!GAME_IDS.includes(id)) return Promise.resolve(null);
  if (!cache.has(id)) {
    cache.set(id, import('../games/' + id + '/index.js')
      .then(m => (m && m.default && typeof m.default.create === 'function' ? m.default : null))
      .catch(() => null));
  }
  return cache.get(id);
}

export function loadGames() {
  return Promise.all(GAME_IDS.map(id => loadGame(id).then(game => ({ id, game }))));
}
