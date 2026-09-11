import { describe, expect, it } from "vitest";
import { registerMailboxFeatureTools } from "../src/tools/admin-mailbox-features.js";

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
  registerMailboxFeatureTools(server as any, ps as any);
  const fn = server.tools[name];
  expect(fn, `${name} registered`).toBeDefined();
  return { fn, ps };
}

describe("mailbox rules/folders/sweep Batch 1", () => {
  it("exchange_disable_inboxrule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_disable_inboxrule");
    await fn({ identity: "MoveAnnouncements", mailbox: "Joe@Contoso.com" });
    expect(ps.commands).toEqual([`Disable-InboxRule -Identity 'MoveAnnouncements' -Mailbox 'Joe@Contoso.com' -Confirm:$false`]);
  });

  it("exchange_enable_inboxrule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_enable_inboxrule");
    await fn({ identity: "Move To Junk Mail", mailbox: "User 1" });
    expect(ps.commands).toEqual([`Enable-InboxRule -Identity 'Move To Junk Mail' -Mailbox 'User 1' -Confirm:$false`]);
  });

  it("exchange_set_inboxrule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_inboxrule");
    await fn({ mailbox: "chris@contoso.com", name: "ProjectContoso", markImportance: "High" });
    expect(ps.commands).toEqual([`Set-InboxRule -Mailbox 'chris@contoso.com' -Name 'ProjectContoso' -MarkImportance High`]);
  });

  it("exchange_remove_inboxrule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_inboxrule");
    await fn({ identity: "ProjectA-MoveToFolderA", mailbox: "Joe@Contoso.com" });
    expect(ps.commands).toEqual([`Remove-InboxRule -Identity 'ProjectA-MoveToFolderA' -Mailbox 'Joe@Contoso.com' -Confirm:$false`]);
  });

  it("exchange_add_mailboxfolderpermission (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_add_mailboxfolderpermission");
    await fn({ identity: "ayla@contoso.com:\\Marketing", user: "ed@contoso.com", accessRights: "Owner" });
    expect(ps.commands).toEqual([`Add-MailboxFolderPermission -Identity 'ayla@contoso.com:\\Marketing' -User 'ed@contoso.com' -AccessRights Owner`]);
  });

  it("exchange_remove_mailboxfolderpermission (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_mailboxfolderpermission");
    await fn({ identity: "kim@contoso.com:\\Training", user: "john@contoso.com" });
    expect(ps.commands).toEqual([`Remove-MailboxFolderPermission -Identity 'kim@contoso.com:\\Training' -User 'john@contoso.com' -Confirm:$false`]);
  });

  it("exchange_set_mailboxfolderpermission (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_mailboxfolderpermission");
    await fn({ identity: "ayla@contoso.com:\\Marketing", user: "ed@contoso.com", accessRights: "Owner" });
    expect(ps.commands).toEqual([`Set-MailboxFolderPermission -Identity 'ayla@contoso.com:\\Marketing' -User 'ed@contoso.com' -AccessRights Owner`]);
  });

  it("exchange_get_mailboxfolder children (docs Example 4)", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxfolder");
    await fn({ identity: ":\\Inbox", getChildren: true });
    expect(ps.commands).toEqual([`Get-MailboxFolder -Identity ':\\Inbox' -GetChildren`]);
  });

  it("exchange_new_mailboxfolder (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_new_mailboxfolder");
    await fn({ name: "Personal", parent: ":\\Inbox" });
    expect(ps.commands).toEqual([`New-MailboxFolder -Name 'Personal' -Parent ':\\Inbox'`]);
  });

  it("exchange_get_sweeprule by mailbox (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_get_sweeprule");
    await fn({ mailbox: "julia@contoso.com" });
    expect(ps.commands).toEqual([`Get-SweepRule -Mailbox 'julia@contoso.com'`]);
  });

  it("exchange_new_sweeprule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_new_sweeprule");
    await fn({ name: "From Michelle", mailbox: "Felipe Apodaca", provider: "Exchange16", sender: "michelle@fabrikam.com", keepLatest: 1 });
    expect(ps.commands).toEqual([`New-SweepRule -Name 'From Michelle' -Provider Exchange16 -Mailbox 'Felipe Apodaca' -Sender 'michelle@fabrikam.com' -KeepLatest 1`]);
  });

  it("exchange_set_sweeprule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_sweeprule");
    await fn({ identity: "x2hlsdpGmUifjFgxxGIOJw==", keepForDays: 15, exceptIfPinned: true });
    expect(ps.commands).toEqual([`Set-SweepRule -Identity 'x2hlsdpGmUifjFgxxGIOJw==' -KeepForDays 15 -ExceptIfPinned $true`]);
  });

  it("exchange_remove_sweeprule (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_sweeprule");
    await fn({ identity: "x2hlsdpGmUifjFgxxGIOJw==" });
    expect(ps.commands).toEqual([`Remove-SweepRule -Identity 'x2hlsdpGmUifjFgxxGIOJw==' -Confirm:$false`]);
  });

  it("exchange_enable_sweeprule + exchange_disable_sweeprule", async () => {
    const { fn, ps } = await tool("exchange_enable_sweeprule");
    await fn({ identity: "x2hlsdpGmUifjFgxxGIOJw==" });
    expect(ps.commands).toEqual([`Enable-SweepRule -Identity 'x2hlsdpGmUifjFgxxGIOJw=='`]);
    const t2 = await tool("exchange_disable_sweeprule");
    await t2.fn({ identity: "x2hlsdpGmUifjFgxxGIOJw==" });
    expect(t2.ps.commands).toEqual([`Disable-SweepRule -Identity 'x2hlsdpGmUifjFgxxGIOJw=='`]);
  });
});
