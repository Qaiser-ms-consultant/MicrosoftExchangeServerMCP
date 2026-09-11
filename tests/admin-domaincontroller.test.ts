import { describe, expect, it } from "vitest";
import { registerOrganizationTools } from "../src/tools/admin-organization.js";

function makeServer() {
  const tools: Record<string, (...args: any[]) => Promise<any>> = {};
  return {
    tool: (name: string, _desc: string, _schema: any, fn: (...args: any[]) => Promise<any>) => {
      tools[name] = fn;
    },
    tools,
  };
}

function psCapturing() {
  const commands: string[] = [];
  return {
    commands,
    invokeJson: async (cmd: string) => {
      commands.push(cmd);
      return [];
    },
    invoke: async (cmd: string) => {
      commands.push(cmd);
      return "";
    },
  };
}

describe("exchange_get_domaincontroller", () => {
  it("lists DCs for a domain (docs Example 1, without interactive Credential)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    const fn = server.tools["exchange_get_domaincontroller"];
    expect(fn).toBeDefined();
    const res = await fn({ domainName: "corp.contoso.com" });
    expect(ps.commands[0]).toContain(`Get-DomainController -DomainName 'corp.contoso.com'`);
    expect(res.content[0].text).toBeDefined();
  });

  it("lists all DCs when no scope given", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await server.tools["exchange_get_domaincontroller"]({});
    expect(ps.commands[0].startsWith(`Get-DomainController`)).toBe(true);
  });

  it("supports GlobalCatalog + Forest set", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await server.tools["exchange_get_domaincontroller"]({ globalCatalog: true, forest: "contoso.com" });
    expect(ps.commands[0]).toContain(`-GlobalCatalog`);
    expect(ps.commands[0]).toContain(`-Forest 'contoso.com'`);
  });
});
