# Budget Backend (Local-first)

This is a **local-only** API server for the budgeting webapp. It stores canonical data on disk as **CSV** and provides **dashboard aggregations** plus optional **Google Drive sync**.

## Quickstart

### Prereqs
- Python **3.11+** (target **3.12**)
- [`uv`](https://github.com/astral-sh/uv)

### Install deps
```bash
cd backend
uv sync
```

### Run (local-only)
```bash
cd backend
uv run uvicorn app.main:app --host 127.0.0.1 --port 8123 --reload
```

- Health check: `GET http://127.0.0.1:8123/health`
- API base: `/api/*`

## Frontend integration (Vite)

To use the real backend from the existing `webapp/`:
- Set `VITE_API_MODE=real`
- Set `VITE_API_BASE_URL=http://127.0.0.1:8123/api`

## Data storage

Canonical storage lives in `backend/data/` (created at runtime if missing):
- `transactions.csv`
- `categories.csv`
- `budgets.csv` (scaffold)
- `config.json` (schema version)
- `backups/` (timestamped backups on every write)
- `.secrets/` (Google tokens + Drive sync state)

## Import (Cashew CSV)

This backend supports importing a **Cashew** transactions CSV export (one-time migration).

### Endpoint
- `POST /api/import/cashew` (multipart upload, file field name: `file`)

Query params:
- `commit` (default `false`): dry-run vs write to disk
- `skipDuplicates` (default `true`): best-effort de-dupe
- `preserveExtras` (default `false`): keep extra Cashew columns as additional `cashew_*` columns in `transactions.csv`

### Example (dry-run first)

```bash
curl -sS -X POST "http://127.0.0.1:8123/api/import/cashew?commit=false" \
  -F "file=@/absolute/path/to/cashew-transactions.csv"
```

### Example (commit)

```bash
curl -sS -X POST "http://127.0.0.1:8123/api/import/cashew?commit=true&skipDuplicates=true" \
  -F "file=@/absolute/path/to/cashew-transactions.csv"
```

Notes:
- The importer creates **categories first** (including parent/child from `category name` + `subcategory name`), then writes transactions that reference those category IDs.
- Income/expense is inferred from Cashew’s `income` column and/or sign of `amount`.
- On `commit=true`, the backend will create backups in `backend/data/backups/` before overwriting CSVs.

### Safety guarantees
- **Atomic writes**: write-to-temp then `os.replace()`
- **Backups**: prior file copied into `data/backups/` on every write
- **Single-writer lock**: `data/.lock` prevents multiple server instances from writing at once
- **Schema versioning/migrations**: `data/config.json` with minimal migrations for missing columns

## Configuration (.env)

The server loads environment variables (optionally from `backend/.env`).

Common settings:
- `HOST` (default `127.0.0.1`)
- `PORT` (default `8123`)
- `CORS_ORIGINS` (comma-separated)
- `DATA_DIR` (default `backend/data`)

### Google Drive sync
- `DRIVE_SYNC_MODE=folder|appdata` (default `folder`)
- `GOOGLE_OAUTH_CLIENT_SECRETS_PATH=/absolute/path/to/client_secret.json`
- `TOKEN_PATH=backend/data/.secrets/google_token.json`
- `DRIVE_STATE_PATH=backend/data/.secrets/drive_state.json`
- `FRONTEND_URL=http://127.0.0.1:5173` (used for OAuth redirect back to `/settings?drive=connected`)

## Notes on Google OAuth

This backend uses a local browser-based OAuth flow and redirects back to the SPA.
You must provide a valid OAuth client secrets JSON file via `GOOGLE_OAUTH_CLIENT_SECRETS_PATH`.

## Code quality (recommended)

This repo uses [`ruff`](https://docs.astral.sh/ruff/) for fast linting (and optional formatting).

From `backend/`:

```bash
# Lint
uv run ruff check .

# Auto-fix safe issues
uv run ruff check . --fix

# Format (Black-compatible)
uv run ruff format .
```
