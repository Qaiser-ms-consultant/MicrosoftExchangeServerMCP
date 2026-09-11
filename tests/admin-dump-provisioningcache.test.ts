import { describe, expect, it } from "vitest";
import { registerDiagnosticsExtended } from "../src/tools/admin-diagnostics-extended.js";

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

describe("exchange_dump_provisioningcache", () => {
  it("dumps GlobalCache (docs Example 1)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerDiagnosticsExtended(server as any, ps as any);
    const fn = server.tools["exchange_dump_provisioningcache"];
    expect(fn).toBeDefined();
    const res = await fn({
      server: "EXSRV1.contoso.com",
      application: "Powershell-Proxy",
      globalCache: true,
    });
    expect(ps.commands).toEqual([
      `Dump-ProvisioningCache -Server 'EXSRV1.contoso.com' -Application 'Powershell-Proxy' -GlobalCache`,
    ]);
    expect(res.content[0].text).toBeDefined();
  });

  it("supports OrganizationCache set with currentOrganization and cacheKeys", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerDiagnosticsExtended(server as any, ps as any);
    await server.tools["exchange_dump_provisioningcache"]({
      server: "EXSRV1.contoso.com",
      application: "Powershell-Proxy",
      currentOrganization: true,
      cacheKeys: "11111111-2222-3333-4444-555555555555",
    });
    expect(ps.commands[0]).toContain(`-CurrentOrganization`);
    expect(ps.commands[0]).toContain(`11111111-2222-3333-4444-555555555555`);
  });

  it("rejects globalCache combined with organization scope", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerDiagnosticsExtended(server as any, ps as any);
    await expect(
      server.tools["exchange_dump_provisioningcache"]({
        server: "EXSRV1.contoso.com",
        application: "Powershell-Proxy",
        globalCache: true,
        currentOrganization: true,
      }),
    ).rejects.toThrow(/globalCache.*organization|organization.*globalCache/i);
  });
});
