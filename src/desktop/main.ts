import { app, BrowserWindow, ipcMain, dialog, safeStorage } from "electron";
import { createInterface } from "readline";
import { join, resolve, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { spawn, ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hasWriteIntent, helpExamplesFor, helpHintFor, routeQuery } from "./queryRouter.js";
import type { RouteResult } from "./queryRouter.js";
import { loadConfig } from "../config.js";
import { parse as parseYaml } from "yaml";
import { buildSummaryMessages, buildToolPickerMessages, chatComplete, isAiProvider, parseNoToolVerdict, parseToolSelection } from "./modelClient.js";
import { appendExchange, buildContextBlocks, clipText, fillMissingArgs, narrowCatalog, recallIdentities, type ExchangeRecord } from "./conversationContext.js";
import { checkForUpdates, checkZipUpdate, isGitCheckout, performUpdate, performZipUpdate } from "./updater.js";
import { enhancePrompt, enhancePromptWithModel, guardResult } from "./promptGuard.js";
import { getFollowUps } from "./followUps.js";
import {
  consumeRecoveryCode,
  generateEnrollment,
  hashPin,
  isLockedOut,
  recordFailure,
  resetFailures,
  verifyPin,
  verifyTotp,
  type PinStored,
} from "./appLock.js";

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

interface AppLockPersisted {
  enabled: boolean;
  secretEnc: string | null; // base64 safeStorage payload (OS keychain)
  secretPlain: string | null; // fallback only when safeStorage is unavailable
  weakStorage: boolean;
  recoveryHashes: string[];
  failedAttempts: number;
  lockoutUntil: number;
  pin: PinStored | null;
}

const APPLOCK_DEFAULTS: AppLockPersisted = {
  enabled: false,
  secretEnc: null,
  secretPlain: null,
  weakStorage: false,
  recoveryHashes: [],
  failedAttempts: 0,
  lockoutUntil: 0,
  pin: null,
};

// True from launch until a successful unlock. While gated the window stays
// hidden, the MCP child is not started, and exchange:ask refuses work.
let gateLocked = false;
let pendingEnrollment: { secretBase32: string; recoveryHashes: string[]; createdAt: number } | null = null;

function appLockPath(): string {
  return resolve(getUserDataPath(), "applock.json");
}

function loadAppLock(): AppLockPersisted {
  try {
    const raw = readFileSync(appLockPath(), "utf-8");
    return { ...APPLOCK_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...APPLOCK_DEFAULTS };
  }
}

function saveAppLock(s: AppLockPersisted): void {
  mkdirSync(getUserDataPath(), { recursive: true });
  writeFileSync(appLockPath(), JSON.stringify(s, null, 2), { encoding: "utf-8", mode: 0o600 });
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function readAppSecret(s: AppLockPersisted): string | null {
  if (s.secretEnc) {
    try {
      return safeStorage.decryptString(Buffer.from(s.secretEnc, "base64"));
    } catch {
      return null;
    }
  }
  return s.secretPlain;
}

function storeAppSecret(s: AppLockPersisted, secretBase32: string): AppLockPersisted {
  try {
    if (encryptionAvailable()) {
      return { ...s, secretEnc: safeStorage.encryptString(secretBase32).toString("base64"), secretPlain: null, weakStorage: false };
    }
  } catch {}
  return { ...s, secretEnc: null, secretPlain: secretBase32, weakStorage: true };
}

function isAppLockEnabled(): boolean {
  const s = loadAppLock();
  return s.enabled && !!readAppSecret(s);
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
  win.once("ready-to-show", () => { if (!gateLocked) win?.show(); });
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
  if (isAppLockEnabled()) {
    // App lock gate: window stays hidden and the MCP child (which holds
    // Exchange credentials) is NOT started until a successful unlock.
    gateLocked = true;
    console.log("App lock enabled — window hidden until unlock");
    return;
  }
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
// Self-update for source-checkout installs: compare/f pull the git clone the
// app was launched from, then relaunch into the rebuilt code.
ipcMain.handle("updater:check", async () => {
  if (isGitCheckout(process.cwd())) return { kind: "git", ...(await checkForUpdates(process.cwd())) };
  return checkZipUpdate(process.cwd());
});
ipcMain.handle("updater:update", async () => {
  if (isGitCheckout(process.cwd())) return performUpdate(process.cwd());
  return performZipUpdate(process.cwd());
});
ipcMain.handle("updater:restart", async () => {
  app.relaunch({ args: process.argv.slice(1) });
  app.quit();
  return { ok: true };
});
// App lock (launch MFA gate): TOTP + optional PIN + recovery codes.
// The TOTP secret is encrypted with the OS keychain (Electron safeStorage)
// whenever available; recovery codes are stored as SHA-256 hashes.
async function qrDataUrlFor(otpauthUrl: string): Promise<string | null> {
  try {
    const { default: QRCode } = await import("qrcode");
    return await QRCode.toDataURL(otpauthUrl);
  } catch {
    return null;
  }
}

ipcMain.handle("applock:status", async () => {
  const s = loadAppLock();
  const lockout = isLockedOut(s, Date.now());
  return {
    enabled: s.enabled,
    locked: gateLocked,
    lockout,
    attemptsLeft: Math.max(0, 5 - s.failedAttempts),
    remainingRecovery: s.recoveryHashes.length,
    weakStorage: s.weakStorage,
    hasPin: !!s.pin,
  };
});

ipcMain.handle("applock:enroll-start", async (_e, { label }: { label?: string }) => {
  const s = loadAppLock();
  // A locked app cannot re-enroll (that would bypass the gate).
  if (s.enabled && gateLocked) throw new Error("App is locked — unlock before re-enrolling.");
  const e = generateEnrollment(label || "exchange-desktop");
  pendingEnrollment = { secretBase32: e.secretBase32, recoveryHashes: e.recoveryHashes, createdAt: Date.now() };
  return {
    secretBase32: e.secretBase32,
    otpauthUrl: e.otpauthUrl,
    qrDataUrl: await qrDataUrlFor(e.otpauthUrl),
    recoveryCodes: e.recoveryCodes,
    weakStorage: !encryptionAvailable(),
  };
});

ipcMain.handle("applock:enroll-verify", async (_e, { token, pin }: { token: string; pin?: string }) => {
  if (!pendingEnrollment || Date.now() - pendingEnrollment.createdAt > 10 * 60_000) {
    pendingEnrollment = null;
    return { ok: false, error: "Enrollment expired — start again." };
  }
  if (!verifyTotp(pendingEnrollment.secretBase32, token)) {
    return { ok: false, error: "Code does not match — check the authenticator entry and try again." };
  }
  if (pin !== undefined && pin !== "" && !/^\d{4,12}$/.test(pin)) {
    return { ok: false, error: "PIN must be 4–12 digits." };
  }
  let s = loadAppLock();
  s = storeAppSecret(s, pendingEnrollment.secretBase32);
  s = {
    ...s,
    enabled: true,
    recoveryHashes: pendingEnrollment.recoveryHashes,
    pin: pin ? hashPin(pin) : null,
    ...resetFailures(),
  };
  saveAppLock(s);
  pendingEnrollment = null;
  return { ok: true, weakStorage: s.weakStorage };
});

async function unlockApp(): Promise<void> {
  gateLocked = false;
  win?.show();
  if (!mcpProc) {
    const startInfo = await startMcpInternal();
    console.log("MCP auto‑started after unlock", startInfo);
  }
}

ipcMain.handle("applock:unlock", async (_e, { code, pin }: { code: string; pin?: string }) => {
  const s = loadAppLock();
  if (!s.enabled) return { ok: true, notEnabled: true };
  if (!gateLocked) return { ok: true };
  const now = Date.now();
  const lockout = isLockedOut(s, now);
  if (lockout.locked) return { ok: false, locked: true, retryAfterMs: lockout.retryAfterMs };
  const secret = readAppSecret(s);
  if (!secret) return { ok: false, error: "No lock secret stored — re-enroll from Settings." };
  if (s.pin && !verifyPin(pin ?? "", s.pin)) {
    const next: AppLockPersisted = { ...s, ...recordFailure(s, now) };
    saveAppLock(next);
    const l = isLockedOut(next, now);
    return { ok: false, error: "Wrong PIN.", attemptsLeft: Math.max(0, 5 - next.failedAttempts), locked: l.locked, retryAfterMs: l.retryAfterMs };
  }
  if (verifyTotp(secret, code)) {
    saveAppLock({ ...s, ...resetFailures() });
    await unlockApp();
    return { ok: true };
  }
  const consumed = consumeRecoveryCode(s.recoveryHashes, code);
  if (consumed.ok) {
    saveAppLock({ ...s, recoveryHashes: consumed.remaining, ...resetFailures() });
    await unlockApp();
    return { ok: true, usedRecovery: true, remainingRecovery: consumed.remaining.length };
  }
  const next: AppLockPersisted = { ...s, ...recordFailure(s, now) };
  saveAppLock(next);
  const lockoutAfter = isLockedOut(next, now);
  return { ok: false, error: "Wrong code.", attemptsLeft: Math.max(0, 5 - next.failedAttempts), locked: lockoutAfter.locked, retryAfterMs: lockoutAfter.retryAfterMs };
});

ipcMain.handle("applock:disable", async (_e, { code }: { code: string }) => {
  if (gateLocked) throw new Error("App is locked — unlock before disabling the lock.");
  const s = loadAppLock();
  if (!s.enabled) return { ok: true };
  const secret = readAppSecret(s);
  const valid = (secret && verifyTotp(secret, code)) || consumeRecoveryCode(s.recoveryHashes, code).ok;
  if (!valid) return { ok: false, error: "Code does not match." };
  saveAppLock({ ...APPLOCK_DEFAULTS });
  return { ok: true };
});

ipcMain.handle("applock:recovery-regenerate", async (_e, { code }: { code: string }) => {
  if (gateLocked) throw new Error("App is locked — unlock first.");
  const s = loadAppLock();
  if (!s.enabled) return { ok: false, error: "App lock is not enabled." };
  const secret = readAppSecret(s);
  // Recovery codes prove nothing about authenticator possession — require TOTP.
  if (!secret || !verifyTotp(secret, code)) return { ok: false, error: "Enter a current authenticator code." };
  const fresh = generateEnrollment();
  saveAppLock({ ...s, recoveryHashes: fresh.recoveryHashes });
  return { ok: true, recoveryCodes: fresh.recoveryCodes };
});

// Prompt coach: validate + rewrite the AI Chat input before it runs.
// Pure rules first; an optional model-assisted rewrite is layered on top
// when a provider is configured, falling back to rules on any failure.
ipcMain.handle("prompt:validate", async (_e, { prompt }: { prompt: string }) => {
  return guardResult(prompt || "");
});
ipcMain.handle("prompt:enhance", async (_e, { prompt, useModel }: { prompt: string; useModel?: boolean }) => {
  const p = (prompt || "").trim();
  if (!p) return { enhanced: "", changed: false, scoreBefore: 0, scoreAfter: 0, findings: [], source: "rules" as const };
  if (useModel) {
    const modelCfg = readModelConfig();
    if (modelCfg && isAiProvider(modelCfg.provider)) {
      try {
        const enhanced = await enhancePromptWithModel(p, async (text) => {
          const r = await chatComplete(modelCfg, [
            { role: "system", content: "Rewrite the user's Exchange admin request into a professional prompt for an AI agent. Include: role, task, scope, constraints, and output format. Preserve every named identity (mailbox, server, database, domain) and action verb verbatim. Reply with ONLY the rewritten prompt, no preamble." },
            { role: "user", content: text },
          ]);
          return r.text;
        });
        const before = guardResult(p);
        return { enhanced, changed: enhanced !== p, scoreBefore: before.score, scoreAfter: guardResult(enhanced).score, findings: before.findings, source: "model" as const };
      } catch (e: any) {
        const before = guardResult(p);
        const enhanced = enhancePrompt(p);
        return { enhanced, changed: enhanced !== p, scoreBefore: before.score, scoreAfter: guardResult(enhanced).score, findings: before.findings, source: "rules" as const, note: `AI rewrite failed (${e?.message || "model unavailable"}) — showing rule-based draft.` };
      }
    }
    const before = guardResult(p);
    const enhanced = enhancePrompt(p);
    return { enhanced, changed: enhanced !== p, scoreBefore: before.score, scoreAfter: guardResult(enhanced).score, findings: before.findings, source: "rules" as const, note: "No AI-compatible model configured — showing rule-based draft. Save a provider + model to enable AI rewrites." };
  }
  const enhanced = enhancePrompt(p);
  const before = guardResult(p);
  return { enhanced, changed: enhanced !== p, scoreBefore: before.score, scoreAfter: guardResult(enhanced).score, findings: before.findings, source: "rules" as const };
});
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
  if (gateLocked) throw new Error("App is locked — unlock to continue.");
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
// With conversation context, the model may also answer "__no_tool" when a
// follow-up is answerable from recent exchanges without running anything.
async function tryAiRoute(prompt: string, modelCfg: { provider: string; apiKey: string; baseUrl?: string; model: string; systemPrompt?: string }, context?: string, recentTools?: string[]): Promise<{ tool: string; args: any; write: boolean } | null> {
  try {
    await ensureMcpInitialized();
    const list = await mcpRpc("tools/list", {});
    const entries: Array<{ name: string; description?: string }> = (((list as any)?.tools ?? []) as any[])
      .map((t: any) => ({ name: String(t?.name ?? ""), description: typeof t?.description === "string" ? t.description.slice(0, 160) : undefined }))
      .filter((t) => t.name);
    if (!entries.length) return null;
    const names = entries.map((t) => t.name);
    // Full catalog with one-line descriptions so loose phrasing can resolve
    // across MCP, AI-suite and report tools. Validation still uses exact names.
    const labelFor = (n: string) => {
      const e = entries.find((x) => x.name === n);
      return e?.description ? `${n} — ${e.description}` : n;
    };
    const pickFrom = async (pool: string[]) => {
      const reply = (await chatComplete(modelCfg, buildToolPickerMessages(prompt, pool.map(labelFor), modelCfg.systemPrompt, context))).text;
      if (parseNoToolVerdict(reply)) return { verdict: "no_tool" as const };
      const picked = parseToolSelection(reply, pool);
      return picked ? { verdict: "picked" as const, picked } : { verdict: "miss" as const, reply };
    };
    let r = await pickFrom(names);
    if (r.verdict === "no_tool") return { tool: "__no_tool", args: {}, write: false };
    if (r.verdict === "miss" && recentTools?.length) {
      // Vague follow-up ("update X") over 200+ tools: retry against the
      // family of recently used tools before giving up to the help card.
      const narrowed = narrowCatalog(names, recentTools);
      if (narrowed.length >= 2 && narrowed.length < names.length) r = await pickFrom(narrowed);
    }
    if (r.verdict === "picked") return { tool: r.picked.tool, args: r.picked.args, write: r.picked.tool in WRITE_REQUIRED_ARGS };
    if (r.verdict === "miss") console.error("AI tool pick unparseable for prompt:", JSON.stringify(prompt).slice(0, 200), "reply:", JSON.stringify(r.reply).slice(0, 500));
    return null;
  } catch (e) { console.error("AI routing failed, falling back to help", e); return null; }
}

// Rolling per-conversation memory for follow-up questions. Session-only:
// entries are clipped summaries (never credentials), capped so a long chat
// cannot blow up model input. Keyed by the renderer's conversation id;
// prompts without one stay stateless exactly as before.
const conversationMemory = new Map<string, ExchangeRecord[]>();
function contextFor(conversationId: string | undefined): string {
  if (!conversationId) return "";
  return buildContextBlocks(conversationMemory.get(conversationId) ?? []);
}
function rememberConversation(conversationId: string | undefined, record: ExchangeRecord): void {
  if (!conversationId) return;
  conversationMemory.set(conversationId, appendExchange(conversationMemory.get(conversationId) ?? [], record));
}

ipcMain.handle("exchange:ask", async (_e, payload: { prompt: string; confirmed?: boolean; tool?: string; args?: any; conversationId?: string }) => {
  if (gateLocked) throw new Error("App is locked — unlock to continue.");
  console.log("exchange:ask invoked", payload);
  const prompt = payload.prompt ?? "";
  if(!prompt.trim()) throw new Error("Type a prompt first");
  // AI mode: a configured OpenAI-compatible model interprets unknown prompts
  // and narrates results. Without it, pure keyword routing runs as before.
  const modelCfg = readModelConfig();
  const aiMode = !!modelCfg && isAiProvider(modelCfg.provider);
  await ensureMcpInitialized();
  const conversationId = payload.conversationId || undefined;
  const contextBlock = aiMode ? contextFor(conversationId) : "";
  const recentTools = aiMode ? (conversationMemory.get(conversationId ?? "") ?? []).map((x) => x.tool) : [];

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
      if ("help" in route) aiRouted = await tryAiRoute(prompt, modelCfg, contextBlock || undefined, recentTools);
      else if (!route.write && hasWriteIntent(prompt)) aiRouted = await tryAiRoute(prompt, modelCfg, contextBlock || undefined, recentTools);
    }
    if ("help" in route && !aiRouted) return { prompt, tool: "help", result: {
      message: "I can run Exchange queries. Try one of these:",
      examples: helpExamplesFor(prompt),
      ...(helpHintFor(prompt) ? { hint: helpHintFor(prompt) } : {}),
      ...(modelCfg && !isAiProvider(modelCfg.provider) ? { note: "Tip: AI answers need an OpenAI-compatible provider (OpenAI, Groq, Together, OpenRouter, Mistral, Ollama, Custom)." } : {}),
    },
    ...((aiMode && modelCfg) ? { aiNote: "Model could not interpret this request — keyword help below." } : {}) };
    if (aiRouted) {
      // Follow-up answerable from recent exchanges: no tool runs. The answer
      // is narrated from context below; still recorded so later turns see it.
      if (aiRouted.tool === "__no_tool" && modelCfg) {
        let ctxAnswer: string | undefined; let ctxUsage: { input: number; output: number } | undefined; let ctxNote: string | undefined;
        try {
          const s = await chatComplete(modelCfg, buildSummaryMessages(prompt, "history", "No new tool result for this follow-up — answer from the conversation context.", modelCfg.systemPrompt, contextBlock || undefined));
          ctxAnswer = s.text; ctxUsage = s.usage;
        } catch (e: any) { console.error("Context answer failed", e); ctxNote = `AI unavailable (${e?.message || e}) — no new Exchange data was fetched.`; }
        if (ctxAnswer || ctxNote) rememberConversation(conversationId, { prompt, tool: "history", resultJson: "", aiAnswer: ctxAnswer });
        return { prompt, tool: "history", args: {}, result: { message: "Answered from conversation context." }, psTrace: [], ...(ctxAnswer ? { aiAnswer: ctxAnswer, aiUsage: ctxUsage } : { aiNote: ctxNote }) };
      }
      tool = aiRouted.tool; args = aiRouted.args; write = aiRouted.write;
    }
    else { const r = route as RouteResult; tool = r.tool; args = r.args; write = r.write; }
  }

  // Safety gate for writes. Missing args are first resolved from the
  // conversation (e.g. "dismount the database" after talking about DB01),
  // so a follow-up "yes" confirms the intended target instead of stalling.
  if(write && !payload.confirmed){
    const required = WRITE_REQUIRED_ARGS[tool] ?? [];
    const unfilled = required.filter((k) => args[k] === undefined || args[k] === "");
    const remembered = conversationMemory.get(conversationId ?? "") ?? [];
    const filled = fillMissingArgs(tool, args, unfilled, recallIdentities(remembered));
    const assumed = Object.keys(filled).filter((k) => (args[k] === undefined || args[k] === "") && filled[k] !== undefined && filled[k] !== "");
    args = filled;
    const missing = required.filter((k) => args[k] === undefined || args[k] === "");
    if(missing.length) return { prompt, tool, args, needsInfo: true, missing, result: { message: `To run ${tool} I still need: ${missing.join(", ")}. Add it to your prompt and run again.` } };
    const assumedNote = assumed.length ? ` (assuming ${assumed.map((k) => `${k} = ${args[k]}`).join(", ")} from earlier in this conversation — say no to cancel)` : "";
    return { prompt, tool, args, needsConfirm: true, result: { message: `Ready to run ${tool}${assumedNote}`, parameters: args } };
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
  // Remember every exchange (success or failure) so follow-ups like "why?"
  // or a bare "yes" resolve against what just happened — even with no AI
  // provider configured. Clipped so a long session stays bounded.
  if(toolError) {
    rememberConversation(conversationId, { prompt, tool, resultJson: clipText(toolError, 2000) });
    return { prompt, tool, error: toolError, psTrace };
  }
  const text = (result as any)?.content?.[0]?.text;
  if(!text) return { prompt, tool, args, result, psTrace };
  let data: any;
  try { data = JSON.parse(text); } catch { return { prompt, tool, args, result: text, psTrace }; }
  // AI narration: model answers from the executed result. Never fails the ask,
  // but a failed attempt is reported (aiNote) so the UI never looks AI-less.
  let aiAnswer: string | undefined; let aiUsage: { input: number; output: number } | undefined; let aiNote: string | undefined;
  if (aiMode && modelCfg && tool !== "tools" && tool !== "help") {
    try {
      const summary = await chatComplete(modelCfg, buildSummaryMessages(prompt, tool, JSON.stringify(data), modelCfg.systemPrompt, contextBlock || undefined));
      aiAnswer = summary.text; aiUsage = summary.usage;
    } catch (e: any) { console.error("AI answer failed, returning tool result only", e); aiNote = `AI unavailable (${e?.message || e}) — showing MCP result.`; }
  }
  rememberConversation(conversationId, { prompt, tool, resultJson: clipText(JSON.stringify(data), 2000), aiAnswer });
  const nextActions = getFollowUps(tool, args ?? {}, prompt);
  return { prompt, tool, args, result: data, psTrace, nextActions, ...(aiAnswer ? { aiAnswer, aiUsage } : aiNote ? { aiNote } : {}) };
});


// Dialog helpers
ipcMain.handle("dialog:openFile", async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ["openFile"], filters: [{ name: "Config", extensions: ["yaml","yml","json"] }] });
  return r.canceled ? null : r.filePaths[0];
});
