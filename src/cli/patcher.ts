import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

function backup(p: string) {
  if (!existsSync(p)) return;
  const bak = `${p}.bak.${new Date().toISOString().slice(0, 10)}`;
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(p, "utf-8"));
}

function ensureDir(p: string) {
  mkdirSync(dirname(p), { recursive: true });
}

export function patchOpenCode(serverPath: string, configPath: string) {
  const target = resolve(homedir(), ".config/opencode/opencode.jsonc");
  ensureDir(target);
  let content = existsSync(target) ? readFileSync(target, "utf-8") : '{"mcp":{}}';
  backup(target);
  // Simple JSONC: strip comments for parse, but preserve by naive merge
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  let json: any;
  try { json = JSON.parse(stripped); } catch { json = { mcp: {} }; }
  json.mcp = json.mcp ?? {};
  json.mcp.exchange = {
    type: "local",
    command: ["node", serverPath, `--config=${configPath}`],
    enabled: true,
  };
  writeFileSync(target, JSON.stringify(json, null, 2), "utf-8");
  return target;
}

export async function patchClaudeCode(serverPath: string, configPath: string) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  try {
    await exec("claude", ["mcp", "add", "exchange", "--", "node", serverPath, `--config=${configPath}`], { timeout: 10000 });
    return "claude mcp add";
  } catch {
    // Fallback to ~/.claude.json
    const target = resolve(homedir(), ".claude.json");
    ensureDir(target);
    let json: any = existsSync(target) ? JSON.parse(readFileSync(target, "utf-8")) : {};
    json.mcpServers = json.mcpServers ?? {};
    json.mcpServers.exchange = { command: "node", args: [serverPath, `--config=${configPath}`] };
    backup(target);
    writeFileSync(target, JSON.stringify(json, null, 2), "utf-8");
    return target;
  }
}
