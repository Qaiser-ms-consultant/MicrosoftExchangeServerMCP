#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";

const program = new Command();
program.name("exchange-mcp").description("Exchange MCP — init, add clients, doctor").version("0.1.0");

program
  .command("init")
  .description("Wizard: create config.yaml with Exchange FQDN + test PowerShell & EWS (file-based ${EXCHANGE_PASSWORD})")
  .action(async () => {
    await import("./init.js");
  });

program
  .command("add")
  .description("Patch MCP clients (opencode, claude-code)")
  .option("--client <list>", "comma-separated: opencode,claude-code", "opencode,claude-code")
  .option("--server <path>", "server.js path", resolve(process.cwd(), "dist/server.js"))
  .option("--config <path>", "config.yaml path", resolve(process.cwd(), "config.yaml"))
  .action(async (opts) => {
    const clients = opts.client.split(",").map((s: string) => s.trim());
    const { patchOpenCode, patchClaudeCode } = await import("./patcher.js");
    for (const c of clients) {
      if (c === "opencode") {
        const p = patchOpenCode(opts.server, opts.config);
        console.log(`Patched OpenCode: ${p}`);
      } else if (c === "claude-code" || c === "claude") {
        const p = await patchClaudeCode(opts.server, opts.config);
        console.log(`Patched Claude Code: ${p}`);
      } else {
        console.log(`Unknown client ${c} — supported: opencode, claude-code`);
      }
    }
    console.log("Run: opencode mcp list  and  claude mcp list");
  });

program
  .command("doctor")
  .description("Test PowerShell + EWS connectivity (both)")
  .option("--endpoint <url>", "Exchange endpoint (default: config.yaml, then EXCHANGE_ENDPOINT)")
  .option("--insecure", "allow self-signed", process.env.EXCHANGE_INSECURE === "true")
  .action(async (opts) => {
    const { testConnectivity, resolveDoctorTargets, hasRealConfigFile } = await import("./doctor.js");
    const { loadConfig } = await import("../config.js");
    let config = null;
    const hasConfig = hasRealConfigFile();
    if (hasConfig) {
      try {
        const cfg = loadConfig();
        config = { endpoint: cfg.exchange.endpoint, powershellUri: cfg.exchange.powershellUri, ewsPath: cfg.exchange.ewsPath, insecure: cfg.exchange.insecure };
      } catch (e: any) {
        console.error(`Cannot load config: ${e?.message || e}`);
        process.exit(1);
      }
    }
    const resolved = resolveDoctorTargets({
      config,
      hasConfigFile: hasConfig,
      env: { ...process.env, ...(opts.endpoint ? { EXCHANGE_ENDPOINT: opts.endpoint } : {}), ...(opts.insecure ? { EXCHANGE_INSECURE: "true" } : {}) },
    });
    if (!resolved.ok) {
      console.error(resolved.error);
      process.exit(1);
    }
    const r = await testConnectivity({ ...resolved.targets });
    console.log(JSON.stringify({ source: resolved.source, ...r }, null, 2));
  });

program.parseAsync(process.argv);
