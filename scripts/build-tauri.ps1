# Build the Tauri desktop client (Windows).
# Requires: Node.js, Rust stable toolchain, and `npm run build` output (dist/server.js).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-tauri.ps1
$ErrorActionPreference = "Stop"

Write-Host "==> Building MCP server (dist/server.js)..."
npm run build

if (-not (Test-Path "tauri-client/src-tauri/tauri.conf.json")) {
  throw "Missing tauri-client/src-tauri/tauri.conf.json"
}

Write-Host "==> Installing Tauri CLI (one-time)..."
npx --yes @tauri-apps/cli@^1.5 --version

Write-Host "==> Building Tauri app..."
Push-Location tauri-client/src-tauri
cargo tauri build
Pop-Location

Write-Host "Done. Installer bundle is under tauri-client/src-tauri/target/release/bundle/"
