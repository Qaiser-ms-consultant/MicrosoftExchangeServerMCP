#!/usr/bin/env bash
# Build the Tauri desktop client (macOS/Linux).
# Requires: Node.js, Rust stable toolchain, and `npm run build` output (dist/server.js).
set -e
echo "==> Building MCP server (dist/server.js)..."
npm run build
echo "==> Building Tauri app..."
pushd tauri-client/src-tauri
cargo tauri build
popd
echo "Done. Installer bundle is under tauri-client/src-tauri/target/release/bundle/"
