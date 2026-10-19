/* All imported data lives in memory. No requests, storage, analytics, or uploads. */
'use strict';
const $ = id => document.getElementById(id);
const ns = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(ns, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text !== undefined) node.textContent = text;
  return node;
}
const canvas = $('canvas'), world = $('world');
let graph, index, points = new Map(), selected = null, isolated = false, activeClass = null;
let family = null, visibleIds = new Set(), nodeElements = new Map(), edgeElements = [];
let feedbackRefs = new Map(), feedbackTokenByNode = new Map();
let camera = {x: 0, y: 0, scale: 0.85}, miniBounds, miniWindow;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function load(raw) {
  const parsed = Lineage.normalize(raw); // Validate before replacing a working graph.
  graph = parsed; index = Lineage.model(graph);
  ['overview','recent','clear','zoom-out','zoom-level','zoom-in','fit','feedback-open'].forEach(id => { $(id).disabled = false; });
  selected = null; isolated = false; family = null; activeClass = null;
  $('empty').hidden = true;
  $('summary').textContent = `${new Set(graph.nodes.map(n => n.rank)).size} pledge-class chapters`;
  $('classes').replaceChildren();
  feedbackRefs = new Map(); feedbackTokenByNode = new Map();
  const classes = [...new Map(graph.nodes.map(n => [n.rank, n.class_name])).entries()].sort((a,b) => a[0]-b[0]);
  const pointOptions = [el('option', {value:''}, 'Choose a map point…')];
  for (const [rank, label] of classes) {
    const button = el('button', {'data-rank': rank});
    button.append(el('span', {class:'class-number'}, String(rank + 1).padStart(2, '0')), el('span', {}, label));
    button.addEventListener('click', () => jumpClass(rank)); $('classes').append(button);
    const members=graph.nodes.filter(n=>n.rank===rank).sort((a,b)=>a.x-b.x||a.id-b.id);
    members.forEach((n,i)=>{
      const token=`${rank}:${i+1}`;
      feedbackRefs.set(token,n.id); feedbackTokenByNode.set(n.id,token);
      pointOptions.push(el('option',{value:token},`${label} · point ${String(i+1).padStart(2,'0')}`));
    });
  }
  $('feedback-member').replaceChildren(...pointOptions);
  $('feedback-related').replaceChildren(el('option', {value:''}, 'Not applicable'), ...pointOptions.slice(1));
  render();
  // Start with readable recent cards; the minimap provides context for the full map.
  recent();
}

function render() {
  visibleIds = isolated && family ? family.all : new Set(graph.nodes.map(n => n.id));
  const visible = graph.nodes.filter(n => visibleIds.has(n.id));
  points = Lineage.layout(visible);
  world.replaceChildren(); nodeElements = new Map(); edgeElements = [];
  const defs = svgEl('defs'), grad = svgEl('linearGradient', {id:'both'});
  grad.append(svgEl('stop', {offset:'50%', 'stop-color':'#466ec3'}), svgEl('stop', {offset:'50%', 'stop-color':'#bf6470'})); defs.append(grad); world.append(defs);
  const bounds = Lineage.bounds(visibleIds, points);
  const rows = [...new Map(visible.map(n => [n.rank,n.class_name])).entries()].sort((a,b)=>a[0]-b[0]);
  for (const [rank, name] of rows) {
    const y = 90 + rank * Lineage.ROW;
    if (rank % 2 === 0) world.append(svgEl('rect', {x:0,y:y-Lineage.ROW/2,width:bounds.x+bounds.w+60,height:Lineage.ROW,class:'band'}));
    // Repeat class labels across wide rows so a class remains identifiable while panning.
    for (let x = 30; x < bounds.x + bounds.w; x += 1100) world.append(svgEl('text', {x,y:y-49,class:'class-label'}, name.toUpperCase()));
  }
  const edgeLayer=svgEl('g'), nodeLayer=svgEl('g'); world.append(edgeLayer,nodeLayer);
  for (const edge of graph.edges) {
    const a=points.get(edge.source), b=points.get(edge.target);
    if(!a || !b) continue;
    const path=svgEl('path', {d:routeEdge(edge,a,b),class:'edge'});
    edgeLayer.append(path); edgeElements.push({edge,path});
  }
  for (const n of visible) {
    const p=points.get(n.id);
    const g=svgEl('g',{class:'node',transform:`translate(${p.x},${p.y})`,tabindex:'0',role:'button','aria-label':`Unlabeled point in ${n.class_name} chapter`});
    g.append(svgEl('title',{},`Unlabeled point · ${n.class_name}`),svgEl('circle',{r:6,class:'point'}));
    g.addEventListener('click',()=>{ if(!suppressClick) select(n.id); });
    g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();select(n.id);}});
    nodeLayer.append(g); nodeElements.set(n.id,g);
  }
  buildMini(); updateStyles(); transform();
}

