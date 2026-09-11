#!/usr/bin/env node
import { writeFileSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import inquirer from "inquirer";
import { stringify as yamlDump, parse as yamlParse } from "yaml";

interface HttpAuthConfig {
  enabled: boolean;
  method: "apikey" | "bearer" | "basic" | "none" | ("apikey" | "bearer" | "basic" | "none")[];
  apiKeys?: string[];
  bearerTokens?: string[];
  basicAuth?: { username: string; password: string };
  allowlist?: string[];
  denylist?: string[];
  rateLimit?: { windowMs: number; maxRequests: number };
  protectHealth?: boolean;
}

interface SetupOptions {
  yes: boolean;
  json: boolean;
  method: string;
  keyCount: number;
  allowlist: string;
  rateLimitWindow: number;
  rateLimitMax: number;
  protectHealth: boolean;
  transport: string;
  writeEnv: boolean;
}

function generateKey(): string {
  return randomBytes(32).toString("hex");
}

function generateKeys(count: number): string[] {
  return Array.from({ length: count }, () => generateKey());
}

function parseArgs(): SetupOptions {
  const args = process.argv.slice(2);
  const options: SetupOptions = {
    yes: args.includes("-y") || args.includes("--yes"),
    json: args.includes("--json"),
    method: "apikey",
    keyCount: 2,
    allowlist: "",
    rateLimitWindow: 60000,
    rateLimitMax: 100,
    protectHealth: false,
    transport: "http",
    writeEnv: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--method" && i + 1 < args.length) options.method = args[++i];
    if (arg === "--key-count" && i + 1 < args.length) options.keyCount = parseInt(args[++i], 10);
    if (arg === "--allowlist" && i + 1 < args.length) options.allowlist = args[++i];
    if (arg === "--rate-limit-window" && i + 1 < args.length) options.rateLimitWindow = parseInt(args[++i], 10);
    if (arg === "--rate-limit-max" && i + 1 < args.length) options.rateLimitMax = parseInt(args[++i], 10);
    if (arg === "--protect-health") options.protectHealth = true;
    if (arg === "--transport" && i + 1 < args.length) options.transport = args[++i];
    if (arg === "--no-env") options.writeEnv = false;
  }
  return options;
}

async function promptInteractive(opts: SetupOptions): Promise<Partial<SetupOptions>> {
  if (opts.yes) return {};

  const questions = [
    {
      type: "select",
      name: "method",
      message: "Authentication method:",
      choices: [
        { name: "API Key (recommended)", value: "apikey" },
        { name: "Bearer Token", value: "bearer" },
        { name: "Basic Auth", value: "basic" },
        { name: "None (IP allowlist only)", value: "none" },
      ],
      default: "apikey",
    },
    {
      type: "number",
      name: "keyCount",
      message: "Number of API keys to generate (for rotation):",
      default: 2,
      validate: (v: number) => v >= 1 && v <= 5 || "Must be 1-5",
      when: (answers: Record<string, unknown>) => answers.method !== "basic" && answers.method !== "none",
    },
    {
      type: "input",
      name: "allowlist",
      message: "IP/CIDR allowlist (comma-separated, e.g. 10.0.0.0/8,192.168.1.0/24):",
      default: "",
      when: (answers: Record<string, unknown>) => answers.method === "none" || !answers.method,
    },
    {
      type: "number",
      name: "rateLimitWindow",
      message: "Rate limit window (ms):",
      default: 60000,
    },
    {
      type: "number",
      name: "rateLimitMax",
      message: "Max requests per window:",
      default: 100,
    },
    {
      type: "confirm",
      name: "protectHealth",
      message: "Protect /health endpoint (requires auth for load balancer probes)?",
      default: false,
    },
    {
      type: "confirm",
      name: "writeEnv",
      message: "Write keys to .env file (not committed to git)?",
      default: true,
    },
  ];

  const answers = await inquirer.prompt(questions);
  return answers;
}

function loadExistingConfig(): any {
  const configPath = resolve(process.cwd(), "config.yaml");
  if (!existsSync(configPath)) return {};
  try {
    return yamlParse(readFileSync(configPath, "utf-8")) ?? {};
  } catch {
    return {};
  }
}

function loadExistingEnv(): string {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return "";
  return readFileSync(envPath, "utf-8");
}

function writeConfig(config: any): void {
  const configPath = resolve(process.cwd(), "config.yaml");
  writeFileSync(configPath, yamlDump(config), "utf-8");
  console.log(`\nUpdated ${configPath}`);
}

function writeEnvFile(keys: string[], opts: SetupOptions): void {
  const envPath = resolve(process.cwd(), ".env");
  const existing = loadExistingEnv();

  const newKeys = [
    `MCP_HTTP_AUTH_ENABLED=true`,
    `MCP_HTTP_AUTH_METHOD=${opts.method}`,
    `MCP_API_KEYS="${keys.join(",")}"`,
    `MCP_RATE_LIMIT_WINDOW_MS=${opts.rateLimitWindow}`,
    `MCP_RATE_LIMIT_MAX_REQUESTS=${opts.rateLimitMax}`,
  ];

  if (opts.allowlist) newKeys.push(`MCP_ALLOWLIST="${opts.allowlist}"`);
  if (opts.protectHealth) newKeys.push(`MCP_PROTECT_HEALTH=true`);

  let envContent = existing;
  for (const line of newKeys) {
    const key = line.split("=")[0];
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, line);
    } else {
      envContent += (envContent && !envContent.endsWith("\n") ? "\n" : "") + line + "\n";
    }
  }

  writeFileSync(envPath, envContent.trimEnd() + "\n", "utf-8");
  console.log(`Updated ${envPath} (not tracked by git)`);
}

