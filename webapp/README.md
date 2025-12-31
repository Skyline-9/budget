## Budget Webapp (Frontend)

Local-first budgeting UI built with **React + TypeScript + Vite**, **Tailwind**, Radix-based **shadcn-style components**, **TanStack Query/Table/Virtual**, and **ECharts**.

### Setup

```bash
cd webapp
npm install
npm run dev
```

The app runs on `http://localhost:5173`.

### API mode (mock vs real)

By default the app uses an **in-memory mock backend** (seeded with categories and ~50 transactions across multiple months).

- **Mock (default)**:

```bash
VITE_API_MODE=mock npm run dev
```

- **Real API** (calls `fetch`):

```bash
VITE_API_MODE=real VITE_API_BASE_URL=http://127.0.0.1:8123 npm run dev
```

### Configure API base URL

Set `VITE_API_BASE_URL` (defaults to `http://127.0.0.1:8123`):

```bash
VITE_API_BASE_URL=http://127.0.0.1:8123 npm run dev
```

### Keyboard shortcuts

- **Cmd/Ctrl+K**: focus global search
- **N**: open “Add Transaction” dialog

### URL-synced filters

Filters are stored in the URL query string and preserved when navigating via the sidebar/topbar:

- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`
- `q=...` (merchant/notes)
- `categoryId=cat1,cat2`
- `min=...` (dollars, absolute)
- `max=...` (dollars, absolute)


