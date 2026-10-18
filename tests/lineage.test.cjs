const {test} = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/lineage.js');
const node = (id, rank, x = 1) => ({id, rank, x, name:`Member ${id}`, display_name:`Member ${id}`, class_name:`Class ${rank}`, roles:[]});

test('lineage excludes siblings and unrelated descendants of ancestors', () => {
  const graph = L.normalize({nodes:[node(1,0),node(2,1),node(3,1),node(4,2),node(5,0)], edges:[{source:1,target:2},{source:1,target:3},{source:2,target:4},{source:5,target:2}]});
  const family=L.model(graph).family(2);
  assert.deepEqual([...family.ancestors].sort(),[1,5]);
  assert.deepEqual([...family.descendants],[4]);
  assert.equal(family.all.has(3),false);
});
test('numeric search is exact and duplicate names remain distinguishable by ID', () => {
  const n=node(123,1);n.name='Shared Name';
  assert.equal(L.matches(n,'#123'),true);assert.equal(L.matches(n,'123'),true);
  assert.equal(L.matches(n,'23'),false);assert.equal(L.matches(n,'shared'),true);
});
test('invalid relationships and duplicate roster IDs fail import', () => {
  assert.throws(()=>L.normalize({nodes:[node(1,0),node(1,1)],edges:[]}));
  assert.throws(()=>L.normalize({nodes:[node(1,0),node(2,1)],edges:[{source:2,target:1}]}));
  assert.throws(()=>L.normalize({nodes:[node(1,0)],edges:[{source:1,target:99}]}));
});
test('file import drops directory fields and preserves both leadership roles', () => {
  const graph=L.normalize({nodes:[{Roster_Number:1,Full_Name:'Example Member',Display_Name:'Example',Class:'Example',Class_Order:1,Layout_X:2,Is_President:true,Is_Sensei:true,Primary_Email:'private@example.test'}],edges:[]});
  assert.deepEqual(graph.nodes[0].roles,['president','sensei']);
  assert.equal('Primary_Email' in graph.nodes[0],false);
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
