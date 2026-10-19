const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

test('viewer preloads graph and exposes accessible member search and lineage sidebar', () => {
  assert.match(html, /<script src="data\/graph\.js"><\/script>/);
  assert.match(html, /id="member-search"[^>]*type="search"/);
  assert.match(html, /id="search-results"/);
  assert.match(html, /id="details"[^>]*aria-label="Selected member lineage"/);
  assert.match(app, /function searchMembers\(\)/);
  assert.match(app, /function renderDetails\(member\)/);
  for (const section of ['Bigs', 'Littles', 'Ancestors', 'Descendants']) {
    assert.match(app, new RegExp(`addSection\\('${section}'`));
  }
  assert.match(app, /center\(id,Math\.max\(camera\.scale,\.9\)\)/);
});

test('lineage sidebar does not render roster identifiers or directory fields', () => {
  assert.doesNotMatch(app, /Roster_Number|Primary_Email|Current_Location|LinkedIn|Phone/);
  assert.doesNotMatch(html, /suggestion|correction/i);
});

test('camera updates run once per frame as a CSS transform on the map', () => {
  assert.match(app, /requestAnimationFrame\(applyCamera\)/);
  assert.match(app, /graphSvg\.style\.transform=/);
  assert.doesNotMatch(app, /world\.setAttribute\('transform'/);
});

test('map cards avoid per-node filters and group opacity', () => {
  const css = fs.readFileSync('public/styles.css', 'utf8');
  assert.doesNotMatch(css, /\.card[^}]*filter:/);
  assert.doesNotMatch(css, /\.node\.dim\s*\{[^}]*\bopacity:/);
});

test('legend entries and controls keep their names and order', () => {
  const legend = [...html.match(/<div class="legend">(.*?)<\/div>/)[1].matchAll(/<\/i>([^<]+)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(legend, ['Brother', 'President', 'Sensei', 'President &amp; Sensei', 'Big–Little relationship']);
  const labels = ['Stanford Lambdas', 'THETA CHAPTER / LINEAGE EXPLORER', 'Edit lineage', 'Open graph', 'Light mode',
    'THETA CHAPTER', 'Lineage.', 'Full overview', 'Recent classes', 'PLEDGE CLASSES', 'Reset', 'LINEAGE MAP',
    'Isolate lineage', 'Fit lineage', 'Fit view', 'YOU ARE HERE', 'LINEAGE DETAILS', 'Explore a lineage'];
  const positions = labels.map(label => html.indexOf(`>${label}<`));
  labels.forEach((label, i) => assert.ok(positions[i] > 0, `${label} is missing`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});
