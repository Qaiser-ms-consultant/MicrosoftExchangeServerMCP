import axios from "axios";
import https from "node:https";
import { existsSync } from "node:fs";

export interface DoctorConfig {
  endpoint?: string;
  powershellUri?: string;
  ewsPath?: string;
  insecure?: boolean;
}

export type DoctorTargetResult =
  | { ok: true; source: "config" | "env"; targets: { endpoint: string; powershellUri: string; ewsPath: string; insecure: boolean } }
  | { ok: false; error: string };

/**
 * Decide which Exchange host doctor probes: explicit env wins, otherwise the
 * real config file. Never silently probes placeholder hosts — with neither,
 * it refuses and points at init instead of testing contoso.com.
 */
export function resolveDoctorTargets(args: {
  config?: DoctorConfig | null;
  hasConfigFile: boolean;
  env?: Record<string, string | undefined>;
}): DoctorTargetResult {
  const env = args.env ?? process.env;
  const envEndpoint = env.EXCHANGE_ENDPOINT;
  if (envEndpoint) {
    return {
      ok: true,
      source: "env",
      targets: {
        endpoint: envEndpoint,
        powershellUri: env.EXCHANGE_POWERSHELL_URL ?? `${envEndpoint.replace(/\/$/, "")}/PowerShell`,
        ewsPath: "/EWS/Exchange.asmx",
        insecure: env.EXCHANGE_INSECURE === "true",
      },
    };
  }
  if (args.hasConfigFile && args.config?.endpoint) {
    return {
      ok: true,
      source: "config",
      targets: {
        endpoint: args.config.endpoint,
        powershellUri: args.config.powershellUri ?? `${args.config.endpoint.replace(/\/$/, "")}/PowerShell`,
        ewsPath: args.config.ewsPath ?? "/EWS/Exchange.asmx",
        insecure: args.config.insecure ?? false,
      },
    };
  }
  return {
    ok: false,
    error: "No Exchange server configured — doctor will not probe placeholder hosts. Run `npx exchange-mcp init` or set EXCHANGE_ENDPOINT (e.g. https://mail.contoso.com).",
  };
}

/** Real (non-example) config files doctor may trust. Never config.example.yaml. */
export function hasRealConfigFile(cwd = process.cwd()): boolean {
  return ["./config.yaml", "./config.yml", "./config.json"].some((p) => {
    try {
      return existsSync(p);
    } catch {
      return false;
    }
  });
}

export async function testConnectivity(opts: { endpoint: string; powershellUri: string; ewsPath: string; insecure: boolean }) {
  const agent = opts.insecure ? new https.Agent({ rejectUnauthorized: false }) : undefined;
  const results: Record<string, unknown> = {};

  const testUrl = async (url: string, method: "GET" | "POST" = "GET", body?: string) => {
    try {
      const res = await axios({
        method,
        url,
        data: body,
        headers: body ? { "Content-Type": "text/xml; charset=utf-8" } : {},
        httpsAgent: agent as any,
        validateStatus: () => true,
        timeout: 8000,
      });
      return { url, status: res.status, ok: res.status < 400, hint: res.status === 401 ? "401 — check BasicAuthentication on virtual directory" : res.status === 404 ? "404 — check host/path (must be /PowerShell or /EWS/Exchange.asmx)" : undefined, preview: typeof res.data === "string" ? res.data.slice(0, 400).replace(/\s+/g, " ") : JSON.stringify(res.data).slice(0, 400) };
    } catch (e: any) {
      return { url, error: e.message, code: e.code };
    }
  };

  results.powershell = await testUrl(opts.powershellUri, "GET");
  const ewsBody = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"><soap:Header><t:RequestServerVersion Version="Exchange2016"/></soap:Header><soap:Body><m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape><m:IndexedPageItemView MaxEntriesReturned="1" Offset="0" BasePoint="Beginning"/><m:ParentFolderIds><t:DistinguishedFolderId Id="inbox"/></m:ParentFolderIds></m:FindItem></soap:Body></soap:Envelope>`;
  results.ews = await testUrl(opts.endpoint.replace(/\/$/, "") + opts.ewsPath, "POST", ewsBody);
  results.rest = await testUrl(opts.endpoint.replace(/\/$/, "") + "/api/v2.0", "GET");
  results.insecure = opts.insecure;
  return results;
}

// CLI entry when run directly
if (import.meta.url.endsWith("doctor.ts") || process.argv[1]?.endsWith("doctor.ts") || process.argv[1]?.endsWith("doctor.js")) {
  const { loadConfig } = await import("../config.js").catch(() => ({ loadConfig: null as any }));
  let config: DoctorConfig | null = null;
  const hasConfig = hasRealConfigFile();
  if (hasConfig && loadConfig) {
    try {
      const cfg = loadConfig();
      config = { endpoint: cfg.exchange.endpoint, powershellUri: cfg.exchange.powershellUri, ewsPath: cfg.exchange.ewsPath, insecure: cfg.exchange.insecure };
    } catch (e: any) {
      console.error(`Cannot load config: ${e?.message || e}`);
      process.exit(1);
    }
  }
  const resolved = resolveDoctorTargets({ config, hasConfigFile: hasConfig, env: process.env });
  if (!resolved.ok) {
    console.error(resolved.error);
    process.exit(1);
  }
  testConnectivity({ ...resolved.targets }).then((r) => console.log(JSON.stringify({ source: resolved.source, ...r }, null, 2)));
}
