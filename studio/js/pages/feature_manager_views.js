/* ============================================================================
   FEATURE MANAGER — vues pures : badges, verdicts, carrousel, checklist.

   Aucune de ces fonctions ne touche au DOM : elles RENDENT du HTML. Les
   cablages correspondants vivent dans feature_manager_actions.js.

   Pieges consignes ici :
   - L etat « repack » N EST PAS un detail cosmetique. Les fichiers poses dans
     game_unpacked mais absents du .pkg font une feature VERTE et invisible en
     jeu (chat_emoji / Emoji.imageset, 2026-08-03) : d ou un etat, une couleur
     et un verdict qui lui sont propres.
   - `unknown` n est ni vert ni rouge : le scan n a produit AUCUN marqueur. Le
     ranger en rouge accusait a tort, en vert mentait.
   - fmReadinessHtml lit `H.me()` pour savoir quel vote est le mien : sans hote
     pose, la page n a aucun vote « on ».
   ============================================================================ */
import { H, fm } from './feature_manager_state.js';

export function fmBadge(letter,state,why){
  // letter = 'C' (client) or 'S' (server); state = ok(green)/partial(orange)/off(red)/na(grey)/upd(gold=update available)
  // ⛔ « repack » manquait : les fichiers sont posés mais PAS dans le .pkg que le jeu lit.
  // Sans état dédié, la feature s'affichait VERTE et le manque ne se découvrait qu'en jeu,
  // par un plantage (chat_emoji / Emoji.imageset, 2026-08-03).
  const map={ok:['#2ea043','installed'],partial:['#b8860b','something missing'],repack:['#c2410c','installed but NOT in the .pkg yet — repack to make the game see it'],off:['#d1242f','off / not installed'],na:['#6b6b6b','n/a'],upd:['#caa24a','update available — a newer version is in the repo, Deploy to apply'],unk:['#9a8f78','not checked yet — the server state is still loading (open the feature to scan it now)']};
  const a=map[state]||map.na;
  const bg={ok:'rgba(46,160,67,.16)',partial:'rgba(184,134,11,.18)',repack:'rgba(194,65,12,.18)',off:'rgba(209,36,47,.15)',na:'transparent',upd:'rgba(202,162,74,.22)',unk:'transparent'}[state]||'transparent';
  return `<span class="fm-b" title="${letter==='C'?'client':'server'}: ${a[1]}${why?' — '+H.esc(why):''}" style="border-color:${a[0]};color:${a[0]};background:${bg}${state==='unk'?';border-style:dashed':''}">${letter}</span>`;
}
// Message quand la liste des features est VIDE — dit POURQUOI + quoi faire (au lieu d'une page muette).
export function fmEmptyMsg(status){
  const box=(t)=>`<div class="esub" style="padding:14px 10px;line-height:1.5;color:var(--faint)">${t}</div>`;
  if(status==='no-git'||status==='no-repo')
    return box('No features yet. Click <b>Pull latest features</b> above — the tool downloads the shared feature repo (and, if you don\'t have Git, a small portable Git the first time). No install needed.');
  if(status==='empty-clone')
    return box('The feature repo was pulled but is <b>empty</b> — the pull didn\'t complete. Click <b>Pull latest features</b> again (check your internet connection).');
  return box('No features to show. Try <b>Pull latest features</b>, or <img src="/studio/icons/icons/24/refresh.png" srcset="/studio/icons/icons/24/refresh.png 1x, /studio/icons/icons/48/refresh.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"> rescan.');
}
export function fmLoader(part,name){
  return `<div class="fm-detail"><div class="fm-title">${H.esc(name||'')}</div>
    <div class="fmload"><span class="fmspin"></span> <span>${part==='client'?'checking client files & data…':'scanning server binaries (SSH)…'}</span></div></div>`;
}
export function fmVerdict(state){
  return {ok:'<span style="color:#2ea043">fully installed</span>',partial:'<span style="color:#b8860b">partial</span>',off:'<span style="color:#d1242f">not installed</span>',na:'<span style="opacity:.5">n/a</span>',
          // « staged » = les fichiers sont dans game_unpacked mais PAS encore dans le .pkg : sur un client
          // packé le jeu ne les voit donc PAS. Un vert « fully installed » ici était un mensonge.
          // « unknown » ≠ « not installed » : le scan n'a produit AUCUN marqueur d'état. Le ranger
          // en rouge accusait à tort, le ranger en vert mentait — on dit qu'on ne sait pas.
          unknown:'<span style="color:#8a7bce">status unknown — re-scan</span>',
          repack:'<span style="color:#b8860b">staged — repack required</span>'}[state]||'';
}
function fmMediaTag(url,big){
  const prox='/api/features/preview-proxy?url='+encodeURIComponent(url);   // server-side fetch → bypasses hotlink
  const sz=big?'width:100%;max-height:360px;object-fit:contain':'width:100%;height:100%;object-fit:cover';
  const rad=big?8:6;
  // LOADER : un spinner recouvre le media tant qu'il n'est pas chargé. onload/oncanplay le retire (classe
  // .loaded sur le wrapper masque le spinner + fait apparaître le media en fondu). onerror = média cassé.
  const isV=/\.(mp4|webm|mov)(\?|$)/i.test(url);
  const media=isV
    ? `<video src="${prox}" ${big?'autoplay loop muted playsinline controls':'muted'} style="${sz};border-radius:${rad}px;background:#000" oncanplay="this.closest('.fm-media').classList.add('loaded')" onerror="this.closest('.fm-media').classList.add('err')"></video>`
    : `<img src="${prox}" alt="preview" style="${sz};border-radius:${rad}px" ${big?'':'loading="lazy"'} onload="this.closest('.fm-media').classList.add('loaded')" onerror="this.closest('.fm-media').classList.add('err')">`;
  return `<div class="fm-media${big?' big':''}"><span class="fm-media-spin"></span>${media}</div>`;
}
export function fmPreviewHtml(urls){
  const list=Array.isArray(urls)?urls:(urls?[urls]:[]);
  if(!list.length)return '<div class="fm-noprev">no preview yet — paste one or more GIF/MP4 URLs below (one per line)</div>';
  const i=Math.min(fm()._pv||0, list.length-1);
  const thumbs=list.length>1?('<div class="fm-thumbs">'+list.map((u,k)=>`<div class="fm-thumb${k===i?' on':''}" data-fmpv="${k}" title="view ${k+1}/${list.length}">${fmMediaTag(u,false)}</div>`).join('')+'</div>'):'';
  return `<div class="fm-carousel"><div class="fm-cmain" data-fmfull="${H.esc(list[i])}" title="click to view fullscreen">${fmMediaTag(list[i],true)}<span class="fm-full"><img src="/studio/icons/icons/24/expand.png" srcset="/studio/icons/icons/24/expand.png 1x, /studio/icons/icons/48/expand.png 2x" class="ui-icon ui-icon-24" width="24" height="24" alt="" aria-hidden="true"></span></div>${thumbs}</div>`;
  // (layout: main left, thumbnails column right — see .fm-carousel CSS)
}
// ── Readiness / test checklist: tells devs which feature is 100% functional (ready to install) vs WIP ──
export function fmReadinessHtml(name, rd){
  const IC=(n,s)=>`<img class="fx-i" src="/studio/icons/fx/${n}.png" width="${s||18}" height="${s||18}" alt="" aria-hidden="true">`;
  const cl=rd.checklist||[], total=cl.length, done=rd.done||0, left=Math.max(0,total-done);
  const me=(H.me()&&H.me().username)||'';
  const env=((fm().list||{}).env_name||(fm().list||{}).env)||'this environment';
  const canManage=H.can('features.manage');
  const openCm=fm()._cmOpen||{};
  const ini=u=>String(u||'?').replace(/^ER-/,'').replace(/[^A-Za-z0-9]/g,'').slice(0,2).toUpperCase()||'?';
  const items=cl.map((x,i)=>{
    const up=x.up||[], down=x.down||[], comments=x.comments||[];
    const mine=up.includes(me)?1:(down.includes(me)?-1:0);
    const st=x.broken?'bad':(x.confirmed?'ok':'na');
    const stTxt=x.broken?'Failed':(x.confirmed?'Confirmed':'Not tested');
    const stIc=x.broken?'status_error':(x.confirmed?'status_success':'status_off');
    const who=[...new Set([...up,...down])];
    const cmts=comments.map(c=>{
      const canDel=c.author===me||canManage;
      const iu=(c.image&&/^https?:\/\//i.test(c.image))?c.image:'';
      return `<div class="fx-cm"><span class="fx-av" title="${H.esc(c.author)}">${H.esc(ini(c.author))}</span>
        <div class="fx-cm-b"><div>${H.esc(c.body)}</div>${iu?`<img class="fm-cmt-img" src="${H.esc(iu)}" alt="attachment" loading="lazy" data-fmimgfull="${H.esc(iu)}">`:''}</div>
        <span class="fx-cm-t">${H.esc(c.author)}<br>${H.esc((c.ts||'').slice(0,16).replace('T',' '))}</span>
        ${canDel?`<button class="fx-x" data-fmcdel="${c.id}" title="delete this comment">${IC('close',12)}</button>`:''}</div>`;
    }).join('');
    const key=name+':'+i;
    const mnum=String(x.item||'').match(/^\s*(\d+)[.)]\s*/);
    const num=mnum?mnum[1]:String(i+1), txt=mnum?String(x.item).slice(mnum[0].length):(x.item||'');
    return `<div class="fx-test fx-t${st}">
      <div class="fx-trow">
        <span class="fx-tst">${IC(stIc,22)}</span><span class="fx-tnum">${num}</span>
        <div class="fx-ttxt">${H.esc(txt)}</div>
        <div class="fx-tenv"><small>${H.esc(env)}</small><b class="fx-${st}">${stTxt}</b>
          <span title="works: ${H.esc(up.join(', ')||'nobody')}">${IC('thumb_up',16)} ${up.length}</span>
          <span title="broken: ${H.esc(down.join(', ')||'nobody')}">${IC('thumb_down',16)} ${down.length}</span></div>
        <div class="fx-twho"><span class="fx-avs">${who.slice(0,3).map(u=>`<span class="fx-av" title="${H.esc(u)}">${H.esc(ini(u))}</span>`).join('')}${who.length>3?`<span class="fx-av">+${who.length-3}</span>`:''}</span>
          <small>Last tested<br>${H.esc(x.last_tested?x.last_tested+' UTC':'never')}</small>${(x.stale&&x.stale.length&&!up.length&&!down.length)?`<small style="color:#cf9b2a" title="voted by ${H.esc(x.stale.join(', '))} failed on an older version, fixed since">fixed in a new version: test again</small>`:''}</div>
      </div>
      <div class="fx-tfoot">
        <details class="fx-tcm" data-fxcm="${H.esc(key)}"${openCm[key]?' open':''}><summary>${IC('chevron_right',12)} ${comments.length?`${comments.length} comment${comments.length>1?'s':''}`:'Add a comment'}</summary>
          ${cmts}
          <div class="fm-caddrow"><input class="fm-cin" data-fmcadd="${i}" placeholder="add a comment… (paste an image too)" maxlength="2000"><button class="mini fm-cimg" data-fmcimg="${i}" title="attach an image">${IC('image',16)}</button><button class="mini fm-csend" data-fmcsend="${i}">Comment</button><span class="fm-cimg-preview" data-fmcprev="${i}"></span></div>
        </details>
        <button class="fx-vote up${mine===1?' on':''}" data-fmvote="${i}" data-v="1" title="${mine===1?'click again to remove your vote':'it works'}">${IC('thumb_up',16)} +1 it works</button>
        <button class="fx-vote down${mine===-1?' on':''}" data-fmvote="${i}" data-v="-1" title="${mine===-1?'click again to remove your vote':'it fails'}">${IC('thumb_down',16)} It fails</button>
        ${canManage?`<button class="fx-x" data-fmtdel="${i}" title="remove this test">${IC('close',12)}</button>`:''}
      </div></div>`;
  }).join('');
  const head=`<div class="fx-card-h">${IC('checklist',26)}<div class="fx-card-t"><h2>Test readiness</h2><p>Votes of the testers on ${H.esc(env)}. A test is confirmed with at least one +1 and no failure; the feature is ready when every test is.</p></div></div>
    <div class="fx-rsum"><span class="fx-pill fx-${rd.ready?'ok':(total?'bad':'na')} big">${IC(rd.ready?'ready':(total?'not_ready':'status_off'),20)} ${rd.ready?'Ready':(total?'Not ready yet':'No tests')}</span>
      <div><b class="fx-big-n">${total?(rd.ready?'All tests confirmed':left+' test'+(left>1?'s':'')+' left'):'No tests yet'}</b><span>${done} of ${total} tests confirmed</span></div>
      ${total?`<div class="fx-tprog wide"><i><b style="width:${Math.round(done/total*100)}%"></b></i><span>${done}/${total}</span></div>`:''}</div>`;
  const allBtn=(H.can('features.promote')&&total&&!rd.ready)?`<div style="text-align:right;margin:6px 0"><button class="fx-vote up" id="fmt-voteall" title="+1 every test you have not validated yet (super-admin only)">${IC('thumb_up',16)} Validate all</button></div>`:'';
  const addRow=canManage?`<div class="fm-ractrow"><input id="fmt-in" placeholder="add a test to verify (e.g. equip works in-game / server boots clean)…" maxlength="240"><button class="mini gold" id="fmt-add">+ Add test</button></div>`:'';
  return `<section class="fx-card fm-ready">${head}
    ${allBtn}<div class="fx-tests">${items||`<div class="fx-empty">${IC('empty_tests',32)}<div><b>No checks yet</b><span>Add what a tester must verify in-game (e.g. “slot 16 accepts a ring”, “server survives a restart”).</span></div></div>`}</div>
    ${addRow}</section>`;
}

  // Radio « ou lire le journal d'execution ». Celui qui met en production travaille avec le client
  // DEPACKE ; le releve etait pris dans le PACKE, en dur. Resultat : « No runtime log yet » quel que
  // soit le nombre de lancements, et impossible d'y remedier — un `eden_patch.ini` depose dans le
  // client packe serait ecrase par le lanceur chez le joueur (signale le 2026-08-11).
  // « Auto » suit le journal le plus RECENT des deux : personne n'a rien a regler, et le choix se
  // corrige tout seul quand on change d'habitude. Les deux autres imposent la source.
