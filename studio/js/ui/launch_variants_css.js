export const LV_CSS = `
.sheet.lv-on{width:min(580px,96vw)!important}
.sheet.lv-on .body>:not(#lv-root){display:none!important}
.sheet.lv-on #lm-yes{display:none}
#lv-bar{display:none;gap:4px;align-items:center;margin-bottom:12px;justify-content:center}
.lv-on #lv-bar.has{display:flex}
#lv-bar button{font:700 11px Cinzel,serif;padding:3px 8px;border-radius:5px;border:1px solid var(--edge);background:var(--paper2);color:var(--ink)}
#lv-bar button.on{background:linear-gradient(180deg,#d3ab63,#b8862f);border-color:#8a5a22;color:#3a2410}
#lv-bar .lv-lbl{font:700 11px Cinzel,serif;color:var(--dim)}
#lv-view{display:block}
#lv-settings{display:none;margin-top:12px;border-top:1px dashed var(--edge);padding-top:8px}
.lv-on #lv-settings{display:block}
#lv-settings summary{font:700 13px Cinzel,serif;color:var(--gold2);padding:2px 0;list-style:none;display:flex;align-items:center;gap:8px}
#lv-settings summary::-webkit-details-marker{display:none}
#lv-settings summary img{width:20px;height:20px}
#lv-settings[open] summary{margin-bottom:8px}
.lv-ic{width:22px;height:22px;flex:none;object-fit:contain}
.lv-fix{white-space:nowrap;font:700 12px Cinzel,serif;padding:4px 12px;border-radius:6px;border:1px solid #8a5a22;background:linear-gradient(180deg,#d3ab63,#b8862f);color:#3a2410}
.lv-fix[disabled]{opacity:.55}
.lv-play{display:flex;align-items:center;justify-content:center;gap:8px;width:fit-content;min-width:180px;height:44px;margin:12px auto 0;font:700 17px Cinzel,serif;letter-spacing:.06em;padding:0 28px;border-radius:8px;border:1px solid #8a5a22;background:linear-gradient(180deg,#dcb56d,#b8862f);color:#3a2410;box-shadow:0 2px 0 #7a4f1d}
.lv-play img{width:26px;height:26px}
.lv-play[disabled]{filter:grayscale(1) brightness(.9);opacity:.6;box-shadow:none}
.lv-note{margin-top:8px;text-align:center;font:700 12px Cinzel,serif;min-height:16px}
.lv-note.warn{color:#b8651b}.lv-note.block{color:#a5332a}.lv-note.ok{color:var(--jade)}
.lv-sim{font:700 10px Cinzel,serif;color:var(--faint);text-align:center;margin-top:4px}
.lv-env{display:flex;gap:8px;justify-content:center}
.lv-env button{display:flex;align-items:center;gap:6px;font:700 12px Cinzel,serif;padding:3px 10px 3px 5px;border-radius:8px;border:1px solid var(--edge);background:var(--paper2);color:var(--ink)}
.lv-env button img{width:22px;height:22px}
.lv-env button.on{border-color:#9a6a2b;background:#f9efd0;box-shadow:0 0 0 2px rgba(154,106,43,.25)}
.lv-env.big{gap:12px;margin-bottom:12px}
.lv-env.big button{flex-direction:column;gap:2px;padding:8px 8px 6px;font-size:12px;width:96px}
.lv-env.big button img{width:48px;height:48px}
.lv-s3 .lv-line{display:flex;align-items:center;gap:12px;justify-content:center;font:700 14px Cinzel,serif;flex-wrap:wrap}
.lv-s3 .lv-line>img{width:22px;height:22px}
.lv-s3 .lv-part{display:inline-flex;align-items:center;gap:8px}

.lv-playrow{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:12px}
.lv-playrow .lv-play{margin:0}
.lv-count{display:flex;align-items:center;gap:6px}
.lv-count .lv-cl{font:700 11px Cinzel,serif;color:var(--dim)}
.lv-count button{width:28px;height:28px;border-radius:6px;border:1px solid var(--edge);background:var(--paper2);color:var(--ink);font:700 16px Cinzel,serif;line-height:1}
.lv-count .lv-cn{min-width:20px;text-align:center;font:700 15px Cinzel,serif;color:var(--ink)}
`;
