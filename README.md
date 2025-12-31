<p align="center">
  <img src="webapp/public/favicon/favicon-256.png" alt="Budget" width="120" height="120" />
</p>

<h1 align="center">Budget</h1>

<p align="center">
  <strong>Local-first budgeting that just works.</strong><br/>
  React frontend • FastAPI backend • Native macOS app<br/>
  All your data stays local in CSV files with automatic backups.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-building-the-macos-app">Build macOS App</a> •
  <a href="#-development">Development</a>
</p>

---

## 🚀 Quick Start

### Run the macOS App (Easiest)

```bash
./build_mac_app.sh
open dist/Budget.app
```

**First time?** The script auto-builds everything. Just make sure you have:
- Xcode Command Line Tools: `xcode-select --install`
- Node.js, Python 3.11+, and [uv](https://github.com/astral-sh/uv)

### Or Run in Browser (Development)

```bash
# Terminal 1: Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload

# Terminal 2: Frontend
cd webapp
npm install
VITE_API_MODE=real npm run dev
# Open http://localhost:5173
```

---

## ✨ Features

- 💰 **Transaction management** with categories and budgets
- 📊 **Visual dashboard** with spending trends and charts
- 🔍 **Fast search** (Cmd+K) across all transactions
- ⌨️ **Keyboard shortcuts** (N to add transaction)
- 💾 **Local CSV storage** with automatic backups
- ☁️ **Optional Google Drive sync** (coming soon)
- 🎨 **Modern UI** with dark mode and smooth animations

---

## 📁 Project Structure

```
budget/
├── backend/          Python FastAPI + CSV storage
├── webapp/           React + TypeScript + Vite
├── macos-app/        Swift wrapper + Rust build tool
│   ├── build_tool/   Fast incremental build system
│   └── Sources/      Native macOS window & menus
└── dist/             Built .app bundles
```

---

## 🏗 Building the macOS App

### One Command Build

```bash
./build_mac_app.sh
```

Creates `dist/Budget.app` with everything bundled inside.

### Build Options

```bash
CLEAN=1 ./build_mac_app.sh              # Full rebuild
DEV_MODE=1 ./build_mac_app.sh           # Fast frontend-only (UI dev)
VERBOSE=1 ./build_mac_app.sh            # Show detailed output
DRY_RUN=1 ./build_mac_app.sh            # Preview without building

# Customize
APP_NAME="MyBudget" APP_VERSION="2.0" ./build_mac_app.sh

# Code sign
CODESIGN_IDENTITY="Developer ID..." ./build_mac_app.sh
```

### How It Works

The build system (written in Rust) is **smart and fast**:

1. ⚡ **Parallel builds** — Frontend, backend, and Swift compile simultaneously
2. 🎯 **Incremental** — Only rebuilds what changed (timestamp-based)
3. 🚀 **Optimized PyInstaller** — ~40% faster with smart exclusions
4. 🎨 **Auto icon generation** — Flattens PNG transparency for macOS
5. 📦 **No Rust required** — Prebuilt universal binary included

**Performance:** ~40% faster clean builds, ~80% faster incremental vs bash scripts.

---

## 💻 Development

### Quick Webapp Iteration

```bash
cd webapp
npm run dev  # Mock API mode (default)
```

Open `http://localhost:5173` — hot reload enabled.

### Full Stack Development

```bash
# Terminal 1: Backend with auto-reload
cd backend && uv run uvicorn app.main:app --reload

# Terminal 2: Frontend with real API
cd webapp && VITE_API_MODE=real npm run dev
```

### Fast macOS App Iteration

```bash
DEV_MODE=1 ./build_mac_app.sh  # Rebuilds frontend only
open dist/Budget.app           # Manually restart
```

### Keyboard Shortcuts

- **Cmd/Ctrl+K** — Global search
- **N** — Add transaction
- **Esc** — Close dialogs

---

## 📊 Data Storage

All data lives in `backend/data/`:

```
backend/data/
├── transactions.csv     Your transaction data
├── categories.csv       Category definitions
├── budgets.csv          Budget allocations
├── config.json          Schema version
└── backups/             Timestamped backups (every write)
```

**No database required.** CSV files are human-readable and version-control friendly.

---

## 🛠 Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Query
- **Backend:** FastAPI, Python 3.11+, Pandas, uvicorn
- **Build:** Rust (orchestrator), PyInstaller, SwiftPM
- **macOS App:** Swift, WKWebView

---

## 🐛 Troubleshooting

**App icon doesn't show:**
```bash
killall Finder && killall Dock
```

**Build fails:**
```bash
CLEAN=1 VERBOSE=1 ./build_mac_app.sh
```

**Need Rust toolchain:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

---

## 📝 License

MIT

---

<p align="center">
  Made with ❤️ for local-first budgeting
</p>
