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

describe("exchange_set_adserversettings", () => {
  it("sets recipient scope (docs Example 1)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    const fn = server.tools["exchange_set_adserversettings"];
    expect(fn).toBeDefined();
    await fn({ recipientViewRoot: "contoso.com/Marketing Users" });
    expect(ps.commands).toEqual([
      `Set-ADServerSettings -RecipientViewRoot 'contoso.com/Marketing Users'`,
    ]);
  });

  it("sets forest scope + preferred GC (docs Example 2)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await server.tools["exchange_set_adserversettings"]({
      viewEntireForest: true,
      preferredGlobalCatalog: "gc1.contoso.com",
    });
    expect(ps.commands[0]).toContain(`-ViewEntireForest $true`);
    expect(ps.commands[0]).toContain(`-PreferredGlobalCatalog 'gc1.contoso.com'`);
  });

  it("supports SingleDC preferredServer", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await server.tools["exchange_set_adserversettings"]({ preferredServer: "dc01.contoso.com" });
    expect(ps.commands[0]).toContain(`Set-ADServerSettings -PreferredServer 'dc01.contoso.com'`);
  });
});
