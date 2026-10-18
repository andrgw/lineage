# Lambda Lineage

A local, privacy-safe lineage viewer generated from the supplied alumni spreadsheets,
2019 TikZ lineage source, and post-2019 screenshot.

## Build

```sh
.venv/bin/python scripts/build_lineage.py
open public/index.html
```

The script reads the four source artifacts from `~/Downloads` by default. Override any
location with its corresponding `--*-path` option. It writes private merged directory
data to `data/private/` and local-only viewer data to `public/data/`. Both directories
are gitignored, so this repository never contains member data.

## Data model

Members are identified by roster number, never name. Each relationship is an edge from
`big_bro_id` to `little_bro_id` and retains a source (`tex`, `stanford_big_bro`, or
`screenshot_2026`) so disputed or incomplete links remain auditable.

## View locally

After building the data, serve `public/` rather than opening the HTML file directly:

```sh
.venv/bin/python -m http.server 8000 --directory public
```

Then visit <http://localhost:8000>. The viewer loads local JSON only; it makes no
network calls and is not configured for deployment.