function buildHttpAuthConfig(keys: string[], opts: SetupOptions): HttpAuthConfig {
  const config: HttpAuthConfig = {
    enabled: true,
    method: opts.method as HttpAuthConfig["method"],
    rateLimit: { windowMs: opts.rateLimitWindow, maxRequests: opts.rateLimitMax },
    protectHealth: opts.protectHealth,
  };

  if (opts.method === "apikey" || opts.method === "bearer") {
    config.apiKeys = keys;
    if (opts.method === "bearer") config.bearerTokens = keys;
  }

  if (opts.method === "basic") {
    // For basic auth, we'd need username/password - placeholder for now
    config.basicAuth = { username: "admin", password: keys[0] };
  }

  if (opts.allowlist) {
    config.allowlist = opts.allowlist.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return config;
}

function outputJson(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const opts = parseArgs();

  console.log("Exchange MCP — HTTP Auth Setup\n");

  // Interactive prompts
  const interactiveOpts = opts.yes ? {} : await promptInteractive(opts);
  const finalOpts = { ...opts, ...interactiveOpts };

  // Validate method
  const validMethods = ["apikey", "bearer", "basic", "none"];
  if (!validMethods.includes(finalOpts.method)) {
    console.error(`Invalid method: ${finalOpts.method}. Must be one of: ${validMethods.join(", ")}`);
    process.exit(1);
  }

  // Generate keys
  const keys = generateKeys(finalOpts.keyCount);

  // Build httpAuth config
  const httpAuthConfig = buildHttpAuthConfig(keys, finalOpts);

  // Load and merge existing config
  const existing = loadExistingConfig();
  const merged = {
    ...existing,
    server: {
      ...existing.server,
      transport: finalOpts.transport,
      httpAuth: { ...existing.server?.httpAuth, ...httpAuthConfig },
    },
  };

  // Write config
  writeConfig(merged);

  // Write .env if requested
  if (finalOpts.writeEnv) {
    writeEnvFile(keys, finalOpts);
  }

  // Output summary
  if (finalOpts.json) {
    outputJson({
      keys,
      config: httpAuthConfig,
      envKeys: [
        "MCP_HTTP_AUTH_ENABLED",
        "MCP_HTTP_AUTH_METHOD",
        "MCP_API_KEYS",
        "MCP_RATE_LIMIT_WINDOW_MS",
        "MCP_RATE_LIMIT_MAX_REQUESTS",
      ],
    });
    return;
  }

  // Human-readable output
  console.log("\n========================================");
  console.log("HTTP Auth Configuration Complete");
  console.log("========================================");

  console.log(`\nTransport: ${finalOpts.transport}`);
  console.log(`Auth method: ${finalOpts.method}`);
  console.log(`Keys generated: ${keys.length}`);

  if (keys.length > 0) {
    console.log("\nGenerated keys (save these - not shown again):");
    keys.forEach((k, i) => console.log(`  MCP_API_KEY_${i + 1}=${k}`));
  }

  if (finalOpts.allowlist) {
    console.log(`\nIP Allowlist: ${finalOpts.allowlist}`);
  }

  console.log(`\nRate limit: ${finalOpts.rateLimitMax} req / ${finalOpts.rateLimitWindow}ms`);
  console.log(`Protect /health: ${finalOpts.protectHealth ? "yes" : "no"}`);

  console.log("\n========================================");
  console.log("Next Steps");
  console.log("========================================");
  console.log("1. Restart server:");
  console.log("   npm run start    # production");
  console.log("   npm run dev      # development");
  console.log("\n2. Test:");
  console.log(`   curl -H "X-API-Key: ${keys[0]}" http://localhost:3000/health`);
  console.log("\n3. Configure agent (opencode/claudecode):");
  console.log(`   export MCP_API_KEY="${keys[0]}"`);
  console.log("\n4. For Docker:");
  console.log(`   echo 'MCP_API_KEYS="${keys.join(",")}"' >> .env`);
  console.log("   docker-compose up -d");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});