import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { createInterface } from "readline";
import { join, resolve, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { spawn, ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hasWriteIntent, routeQuery } from "./queryRouter.js";
import type { RouteResult } from "./queryRouter.js";
import { loadConfig } from "../config.js";
import { parse as parseYaml } from "yaml";
import { buildSummaryMessages, buildToolPickerMessages, chatComplete, isAiProvider, parseToolSelection } from "./modelClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let win: BrowserWindow | null = null;
let mcpProc: ChildProcess | null = null;

function getUserDataPath() {
  return resolve(homedir(), ".config/exchange-desktop");
}

function ensureConfig(): string {
  // Desktop settings file — model/provider keys ONLY. The MCP server uses its
  // own tool config (./config.yaml + env) for Exchange auth, so we seed an
  // empty JSON object here and never copy the Exchange template into it.
  const dir = getUserDataPath();
  mkdirSync(dir, { recursive: true });
  const p = resolve(dir, "config.yaml");
  if (!existsSync(p)) writeFileSync(p, "{}", "utf-8");
  return p;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    title: "Exchange Agentic Admin — AI Powered Exchange Operations Intelligence Platform",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    show: false,
  });
  win.once("ready-to-show", () => win?.show());
  // In dev, load vite dev server; in prod, load dist or fallback to src
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else {
    const prodPath = join(__dirname, "renderer/index.html");
    const srcPath = resolve(process.cwd(), "src/desktop/renderer/index.html");
    win.loadFile(existsSync(prodPath) ? prodPath : srcPath);
  }
}

// Auto‑start MCP when the app is ready.
// NOTE: no --config flag on purpose — the MCP server resolves its own tool
// config (./config.yaml + env) which holds the Exchange connection + auth.
// The desktop config file carries model/provider settings only.
function startMcpInternal(){
  if (mcpProc) { try { mcpProc.kill(); } catch {} }
  const configPath = ensureConfig();
  const serverPath = resolve(process.cwd(), "dist/server.js");
  mcpProc = spawn("node", [serverPath], { stdio: ["pipe","pipe","pipe"] });
  mcpProc.stderr?.on("data", (d) => win?.webContents.send("mcp:log", d.toString()));
  mcpProc.stdout?.on("data", (d) => win?.webContents.send("mcp:log", d.toString()));
  attachRpcListener();
  mcpInitialized = false;
  return { pid: mcpProc.pid, configPath };
}

app.whenReady().then(async () => {
  createWindow();
  const startInfo = await startMcpInternal();
  console.log('MCP auto‑started', startInfo);
});


app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// IPC: config
ipcMain.handle("config:load", async () => {
  const p = ensureConfig();
  try { return readFileSync(p, "utf-8"); } catch { return ""; }
});
ipcMain.handle("config:save", async (_e, content: string) => {
  const p = ensureConfig();
  writeFileSync(p, content, "utf-8");
  return { ok: true, path: p };
});
ipcMain.handle("config:path", async () => ensureConfig());
// IPC: backend Exchange identity — resolved with the same loader the MCP
// server uses (./config.yaml + env), so labels always match the live backend.
// Returns endpoints only, never credentials.
ipcMain.handle("backend:info", async () => {
  try {
    const cfg = loadConfig();
    const ep = (cfg.exchange.endpoint || "").replace(/\/$/, "");
    return {
      endpoint: cfg.exchange.endpoint,
      powershellUri: cfg.exchange.powershellUri,
      ewsUrl: `${ep}${cfg.exchange.ewsPath}`,
      insecure: !!cfg.exchange.insecure,
    };
  } catch {
    return { endpoint: "", powershellUri: "", ewsUrl: "", insecure: false };
  }
});

