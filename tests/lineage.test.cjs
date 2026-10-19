const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../public/lineage.js');
const node = (id, rank, x = 1) => ({id, rank, x, class_name:`Class ${rank}`});

test('lineage excludes siblings and unrelated descendants of ancestors', () => {
  const graph = L.normalize({nodes:[node(1,0),node(2,1),node(3,1),node(4,2),node(5,0)], edges:[{source:1,target:2},{source:1,target:3},{source:2,target:4},{source:5,target:2}]});
  const family=L.model(graph).family(2);
  assert.deepEqual([...family.ancestors].sort(),[1,5]);
  assert.deepEqual([...family.descendants],[4]);
  assert.equal(family.all.has(3),false);
});
test('import replaces source IDs with anonymous runtime IDs', () => {
  const graph=L.normalize({nodes:[{id:902,name:'Private Name',display_name:'Nickname',class_name:'Class A',rank:0,x:3,roles:['president']}],edges:[]});
  assert.deepEqual(graph.nodes[0],{id:1,class_name:'Class A',rank:0,x:3});
});
test('invalid relationships and duplicate roster IDs fail import', () => {
  assert.throws(()=>L.normalize({nodes:[node(1,0),node(1,1)],edges:[]}));
  assert.throws(()=>L.normalize({nodes:[node(1,0),node(2,1)],edges:[{source:2,target:1}]}));
  assert.throws(()=>L.normalize({nodes:[node(1,0)],edges:[{source:1,target:99}]}));
});
test('file import drops identity, leadership, and directory fields', () => {
  const graph=L.normalize({nodes:[{Roster_Number:1,Full_Name:'Example Member',Display_Name:'Example',Class:'Example',Class_Order:1,Layout_X:2,Is_President:true,Is_Sensei:true,Primary_Email:'private@example.test'}],edges:[]});
  assert.deepEqual(graph.nodes[0],{id:1,class_name:'Example',rank:0,x:2});
});
test('layout preserves class rows, original order, and minimum card spacing', () => {
  const nodes=[node(1,0,1),node(2,0,1.1),node(3,0,1.1),node(4,1,3)];
  for(const compact of [false,true]) {
    const points=L.layout(nodes,compact);
    assert.equal(points.get(1).y,points.get(2).y);
    assert.equal(points.get(4).y-points.get(1).y,L.ROW);
    assert.ok(points.get(2).x-points.get(1).x>=L.CARD_W+39);
    assert.ok(points.get(3).x-points.get(2).x>=L.CARD_W+39);
  }
});
test('isolated layout preserves horizontal family corridors across pledge classes', () => {
  const nodes=[node(1,0,2),node(2,1,12),node(3,2,2)];
  const points=L.layout(nodes,true);
  assert.equal(points.get(1).x,points.get(3).x);
  assert.notEqual(points.get(1).x,points.get(2).x);
});
test('anonymous review references contain only chapter and left-to-right point', () => {
  const nodes=[node(41,2,4),node(42,2,1),node(43,2,9)];
  assert.deepEqual(L.anonymousReference(nodes,41),{chapter:'Class 2',point:2});
  assert.deepEqual(Object.keys(L.anonymousReference(nodes,42)).sort(),['chapter','point']);
});
test('public viewer renders no member identity or profile UI', () => {
  const app=fs.readFileSync('public/app.js','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(app,/svgEl\('circle',\{r:6,class:'point'\}\)/);
  assert.doesNotMatch(app,/n\.(?:name|display_name|roles)|Roster_Number|data-source|data-target/);
  assert.doesNotMatch(html,/Find a member|Member details|#profile|Show members/);
});
