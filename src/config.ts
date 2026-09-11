import { readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

function loadDotEnv() {
  const candidates = [".env", ".env.local"].filter(p => existsSync(p));
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (m) {
          const key = m[1];
          let val = m[2];
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) process.env[key] = val;
        }
      }
    } catch {}
  }
}

export type ExchangeVersion = "2013" | "2016" | "2019" | "auto";
export type ProviderType = "ews" | "rest" | "powershell" | "auto";
export type AuthMethod = "basic" | "oauth" | "certificate";
export type TransportType = "stdio" | "http";
export type HttpAuthMethod = "apikey" | "bearer" | "basic" | "none";

export interface AppConfig {
  exchange: {
    endpoint: string;
    version: ExchangeVersion;
    provider: ProviderType;
    ewsPath: string;
    restPath: string;
    powershellUri: string;
    insecure?: boolean;
    tls?: { rejectUnauthorized?: boolean; allowSelfSigned?: boolean };
    // HA: multiple backends — if set, MCP will failover smartly; single endpoint above is fallback for backward compat
    servers?: string[];
    ha?: {
      strategy?: "failover" | "round_robin";
      retryCount?: number;
      timeoutMs?: number;
      healthCheckIntervalSec?: number;
    };
  };
  auth: {
    method: AuthMethod;
    basic?: { username: string; password: string; domain?: string };
    oauth?: {
      authority: string;
      clientId: string;
      clientSecret?: string;
      tenantId?: string;
      scope?: string;
    };
    certificate?: { pfxPath: string; passphrase?: string; certPath?: string; keyPath?: string };
  };
  server: {
    transport: TransportType;
    port: number;
    host: string;
    // Deprecated: all 128 tools now always enabled; these flags are ignored but kept for backward compat
    enableAdminTools?: boolean;
    enableMailboxTools?: boolean;
    // HTTP Transport Authentication — SECURITY: Enable for production!
    httpAuth?: {
      enabled?: boolean;                    // default: true (secure by default)
      method?: HttpAuthMethod | HttpAuthMethod[]; // default: "apikey"
      apiKeys?: string[];                   // from MCP_API_KEYS env (comma-separated)
      bearerTokens?: string[];              // from MCP_BEARER_TOKENS env (comma-separated)
      basicAuth?: { username: string; password: string }; // from MCP_BASIC_USER / MCP_BASIC_PASS
      allowlist?: string[];                 // IP/CIDR allowlist from MCP_ALLOWLIST env
      denylist?: string[];                  // IP/CIDR denylist from MCP_DENYLIST env
      rateLimit?: {
        windowMs?: number;                  // default: 60000 (1 minute)
        maxRequests?: number;               // default: 100
      };
      protectHealth?: boolean;              // default: false (health checks public for LB)
    };
  };
  logging: { level: string; file: string };
}

const defaults: AppConfig = {
  exchange: {
    endpoint: "https://mail.contoso.local",
    version: "auto",
    provider: "auto",
    ewsPath: "/EWS/Exchange.asmx",
    restPath: "/api/v2.0",
    powershellUri: "https://mail.contoso.local/PowerShell",
    insecure: false,
    tls: { rejectUnauthorized: true },
  },
  auth: { method: "basic" },
  server: {
    transport: "stdio",
    port: 3000,
    host: "0.0.0.0",
    enableAdminTools: true,
    enableMailboxTools: false,
    httpAuth: {
      enabled: true,
      method: "apikey",
      apiKeys: [],
      bearerTokens: [],
      allowlist: [],
      denylist: [],
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      protectHealth: false,
    },
  },
  logging: { level: "info", file: "" },
};

function expandEnv(value: string, missing: Array<{ name: string; path: string }>, path: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => {
    const v = process.env[name];
    if (v === undefined) missing.push({ name, path });
    return v ?? "";
  });
}

function deepExpandEnv(obj: any, missing: Array<{ name: string; path: string }>, path = ""): any {
  if (typeof obj === "string") return expandEnv(obj, missing, path);
  if (Array.isArray(obj)) return obj.map((v, i) => deepExpandEnv(v, missing, `${path}[${i}]`));
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepExpandEnv(v, missing, path ? `${path}.${k}` : k);
    return out;
  }
  return obj;
}

function deepMerge(target: any, source: any): any {
  for (const [k, v] of Object.entries(source ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof target[k] === "object") {
      deepMerge(target[k], v);
    } else if (v !== undefined) {
      target[k] = v;
    }
  }
  return target;
}

