/* ============================================================================
   FEATURE MANAGER — tri de la liste (A-Z, Z-A, Newest/Oldest first, Problems
   first, Most/Fewest tests left = badge des tests non confirmes, sans tests en dernier) memorise par utilisateur (localStorage, garde), et la date de
   publication discrete de chaque ligne (« updated 2 h ago »).
   Date = /api/features -> published (dernier commit touchant features/<f>/ sur
   feature_ee main, repli : date de la 1re entree du CHANGELOG).
   ============================================================================ */
import { H, fm } from './feature_manager_state.js';

const FM_SORTS=['az','za','new','old','status','most','fewest'];
function fmSortKey(){ const u=((H.me&&H.me())||{}).username||''; return 'eden_fm_sort:'+u; }
export function fmSortLoad(){ try{ const v=localStorage.getItem(fmSortKey()); return FM_SORTS.includes(v)?v:'az'; }catch(e){ return 'az'; } }
export function fmSortSave(v){ try{ localStorage.setItem(fmSortKey(), v); }catch(e){} }
function fmAgo(sec){
  const d=Math.max(0,Date.now()/1000-sec);
  if(d<3600) return Math.max(1,Math.round(d/60))+' min ago';
  if(d<86400) return Math.round(d/3600)+' h ago';
  if(d<86400*45) return Math.round(d/86400)+' d ago';
  return Math.round(d/86400/30)+' mo ago';
}
export function fmPubHtml(f){
  if(!f.published) return '';
  const when=new Date(f.published*1000);
  const src=f.published_src==='changelog'?'CHANGELOG top entry':(f.published_src||'git');
  return `<span class="fm-pub" title="current version published ${H.esc(when.toLocaleString())} (${H.esc(src)})">updated ${fmAgo(f.published)}</span>`;
}
export function fmSortList(){
  const list=document.querySelector('.fm-side2 .fm-list'); if(!list)return;
  const mode=fm()._sort||'az';
  const rank=r=>{ const s=(r.dataset.fmstate||'').split(' ');
    return (s.includes('missing')||s.includes('cmissing'))?0:s.includes('update')?1:s.includes('off')?2:s.includes('totest')?3:4; };
  const rows=[...list.querySelectorAll('.fm-row')];
  const pub=r=>+(r.dataset.fmpub||0);
  rows.sort((a,b)=>{
    if(mode==='status'){ const d=rank(a)-rank(b); if(d)return d; }
    if(mode==='most'||mode==='fewest'){ const la=+(a.dataset.fmleft??-1), lb=+(b.dataset.fmleft??-1);
      if(la!==lb){ if(la<0)return 1; if(lb<0)return -1; return mode==='most'?lb-la:la-lb; } }
    if(mode==='new'||mode==='old'){ const pa=pub(a), pb=pub(b);
      if(pa!==pb){ if(!pa)return 1; if(!pb)return -1; return mode==='new'?pb-pa:pa-pb; } }
    const c=(a.dataset.fmsel||'').localeCompare(b.dataset.fmsel||'');
    return mode==='za'?-c:c;
  }).forEach(r=>list.appendChild(r));
}
