# Lambda Lineage

A browser-based lineage explorer with historical family positions, fixed pledge-class
rows, pan/zoom, a minimap, exact roster search, and isolated ancestor/descendant views.
The framework has no runtime dependencies or external assets.

## Lineage source and local build

```sh
.venv/bin/python scripts/prepare_viewer.py
open public/index.html
```

The canonical, sanitized source is [`source/lineage.json`](source/lineage.json). It
contains stable opaque IDs, display names, pledge-class chapter, President/Sensei
roles, layout positions, and relationship edges only. It intentionally excludes
roster numbers and all contact, location, career, and other directory fields. The
preparation script validates this file and writes the viewer's preloaded graph to
ignored `public/data/`; these generated files must not be committed.

## Contribute a lineage update

Edit `source/lineage.json` in a fork and open a pull request. Keep existing member IDs
unchanged; add new members with UUIDv4 IDs. The chapter array defines the chronological
class order. An edge's `source` is the Big Bro and its `target` is the Little. Multiple
Big Bros are supported. Do not add fields to the schema or include roster numbers or
directory information.

Set up the local environment and validate/build the source:

```sh
python3 -m venv .venv
.venv/bin/python scripts/prepare_viewer.py
node --test tests/lineage.test.cjs
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
node --check public/app.js
```

The validator rejects unknown fields, duplicate/invalid IDs, invalid roles, missing
edge endpoints, duplicate/self relationships, and edges within the same chapter or
backwards in chapter order. PR CI runs the same validation and tests. Once merged, the
sanitized source is what the hosted viewer deploys; no private reconciliation files
are needed by contributors.

## Data model

Source IDs are stable UUIDv4 values. Viewer IDs are temporary array positions and are
regenerated from the source graph during each local build. Viewer edges point from Big
Bro (`source`) to Little (`target`). Layout positions preserve the historical diagram
and newer family corridors; spacing is scaled to prevent card overlap. Isolated mode
keeps those same horizontal family corridors while hiding unrelated members, avoiding
the crossings caused by independently centering each row.
Long edges are fanned at shared card ports and routed around intermediate cards; in
the densest cases, they use an outside gutter. Historian-review edges are dashed,
highlighted, and filterable.

Selecting a point traces its connected ancestors and descendants separately, without
including siblings and cousins.

The historical workbook/TikZ reconciliation inputs remain local-only and are not
required to edit or validate the public source graph.

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

## Cloudflare Workers hosting

```sh
.venv/bin/python scripts/prepare_viewer.py
.venv/bin/python scripts/package_site.py
cd dist/deploy/stanford-lambdas-lineage
npm install
npm run deploy
```

This creates an isolated deploy folder with Cloudflare's Vite plugin and static assets.
The preloaded graph is generated from the tracked sanitized source. Do not deploy the
repository root or local reconciliation files. Deployment response headers prohibit
network connections from the application.

### Automatic deployment after merge

Connect the `stanfordlambdas/lineage` repository to the existing Worker in Cloudflare:
**Workers & Pages → Worker → Settings → Builds → Connect**. Select `main` as the
production branch and the repository root as the project root. Configure:

- Build command: `python scripts/prepare_viewer.py && python scripts/package_site.py && cd dist/deploy/stanford-lambdas-lineage && npm install && npm run build`
- Deploy command: `cd dist/deploy/stanford-lambdas-lineage && npm run deploy`

Cloudflare handles the deployment credential through Workers Builds; do not add a
Cloudflare token to this repository. Merges to `main` will rebuild the graph and deploy
it to the existing `workers.dev` hostname. See [Cloudflare Workers Builds GitHub
integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/).

The Worker is served on its `workers.dev` hostname. Custom-domain setup is separate;
first confirm the chapter still controls its registrar account before changing DNS.

## Verification

`node --test tests/lineage.test.cjs` and `.venv/bin/python -m unittest discover -s tests`
check viewer operations and source validation. `node --check public/app.js` checks
viewer syntax.

