export const GMV_CSS = `
#gmmodal.gmv-on .sheet{width:min(1080px,96vw)!important}
#gmmodal.gmv-on #gm-q,#gmmodal.gmv-on #gm-cats,#gmmodal.gmv-on #gm-compose,#gmmodal.gmv-on #gm-list{display:none!important}
#gmv-root{display:none}
#gmmodal.gmv-on #gmv-root{display:block}
#gmv-root img.gi{display:block;object-fit:contain}
.gmv-search{display:flex;align-items:center;gap:10px;flex:1;min-width:0;border:2px solid var(--edge);border-radius:12px;background:#fbf5e3;padding:6px 12px}
.gmv-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font-family:"Spectral";font-size:15px;color:var(--ink)}
.gmv-rows{display:flex;flex-direction:column;gap:6px}
.gmv-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--edge2);border-radius:9px;background:#fbf5e3;cursor:pointer}
.gmv-row:hover{border-color:#a9823f;background:#f6ebcb}
.gmv-row.on{border-color:#a9823f;background:#e7c98a}
.gmv-row .nm{font-family:ui-monospace,Consolas,monospace;font-size:16px;font-weight:700;color:var(--ink);white-space:nowrap}
.gmv-row.big .nm{font-size:19px}
.gmv-row .nt{font-size:12px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.gmv-row .rc{margin-left:auto;display:flex;gap:6px;align-items:center;flex:none}
.gmv-ib{border:0;background:transparent;padding:4px;cursor:pointer;border-radius:6px;display:inline-flex}
.gmv-ib:hover{background:rgba(154,106,43,.18)}
.gmv-bdg{font-family:"Cinzel";font-size:10px;padding:1px 6px;border-radius:6px;background:rgba(150,110,40,.25);color:var(--gold2);flex:none}
.gmv-sec{display:flex;align-items:center;gap:8px;margin:14px 0 6px;font-family:"Cinzel";font-weight:700;font-size:13px;color:var(--gold2)}
.gmv-card{border:2px solid #a9823f;border-radius:12px;background:linear-gradient(180deg,#f8f1dc,#efe4c6);padding:16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 8px rgba(120,90,40,.2)}
.gmv-card.empty{align-items:center;justify-content:center;min-height:220px;border-style:dashed;color:var(--faint);box-shadow:none}
.gmv-ct{display:flex;align-items:center;gap:10px}
.gmv-ct code{font-size:22px;font-weight:700;color:var(--ink);font-family:ui-monospace,Consolas,monospace}
.gmv-ct .gmv-ib{margin-left:auto}
.gmv-note{font-size:12.5px;color:var(--dim)}
.gmv-fields{display:flex;gap:10px;flex-wrap:wrap}
.gmv-f{display:flex;flex-direction:column;gap:3px;flex:1 1 130px;min-width:110px;font-family:"Cinzel";font-size:11px;color:var(--dim)}
.gmv-f input{padding:10px 12px;font-size:16px;border:1px solid var(--gold);border-radius:8px;background:#fffaf0;color:var(--ink);font-family:ui-monospace,Consolas,monospace}
.gmv-prev{font-family:ui-monospace,Consolas,monospace;font-size:14px;padding:8px 10px;border-radius:8px;background:rgba(58,44,24,.08);word-break:break-all}
.gmv-copy{justify-content:center;font-size:18px;padding:14px 20px;width:100%}
.gmv-copy.ok{background:#4f8a3a;border-color:#3b6a2a;color:#fff}
.gmv-split{display:grid;grid-template-columns:176px minmax(0,1fr) 340px;gap:14px;align-items:start}
.gmv-rail{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.gmv-rb{display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 2px;border:1px solid transparent;border-radius:9px;cursor:pointer;font-family:"Cinzel";font-size:10px;text-align:center;color:var(--ink);line-height:1.15}
.gmv-rb:hover{border-color:var(--edge)}
.gmv-rb.on{background:#e7c98a;border-color:#a9823f}
.gmv-scroll{max-height:56vh;overflow:auto;padding-right:4px}
.gmv-sticky{position:sticky;top:0}
.gmv-more{margin-top:16px;border-top:1px dashed var(--edge);padding-top:10px}
.gmv-more .mb{display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:0;background:transparent;font-family:"Cinzel";font-size:12px;color:var(--dim)}
.gmv-more .mp{display:none;margin-top:8px;gap:8px;flex-direction:column}
.gmv-more.open .mp{display:flex}
.gmv-more input{font-family:ui-monospace,Consolas,monospace;font-size:13px;padding:6px 8px}
@media (max-width:1000px){.gmv-split{grid-template-columns:176px minmax(0,1fr)}.gmv-split .gmv-side{grid-column:1/-1}}
`;
