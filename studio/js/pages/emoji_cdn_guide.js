import { el } from '../core/dom.js';
import { icon, badge } from '../components.js';
import { ES, lim, pubState } from './emoji_cdn_view.js';

const KEY = 'eden.emc.guide';

function isOpen() { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } }
function remember(open) { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch (e) { } }

function block(title, ic, ...body) {
  return el('div', { class: 'emc-gd-b' }, el('h4', {}, icon(ic, 20), title), ...body);
}

function ul(items) { return el('ul', {}, items.filter(Boolean).map(x => el('li', {}, x))); }

export function renderGuide() {
  const L = lim(), S = (ES.model && ES.model.sounds && ES.model.sounds.limits) || {};
  const ps = pubState();
  const d = el('details', { class: 'emc-guide', open: isOpen() ? true : null });
  d.addEventListener('toggle', () => remember(d.open));
  const mb = n => Math.round(n / 1048576);
  d.append(
    el('summary', {}, icon('lorebook', 20), el('b', {}, 'How this page works'),
      ps.can ? badge('This PC can publish', 'ok') : badge('This PC prepares drafts, the admin publishes', 'warn', { title: ps.blocks.join(' ') })),
    el('div', { class: 'emc-gd' },
      block('What you can add', 'image', ul([
        [el('b', {}, 'Emoji'), ': a still picture (PNG, JPG, WEBP). Players type ', el('code', {}, ':code:'), ' in chat or pick it in the Emoji palette.'],
        [el('b', {}, 'GIF emoji'), ': an animated GIF', ES.ctx && ES.ctx.ffmpeg && ES.ctx.ffmpeg.ok ? ' (or MP4 / WEBM)' : '', '. Same as an emoji, it plays in a loop.'],
        [el('b', {}, 'Sound'), ': a short sound effect in the in-game Sounds panel. Its button shows an emoji as icon; players nearby hear it.'],
      ])),
      block('Steps', 'objectives', el('ol', {},
        el('li', {}, el('b', {}, 'Add'), ': drop files in ', el('b', {}, 'Add emojis'), ' (pictures, GIFs) or ', el('b', {}, 'Sounds'), ' (audio). They go into a draft on this PC: players see nothing yet.'),
        el('li', {}, el('b', {}, 'Check'), ': fix code, name and category, look at the preview (real size and x2), listen to sounds. A red card must be fixed.'),
        el('li', {}, el('b', {}, 'Preview'), ': ', el('b', {}, 'Publish'), ' tab > Preview changes. It builds the next catalog, checks it with the game rules and lists every change. Nothing is uploaded.'),
        el('li', {}, el('b', {}, 'Publish'), ': Publish vN on the admin PC, or ', el('b', {}, 'Export draft for the admin'), ' anywhere else.'))),
      block('Who can publish', 'lock', ul([
        'Publishing needs a catalog signing key (the game refuses a catalog that is not signed) and the CDN upload credentials. The admin PC has the release key; staff granted a catalog key by the admin (Nunez, Muse) receive it from the back-office when they sign in to the tool, on any PC. The Publish tab says what this PC has and, if something is missing, exactly what.',
        'On any other PC you can do everything else: add, edit, preview. Then Publish tab > Export draft for the admin, and send the .zip. The admin uses Import a draft, checks the preview and publishes.',
        ['This PC: ', el('b', {}, ps.can ? 'can publish.' : 'cannot publish, it prepares drafts for the admin.')],
      ])),
      block('What players get, and when', 'party', ul([
        'Every player on the Eden Reforged client, not only devs: the game DLL reads this catalog from the CDN.',
        'They get it at the next check, about every 10 minutes, without relogging. The preview says when a big change has to wait for their next relog.',
        'Undo: the History tab republishes any older version in one click.',
      ])),
      block('Change an icon or an image', 'edit', ul([
        [el('b', {}, 'Emoji'), ': Catalog tab > click the emoji > Replace image. It keeps its code, name and place in the palette. Emojis drawn only by the DLL (marked read-only) cannot be changed here.'],
        [el('b', {}, 'Sound'), ': Sounds tab > click the icon of the sound and pick any emoji of the catalog, or Image… to upload your own (resized to the 37 px of the in-game panel, transparent background kept).'],
        'Then Preview and Publish as usual.',
      ])),
      block('Limits: pictures and GIFs', 'image', ul([
        `Every image is cropped to its visible pixels and shrunk into a ${L.cell || 32} px square, transparency kept. Thin lines and small text disappear: use bold, simple pictures.`,
        `GIF: up to ${L.default_frames || 22} images kept by default, ${L.max_frames || 64} at most, 1 to ${L.max_fps || 30} fps. Every image of an animation takes one ${L.cell || 32} px cell.`,
        `All emojis share ${L.max_pages || 4} pages of ${L.page_max || 2048} x ${L.page_max || 2048} pixels: this is the texture budget shown in the preview. ${L.max_emojis || 2048} emojis and ${L.max_categories || 8} categories at most.`,
        `Code: 1 to 15 characters among a-z, 0-9 and _. Name: ${L.name_max || 39} characters. Keywords: ${L.kw_one || 31} characters each, ${L.kw_total || 95} in total.`,
        `Files up to ${mb(L.upload_max || 67108864)} MB${ES.ctx && ES.ctx.ffmpeg && ES.ctx.ffmpeg.ok ? `, videos: first ${L.video_max_s || 10} s` : ''}. Players only download the pages that changed.`,
      ])),
      block('Limits: sounds', 'sound', ul([
        'WAV, MP3, OGG, FLAC or M4A. Converted on this PC to mono 22 kHz 16-bit WAV, with the silence at both ends removed.',
        'Volume: the loudness is levelled by default so every sound plays about as loud as the others (untick "Level the volume" to keep the original).',
        `${(S.max_ms || 3000) / 1000} s and ${Math.round((S.max_data || 262144) / 1024)} KB at most per sound. ${S.max_sounds || 24} sounds in the list (hidden ones count), ${S.max_categories || 5} categories.`,
        `Name: ${S.name_max || 24} characters, the panel shows the first ${S.label_show || 13}. Chat token (sfx:...): 1 to 16 characters among a-z, 0-9 and _, fixed once published.`,
        'The 12 sounds embedded in the DLL can be renamed, moved or hidden, not replaced.',
      ]))));
  return d;
}
