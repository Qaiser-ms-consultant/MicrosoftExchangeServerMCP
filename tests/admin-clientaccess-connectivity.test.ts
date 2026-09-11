import { describe, expect, it } from "vitest";
import { registerClientAccessTools } from "../src/tools/admin-clientaccess.js";

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

async function tool(name: string) {
  const server = makeServer();
  const ps = psCapturing();
  registerClientAccessTools(server as any, ps as any);
  const fn = server.tools[name];
  expect(fn, `${name} registered`).toBeDefined();
  return { fn, ps };
}

describe("clientaccess Test-* connectivity Batch 3", () => {
  it("exchange_test_calendarconnectivity (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_test_calendarconnectivity");
    const res = await fn({ clientAccessServer: "MBX01" });
    expect(ps.commands).toEqual([`Test-CalendarConnectivity -ClientAccessServer 'MBX01'`]);
    expect(res.content[0].text).toBeDefined();
  });

  it("exchange_test_clientaccessrule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_test_clientaccessrule");
    await fn({ authenticationType: "BasicAuthentication", protocol: "OutlookWebApp", remoteAddress: "172.17.17.26", remotePort: 443, user: "julia@contoso.com" });
    expect(ps.commands).toEqual([`Test-ClientAccessRule -AuthenticationType BasicAuthentication -Protocol OutlookWebApp -RemoteAddress '172.17.17.26' -RemotePort 443 -User 'julia@contoso.com'`]);
  });

  it("exchange_test_ecpconnectivity (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_test_ecpconnectivity");
    await fn({ clientAccessServer: "Server01" });
    expect(ps.commands).toEqual([`Test-EcpConnectivity -ClientAccessServer 'Server01'`]);
  });

  it("exchange_test_imapconnectivity (docs Example 2, no interactive creds)", async () => {
    const { fn, ps } = await tool("exchange_test_imapconnectivity");
    await fn({ clientAccessServer: "Contoso12" });
    expect(ps.commands).toEqual([`Test-ImapConnectivity -ClientAccessServer 'Contoso12'`]);
  });

  it("exchange_test_outlookconnectivity probe (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_test_outlookconnectivity");
    await fn({ probeIdentity: "OutlookMapiHttp.Protocol\\OutlookMapiHttpSelfTestProbe" });
    expect(ps.commands).toEqual([`Test-OutlookConnectivity -ProbeIdentity 'OutlookMapiHttp.Protocol\\OutlookMapiHttpSelfTestProbe'`]);
  });

  it("exchange_test_popconnectivity (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_test_popconnectivity");
    await fn({ clientAccessServer: "Contoso12" });
    expect(ps.commands).toEqual([`Test-PopConnectivity -ClientAccessServer 'Contoso12'`]);
  });

  it("exchange_test_powershellconnectivity (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_test_powershellconnectivity");
    await fn({ clientAccessServer: "MBX2", virtualDirectoryName: "PowerShell (Default Web Site)", trustAnySSLCertificate: true });
    expect(ps.commands).toEqual([`Test-PowerShellConnectivity -ClientAccessServer 'MBX2' -VirtualDirectoryName 'PowerShell (Default Web Site)' -TrustAnySSLCertificate`]);
  });

  it("exchange_test_webservicesconnectivity (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_test_webservicesconnectivity");
    await fn({ clientAccessServer: "MBX01" });
    expect(ps.commands).toEqual([`Test-WebServicesConnectivity -ClientAccessServer 'MBX01'`]);
  });
});
