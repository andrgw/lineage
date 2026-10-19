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
including siblings and cousins. Use **Suggest a correction** to download a review note
identified by member name, chapter, and left-to-right point, without roster numbers. It does not change the graph or
send the note anywhere; share it privately with a historian who can map the reference
to source records.

## Review or propose a lineage update

With the local graph loaded (automatically when prepared), select **Suggest a correction**. Choose the member(s) by name,
chapter, and left-to-right order, then describe the proposed change and its
source or context. The viewer downloads a `lineage-review-*.json` note to your device.
The app adds no roster number, role, contact, or profile details to the note. It does not change the graph
or send the note anywhere; share it with a chapter historian through a private channel.

A historian should verify each proposal against its cited source before changing the
private reconciliation inputs under ignored `data/private/` (or the authoritative
source workbook/TikZ file). Rebuild and review the graph locally before distributing
an updated graph file. The deployed site intentionally has no write endpoint or
member data, so it cannot accept edits directly.

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

## Cloudflare hosting, with data kept local

```sh
.venv/bin/python scripts/package_site.py
```

This creates a new `dist/framework-*` folder containing only an explicit list of
framework assets. Upload that folder to Cloudflare Pages, not `public/` (which contains
ignored local data). The public bundle intentionally has no lineage data; visitors use
**Open graph** to view a local file in memory. During local development, the ignored
graph preloads automatically.
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