// IPC: model providers — 14 (12 + OpenCode + Ollama Cloud), file-based ${API_KEY}
const PROVIDERS = ["OpenAI","Anthropic","Google","Azure OpenAI","AWS Bedrock","Ollama","Ollama Cloud","Mistral","Cohere","Groq","Together","OpenRouter","Custom","OpenCode"];
ipcMain.handle("providers:list", async () => PROVIDERS);
ipcMain.handle("providers:test", async (_e, { provider, apiKey, baseUrl }: { provider: string; apiKey: string; baseUrl?: string }) => {
  // Model test: GET /v1/models with Bearer — file-based key, no keytar
  const urlMap: Record<string, string> = {
    OpenAI: "https://api.openai.com/v1/models",
    Anthropic: "https://api.anthropic.com/v1/models",
    Google: "https://generativelanguage.googleapis.com/v1/models",
    "Azure OpenAI": "https://api.openai.azure.com/openai/models?api-version=2023-05-15",
    "AWS Bedrock": "https://bedrock-runtime.us-east-1.amazonaws.com/models",
    Ollama: "http://localhost:11434/api/tags",
    "Ollama Cloud": "https://api.ollama.com/v1/models",
    Mistral: "https://api.mistral.ai/v1/models",
    Cohere: "https://api.cohere.ai/v1/models",
    Groq: "https://api.groqu.com/openai/v1/models",
    Together: "https://api.together.xyz/v1/models",
    OpenRouter: "https://openrouter.ai/api/v1/models",
    Custom: "https://api.openai.com/v1/models",
    OpenCode: "http://localhost:4096/models", // OpenCode local gateway if available, falls back to OpenAI
  };
  const url = baseUrl || urlMap[provider] || "https://api.openai.com/v1/models";
  try {
    const headers: Record<string,string> = {};
    if (provider === "Anthropic") headers["x-api-key"] = apiKey;
    else if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(url, { headers } as any);
    const json: any = await res.json().catch(() => ({}));
    
    // Extract models from various API response formats
    let models: any[] = [];
    if (Array.isArray(json.data)) models = json.data;
    else if (Array.isArray(json.models)) models = json.models;
    else if (Array.isArray(json)) models = json;
    else if (json && typeof json === 'object') {
      // Try common nested patterns
      for (const key of Object.keys(json)) {
        if (Array.isArray(json[key])) { models = json[key]; break; }
      }
    }
    
    // Normalize model objects to have id/name
    const normalizedModels = models.slice(0, 50).map((m: any) => ({
      id: m.id || m.name || m.model || m.id || JSON.stringify(m),
      name: m.name || m.id || m.model || m.id || JSON.stringify(m)
    }));
    
    return { ok: res.ok, status: res.status, models: normalizedModels, raw: JSON.stringify(json).slice(0,600) };
  } catch (e: any) { return { ok: false, error: e.message }; }
});

// JSON‑RPC client for the MCP child process
const pending = new Map<number, { resolve: (v:any)=>void; reject: (e:any)=>void }>();
let rpcId = 1;
function mcpRpc(method:string, params:any){
  if(!mcpProc?.stdin || !mcpProc?.stdout){ throw new Error("MCP not started"); }
  const id = rpcId++;
  const request = JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n";
  mcpProc.stdin.write(request);
  return new Promise<any>((resolve,reject)=>{ pending.set(id,{resolve,reject}); });
}
// MCP servers require an initialize handshake before tools/call.
// Lazily initialized on first use (and reset whenever the child restarts).
let mcpInitialized = false;
async function ensureMcpInitialized(){
  if(mcpInitialized) return;
  await mcpRpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "exchange-desktop", version: "0.1.0" },
  });
  // Initialized notification gets no response — fire and forget
  if(mcpProc?.stdin) mcpProc.stdin.write(JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})+"\n");
  mcpInitialized = true;
}
// Listen to stdout lines and resolve pending promises
let rl: any;
function attachRpcListener(){
  if(!mcpProc?.stdout) return;
  rl = createInterface({ input: mcpProc.stdout as any, crlfDelay: Infinity });
  rl.on("line", (line:string)=>{
    try{ const msg = JSON.parse(line); if(msg.id && pending.has(msg.id)){
        const {resolve,reject}=pending.get(msg.id)!; pending.delete(msg.id);
        if(msg.error) reject(msg.error); else resolve(msg.result);
      } }
      catch{ /* non‑JSON log line – ignore */ }
  });
}
// Ensure listener is attached when MCP starts
ipcMain.handle("mcp:start", async () => {
  if (mcpProc) { try { mcpProc.kill(); } catch {} }
  const configPath = ensureConfig();
  const serverPath = resolve(process.cwd(), "dist/server.js");
  // No --config: MCP uses its own tool config for Exchange auth (see above)
  mcpProc = spawn("node", [serverPath], { stdio: ["pipe","pipe","pipe"] });
  mcpProc.stderr?.on("data", (d) => win?.webContents.send("mcp:log", d.toString()));
  mcpProc.stdout?.on("data", (d) => win?.webContents.send("mcp:log", d.toString()));
  // Attach JSON‑RPC listener after spawning
  attachRpcListener();
  mcpInitialized = false;
  return { pid: mcpProc.pid, configPath };
});
ipcMain.handle("mcp:stop", async () => { try { mcpProc?.kill(); } catch {} mcpProc = null; mcpInitialized = false; return { ok:true }; });

