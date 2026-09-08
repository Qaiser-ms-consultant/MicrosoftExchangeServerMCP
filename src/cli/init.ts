#!/usr/bin/env node
import { writeFileSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import inquirer from "inquirer";
import { stringify as yamlDump, parse as yamlParse } from "yaml";

async function main() {
  console.log("Exchange MCP — init wizard (Production, password stored in .env file)");
  console.log("This will create/update config.yaml with generic endpoint and test both PowerShell + EWS.\n");

  const answers = await inquirer.prompt([
    { name: "fqdn", message: "Exchange FQDN (e.g. mail.contoso.com or exchange.lab.local):", default: "mail.contoso.com", validate: (v: string) => !!v || "required" },
    { name: "username", message: "Username (e.g. admin@contoso.com):", default: "admin@contoso.com" },
    { name: "domain", message: "Domain (e.g. CONTOSO, leave empty if UPN):", default: "CONTOSO" },
    { name: "password", type: "password", message: "Exchange password (will be stored in .env, not config.yaml):", mask: "*", validate: (v: string) => v.length > 0 || "required" },
    { name: "insecure", type: "confirm", message: "Self-signed cert (lab) — set insecure:true? (Production: No)", default: false },
  ]);

  const fqdn = answers.fqdn.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const endpoint = `https://${fqdn}`;
  const powershellUri = `https://${fqdn}/PowerShell`;
  const ewsPath = "/EWS/Exchange.asmx";

  const configPath = resolve(process.cwd(), "config.yaml");
  let existing: any = {};
  if (existsSync(configPath)) {
    try { existing = yamlParse(readFileSync(configPath, "utf-8")) ?? {}; } catch {}
  }

  const passwordEnv = "EXCHANGE_PASSWORD";

  const config: any = {
    exchange: {
      endpoint,
      version: "auto",
      provider: "auto",
      ewsPath,
      restPath: "/api/v2.0",
      powershellUri,
      insecure: answers.insecure,
      tls: { rejectUnauthorized: !answers.insecure, allowSelfSigned: answers.insecure },
    },
    auth: {
      method: "basic",
      basic: {
        username: answers.username,
        password: `\${${passwordEnv}}`,
        domain: answers.domain || undefined,
      },
    },
    server: {
      transport: "stdio",
      port: 3000,
      host: "0.0.0.0",
    },
    logging: { level: "info", file: "" },
  };

  // Merge with existing to preserve other keys
  const merged = { ...existing, ...config, exchange: { ...existing.exchange, ...config.exchange }, auth: { ...existing.auth, ...config.auth, basic: { ...existing.auth?.basic, ...config.auth.basic } }, server: { ...existing.server, ...config.server } };

  writeFileSync(configPath, yamlDump(merged), "utf-8");
  console.log(`\nWrote ${configPath}`);

  // Write password to .env (not committed to git)
  const envPath = resolve(process.cwd(), ".env");
  const envLine = `${passwordEnv}="${answers.password.replace(/"/g, '\\"')}"\n`;
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    if (envContent.includes(`${passwordEnv}=`)) {
      // Replace existing line
      const newEnv = envContent.replace(new RegExp(`^${passwordEnv}=.*$`, "m"), envLine.trim());
      writeFileSync(envPath, newEnv, "utf-8");
    } else {
      appendFileSync(envPath, envLine, "utf-8");
    }
  } else {
    writeFileSync(envPath, envLine, "utf-8");
  }
  console.log(`Wrote password to ${envPath} (not tracked by git)`);

  console.log(`\nTesting connectivity — PowerShell + EWS (production insecure:${answers.insecure})...`);

  // Test both endpoints via doctor logic (import to avoid duplication)
  const { testConnectivity } = await import("./doctor.js");
  const result = await testConnectivity({ endpoint, powershellUri, ewsPath: ewsPath, insecure: answers.insecure });
  console.log(JSON.stringify(result, null, 2));

  console.log(`\nNext: npx exchange-mcp add --client opencode,claude-code  (or npm run add)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
