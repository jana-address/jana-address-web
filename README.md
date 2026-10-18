# jana-address-web

The web UI of Jana Address (React 19.2 + Vite 8.2, served by nginx 1.30).

## Running

The UI runs together with the API from the `jana-address-api` repository, where this
repository is the submodule `web/`:

```bash
git clone --recurse-submodules https://github.com/jana-address/jana-address-api.git
cd jana-address-api
docker compose up
```

The UI is on http://localhost:3000.

For development, on its own (Node 24: ≥ 24.11 and < 25, `engine-strict` is on; the Dockerfile uses
`node:24.22.0-alpine`):

```bash
npm ci
npm run dev   # http://localhost:5173, /api is proxied to http://localhost:8080
```

## Building

```bash
npm run build   # tsc --noEmit && vite build, output in dist/
```

`docker compose up` in `jana-address-api` builds the image from the `Dockerfile` in this
repository: `npm run build` in a Node stage, then `dist/` is served by nginx 1.30.

## Screens

- **Check one line.** The address is parsed as you type. Fragments of the line are
  highlighted by field, and every field has a source badge: "from text", "directory" or "none"
  (in Russian «из строки», «справочник», «нет»). A restored field shows how it was found: by
  house, by neighbouring houses, by street, by living area, by settlement or by district.
- **File upload.** A JSON array `[{"id", "raw_address"}, …]` in the jury format, or NDJSON
  (`.jsonl`). Drag the file in or choose it. The file goes to `POST /api/v1/parse/batch`
  unchanged.
- **Results table.** Totals: all records, confident, to review, reviewed by hand, parse time.
  The filters "Review" / "Unparsed" / "Corrected" turn on by themselves if there are
  uncertain records. There is search by line, city and street, the sort "Least confident
  first" and the "All fields" switch.
- **Manual correction.** A side panel with highlighting, the suggestion and all 11 fields.
  - "Save and next" (Enter) goes to the next unreviewed record in table order. There are also
    "Save", "Accept as is" and "Reset".
  - Esc and a click outside the panel ask before losing unsaved edits.
  - Edits are stored in the browser and restored when the same file is uploaded again.
- **Download.** "Download JSON" gives all records with the edits; "Corrections only" gives only
  the reviewed ones.
- Languages kk / ru / en, light and dark theme.

## File formats

| Direction | Format |
|---|---|
| Upload | JSON array `[{"id", "raw_address"}, …]` (jury format) or NDJSON (`.jsonl`) |
| Download | JSON array; every record has 14 keys in the order of the case brief. `id` and `raw_address` are copied from the API response byte for byte; reviewed records have `confidence` = 1 |

## Offline

The Inter font is bundled locally (`@fontsource-variable/inter`), and the CSP allows only
the page's own origin: the UI makes no external requests and works without a network.