function routeEdge(edge, a, b) {
  const source=index.byId.get(edge.source), target=index.byId.get(edge.target);
  const outgoing=index.children.get(edge.source), incoming=index.parents.get(edge.target);
  const port=(neighbors,id)=>neighbors.length>1?(neighbors.indexOf(id)-(neighbors.length-1)/2)*3:0;
  const x1=a.x+port(outgoing,edge.target), x2=b.x+port(incoming,edge.source);
  const y1=a.y, y2=b.y, middle=(y1+y2)/2;
  const obstacles=source.rank+1<target.rank?graph.nodes.filter(n=>n.rank>source.rank&&n.rank<target.rank&&points.has(n.id)).map(n=>points.get(n.id)):[];
  const pathFor=bow=>`M${x1},${y1} C${x1+bow},${middle} ${x2+bow},${middle} ${x2},${y2}`;
  if(!obstacles.length) return pathFor(0);
  const collisionCount=bow=>{
    let hits=0;
    for(let step=1;step<48;step++) {
      const t=step/48, mt=1-t;
      const x=mt**3*x1+3*mt**2*t*(x1+bow)+3*mt*t**2*(x2+bow)+t**3*x2;
      const y=mt**3*y1+3*mt**2*t*middle+3*mt*t**2*middle+t**3*y2;
      if(obstacles.some(p=>Math.abs(x-p.x)<10&&Math.abs(y-p.y)<10)) hits++;
    }
    return hits;
  };
  if(!collisionCount(0)) return pathFor(0);
  // Search both sides of the corridor, preferring the smallest clear detour.
  let bestBow=0,bestHits=Infinity;
  for(let offset=90;offset<=900;offset+=45) {
    for(const bow of [offset,-offset]) {
      const hits=collisionCount(bow);
      if(hits<bestHits){bestHits=hits;bestBow=bow;}
      if(!hits) return pathFor(bow);
    }
  }
  // Dense intermediate rows can leave no clear single-cubic corridor. Route
  // through the row gaps and use an outside gutter so the edge cannot cross a card.
  if(bestHits>0) {
    const left=Math.min(...obstacles.map(p=>p.x))-Lineage.CARD_W/2-24;
    const right=Math.max(...obstacles.map(p=>p.x))+Lineage.CARD_W/2+24;
    const gutter=Math.abs(x1-left)+Math.abs(x2-left)<Math.abs(x1-right)+Math.abs(x2-right)?left:right;
    const gapTop=y1+Lineage.ROW/2, gapBottom=y2-Lineage.ROW/2;
    return `M${x1},${y1} C${x1},${gapTop} ${gutter},${gapTop} ${gutter},${gapTop} L${gutter},${gapBottom} C${gutter},${gapBottom} ${x2},${gapBottom} ${x2},${y2}`;
  }
  return pathFor(bestBow);
}

function updateStyles() {
  for (const [id,g] of nodeElements) {
    const n=index.byId.get(id), filtered=activeClass===null||n.rank===activeClass;
    g.classList.toggle('selected',id===selected);
    g.classList.toggle('related',!!family?.all.has(id));
    g.classList.toggle('dim',family?!family.all.has(id):!filtered);
  }
  for (const {edge,path} of edgeElements) {
    const chain=family?.all.has(edge.source)&&family?.all.has(edge.target);
    path.classList.toggle('active',!!chain);
    path.classList.toggle('dim',family?!chain:activeClass!==null&&!(index.byId.get(edge.source).rank===activeClass||index.byId.get(edge.target).rank===activeClass));
  }
  $('isolate').disabled=selected===null; $('fit-selection').disabled=selected===null;
  $('isolate').setAttribute('aria-pressed',String(isolated));
  $('isolate').textContent=isolated?'Show full map':'Isolate lineage';
  document.querySelectorAll('#classes button').forEach(b=>{b.classList.toggle('active',Number(b.dataset.rank)===activeClass);b.setAttribute('aria-pressed',String(Number(b.dataset.rank)===activeClass));});
}

