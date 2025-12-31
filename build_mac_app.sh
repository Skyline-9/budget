#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The macOS build pipeline is implemented in Rust under:
#   macos-app/build_tool
# This script is kept as a thin compatibility wrapper so you can still run:
#   ./build_mac_app.sh

TOOL_DIR="$ROOT/macos-app/build_tool"
BIN_RELEASE="$TOOL_DIR/target/release/build_mac_app"
BIN_PREBUILT="$TOOL_DIR/bin/build_mac_app"

# Prefer pre-built binary (no Rust toolchain required), fall back to building
if [[ -x "$BIN_PREBUILT" ]]; then
  exec "$BIN_PREBUILT" --root "$ROOT" "$@"
elif [[ -x "$BIN_RELEASE" ]]; then
  exec "$BIN_RELEASE" --root "$ROOT" "$@"
elif command -v cargo >/dev/null 2>&1; then
  echo "==> Building Rust build tool (first time)..."
  (cd "$TOOL_DIR" && cargo build --release)
  exec "$BIN_RELEASE" --root "$ROOT" "$@"
else
  echo "ERROR: No pre-built binary found and cargo not installed."
  echo "Please install Rust from https://rustup.rs/ or download a pre-built release."
  exit 1
fi

