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
let camera = {x: 0, y: 0, scale: 0.85}, miniBounds, miniWindow;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function load(raw) {
  const parsed = Lineage.normalize(raw); // Validate before replacing a working graph.
  graph = parsed; index = Lineage.model(graph);
  selected = null; isolated = false; family = null; activeClass = null;
  $('role').value = 'all'; $('search').value = ''; $('results').hidden = true;
  $('details').hidden = true; $('close-details').hidden = true; $('empty').hidden = true;
  $('summary').textContent = `${graph.nodes.length} brothers · ${new Set(graph.nodes.map(n => n.rank)).size} pledge classes`;
  $('classes').replaceChildren();
  const classes = [...new Map(graph.nodes.map(n => [n.rank, n.class_name])).entries()].sort((a,b) => a[0]-b[0]);
  for (const [rank, label] of classes) {
    const button = el('button', {'data-rank': rank});
    button.append(el('span', {class:'class-number'}, String(rank + 1).padStart(2, '0')), el('span', {}, label), el('span', {class:'class-count'}, graph.nodes.filter(n => n.rank === rank).length));
    button.addEventListener('click', () => jumpClass(rank)); $('classes').append(button);
  }
  render();
  // Start with readable recent cards; the minimap provides context for the full map.
  recent();
}

function render() {
  visibleIds = isolated && family ? family.all : new Set(graph.nodes.map(n => n.id));
  const visible = graph.nodes.filter(n => visibleIds.has(n.id));
  points = Lineage.layout(visible, isolated);
  world.replaceChildren(); nodeElements = new Map(); edgeElements = [];
  const defs = svgEl('defs'), grad = svgEl('linearGradient', {id:'both'});
  grad.append(svgEl('stop', {offset:'50%', 'stop-color':'#466ec3'}), svgEl('stop', {offset:'50%', 'stop-color':'#bf6470'})); defs.append(grad); world.append(defs);
  const bounds = Lineage.bounds(visibleIds, points);
  const rows = [...new Map(visible.map(n => [n.rank,n.class_name])).entries()].sort((a,b)=>a[0]-b[0]);
  for (const [rank, name] of rows) {
    const y = 90 + rank * Lineage.ROW;
    if (rank % 2 === 0) world.append(svgEl('rect', {x:0,y:y-Lineage.ROW/2,width:bounds.x+bounds.w+60,height:Lineage.ROW,class:'band'}));
    // Labels repeat across the poster, so a class remains identifiable while panning.
    for (let x = 30; x < bounds.x + bounds.w; x += 1100) world.append(svgEl('text', {x,y:y-49,class:'class-label'}, name.toUpperCase()));
  }
  const edgeLayer=svgEl('g'), nodeLayer=svgEl('g'); world.append(edgeLayer,nodeLayer);
  for (const edge of graph.edges) {
    const a=points.get(edge.source), b=points.get(edge.target);
    if(!a || !b) continue;
    const y1=a.y+Lineage.CARD_H/2, y2=b.y-Lineage.CARD_H/2;
    const middle=(y1+y2)/2;
    const path=svgEl('path', {d:`M${a.x},${y1} C${a.x},${middle} ${b.x},${middle} ${b.x},${y2}`,class:`edge ${edge.era==='post-2019'?'recent':''} ${edge.review_required?'review':''}`, 'data-source':edge.source,'data-target':edge.target});
    edgeLayer.append(path); edgeElements.push({edge,path});
  }
  for (const n of visible) {
    const p=points.get(n.id), role=n.roles.length===2?'both':(n.roles[0]||'');
    const unknown=n.rank>=31&&!index.parents.get(n.id).length;
    const g=svgEl('g',{class:`node ${role} ${unknown?'unknown':''}`,transform:`translate(${p.x-Lineage.CARD_W/2},${p.y-Lineage.CARD_H/2})`,'data-id':n.id,tabindex:'0',role:'button','aria-label':`#${n.id} ${n.name}, ${n.class_name}`});
    g.append(svgEl('title',{},`#${n.id} ${n.name} · ${n.class_name}`),svgEl('rect',{width:Lineage.CARD_W,height:Lineage.CARD_H,class:'card'}),svgEl('rect',{x:0,y:12,width:3,height:48,rx:1.5,class:'accent'}));
    g.append(svgEl('text',{x:15,y:20,class:'meta'},`#${n.id}  ·  ${unknown?'BIG BRO UNKNOWN':n.roles.length?n.roles.join(' + ').toUpperCase():'BROTHER'}`));
    const name = n.display_name.replace(/\*/g,'');
    const words=name.split(' '), lines=[''];
    for (const word of words) {
      const last=lines.length-1;
      if ((lines[last]+' '+word).trim().length>23 && lines[last]) lines.push(word);
      else lines[last]=(lines[last]+' '+word).trim();
    }
    lines.slice(0,2).forEach((line,i)=>g.append(svgEl('text',{x:15,y:lines.length>1?41+i*17:48,class:'name'},line.length>25?line.slice(0,24)+'…':line)));
    g.addEventListener('click',()=>{ if(!suppressClick) select(n.id); });
    g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();select(n.id);}});
    nodeLayer.append(g); nodeElements.set(n.id,g);
  }
  buildMini(); updateStyles(); transform();
}

