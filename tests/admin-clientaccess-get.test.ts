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

describe("clientaccess Get-* reads (Batch 1)", () => {
  it("exchange_get_clientaccessrule lists all + one by identity", async () => {
    const { fn, ps } = await tool("exchange_get_clientaccessrule");
    const res = await fn({});
    expect(ps.commands[0]).toContain(`Get-ClientAccessRule`);
    expect(res.content[0].text).toBeDefined();
    const ps2 = psCapturing();
    const server2 = makeServer();
    registerClientAccessTools(server2 as any, ps2 as any);
    await server2.tools["exchange_get_clientaccessrule"]({ identity: "Block Client Connections from 192.168.1.0/24" });
    expect(ps2.commands[0]).toContain(`-Identity 'Block Client Connections from 192.168.1.0/24'`);
  });

  it("exchange_get_imapsettings targets a server", async () => {
    const { fn, ps } = await tool("exchange_get_imapsettings");
    await fn({ server: "MBX01" });
    expect(ps.commands).toEqual([`Get-ImapSettings -Server 'MBX01'`]);
  });

  it("exchange_get_mailboxcalendarconfiguration requires identity", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxcalendarconfiguration");
    await fn({ identity: "kai" });
    expect(ps.commands).toEqual([`Get-MailboxCalendarConfiguration -Identity 'kai'`]);
  });

  it("exchange_get_mailboxmessageconfiguration shows OWA settings", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxmessageconfiguration");
    await fn({ identity: "tony@contoso.com" });
    expect(ps.commands).toEqual([`Get-MailboxMessageConfiguration -Identity 'tony@contoso.com'`]);
  });

  it("exchange_get_mailboxregionalconfiguration with verify switch", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxregionalconfiguration");
    await fn({ identity: "Alice Jakobsen", verifyDefaultFolderNameLanguage: true });
    expect(ps.commands[0]).toContain(`Get-MailboxRegionalConfiguration -Identity 'Alice Jakobsen'`);
    expect(ps.commands[0]).toContain(`-VerifyDefaultFolderNameLanguage`);
  });

  it("exchange_get_mailboxspellingconfiguration by identity", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxspellingconfiguration");
    await fn({ identity: "Tony" });
    expect(ps.commands).toEqual([`Get-MailboxSpellingConfiguration -Identity 'Tony'`]);
  });

  it("exchange_get_outlookprovider lists all + WEB detail", async () => {
    const { fn, ps } = await tool("exchange_get_outlookprovider");
    await fn({});
    expect(ps.commands).toEqual([`Get-OutlookProvider`]);
    const ps2 = psCapturing();
    const server2 = makeServer();
    registerClientAccessTools(server2 as any, ps2 as any);
    await server2.tools["exchange_get_outlookprovider"]({ identity: "WEB" });
    expect(ps2.commands).toEqual([`Get-OutlookProvider -Identity 'WEB'`]);
  });

  it("exchange_get_owamailboxpolicy lists all + Executives", async () => {
    const { fn, ps } = await tool("exchange_get_owamailboxpolicy");
    await fn({});
    expect(ps.commands).toEqual([`Get-OwaMailboxPolicy`]);
    const ps2 = psCapturing();
    const server2 = makeServer();
    registerClientAccessTools(server2 as any, ps2 as any);
    await server2.tools["exchange_get_owamailboxpolicy"]({ identity: "Executives" });
    expect(ps2.commands).toEqual([`Get-OwaMailboxPolicy -Identity 'Executives'`]);
  });

  it("exchange_get_popsettings local + MBX01", async () => {
    const { fn, ps } = await tool("exchange_get_popsettings");
    await fn({});
    expect(ps.commands).toEqual([`Get-PopSettings`]);
    const ps2 = psCapturing();
    const server2 = makeServer();
    registerClientAccessTools(server2 as any, ps2 as any);
    await server2.tools["exchange_get_popsettings"]({ server: "MBX01" });
    expect(ps2.commands).toEqual([`Get-PopSettings -Server 'MBX01'`]);
  });
});
