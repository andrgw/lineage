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
with `--graph-path`. It retains only roster ID, names, class, roles, coordinates, and
relationships. Contact details and other directory fields are discarded. Output is
written to ignored `public/data/`. You can double-click `public/index.html`; no server
is required. Alternatively, choose **Open local graph** in the viewer to read a graph
file into browser memory. The file is not uploaded or saved in browser storage.

To rebuild the original workbook reconciliation in this checkout, run
`.venv/bin/python scripts/build_lineage.py`. This requires the original workbooks and
TikZ file in Downloads, pandas/openpyxl in `.venv`, and the ignored
`data/private/reconciliation.json` (screenshot transcription and alias mappings).
The builder refreshes the viewer from the supplied reconciled graph when available;
it stops if that graph's relationships differ from the workbook reconciliation.

## Data model

Members are identified by roster number, never name. Viewer edges point from Big Bro
(`source`) to Little (`target`). The supplied graph's `Layout_X` values preserve the
historical diagram and newer family corridors; spacing is scaled to prevent card
overlap. Isolated mode compacts each class while keeping class rows fixed.

Selecting a member traces ancestors and descendants separately, so it does not
accidentally include siblings and cousins. Missing Big Bro records remain unknown.
The screenshot's skipped-column relationships still require historian confirmation;
recorded edges are not proof that those gaps imply a direct relationship.

The previous local root commit included screenshot names in the builder. Current
source moves them into ignored local configuration. Do not publish repository history
without removing that historical data first. No remote is configured.

## View locally

Optional HTTP preview, bound to this computer only:

```sh
.venv/bin/python -m http.server 8000 --bind 127.0.0.1 --directory public
```

Then visit <http://127.0.0.1:8000>. Search and select a member to center their card;
**Isolate lineage** reduces the map to their ancestors and descendants. Drag to pan,
scroll to move, use Ctrl/Command + scroll or the buttons to zoom. **Full overview**
fits the whole map; the percentage button returns to readable 100% size. The minimap
can be clicked to navigate. Nodes and relationship buttons support keyboard selection.

## Cloudflare hosting, with data kept local

```sh
.venv/bin/python scripts/package_site.py
```

This creates a new `dist/framework-*` folder containing only an explicit list of
framework assets. Upload that folder to Cloudflare Pages, not `public/` (which contains
ignored local data). Visitors use **Open local graph** to view their own file in memory.
The deployed headers prohibit network connections from the application.

Cloudflare Pages supports [static HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
and [direct uploads](https://developers.cloudflare.com/pages/get-started/direct-upload/).
For a [custom domain](https://developers.cloudflare.com/pages/configuration/custom-domains/),
first confirm the chapter still controls its registrar account. The apex domain needs
a zone with Cloudflare nameservers; a subdomain can use a CNAME with the current DNS
provider. No domain, DNS, account, or hosting changes are made by these scripts.

## Verification

`node --test tests/lineage.test.cjs` checks graph traversal, layout spacing, import
validation, and data allowlisting. `node --check public/app.js` checks viewer syntax.

