// Smoke test for the Tauri frontend (runs in plain Node, no Rust needed).
// Checks: full UI present, JS parses, Tauri shim present, every
// window.exchangeDesktop.* call has a Rust command counterpart.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

const htmlPath = path.join(__dirname, "..", "tauri-client", "src", "index.html");
const mainRsPath = path.join(__dirname, "..", "tauri-client", "src-tauri", "src", "main.rs");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");
if (html.length < 30000) fail(`index.html looks truncated (${html.length} chars)`);
console.log(`index.html size OK (${html.length} chars)`);

const requiredIds = ["runPrompt", "testModel", "saveModel", "runDoctor", "startMcp", "prompt"];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) fail(`missing button/field id="${id}"`);
}
console.log("required element IDs OK");
for (const id of ["logView", "clearLogs", "exportLogs"]) {
  if (!html.includes(`id="${id}"`)) console.log(`note: optional id="${id}" not present (handled by null-guards)`);
}

if (!html.includes("initTauriBridge") || !html.includes("window.__TAURI__")) {
  fail("Tauri bridge shim missing");
}
console.log("Tauri shim OK");

if (html.includes("});});")) fail("leftover syntax bug '});});' still present");
console.log("syntax-bug fix OK");

// Extract inline scripts and run node --check on each
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length === 0) fail("no inline scripts found");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tauri-check-"));
scripts.forEach((src, i) => {
  const f = path.join(tmp, `inline-${i}.js`);
  fs.writeFileSync(f, src);
  try {
    execSync(`node --check "${f}"`, { stdio: "pipe" });
  } catch (e) {
    fail(`inline script ${i} failed node --check: ${e.message}`);
  }
});
console.log(`node --check OK (${scripts.length} inline scripts)`);

// Every exchangeDesktop.* method used by the UI must exist in main.rs
// (onLog is optional/event-based and intentionally null in the Tauri shim)
const used = new Set(
  [...html.matchAll(/exchangeDesktop\.(\w+)/g)].map((m) => m[1]).filter((m) => m !== "onLog")
);
const rs = fs.readFileSync(mainRsPath, "utf8");
const snake = (camel) => camel.replace(/([A-Z])/g, (c) => "_" + c.toLowerCase());
const missing = [...used].filter((m) => !rs.includes(`fn ${snake(m)}`));
if (missing.length) fail(`Rust commands missing for: ${missing.join(", ")}`);
console.log(`bridge coverage OK (${[...used].join(", ")})`);
for (const needle of ['id="outResult"', "renderResult", "needsConfirm", "humanize", "Raw JSON"]) {
  if (!html.includes(needle)) fail(`missing renderer piece: ${needle}`);
}
console.log("friendly-card pieces OK");

for (const needle of [
  "--bg-base",
  'html:not(.dark) [class*="bg-[#0b0f19]"]',
  'html:not(.dark) [class*="text-slate-200"]',
]) {
  if (!html.includes(needle)) fail(`missing light-theme override: ${needle}`);
}
console.log("light-theme overrides OK");

const healthSection = html.match(/<section[^>]*data-view="health"[\s\S]*?<\/section>/)?.[0] || "";
if (!healthSection.includes('id="healthCards"')) fail("Health cards grid missing");
if ((healthSection.match(/data-health-card/g) || []).length !== 4) fail("Health tab must contain exactly four cards");
for (const needle of ['id="psConnStatus"', 'id="ewsConnStatus"', 'id="ewsEndpoint"', 'id="quickPrompts"']) {
  const expected = needle !== 'id="quickPrompts"';
  if (healthSection.includes(needle) !== expected) fail(`unexpected Health card state for ${needle}`);
}
if (!html.includes('id="themeToggle"')) fail('missing theme toggle');
if (!html.includes("refreshBackendLabels")) fail("backend labels must refresh from MCP config (refreshBackendLabels missing)");
if (!html.includes('id="serverPill">mail.contoso.com')) fail("server pill default must be the generic placeholder (live value comes from backend:info)");
if (html.indexOf('id="themeToggle"') > html.indexOf('id="serverPill"')) fail("theme toggle must sit left of the server status pill");
const headerHtml = html.match(/<header[\s\S]*?<\/header>/)?.[0] || "";
if (!headerHtml.includes('id="themeToggle"') || !headerHtml.includes('id="serverPill"')) fail("header must contain both theme toggle and server status");
if (!html.includes('html:not(.dark) [class*="bg-[#111726]"]')) fail("missing light override for output cards");
if (!html.includes('h-full min-h-0 overflow-y-auto" data-view="home"')) fail("home prompt column must be scrollable (Run/Clear clipped otherwise)");
if (!html.includes('auto-rows-fr')) fail("main grid must use auto-rows-fr so rows stay viewport-bound (unbounded rows clip Run/Clear)");
if (!html.includes('max-height: 719px')) fail("missing short-viewport fallback (page must scroll when window is short)");
console.log("Health layout and light surfaces OK");

// Tauri command registration check
if (!rs.includes("invoke_handler") || !rs.includes("ask_exchange")) {
  fail("invoke_handler registration missing");
}
console.log("invoke_handler registration OK");

console.log("PASS: Tauri frontend check");