ipcMain.handle("mcp:isRunning", async () => !!mcpProc);
const WRITE_REQUIRED_ARGS: Record<string, string[]> = {
  "database.mount": ["identity"],
  "database.dismount": ["identity"],
  "exchange_retry_queue": ["identity"],
  "exchange_suspend_queue": ["identity"],
  "server.restart_service": ["name"],
  "mailbox.new_move_request": ["identity", "targetDatabase"],
  "mailbox.set_quota": ["identity"],
  "exchange_remove_mailbox": ["identity"],
  "exchange_set_mailbox": ["identity"],
  "exchange_create_mailbox": ["name"],
  "mailbox.remove_permission": ["identity", "user"],
  "exchange_remove_transport_rule": ["identity"],
  "exchange_set_transport_rule": ["identity"],
  "group.new": ["name"],
  "group.add_member": ["identity", "member"],
  "mailflow.resume_queue": ["identity"],
  "mailflow.set_receive_connector": ["identity"],
  "mailflow.set_send_connector": ["identity"],
  "database.new_repair_request": ["database"],
  "mailbox.add_permission": ["identity", "user"],
};

// Model settings live in the desktop config file (provider/apiKey/baseUrl/model/systemPrompt).
function readModelConfig(): { provider: string; apiKey: string; baseUrl?: string; model: string; systemPrompt?: string } | null {
  try {
    const raw = readFileSync(ensureConfig(), "utf-8").trim();
    if (!raw || raw === "{}") return null;
    const cfg = raw.startsWith("{") ? JSON.parse(raw) : parseYaml(raw);
    if (cfg?.provider && cfg?.apiKey && cfg?.model) {
      return { provider: cfg.provider, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model, systemPrompt: cfg.systemPrompt };
    }
  } catch {}
  return null;
}

// AI fallback: let the configured model pick an MCP tool for prompts the
// keyword router cannot classify. Returns null to keep today's help card.
async function tryAiRoute(prompt: string, modelCfg: { provider: string; apiKey: string; baseUrl?: string; model: string; systemPrompt?: string }): Promise<{ tool: string; args: any; write: boolean } | null> {
  try {
    await ensureMcpInitialized();
    const list = await mcpRpc("tools/list", {});
    const names: string[] = (((list as any)?.tools ?? []) as any[]).map((t: any) => String(t?.name ?? "")).filter((n) => n);
    if (!names.length) return null;
    const picked = parseToolSelection((await chatComplete(modelCfg, buildToolPickerMessages(prompt, names, modelCfg.systemPrompt))).text, names);
    if (!picked) return null;
    return { tool: picked.tool, args: picked.args, write: picked.tool in WRITE_REQUIRED_ARGS };
  } catch (e) { console.error("AI routing failed, falling back to help", e); return null; }
}