function roleMatch(n) {
  const role=$('role').value;
  return role==='all' || (role==='missing' ? n.rank>=31&&!index.parents.get(n.id).length : n.roles.includes(role));
}
function updateStyles() {
  const query=$('search').value.trim();
  for (const [id,g] of nodeElements) {
    const n=index.byId.get(id), filtered=roleMatch(n)&&(activeClass===null||n.rank===activeClass)&&(!query||Lineage.matches(n,query));
    g.classList.toggle('selected',id===selected);
    g.classList.toggle('related',!!family?.all.has(id));
    g.classList.toggle('dim',family?!family.all.has(id):!filtered);
    g.classList.toggle('matched',!family&&filtered&&(!!query||$('role').value!=='all'||activeClass!==null));
  }
  for (const {edge,path} of edgeElements) {
    const chain=family?.all.has(edge.source)&&family?.all.has(edge.target);
    path.classList.toggle('active',!!chain);
    path.classList.toggle('dim',family?!chain:!!query||$('role').value!=='all'||activeClass!==null);
  }
  $('isolate').disabled=selected===null; $('fit-selection').disabled=selected===null;
  $('isolate').setAttribute('aria-pressed',String(isolated));
  $('isolate').textContent=isolated?'Show full map':'Isolate lineage';
  document.querySelectorAll('#classes button').forEach(b=>{b.classList.toggle('active',Number(b.dataset.rank)===activeClass);b.setAttribute('aria-pressed',String(Number(b.dataset.rank)===activeClass));});
}

function select(id) {
  selected=id; family=index.family(id); activeClass=null;
  $('search').value=''; $('results').hidden=true; $('role').value='all';
  $('details').hidden=false; $('close-details').hidden=false;
  if(isolated) render(); else updateStyles();
  const n=index.byId.get(id);
  $('view-title').textContent=`${n.display_name}’s lineage`;
  $('status').textContent=`${family.ancestors.size} ancestors · ${family.descendants.size} descendants · #${id} ${n.class_name}`;
  profile(n); center(id,Math.max(camera.scale,.9));
}

function profile(n) {
  const box=$('profile');box.replaceChildren();
  box.append(el('span',{class:'eyebrow'},`ROSTER #${n.id} / ${n.class_name.toUpperCase()}`),el('h2',{},n.name));
  const badges=el('div',{class:'badges'});
  n.roles.forEach(role=>badges.append(el('span',{class:'badge'},role==='president'?'Chapter President':'Sensei')));box.append(badges);
  const counts=el('div',{class:'counts'});
  [[family.ancestors.size,'Ancestors'],[family.descendants.size,'Descendants']].forEach(([num,label])=>{const c=el('div');c.append(el('strong',{},num),el('span',{},label));counts.append(c);});box.append(counts);
  const focus=el('button',{class:'inspector-action'},'Explore just this lineage');focus.addEventListener('click',()=>{isolated=true;render();center(n.id,.95);});box.append(focus);
  function links(ids, title, collapsible=false) {
    const section=el(collapsible?'details':'section');
    section.append(el(collapsible?'summary':'h3',{},title));
    if(!ids.length) section.append(el('p',{},'No recorded relationship.'));
    for(const id of ids) {
      const other=index.byId.get(id), button=el('button',{class:'member-link'},other.display_name);
      button.append(el('small',{},`#${id} · ${other.class_name}`));button.addEventListener('click',()=>select(id));section.append(button);
    }
    box.append(section);
  }
  links(index.parents.get(n.id),'Big Bros');links(index.children.get(n.id),'Littles');
  if(graph.edges.some(e=>e.target===n.id&&e.review_required)) box.append(el('p',{class:'warning'},'The screenshot skips a column before this connection. A historian should confirm whether this is a direct Big/Little relationship. The dashed edge marks that uncertainty.'));
  if(n.rank>1&&!index.parents.get(n.id).length) box.append(el('p',{class:'warning'},'No Big Bro is recorded for this member. This is a gap in the sources, not a confirmed founding ancestor.'));
  links([...family.ancestors].sort((a,b)=>a-b),'All ancestors',true);
  links([...family.descendants].sort((a,b)=>a-b),'All descendants',true);
  const eras=new Set(graph.edges.filter(e=>e.source===n.id||e.target===n.id).map(e=>e.era));
  box.append(el('p',{class:'provenance'},'Sources: '+[...(eras.has('pre-2019')?['2019 lineage diagram']:[]),...(eras.has('post-2019')?['post-2019 screenshot']:[])].join(' · ')+'. Missing links remain unfilled.'));
}

