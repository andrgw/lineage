# Lambda Lineage

A browser-based lineage explorer with historical family positions, fixed pledge-class
rows, pan/zoom, a minimap, exact roster search, and isolated ancestor/descendant views.
The framework has no runtime dependencies or external assets.

## Build

```sh
.venv/bin/python scripts/prepare_viewer.py
open public/index.html
```

The importer reads `~/Downloads/lfe_stanford_lineage_graph.json`, or a path supplied
with `--graph-path`. It retains only the fields needed to render the graph and discards
contact details and other directory fields. Output is written to ignored `public/data/`.
The viewer displays member names, relationship edges, pledge-class chapters, and
President/Sensei role styling. Roster numbers, member counts, contact details, and
profiles are not shown. If ignored local `public/data/graph.js` exists, the graph
preloads when the page opens; otherwise choose **Open graph** to read one into browser
memory. Imported files are not uploaded or saved in browser storage.

To rebuild the original workbook reconciliation in this checkout, run
`.venv/bin/python scripts/build_lineage.py`. This requires the original workbooks and
TikZ file in Downloads, pandas/openpyxl in `.venv`, and the ignored
`data/private/reconciliation.json` (screenshot transcription and alias mappings).
The builder refreshes the viewer from the supplied reconciled graph when available;
it stops if that graph's relationships differ from the workbook reconciliation.

## Data model

Members are matched by roster number while building the local graph, then use temporary
runtime IDs in the viewer. Viewer edges point from Big Bro
(`source`) to Little (`target`). The supplied graph's `Layout_X` values preserve the
historical diagram and newer family corridors; spacing is scaled to prevent card
overlap. Isolated mode keeps those same horizontal family corridors while hiding
unrelated members, avoiding the crossings caused by independently centering each row.
Long edges are fanned at shared card ports and routed around intermediate cards; in
the densest cases, they use an outside gutter. Historian-review edges are dashed,
highlighted, and filterable.

Selecting a point traces its connected ancestors and descendants separately, without
including siblings and cousins.

The previous local root commit included screenshot names in the builder. Current
source moves them into ignored local configuration. Do not publish repository history
without removing that historical data first. No remote is configured.

## View locally

Optional HTTP preview, bound to this computer only:

```sh
.venv/bin/python -m http.server 8000 --bind 127.0.0.1 --directory public
```

Then visit <http://127.0.0.1:8000>. Select a member to highlight their
connections; **Isolate lineage** reduces the map to those ancestors and descendants. Drag to pan,
scroll to move, use Ctrl/Command + scroll or the buttons to zoom. **Full overview**
fits the whole map; the percentage button returns to readable 100% size. The minimap
can be clicked to navigate. Nodes and relationship buttons support keyboard selection.

## Cloudflare Workers hosting, with source data kept local

```sh
.venv/bin/python scripts/prepare_viewer.py
.venv/bin/python scripts/package_site.py
cd dist/deploy-*/stanford-lambdas-lineage
npm install
npm run deploy
```

This creates an isolated deploy folder with Cloudflare's Vite plugin and static assets.
The preloaded graph is generated locally from ignored source data and contains only
names, chapters, relationships, layout, and President/Sensei styling. Roster numbers,
contact/profile fields, and workbook/TikZ sources are not included. The sanitized graph
becomes public when deployed. Do not deploy the repository root or `data/private/`.
Deployment response headers prohibit network connections from the application.

The Worker is served on its `workers.dev` hostname. Custom-domain setup is separate;
first confirm the chapter still controls its registrar account before changing DNS.

## Verification

`node --test tests/lineage.test.cjs` checks graph traversal, layout spacing, import
validation, and data allowlisting. `node --check public/app.js` checks viewer syntax.

