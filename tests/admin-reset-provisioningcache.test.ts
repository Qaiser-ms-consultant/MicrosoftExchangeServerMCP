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

describe("exchange_reset_provisioningcache", () => {
  it("resets GlobalCache (docs Example 1)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerDiagnosticsExtended(server as any, ps as any);
    const fn = server.tools["exchange_reset_provisioningcache"];
    expect(fn).toBeDefined();
    const res = await fn({
      server: "EXSRV1.contoso.com",
      application: "Powershell",
      globalCache: true,
    });
    expect(ps.commands).toEqual([
      `Reset-ProvisioningCache -Server 'EXSRV1.contoso.com' -Application 'Powershell' -GlobalCache -Confirm:$false`,
    ]);
    expect(res.content[0].text).toContain("EXSRV1.contoso.com");
  });

  it("resets for multi-tenant host (docs Example 2)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerDiagnosticsExtended(server as any, ps as any);
    await server.tools["exchange_reset_provisioningcache"]({
      server: "datacenter1.adatum.com",
      application: "Powershell-Proxy",
      globalCache: true,
    });
    expect(ps.commands[0]).toContain(`-Server 'datacenter1.adatum.com'`);
    expect(ps.commands[0]).toContain(`-Application 'Powershell-Proxy'`);
  });

  it("rejects globalCache combined with organization scope", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerDiagnosticsExtended(server as any, ps as any);
    await expect(
      server.tools["exchange_reset_provisioningcache"]({
        server: "EXSRV1.contoso.com",
        application: "Powershell",
        globalCache: true,
        currentOrganization: true,
      }),
    ).rejects.toThrow(/globalCache.*organization|organization.*globalCache/i);
  });
});
