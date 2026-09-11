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

describe("clientaccess Set-* writes Batch 2b", () => {
  it("exchange_set_casmailbox disables OWA+POP (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_casmailbox");
    await fn({ identity: "adam@contoso.com", owaEnabled: false, popEnabled: false });
    expect(ps.commands).toEqual([`Set-CASMailbox -Identity 'adam@contoso.com' -OWAEnabled $false -PopEnabled $false`]);
  });

  it("exchange_set_clientaccessrule toggles enabled", async () => {
    const { fn, ps } = await tool("exchange_set_clientaccessrule");
    await fn({ identity: "Allow IMAP4", enabled: false });
    expect(ps.commands).toEqual([`Set-ClientAccessRule -Identity 'Allow IMAP4' -Enabled $false -Confirm:$false`]);
  });

  it("exchange_set_imapsettings bindings (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_imapsettings");
    await fn({ server: "MBX01", unencryptedOrTLSBindings: "10.0.0.0:143" });
    expect(ps.commands).toEqual([`Set-ImapSettings -Server 'MBX01' -UnencryptedOrTLSBindings '10.0.0.0:143'`]);
  });

  it("exchange_set_imapsettings logging (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_set_imapsettings");
    await fn({ protocolLogEnabled: true, logFileLocation: "C:\\Imap4Logging" });
    expect(ps.commands[0]).toContain(`-ProtocolLogEnabled $true`);
    expect(ps.commands[0]).toContain(`-LogFileLocation 'C:\\Imap4Logging'`);
  });

  it("exchange_set_mailboxcalendarconfiguration disables reminders (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_mailboxcalendarconfiguration");
    await fn({ identity: "peter@contoso.com", remindersEnabled: false });
    expect(ps.commands).toEqual([`Set-MailboxCalendarConfiguration -Identity 'peter@contoso.com' -RemindersEnabled $false`]);
  });

  it("exchange_set_mailboxmessageconfiguration hides deleted items (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_mailboxmessageconfiguration");
    await fn({ identity: "kai@contoso.com", hideDeletedItems: true });
    expect(ps.commands).toEqual([`Set-MailboxMessageConfiguration -Identity 'kai@contoso.com' -HideDeletedItems $true`]);
  });

  it("exchange_set_mailboxregionalconfiguration language (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_mailboxregionalconfiguration");
    await fn({ identity: "Marcelo Teixeira", language: "pt-br", localizeDefaultFolderName: true });
    expect(ps.commands).toEqual([`Set-MailboxRegionalConfiguration -Identity 'Marcelo Teixeira' -Language 'pt-br' -LocalizeDefaultFolderName`]);
  });

  it("exchange_set_mailboxspellingconfiguration ignore uppercase (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_mailboxspellingconfiguration");
    await fn({ identity: "kai", ignoreUppercase: true });
    expect(ps.commands).toEqual([`Set-MailboxSpellingConfiguration -Identity 'kai' -IgnoreUppercase $true`]);
  });

  it("exchange_set_outlookprovider TTL (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_outlookprovider");
    await fn({ identity: "msExchAutoDiscoverConfig", ttl: 2 });
    expect(ps.commands).toEqual([`Set-OutlookProvider -Identity 'msExchAutoDiscoverConfig' -TTL 2`]);
  });

  it("exchange_set_owamailboxpolicy disables tasks (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_set_owamailboxpolicy");
    await fn({ identity: "Default", tasksEnabled: false });
    expect(ps.commands).toEqual([`Set-OwaMailboxPolicy -Identity 'Default' -TasksEnabled $false`]);
  });

  it("exchange_set_popsettings bindings (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_popsettings");
    await fn({ server: "MBX01", unencryptedOrTLSBindings: "10.0.0.0:110" });
    expect(ps.commands).toEqual([`Set-PopSettings -Server 'MBX01' -UnencryptedOrTLSBindings '10.0.0.0:110'`]);
  });
});
