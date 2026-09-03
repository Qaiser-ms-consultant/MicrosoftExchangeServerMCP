#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ExchangeClient } from "./clients/exchange-client.js";
import { registerMailTools } from "./tools/mail-tools.js";
import { registerCalendarTools } from "./tools/calendar-tools.js";
import { registerContactTools } from "./tools/contact-tools.js";
import { registerAdminTools } from "./tools/admin-tools.js";
import { registerRecipientAdminTools } from "./tools/admin-recipients.js";
import { registerTransportAdminTools } from "./tools/admin-transport.js";
import { registerServerAdminTools } from "./tools/admin-servers.js";
import { registerMonitoringTools } from "./tools/admin-monitoring.js";
import { registerDiagnosticTools } from "./tools/admin-diagnostics.js";
import { registerSearchTools } from "./tools/admin-search.js";
import { registerComplianceTools } from "./tools/admin-compliance.js";
import { registerMailboxFeatureTools } from "./tools/admin-mailbox-features.js";
import { registerSpecMissingTools } from "./tools/spec-missing.js";
import { registerMailboxRecoveryTools } from "./tools/admin-mailbox-recovery.js";
import { registerResources } from "./resources/folder-resource.js";
import { registerPrompts } from "./prompts/index.js";

async function main() {
  const configPath = process.argv.find((a) => a.startsWith("--config="))?.split("=")[1];
  const config = loadConfig(configPath);

  const server = new McpServer({ name: "exchange-mcp-server", version: "0.1.0" });
  const client = new ExchangeClient(config);
  // Log resolved Exchange targets for 404 diagnostics
  console.error(`Exchange targets — endpoint=${config.exchange.endpoint} | powershellUri=${config.exchange.powershellUri} | ews=${config.exchange.endpoint}${config.exchange.ewsPath} | rest=${config.exchange.endpoint}${config.exchange.restPath}`);

  // All tools open — no gating (legacy enableAdminTools/enableMailboxTools ignored for backward compat)
  registerMailTools(server, client);
  registerCalendarTools(server, client);
  registerContactTools(server, client);
  registerAdminTools(server, client);
  registerRecipientAdminTools(server, client.ps);
  registerTransportAdminTools(server, client.ps);
  registerServerAdminTools(server, client.ps);
  registerMonitoringTools(server, client.ps);
  registerSearchTools(server, client.ps);
  registerComplianceTools(server, client.ps);
  registerMailboxFeatureTools(server, client.ps);
  registerSpecMissingTools(server, client.ps);
  registerMailboxRecoveryTools(server, client.ps);
  registerDiagnosticTools(server, config, client.auth);
  registerResources(server, client);
  registerPrompts(server);

  const transportArg = process.argv.find((a) => a.startsWith("--transport="))?.split("=")[1];
  const transport = transportArg ?? config.server.transport;

  if (transport === "stdio") {
    const stdio = new StdioServerTransport();
    await server.connect(stdio);
    const insecure = !!(config.exchange.insecure || config.exchange.tls?.rejectUnauthorized === false);
    console.error(`Exchange MCP server running (stdio) — endpoint=${config.exchange.endpoint} provider=${config.exchange.provider} insecure=${insecure}${insecure ? " [DEV: self-signed allowed]" : ""} | tools=136 (all open)`);
  } else {
    // HTTP/SSE — use Express wrapper (lazy import to keep stdio light)
    const express = await import("express");
    const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
    const app = express.default();
    app.use(express.json());

    let sseTransport: InstanceType<typeof SSEServerTransport> | null = null;

    app.get("/sse", async (req: any, res: any) => {
      sseTransport = new SSEServerTransport("/messages", res);
      await server.connect(sseTransport);
    });

    app.post("/messages", async (req: any, res: any) => {
      if (sseTransport) await sseTransport.handlePostMessage(req, res);
      else res.status(400).send("No SSE connection");
    });

    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", endpoint: config.exchange.endpoint }));

    const port = config.server.port;
    app.listen(port, () => console.error(`Exchange MCP server running (http) on :${port}`));
  }
}

main().catch((err) => {
  console.error("Failed to start Exchange MCP server:", err);
  process.exit(1);
});