function select(id) {
  selected=id; family=index.family(id); activeClass=null;
  if(isolated) render(); else updateStyles();
  const n=index.byId.get(id);
  $('view-title').textContent=`${n.class_name} chapter · lineage highlighted`;
  $('status').textContent='A connected lineage is highlighted; names and member details are hidden.';
  center(id,Math.max(camera.scale,.9));
}

function reset() {
  if(!graph)return;
  selected=null;family=null;isolated=false;activeClass=null;
  $('view-title').textContent='Explore the connections';
  $('status').textContent='Relationship map · member details hidden';
  render();
}
function jumpClass(rank) {
  reset();activeClass=rank;updateStyles();
  const group=graph.nodes.filter(n=>n.rank===rank).sort((a,b)=>a.x-b.x);
  $('view-title').textContent=group[0].class_name+' class';
  $('status').textContent='Chapter highlighted · select a point to trace its connections';
  center(group[Math.floor(group.length/2)].id,.85);
}
function recent() {
  if(!graph)return; reset();
  const maxRank=Math.max(...graph.nodes.map(n=>n.rank));
  const nodes=graph.nodes.filter(n=>n.rank>=maxRank-3).sort((a,b)=>a.x-b.x);
  const mid=nodes[Math.floor(nodes.length/2)];
  camera.scale=.85;camera.x=canvas.clientWidth/2-points.get(mid.id).x*camera.scale;
  camera.y=canvas.clientHeight/2-(90+(maxRank-2)*Lineage.ROW)*camera.scale;
  $('view-title').textContent='Recent generations'; transform();
  const last=$('classes').lastElementChild;if(last)last.scrollIntoView({block:'nearest'});
}
function center(id,scale=camera.scale) {
  const p=points.get(id);if(!p)return;
  camera={scale:clamp(scale,.06,2.5),x:canvas.clientWidth/2-p.x*scale,y:canvas.clientHeight/2-p.y*scale};transform();
}
function fit(ids=visibleIds) {
  const b=Lineage.bounds(ids,points);if(!b)return;
  const scale=clamp(Math.min((canvas.clientWidth-60)/b.w,(canvas.clientHeight-100)/b.h),.06,1.1);
  camera={scale,x:canvas.clientWidth/2-(b.x+b.w/2)*scale,y:(canvas.clientHeight-45)/2-(b.y+b.h/2)*scale};transform();
}
function zoom(scale,x=canvas.clientWidth/2,y=canvas.clientHeight/2) {
  scale=clamp(scale,.06,2.5);camera.x=x-(x-camera.x)*scale/camera.scale;camera.y=y-(y-camera.y)*scale/camera.scale;camera.scale=scale;transform();
}
function transform() {
  world.setAttribute('transform',`translate(${camera.x},${camera.y}) scale(${camera.scale})`);
  world.classList.toggle('zoom-far',camera.scale<.45);
  $('zoom-level').textContent=Math.round(camera.scale*100)+'%';
  if(miniWindow) {
    miniWindow.setAttribute('x',-camera.x/camera.scale);miniWindow.setAttribute('y',-camera.y/camera.scale);
    miniWindow.setAttribute('width',canvas.clientWidth/camera.scale);miniWindow.setAttribute('height',canvas.clientHeight/camera.scale);
  }
}
function buildMini() {
  const mini=$('mini');mini.replaceChildren();miniBounds=Lineage.bounds(visibleIds,points);
  if(!miniBounds)return;
  const b=miniBounds;mini.setAttribute('viewBox',`${b.x} ${b.y} ${b.w} ${b.h}`);
  for(const p of points.values()) mini.append(svgEl('rect',{x:p.x-90,y:p.y-20,width:180,height:40,class:'mini-node'}));
  miniWindow=svgEl('rect',{class:'mini-window','vector-effect':'non-scaling-stroke'});mini.append(miniWindow);
}
$('mini').addEventListener('click',e=>{if(!graph)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform($('mini').getScreenCTM().inverse());camera.x=canvas.clientWidth/2-p.x*camera.scale;camera.y=canvas.clientHeight/2-p.y*camera.scale;transform();});
$('mini').addEventListener('keydown',e=>{if(e.key==='Enter')fit();});

