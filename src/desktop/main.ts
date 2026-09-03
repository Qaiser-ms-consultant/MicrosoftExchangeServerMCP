import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join, resolve, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { spawn, ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let win: BrowserWindow | null = null;
let mcpProc: ChildProcess | null = null;

function getUserDataPath() {
  return resolve(homedir(), ".config/exchange-desktop");
}

function ensureConfig(): string {
  const dir = getUserDataPath();
  mkdirSync(dir, { recursive: true });
  const p = resolve(dir, "config.yaml");
  if (!existsSync(p)) {
    const example = resolve(process.cwd(), "config.example.yaml");
    if (existsSync(example)) writeFileSync(p, readFileSync(example, "utf-8"));
  }
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
    const prodPath = join(__dirname, "../renderer/index.html");
    const srcPath = resolve(process.cwd(), "src/desktop/renderer/index.html");
    win.loadFile(existsSync(prodPath) ? prodPath : srcPath);
  }
}

app.whenReady().then(createWindow);
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

// IPC: model providers — 13 (12 + OpenCode as requested), file-based ${API_KEY}
const PROVIDERS = ["OpenAI","Anthropic","Google","Azure OpenAI","AWS Bedrock","Ollama","Mistral","Cohere","Groq","Together","OpenRouter","Custom","OpenCode"];
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
    return { ok: res.ok, status: res.status, models: json.data?.slice(0,5) ?? json.models?.slice(0,5) ?? [], raw: JSON.stringify(json).slice(0,600) };
  } catch (e: any) { return { ok: false, error: e.message }; }
});

// IPC: MCP spawn + logs (real-time streaming)
ipcMain.handle("mcp:start", async () => {
  if (mcpProc) { try { mcpProc.kill(); } catch {} }
  const configPath = ensureConfig();
  const serverPath = resolve(process.cwd(), "dist/server.js");
  mcpProc = spawn("node", [serverPath, `--config=${configPath}`], { stdio: ["pipe","pipe","pipe"] });
  mcpProc.stderr?.on("data", (d) => win?.webContents.send("mcp:log", d.toString()));
  mcpProc.stdout?.on("data", (d) => win?.webContents.send("mcp:log", d.toString()));
  return { pid: mcpProc.pid, configPath };
});
ipcMain.handle("mcp:stop", async () => { if (mcpProc) { mcpProc.kill(); mcpProc=null; } return { ok:true }; });

// IPC: doctor — PowerShell + EWS both (reuses src/cli/doctor.ts logic)
ipcMain.handle("doctor:run", async (_e, opts: { endpoint?: string; insecure?: boolean }) => {
  const { testConnectivity } = await import("../cli/doctor.js");
  const endpoint = opts?.endpoint ?? "https://mail.contoso.com";
  const ps = endpoint.replace(/\/$/, "") + "/PowerShell";
  const ewsPath = "/EWS/Exchange.asmx";
  return testConnectivity({ endpoint, powershellUri: ps, ewsPath, insecure: !!opts?.insecure });
});

// Dialog helpers
ipcMain.handle("dialog:openFile", async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ["openFile"], filters: [{ name: "Config", extensions: ["yaml","yml","json"] }] });
  return r.canceled ? null : r.filePaths[0];
});
