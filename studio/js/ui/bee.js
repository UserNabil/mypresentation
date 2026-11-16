const ROOT = '/studio/img/brand/';
const CSS_ID = 'bee-css';

function ensureCss(){
  if(document.getElementById(CSS_ID)) return;
  const l = document.createElement('link');
  l.id = CSS_ID; l.rel = 'stylesheet'; l.href = '/studio/css/modern/bee.css';
  document.head.appendChild(l);
}

export function beeHtml({ size = 96, flying = true, label = '' } = {}){
  ensureCss();
  return '<span class="bee' + (flying ? ' is-flying' : '') + '" style="--bee-size:' + size + 'px" role="img" aria-label="' + (label || 'Eden bee') + '">'
    + '<span class="bee-fly">'
    + '<img class="bee-wing-l" src="' + ROOT + 'bee_wing_l.png" alt="" draggable="false">'
    + '<img class="bee-wing-r" src="' + ROOT + 'bee_wing_r.png" alt="" draggable="false">'
    + '<img class="bee-body" src="' + ROOT + 'bee_body.png" alt="" draggable="false">'
    + '</span></span>';
}

export function beeLoaderHtml({ size = 140, label = '' } = {}){
  ensureCss();
  return '<span class="bee-loader" style="--bee-loader-size:' + size + 'px" role="status" aria-live="polite">'
    + '<img class="bee-loader-ring" src="' + ROOT + 'loader_ring.png" alt="" draggable="false">'
    + beeHtml({ size: Math.round(size * .8), flying: true, label: label || 'Loading' })
    + '<img class="bee-loader-spark" src="' + ROOT + 'sparkles.png" alt="" draggable="false">'
    + (label ? '<span class="bee-loader-label">' + label + '</span>' : '')
    + '</span>';
}
