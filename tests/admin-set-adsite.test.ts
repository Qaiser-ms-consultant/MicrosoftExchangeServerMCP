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

describe("exchange_set_adsite", () => {
  it("enables hub site (docs Example 1)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    const fn = server.tools["exchange_set_adsite"];
    expect(fn).toBeDefined();
    await fn({ identity: "Default-First-Site-Name", hubSiteEnabled: true });
    expect(ps.commands).toEqual([
      `Set-ADSite -Identity 'Default-First-Site-Name' -HubSiteEnabled $true`,
    ]);
  });

  it("toggles inbound mail", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await server.tools["exchange_set_adsite"]({ identity: "Default-First-Site-Name", inboundMailEnabled: false });
    expect(ps.commands[0]).toContain(`-InboundMailEnabled $false`);
  });

  it("passes domainController through", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await server.tools["exchange_set_adsite"]({
      identity: "Default-First-Site-Name",
      hubSiteEnabled: true,
      domainController: "dc01.contoso.com",
    });
    expect(ps.commands[0]).toContain(`-DomainController 'dc01.contoso.com'`);
  });
});
