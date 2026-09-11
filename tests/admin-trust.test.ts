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

describe("exchange_get_trust", () => {
  it("enumerates trusts for a domain (docs Example 1)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    const fn = server.tools["exchange_get_trust"];
    expect(fn).toBeDefined();
    const res = await fn({ domainName: "Contoso.com" });
    expect(ps.commands[0]).toContain(`Get-Trust -DomainName 'Contoso.com'`);
    expect(res.content[0].text).toBeDefined();
  });

  it("lists all trusts when no domain given", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await server.tools["exchange_get_trust"]({});
    expect(ps.commands[0].startsWith(`Get-Trust`)).toBe(true);
  });
});