function reset() {
  if(!graph)return;
  selected=null;family=null;isolated=false;activeClass=null;
  $('search').value='';$('results').hidden=true;$('role').value='all';$('details').hidden=true;$('close-details').hidden=true;
  $('view-title').textContent='Explore the connections';
  $('status').textContent=`${graph.nodes.length} members · ${graph.edges.length} recorded relationships`;
  render();
}
function jumpClass(rank) {
  reset();activeClass=rank;updateStyles();
  const group=graph.nodes.filter(n=>n.rank===rank).sort((a,b)=>a.x-b.x);
  $('view-title').textContent=group[0].class_name+' class';
  $('status').textContent=`${group.length} members · Select a card or search to trace a lineage`;
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

$('search').addEventListener('input',()=>{
  if(!graph)return;
  const q=$('search').value.trim(), results=$('results');results.replaceChildren();results.hidden=!q;
  if(!q){updateStyles();return;}
  const matched=graph.nodes.filter(n=>Lineage.matches(n,q)&&roleMatch(n));
  for(const n of matched.slice(0,20)) {const b=el('button',{class:'result'},n.name);b.append(el('span',{},`#${n.id} · ${n.class_name}`));b.addEventListener('click',()=>select(n.id));results.append(b);}
  if(!matched.length)results.append(el('p',{},'No matching members. Try a name or roster number.'));
  else if(matched.length>20)results.append(el('p',{},`${matched.length} matches · keep typing to narrow the list`));
  updateStyles();
});
$('search').addEventListener('keydown',e=>{if(e.key==='Escape')$('results').hidden=true;else if(e.key==='Enter')$('results').querySelector('button')?.click();else if(e.key==='ArrowDown'){e.preventDefault();$('results').querySelector('button')?.focus();}});
document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))$('results').hidden=true;});
$('role').addEventListener('change',()=>{
  if(!graph)return;
  const role=$('role').value;reset();$('role').value=role;updateStyles();
  const matches=graph.nodes.filter(roleMatch);$('status').textContent=`${matches.length} matching members`;
  if(matches.length) {center(matches[0].id,.9);$('view-title').textContent=role==='all'?'Everyone':$('role').selectedOptions[0].textContent;}
});
$('isolate').addEventListener('click',()=>{if(selected===null)return;isolated=!isolated;render();center(selected,.95);});
$('fit-selection').addEventListener('click',()=>{if(family)fit(family.all);});
$('close-details').addEventListener('click',()=>{$('details').hidden=true;$('close-details').hidden=true;});
$('clear').addEventListener('click',reset);
$('recent').addEventListener('click',recent);
$('overview').addEventListener('click',()=>{reset();fit();$('view-title').textContent='The full lineage';});
$('zoom-in').addEventListener('click',()=>zoom(camera.scale*1.25));
$('zoom-out').addEventListener('click',()=>zoom(camera.scale/1.25));
$('zoom-level').addEventListener('click',()=>zoom(1));
$('fit').addEventListener('click',()=>fit());
$('import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{load(JSON.parse(await file.text()));}catch(error){$('status').textContent=error.message;}finally{e.target.value='';}});
try {if(globalThis.LINEAGE_DATA)load(globalThis.LINEAGE_DATA);else{$('empty').hidden=false;$('status').textContent='Choose a local graph to begin.';}}
catch(error){$('empty').hidden=false;$('status').textContent=error.message;}
