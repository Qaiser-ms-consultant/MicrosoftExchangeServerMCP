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

describe("exchange_get_adsite", () => {
  it("shows a named site (docs Example 1: Get-ADSite Default-First-Site-Name)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    const fn = server.tools["exchange_get_adsite"];
    expect(fn).toBeDefined();
    await fn({ identity: "Default-First-Site-Name" });
    expect(ps.commands).toEqual([`Get-ADSite -Identity 'Default-First-Site-Name'`]);
  });

  it("lists all sites when no identity given", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    const res = await server.tools["exchange_get_adsite"]({});
    expect(ps.commands).toEqual([`Get-ADSite`]);
    expect(res.content[0].text).toBeDefined();
  });

  it("passes domainController through", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await server.tools["exchange_get_adsite"]({ identity: "Default-First-Site-Name", domainController: "dc01.contoso.com" });
    expect(ps.commands[0]).toContain(`-DomainController 'dc01.contoso.com'`);
  });
});