export function fmRuntimeRadio(d){
    const cur = d.runtime_client || 'auto';
    const opt = (v, lbl, t) => `<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer" title="${H.esc(t)}">`
      + `<input type="radio" name="fmrt" value="${v}"${cur===v?' checked':''} style="margin:0">${lbl}</label>`;
    const lu = '';   // (l'ancien « (read: X) » prenait une ligne pour redire le bouton coche)
    return `<span class="fm-rt" style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap"
        title="Which client's eden_hook.log the health check READS. ⚠ This does NOT change where the game launches from — the game always starts from the client that holds game_.exe.">log source:
      ${opt('auto','auto','follow whichever client ran the game last'+(d.runtime_source?' — currently reading: '+d.runtime_source:''))}
      ${opt('packed','packed','always read the packed client')}
      ${opt('unpacked','unpacked','always read the unpacked client — reading only: this does not launch the game from there')}
      ${lu}</span>`;
  }

/* ============================================================================
   LA PASTILLE D'AVERTISSEMENT — le detail passe dans l'infobulle.

   ⛔ L'ecran d'une feature empilait des PANNEAUX pleine largeur : conflits de
   fichiers, verification de sante, chacun avec son titre, son paragraphe
   d'explication et sa liste. Sur une feature saine mais partagee, ca faisait
   deux gros blocs colores qui repoussaient hors de vue la SEULE chose qu'on
   vient chercher : ce qu'il reste a installer.

   Un avertissement n'a pas besoin d'occuper l'ecran pour exister. Il doit se
   VOIR (un triangle, un compte) et se LIRE SUR DEMANDE (au survol). C'est ce
   que fait cette pastille.

   ⚠️ L'infobulle est l'attribut `title` natif — DELIBEREMENT. Une infobulle
   maison se serait fait couper par le `overflow` du panneau de detail, aurait
   demande un placement, une fermeture, un comportement au clavier… pour du
   texte qu'on lit trois secondes. Le natif ne peut pas se tromper de place et
   fonctionne partout.
   ⛔ Donc : du TEXTE, jamais de balisage — `title` l'afficherait mot pour mot.
   ============================================================================ */

/** @param {string} level 'fail' | 'warn' | 'info'
    @param {string} label texte court affiche (ex. « 2 conflicts »)
    @param {string[]} lignes detail, une entree par ligne de l'infobulle */
export function fmChip(level, label, lignes) {
  /* ⛔ PAS de `filter(Boolean)` : les chaines VIDES sont les separations de paragraphe de
     l'infobulle. Les jeter collait l'explication, la liste des fichiers et le remede en un
     seul bloc — exactement le mur de texte qu'on cherche a eviter. On ne retire que ce qui
     n'existe pas. */
  const txt = (lignes || []).filter(l => l != null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return `<span class="fm-chip ${level}" title="${esc(txt)}">`
       + (level === 'info' ? '≡' : '⚠') + ' ' + esc(label) + '</span>';
}

/* `title` est du texte : on n'y met pas de balisage, mais les guillemets doivent
   quand meme sortir de l'ATTRIBUT sans le fermer. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
