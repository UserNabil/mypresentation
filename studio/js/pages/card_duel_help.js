/* ============================================================================
   pages/card_duel_help.js — Card Duel page, Help tab: each section in plain
   English for content designers, GMs and the admin.
   ============================================================================ */

import { el, clear } from '../core/dom.js';
import { card } from '../components.js';
import { SKILL_HELP } from './card_duel_render.js';

const P = (...t) => el('p', {}, ...t);
const B = t => el('b', {}, t);

export function renderHelp(node, H) {
  clear(node);
  const env = H.env;
  node.appendChild(card({ title: 'How the game works', icon: 'info', body: el('div', { class: 'cd-help' },
    P('Two players face each other on a 3x3 board. Each brings a deck (7 cards by default). They lay one card per turn on a free cell: the first player lays 5 cards, the second 4, so the board is full after 9 moves.'),
    P('Every card has four sides (North, East, South, West, from 1 to 10, "A" means 10). When a card is laid, each enemy card next to it is ', B('captured'),
      ' if the touching side of the new card is higher than the facing side of the enemy card. Its element can add ', B('+1'),
      ': Fire beats Nature, Nature beats Earth, Earth beats Lightning, Lightning beats Steel, Steel beats Ice, Ice beats Fire; Light and Dark beat each other.'),
    el('ul', {}, Object.values(SKILL_HELP).map(t => el('li', {}, t))),
    P('Every captured card costs its owner duel HP (12 by default, more against Drain). A player at 0 duel HP is ', B('knocked out'),
      '. Otherwise, when the board is full, the player with the most cards (on the board plus the ones left in hand) wins. The real HP bar follows the duel HP and is given back at the end.'),
    P(B('Modes: '), 'Friendly (nothing at stake), Ante (the winner takes one card he captured), Hardcore (the winner takes every card he captured). Stakes have conditions: town maps, level, daily limits, no shared internet connection, and Hardcore is closed unless the Rules tab opens it.'))
  }));
  node.appendChild(card({ title: 'Overview', icon: 'home', body: el('div', { class: 'cd-help' },
    P('The state of the feature on ', B(env), ': the eden-cardduel service (running or not, its version), duels in progress, how many players collect cards, and the catalogue by kind, rarity and element.'),
    P('A green line "Simulator = server" means the rules file running on ', env, ' is byte for byte the one the simulator plays. A warning means the server runs another version: deploy card_duel from the Features page (or Pull latest features if this tool is the older one).'),
    P('The page works on the active environment only. Switch environment in the top bar to see preprod or production.'))
  }));
  node.appendChild(card({ title: 'Rules', icon: 'settings', body: el('div', { class: 'cd-help' },
    P('Every value the game masters may tune, grouped: the match (deck size, HP, damage, timers), the modes and stake limits, how cards are collected (starter cards, loot, item mail, activity rewards). Each line shows its range and its default.'),
    P('Changed values turn blue, wrong values red. ', B('Try in the simulator'), ' plays matches with your values before anything is saved. ', B('Review and save'),
      ' shows the before / after table and warnings (for example a knock-out after only 2 captures), then writes /opt/eden_cardduel/config.json of the environment, keeps the previous file in config_backups and asks the service to reload it: duels in progress finish with their rules, the next ones use the new values (card_duel server 0.7.0+; an older service is restarted, which cancels running duels).'),
    P(B('Highest side value in a duel'), ' (rules.max_side) caps every side during a duel, Rally and Terror included: with 8, a printed 10 plays as 8. Cards keep their printed values.'),
    P('Dev saves right away. Preprod asks you to type "preprod". Production needs the SA role and typing "prod". GS and CM see the rules read only.'))
  }));
  node.appendChild(card({ title: 'Cards', icon: 'dice', body: el('div', { class: 'cd-help' },
    P('Every card of the game (about 3 700, generated from the monsters, bosses, NPCs and places of the game data, read only here) plus the custom cards of the designer file. Search by name, id, title, skill, map or item; filter by kind, element, rarity, source and status. Click a card to see it drawn like in game, how players get it and what the Treasure Archive needs for it.'),
    P(B('New custom card'), ', ', B('Duplicate'), ', ', B('Copy as custom card'), ': custom cards take an id from 4000001 to 4099999. The editor draws the card live and checks it with the card_duel checker itself (the code the server runs): name, element, rarity, sides 1 to 10, skills, level 1 to 120, unique id. It warns when the card is stronger than its rarity (balance guide: common 15, uncommon 18, rare 21, epic 24, legendary 27, mythic 30 points, +1 per 30 levels); choose balance free to keep it that way. The picture is a PNG of any size from 106 x 77, cropped to the card window.'),
    P(B('Card item'), ': an item (ids 59001 to 59999) that, when a player uses it, is used up and adds the card to his collection. It can give a custom card or any game card. Players get it like any item (GM, quest reward, shop, drop table).'),
    P(B('Change'), ' a game card: name, element, rarity, sides, skills, level, picture, random map drops and the drop of its "Card:" item. Only the values you change are written, as an [override] block of the designer file; every copy players own changes too, nobody gains or loses one. ', B('Reset'), ' gives back the generated values. The type cannot change.'),
    P(B('Retire'), ' a card (game or custom): from the next Deploy nobody can get it (no loot, item drop or pickup, activity reward, GM give, starter) and its "Card:" item leaves the drop tables. Copies players own stay in their collection and stay playable. Delete its card items first. ', B('Un-retire'), ' makes it obtainable again.'),
    P(B('Delete'), ' a custom card removes its block: copies players own become unknown cards, so prefer Retire. Never reuse a deleted id.'),
    P(B('Export CSV'), ' gives a spreadsheet (one card per line: id, name, kind, element, rarity, north, east, south, west, skills separated by ;, level, art, loot, nodes, balance). ', B('Import CSV'),
      ' adds or changes custom cards and changes game cards (only their changed values become an override): it shows every new, changed and wrong line, then checks the whole file before anything is written; nothing is imported while a line is wrong.'))
  }));
  node.appendChild(card({ title: 'Publishing custom cards', icon: 'deploy_to_server', body: el('div', { class: 'cd-help' },
    P('Custom cards and card items live in features/card_duel/designer/custom_cards.ini, pictures in designer/art/: the same file the content designers can edit by hand (README.md of that folder). On the admin PC the page writes it directly (a copy of the previous file is kept in the tool backups). On any other PC the page downloads the changed file and pictures as a .zip: send it to the admin.'),
    P('To reach players: push card_duel (Features page), Deploy it on the server (the service reads the file, new and renamed card items and retired card drops go into the server data, then the server stack restarts), install the card_duel client data (new and renamed items and the EdenCardCustom picture sheet, overrides included, go into game_unpacked) and repack. The Overview tab says whether the file of this PC is the one deployed on ', env, '. The simulator plays the custom cards right away ("Include the custom cards of the designer file").'))
  }));
  node.appendChild(card({ title: 'Archive', icon: 'treasure_archive', body: el('div', { class: 'cd-help' },
    P('Every card has a "Card: name" item that players file in the Treasure Archive (Special Items > Monster, Boss, NPC and Place Cards). The tab lists what each card needs and counts, on the server of ', env, ' and in the unpacked client of this PC, the item rows, the archive rows and the monster drops that exist (custom card items only need their item rows: they have no archive row). Missing server rows come back with the card_duel Deploy; missing client rows with the card_duel client data and a repack.'))
  }));
  node.appendChild(card({ title: 'Simulator', icon: 'launch_game', body: el('div', { class: 'cd-help' },
    P('Build two decks (type a card name, or Random with the rarity and kind filters), choose who starts, then lay cards yourself (click a card of the player to play, then a free cell) or let the server auto player move once or to the end. Undo takes back the last move. The log tells every capture, Combo chain, Rally, Terror and HP loss; the end shows what Ante and Hardcore would hand over.'),
    P(B('Balance'), ' plays up to 2 000 matches with the auto player and gives the win rate of each side, of the first player, by element, by rarity and by card. Use it to check a new card or a rule change: a card far above 50 pct with random decks is too strong for its rarity.'),
    P('Every move is computed by the card_duel server rules module itself, the same file as the eden-cardduel service, so what happens here happens in game with the same rules.'))
  }));
}