export function loadConfig(configPath?: string): AppConfig {
  loadDotEnv();
  const cfg: AppConfig = JSON.parse(JSON.stringify(defaults));

  const candidates = [configPath, "./config.yaml", "./config.yml", "./config.json", "./config.example.yaml"].filter(Boolean) as string[];
  const missingEnv: Array<{ name: string; path: string }> = [];
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue;
      if (statSync(p).isDirectory()) continue;
      const raw = readFileSync(p, "utf-8");
      const parsed = p.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
      deepMerge(cfg, deepExpandEnv(parsed, missingEnv));
      break;
    } catch {
      continue;
    }
  }

  // Env var overrides — support aliases flagged by 404 diagnostics + HA
  const psUrlEnv = process.env.EXCHANGE_POWERSHELL_URL ?? process.env.EXCHANGE_POWERSHELL_URI ?? process.env.EXCHANGE_PS_URL ?? process.env.POWERSHELL_URL;
  // HA: comma-separated list of Exchange hosts/URLs — e.g. EXCHANGE_SERVERS=https://exch01/PowerShell,https://exch02/PowerShell
  const serversEnv = process.env.EXCHANGE_SERVERS ?? process.env.EXCHANGE_SERVER_LIST;
  if (serversEnv) {
    cfg.exchange.servers = serversEnv.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (psUrlEnv) cfg.exchange.powershellUri = psUrlEnv;
  if (process.env.EXCHANGE_SERVER) {
    const base = process.env.EXCHANGE_SERVER.replace(/\/$/, "");
    const hasScheme = /^https?:\/\//i.test(base);
    const host = hasScheme ? base : `https://${base}`;
    if (!process.env.EXCHANGE_ENDPOINT) cfg.exchange.endpoint = host;
    if (!psUrlEnv && !cfg.exchange.servers?.length) cfg.exchange.powershellUri = `${host}/PowerShell`;
  }
  if (process.env.EXCHANGE_ENDPOINT) cfg.exchange.endpoint = process.env.EXCHANGE_ENDPOINT;
  if (psUrlEnv) cfg.exchange.powershellUri = psUrlEnv;
  if (process.env.EXCHANGE_POWERSHELL_URL) cfg.exchange.powershellUri = process.env.EXCHANGE_POWERSHELL_URL;
  if (process.env.EXCHANGE_VERSION) cfg.exchange.version = process.env.EXCHANGE_VERSION as ExchangeVersion;
  if (process.env.EXCHANGE_PROVIDER) cfg.exchange.provider = process.env.EXCHANGE_PROVIDER as ProviderType;
  if (process.env.AUTH_METHOD) cfg.auth.method = process.env.AUTH_METHOD as AuthMethod;
  if (process.env.OAUTH_CLIENT_ID && cfg.auth.oauth) cfg.auth.oauth.clientId = process.env.OAUTH_CLIENT_ID;
  if (process.env.OAUTH_CLIENT_SECRET && cfg.auth.oauth) cfg.auth.oauth.clientSecret = process.env.OAUTH_CLIENT_SECRET;
  if (process.env.EXCHANGE_PASSWORD && cfg.auth.basic) cfg.auth.basic.password = process.env.EXCHANGE_PASSWORD;
  if (process.env.MCP_TRANSPORT) cfg.server.transport = process.env.MCP_TRANSPORT as TransportType;
  if (process.env.PORT) cfg.server.port = parseInt(process.env.PORT, 10);
  if (process.env.ENABLE_ADMIN_TOOLS) cfg.server.enableAdminTools = process.env.ENABLE_ADMIN_TOOLS === "true";
  if (process.env.ENABLE_MAILBOX_TOOLS) cfg.server.enableMailboxTools = process.env.ENABLE_MAILBOX_TOOLS === "true";
  if (process.env.EXCHANGE_INSECURE) cfg.exchange.insecure = process.env.EXCHANGE_INSECURE === "true" || process.env.EXCHANGE_INSECURE === "1";
  
  // HTTP Auth env var overrides
  if (process.env.MCP_HTTP_AUTH_ENABLED !== undefined) cfg.server.httpAuth!.enabled = process.env.MCP_HTTP_AUTH_ENABLED === "true";
  if (process.env.MCP_HTTP_AUTH_METHOD) {
    const methods = process.env.MCP_HTTP_AUTH_METHOD.split(",").map((s) => s.trim()).filter(Boolean) as HttpAuthMethod[];
    cfg.server.httpAuth!.method = methods.length === 1 ? methods[0] : methods;
  }
  if (process.env.MCP_API_KEYS) cfg.server.httpAuth!.apiKeys = process.env.MCP_API_KEYS.split(",").map((s) => s.trim()).filter(Boolean);
  if (process.env.MCP_BEARER_TOKENS) cfg.server.httpAuth!.bearerTokens = process.env.MCP_BEARER_TOKENS.split(",").map((s) => s.trim()).filter(Boolean);
  if (process.env.MCP_BASIC_USER && process.env.MCP_BASIC_PASS) {
    cfg.server.httpAuth!.basicAuth = { username: process.env.MCP_BASIC_USER, password: process.env.MCP_BASIC_PASS };
  }
  if (process.env.MCP_ALLOWLIST) cfg.server.httpAuth!.allowlist = process.env.MCP_ALLOWLIST.split(",").map((s) => s.trim()).filter(Boolean);
  if (process.env.MCP_DENYLIST) cfg.server.httpAuth!.denylist = process.env.MCP_DENYLIST.split(",").map((s) => s.trim()).filter(Boolean);
  if (process.env.MCP_RATE_LIMIT_WINDOW_MS) cfg.server.httpAuth!.rateLimit!.windowMs = parseInt(process.env.MCP_RATE_LIMIT_WINDOW_MS, 10);
  if (process.env.MCP_RATE_LIMIT_MAX_REQUESTS) cfg.server.httpAuth!.rateLimit!.maxRequests = parseInt(process.env.MCP_RATE_LIMIT_MAX_REQUESTS, 10);
  if (process.env.MCP_PROTECT_HEALTH !== undefined) cfg.server.httpAuth!.protectHealth = process.env.MCP_PROTECT_HEALTH === "true";

  if (process.env.NODE_ENV === "development" && process.env.EXCHANGE_INSECURE === undefined && cfg.exchange.insecure === false) {
    // auto-detect dev hint — no auto-enable, just note
  }
  // normalize tls flag from insecure
  if (cfg.exchange.insecure) cfg.exchange.tls = { rejectUnauthorized: false, allowSelfSigned: true };
  else if (cfg.exchange.tls?.allowSelfSigned) cfg.exchange.tls.rejectUnauthorized = false;

  // Fail fast on unresolvable ${VAR} references in the ACTIVE auth path only
  // (e.g. a typo'd password var). Refs in unused sections (an optional
  // certificate block while on basic auth) stay silent so optional setups
  // keep working. A literal empty password still fails later at auth time.
  const method = cfg.auth.method;
  const section = method === "oauth" ? "auth.oauth" : method === "certificate" ? "auth.certificate" : "auth.basic";
  const inSection = (p: string) => p === section || p.startsWith(section + ".") || p.startsWith(section + "[");
  {
    const bad = missingEnv.filter((m) => inSection(m.path));
    const finalAt = (path: string) => {
      let cur: any = cfg;
      for (const part of path.replace(/\[(\d+)\]/g, ".$1").split(".")) cur = cur?.[part];
      return cur;
    };
    const blocking = bad.filter((m) => {
      const v = finalAt(m.path);
      return v === undefined || v === null || v === "";
    });
    if (blocking.length) {
      const names = [...new Set(blocking.map((m) => m.name))].join(", ");
      throw new Error(
        `config.yaml references unset environment variable(s): ${names}. ` +
        `Set them persistently — Windows: setx VARNAME "value" (then reopen the terminal); ` +
        `Linux/macOS: export VARNAME="value" (add to ~/.bashrc or ~/.zshrc). Then restart.`,
      );
    }
  }

  // Normalize HA: if servers list provided, ensure endpoint/powershellUri are first in list for backward compat logging
  if (cfg.exchange.servers?.length) {
    cfg.exchange.ha = { strategy: "failover", retryCount: 2, timeoutMs: 30000, healthCheckIntervalSec: 60, ...cfg.exchange.ha };
    // Deduplicate and ensure powershellUris
    cfg.exchange.servers = cfg.exchange.servers.map((s) => {
      const hasPath = /\/PowerShell$/i.test(s) || /\/EWS\//i.test(s);
      if (hasPath) return s.replace(/\/$/, "");
      const hasScheme = /^https?:\/\//i.test(s);
      const host = hasScheme ? s : `https://${s}`;
      // Default to PowerShell URI for HA list
      return `${host.replace(/\/$/, "")}/PowerShell`;
    });
  }

  return cfg;
}
