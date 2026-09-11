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

describe("clientaccess writes Batch 2a (proxies, export, New-/Remove-)", () => {
  it("exchange_disable_pushnotificationproxy", async () => {
    const { fn, ps } = await tool("exchange_disable_pushnotificationproxy");
    await fn({});
    expect(ps.commands).toEqual([`Disable-PushNotificationProxy -Confirm:$false`]);
  });

  it("exchange_enable_pushnotificationproxy with organization", async () => {
    const { fn, ps } = await tool("exchange_enable_pushnotificationproxy");
    await fn({ organization: "contoso.onmicrosoft.com" });
    expect(ps.commands).toEqual([`Enable-PushNotificationProxy -Organization 'contoso.onmicrosoft.com' -Confirm:$false`]);
  });

  it("exchange_export_autodiscoverconfig (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_export_autodiscoverconfig");
    await fn({ targetForestDomainController: "contoso.com" });
    expect(ps.commands).toEqual([`Export-AutoDiscoverConfig -TargetForestDomainController 'contoso.com' -Confirm:$false`]);
  });

  it("exchange_new_clientaccessrule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_new_clientaccessrule");
    await fn({ name: "AllowRemotePS", action: "AllowAccess", anyOfProtocols: "RemotePowerShell", priority: 1 });
    expect(ps.commands).toEqual([`New-ClientAccessRule -Name 'AllowRemotePS' -Action AllowAccess -AnyOfProtocols RemotePowerShell -Priority 1 -Confirm:$false`]);
  });

  it("exchange_new_outlookprovider (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_new_outlookprovider");
    await fn({ name: "MyOABUrl" });
    expect(ps.commands).toEqual([`New-OutlookProvider -Name 'MyOABUrl' -Confirm:$false`]);
  });

  it("exchange_new_owamailboxpolicy (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_new_owamailboxpolicy");
    await fn({ name: "Corporate" });
    expect(ps.commands).toEqual([`New-OwaMailboxPolicy -Name 'Corporate' -Confirm:$false`]);
  });

  it("exchange_remove_clientaccessrule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_clientaccessrule");
    await fn({ identity: "Block Client Connections from 192.168.1.0/24" });
    expect(ps.commands).toEqual([`Remove-ClientAccessRule -Identity 'Block Client Connections from 192.168.1.0/24' -Confirm:$false`]);
  });

  it("exchange_remove_outlookprovider (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_outlookprovider");
    await fn({ identity: "Test Object" });
    expect(ps.commands).toEqual([`Remove-OutlookProvider -Identity 'Test Object' -Confirm:$false`]);
  });

  it("exchange_remove_owamailboxpolicy (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_owamailboxpolicy");
    await fn({ identity: "Executives" });
    expect(ps.commands).toEqual([`Remove-OwaMailboxPolicy -Identity 'Executives' -Confirm:$false`]);
  });
});
