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
  .option("--endpoint <url>", "Exchange endpoint", process.env.EXCHANGE_ENDPOINT ?? "https://mail.contoso.com")
  .option("--insecure", "allow self-signed", process.env.EXCHANGE_INSECURE === "true")
  .action(async (opts) => {
    const { testConnectivity } = await import("./doctor.js");
    const endpoint = opts.endpoint;
    const ps = process.env.EXCHANGE_POWERSHELL_URL ?? `${endpoint}/PowerShell`;
    const r = await testConnectivity({ endpoint, powershellUri: ps, ewsPath: "/EWS/Exchange.asmx", insecure: !!opts.insecure });
    console.log(JSON.stringify(r, null, 2));
  });

program.parseAsync(process.argv);