ipcMain.handle("exchange:ask", async (_e, payload: { prompt: string; confirmed?: boolean; tool?: string; args?: any }) => {
  console.log("exchange:ask invoked", payload);
  const prompt = payload.prompt ?? "";
  if(!prompt.trim()) throw new Error("Type a prompt first");
  // AI mode: a configured OpenAI-compatible model interprets unknown prompts
  // and narrates results. Without it, pure keyword routing runs as before.
  const modelCfg = readModelConfig();
  const aiMode = !!modelCfg && isAiProvider(modelCfg.provider);
  await ensureMcpInitialized();

  // Explicit tool+args after in-card Confirm skips re-routing
  let tool: string; let args: any; let write = false;
  if(payload.tool){
    tool = payload.tool; args = payload.args ?? {};
    write = true;
  } else {
    const route = routeQuery(prompt);
    // AI fallback: model interprets prompts the keyword router cannot classify.
    // It also reinterprets loose write phrasing that matched a read-only route
    // (e.g. typos/synonyms the keywords missed) across the full tool catalog.
    let aiRouted: { tool: string; args: any; write: boolean } | null = null;
    if (aiMode && modelCfg) {
      if ("help" in route) aiRouted = await tryAiRoute(prompt, modelCfg);
      else if (!route.write && hasWriteIntent(prompt)) aiRouted = await tryAiRoute(prompt, modelCfg);
    }
    if ("help" in route && !aiRouted) return { prompt, tool: "help", result: {
      message: "I can run Exchange queries. Try one of these:",
      examples: ["what version of exchange do i have", "show delayed queues", "server health report", "database whitespace and growth", "certificates expiring soon", "explain bounce 5.7.1", "trace messages from admin@contoso.com", "tell me everything about admin@contoso.com", "dismount database DB01", "what tools do you offer"],
      ...(modelCfg && !isAiProvider(modelCfg.provider) ? { note: "Tip: AI answers need an OpenAI-compatible provider (OpenAI, Groq, Together, OpenRouter, Mistral, Ollama, Custom)." } : {}),
    },
    ...((aiMode && modelCfg) ? { aiNote: "Model could not interpret this request — keyword help below." } : {}) };
    if (aiRouted) { tool = aiRouted.tool; args = aiRouted.args; write = aiRouted.write; }
    else { const r = route as RouteResult; tool = r.tool; args = r.args; write = r.write; }
  }

  // Safety gate for writes
  if(write && !payload.confirmed){
    const missing = (WRITE_REQUIRED_ARGS[tool] ?? []).filter((k) => args[k] === undefined || args[k] === "");
    if(missing.length) return { prompt, tool, args, needsInfo: true, missing, result: { message: `To run ${tool} I still need: ${missing.join(", ")}. Add it to your prompt and run again.` } };
    return { prompt, tool, args, needsConfirm: true, result: { message: `Ready to run ${tool}`, parameters: args } };
  }
  if(write) args = { ...args, confirm: true };

  // Live MCP capability catalog (protocol tools/list) for "what tools..." prompts.
  // Grouped summary up front, full tool names in a paged list + Raw JSON.
  if (tool === "__mcp_tools_list") {
    await ensureMcpInitialized();
    try {
      const list = await mcpRpc("tools/list", {});
      const names: string[] = (((list as any)?.tools ?? []) as any[]).map((t: any) => String(t?.name ?? "")).filter((n) => n);
      const counts: Record<string, number> = {};
      for (const n of names) { const g = n.split(/[._]/)[0] || "other"; counts[g] = (counts[g] ?? 0) + 1; }
      const groups = Object.entries(counts).map(([prefix, count]) => ({ prefix, count })).sort((a, b) => b.count - a.count);
      const psTrace = await readPsTrace();
      return { prompt, tool: "tools", result: { toolCount: names.length, groups, tools: [...names].sort() }, psTrace };
    } catch {
      return { prompt, tool: "help", result: { message: "I can run Exchange queries. Try one of these:", examples: ["what version of exchange do i have", "show delayed queues", "server health report", "database whitespace and growth", "certificates expiring soon", "explain bounce 5.7.1", "trace messages from admin@contoso.com", "tell me everything about admin@contoso.com", "dismount database DB01", "what tools do you offer"] } };
    }
  }

  // Per-query PowerShell trace: clear, run, then read (take semantics).
  // Failures are returned (not thrown) so the trace still reaches the card.
  async function readPsTrace(): Promise<any[]> {
    try {
      const t = await mcpRpc("tools/call", { name: "exchange_get_ps_trace", arguments: {} });
      const txt = (t as any)?.content?.[0]?.text;
      const parsed = txt ? JSON.parse(txt) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  await readPsTrace();
  let toolError: string | null = null;
  let result: any = null;
  try {
    result = await mcpRpc("tools/call", { name: tool, arguments: args });
  } catch (e: any) {
    toolError = e?.message || String(e);
  }
  const psTrace = await readPsTrace();
  if(toolError) return { prompt, tool, error: toolError, psTrace };
  const text = (result as any)?.content?.[0]?.text;
  if(!text) return { prompt, tool, args, result, psTrace };
  let data: any;
  try { data = JSON.parse(text); } catch { return { prompt, tool, args, result: text, psTrace }; }
  // AI narration: model answers from the executed result. Never fails the ask,
  // but a failed attempt is reported (aiNote) so the UI never looks AI-less.
  let aiAnswer: string | undefined; let aiUsage: { input: number; output: number } | undefined; let aiNote: string | undefined;
  if (aiMode && modelCfg && tool !== "tools" && tool !== "help") {
    try {
      const summary = await chatComplete(modelCfg, buildSummaryMessages(prompt, tool, JSON.stringify(data), modelCfg.systemPrompt));
      aiAnswer = summary.text; aiUsage = summary.usage;
    } catch (e: any) { console.error("AI answer failed, returning tool result only", e); aiNote = `AI unavailable (${e?.message || e}) — showing MCP result.`; }
  }
  return { prompt, tool, args, result: data, psTrace, ...(aiAnswer ? { aiAnswer, aiUsage } : aiNote ? { aiNote } : {}) };
});


// Dialog helpers
ipcMain.handle("dialog:openFile", async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ["openFile"], filters: [{ name: "Config", extensions: ["yaml","yml","json"] }] });
  return r.canceled ? null : r.filePaths[0];
});
