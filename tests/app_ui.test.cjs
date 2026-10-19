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