let suppressClick=false, pointers=new Map(), drag=null, pinch=null;
canvas.addEventListener('pointerdown',e=>{
  if(e.target.closest('.map-tools,.minimap')||e.button>0)return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  // Capture on the hit node so a simple pointer release retains its click target.
  e.target.setPointerCapture(e.pointerId);
  suppressClick=false;drag={x:e.clientX,y:e.clientY,panX:camera.x,panY:camera.y};
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:camera.scale};}
});
canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2&&pinch){const [a,b]=[...pointers.values()],r=canvas.getBoundingClientRect();zoom(pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);suppressClick=true;return;}
  if(!drag)return;
  if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4){suppressClick=true;canvas.classList.add('dragging');}
  camera.x=drag.panX+e.clientX-drag.x;camera.y=drag.panY+e.clientY-drag.y;transform();
});
function endPointer(e){pointers.delete(e.pointerId);pinch=null;drag=null;canvas.classList.remove('dragging');}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('wheel',e=>{
  if(!graph)return;e.preventDefault();
  if(e.ctrlKey||e.metaKey){const r=canvas.getBoundingClientRect();zoom(camera.scale*Math.exp(-e.deltaY*.008),e.clientX-r.left,e.clientY-r.top);}
  else{camera.x-=e.deltaX+(e.shiftKey?e.deltaY:0);camera.y-=e.shiftKey?0:e.deltaY;transform();}
},{passive:false});
canvas.addEventListener('keydown',e=>{
  if(e.target.closest('button'))return;
  if(e.key==='+'||e.key==='=')zoom(camera.scale*1.2);
  else if(e.key==='-')zoom(camera.scale/1.2);
  else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();camera.x+=e.key==='ArrowLeft'?80:e.key==='ArrowRight'?-80:0;camera.y+=e.key==='ArrowUp'?80:e.key==='ArrowDown'?-80:0;transform();}
});
new ResizeObserver(()=>transform()).observe(canvas);

$('isolate').addEventListener('click',()=>{if(selected===null)return;isolated=!isolated;render();center(selected,.95);});
$('fit-selection').addEventListener('click',()=>{if(family)fit(family.all);});
$('clear').addEventListener('click',reset);
$('recent').addEventListener('click',recent);
$('overview').addEventListener('click',()=>{reset();fit();$('view-title').textContent='The full lineage';});
$('zoom-in').addEventListener('click',()=>zoom(camera.scale*1.25));
$('zoom-out').addEventListener('click',()=>zoom(camera.scale/1.25));
$('zoom-level').addEventListener('click',()=>zoom(1));
$('fit').addEventListener('click',()=>fit());
$('import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{load(JSON.parse(await file.text()));}catch(error){$('status').textContent=error.message;}finally{e.target.value='';}});
 $('empty-import').addEventListener('click',()=>$('import').click());
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const light = theme === 'light';
  $('theme-toggle').setAttribute('aria-pressed', String(light));
  $('theme-toggle').title = `Switch to ${light ? 'dark' : 'light'} mode`;
  $('theme-toggle').innerHTML = `${light ? '◐' : '☼'} <span>${light ? 'Dark mode' : 'Light mode'}</span>`;
}
$('theme-toggle').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
$('feedback-open').addEventListener('click',()=>{
  if(selected !== null) $('feedback-member').value = feedbackTokenByNode.get(selected);
  $('feedback-dialog').showModal();
});
$('feedback-close').addEventListener('click',()=>$('feedback-dialog').close());
$('feedback-cancel').addEventListener('click',()=>$('feedback-dialog').close());
$('feedback-form').addEventListener('submit',e=>{
  e.preventDefault();
  const member = index.byId.get(feedbackRefs.get($('feedback-member').value));
  const relatedId = feedbackRefs.get($('feedback-related').value);
  const related = relatedId ? index.byId.get(relatedId) : null;
  const note = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    kind: $('feedback-type').value,
    point: Lineage.anonymousReference(graph.nodes,member.id),
    related_point: related ? Lineage.anonymousReference(graph.nodes,related.id) : null,
    proposal: $('feedback-note').value.trim(),
    source_or_context: $('feedback-source').value.trim() || null,
    status: 'needs_historian_review'
  };
  const blob = new Blob([JSON.stringify(note, null, 2) + '\n'], {type:'application/json'});
  const url = URL.createObjectURL(blob), link = el('a', {href:url, download:`lineage-review-${new Date().toISOString().slice(0,10)}.json`});
  document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('feedback-dialog').close();
  $('status').textContent = 'Anonymous review note downloaded; it has not changed the lineage.';
});
try {if(globalThis.LINEAGE_DATA)load(globalThis.LINEAGE_DATA);else{$('empty').hidden=false;$('status').textContent='No graph loaded · your data stays on this device.';}}
catch(error){$('empty').hidden=false;$('status').textContent=error.message;}
