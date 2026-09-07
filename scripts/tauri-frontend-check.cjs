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
if (!html.includes('pgPrev') || !html.includes('__pagingTotal') || !html.includes('PAGE_SIZE = 20')) fail("missing output-card pager (20-per-page Prev/Next)");
for (const needle of ['🤖 AI Suite', '📑 Reports', 'data-quick="Executive summary"', 'data-quick="Predict database capacity exhaustion"', 'data-quick="Litigation hold report"']) {
  if (!html.includes(needle)) fail(`missing Helping Prompts piece: ${needle}`);
}
console.log("helping-prompts cards OK");
const cardOrder = ['🤖 AI Suite', '📑 Reports', '📊 Mailbox Intelligence', '💚 Health', '✉️ Mail Flow', '📬 Mailbox Operations', '🗄️ Databases', '🔒 Security', '🖥️ Environment'];
const cardPos = cardOrder.map((t) => html.indexOf(t));
if (cardPos.some((p) => p < 0)) fail("a Helping Prompts card is missing from the usability order");
for (let i = 1; i < cardPos.length; i++) {
  if (cardPos[i] <= cardPos[i - 1]) fail(`Helping Prompts cards out of order before ${cardOrder[i]}`);
}
if (!html.includes('data-quick="Connectivity test"')) fail("missing Mailbox Operations prompts");
console.log("prompts order (AI first) OK");
if (!html.includes('id="overallHealth"') || !html.includes("updateOverallHealth")) fail("Health tab needs an overall status pill (overallHealth/updateOverallHealth)");
console.log("overall health pill OK");
// mcp:stop must null the handle even if kill() throws, or icons stay green
const mainTs = fs.readFileSync(path.join(__dirname, "..", "src", "desktop", "main.ts"), "utf8");
if (!mainTs.includes("mcpProc?.kill")) fail("mcp:stop must guard kill() so the handle is always cleared");
console.log("stop-clears-handle OK");
if (!html.includes('id="quickPromptButtons"') || !html.includes('initQuickPrompts')) fail("Home quick picks must render 10 fresh prompts every launch (quickPromptButtons/initQuickPrompts missing)");
console.log("quick-picks rotation OK");
if (!html.includes("initRealMailboxSamples") || !html.includes("first mailbox")) fail("prompts must sample a live backend mailbox (initRealMailboxSamples missing)");
console.log("live-mailbox sampling OK");
if (!html.includes('data-quick="what tools do you offer"')) fail("missing capability prompt button (what tools do you offer)");
const electronMain = fs.readFileSync(path.join(__dirname, "..", "src", "desktop", "main.ts"), "utf8");
if (!electronMain.includes('__mcp_tools_list') || !electronMain.includes('mcpRpc("tools/list"')) fail("Electron must answer capability prompts via tools/list");
const tauriMain = fs.readFileSync(mainRsPath, "utf8");
if (!tauriMain.includes("__mcp_tools_list") || !tauriMain.includes('mcp_rpc("tools/list"')) fail("Tauri must answer capability prompts via tools/list");
console.log("capability catalog path OK");
if (!html.includes("js-yaml@4.1.0/+esm") || !html.includes("__yamlReady")) fail("YAML must load via guarded dynamic import (static UMD import throws a JS Error banner)");
if (html.includes("import YAML from 'https://cdn.jsdelivr.net/npm/js-yaml")) fail("stale static YAML import still present");
console.log("yaml import OK");
if (!html.includes("parseSimpleYaml")) fail("config restore needs a CDN-independent YAML fallback (parseSimpleYaml)");
console.log("config restore fallback OK");
if ((html.match(/id="tokenCount"/g) || []).length !== 1) fail("tokenCount id must be unique (prompt chip only)");
for (const needle of ['id="tokenFooter"', "updateOpTokens", "updatePromptTokens", "gpt-tokenizer", "__tokLibs"]) {
  if (!html.includes(needle)) fail(`missing token counter piece: ${needle}`);
}
console.log("token counters OK");
if (!html.includes("renderAiAnswer") || !html.includes("res.aiAnswer")) fail("AI answer card wiring missing (renderAiAnswer)");
const desktopMain = fs.readFileSync(path.join(__dirname, "..", "src", "desktop", "main.ts"), "utf8");
if (!desktopMain.includes("chatComplete") || !desktopMain.includes("tryAiRoute") || !desktopMain.includes("aiAnswer")) fail("Electron must route unknown prompts and narrate via the configured model");
console.log("AI answers path OK");
if (!html.includes("renderAiNote") || !html.includes("res.aiNote") || !html.includes("AI answers ON")) fail("AI visibility wiring missing (renderAiNote/aiNote/ON indicator)");
if (!desktopMain.includes("aiNote")) fail("Electron must surface AI failures visibly (aiNote)");
console.log("AI visibility OK");
console.log("Health layout and light surfaces OK");

// Tauri command registration check
if (!rs.includes("invoke_handler") || !rs.includes("ask_exchange")) {
  fail("invoke_handler registration missing");
}
console.log("invoke_handler registration OK");

console.log("PASS: Tauri frontend check");
