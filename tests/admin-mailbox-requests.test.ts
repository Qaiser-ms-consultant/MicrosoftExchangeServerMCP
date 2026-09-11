import { describe, expect, it } from "vitest";
import { registerMailboxRecoveryTools } from "../src/tools/admin-mailbox-recovery.js";

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
  registerMailboxRecoveryTools(server as any, ps as any);
  const fn = server.tools[name];
  expect(fn, `${name} registered`).toBeDefined();
  return { fn, ps };
}

describe("mailbox requests/misc Batch 3", () => {
  it("exchange_set_mailboxexportrequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_mailboxexportrequest");
    await fn({ identity: "Ayla\\MailboxExport1", badItemLimit: "10" });
    expect(ps.commands).toEqual([`Set-MailboxExportRequest -Identity 'Ayla\\MailboxExport1' -BadItemLimit 10`]);
  });

  it("exchange_suspend_mailboxexportrequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_suspend_mailboxexportrequest");
    await fn({ identity: "Ayla\\MailboxExport1" });
    expect(ps.commands).toEqual([`Suspend-MailboxExportRequest -Identity 'Ayla\\MailboxExport1' -Confirm:$false`]);
  });

  it("exchange_resume_mailboxexportrequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_resume_mailboxexportrequest");
    await fn({ identity: "kweku\\export" });
    expect(ps.commands).toEqual([`Resume-MailboxExportRequest -Identity 'kweku\\export'`]);
  });

  it("exchange_remove_mailboxexportrequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_mailboxexportrequest");
    await fn({ identity: "Ayla\\MailboxExport1" });
    expect(ps.commands).toEqual([`Remove-MailboxExportRequest -Identity 'Ayla\\MailboxExport1' -Confirm:$false`]);
  });

  it("exchange_get_mailboxexportrequeststatistics (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxexportrequeststatistics");
    await fn({ identity: "Tony\\MailboxExport1" });
    expect(ps.commands).toEqual([`Get-MailboxExportRequestStatistics -Identity 'Tony\\MailboxExport1'`]);
  });

  it("exchange_set_mailboximportrequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_mailboximportrequest");
    await fn({ identity: "Kweku\\Import", badItemLimit: "5" });
    expect(ps.commands).toEqual([`Set-MailboxImportRequest -Identity 'Kweku\\Import' -BadItemLimit 5`]);
  });

  it("exchange_suspend_mailboximportrequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_suspend_mailboximportrequest");
    await fn({ identity: "Ayla\\MailboxImport1" });
    expect(ps.commands).toEqual([`Suspend-MailboxImportRequest -Identity 'Ayla\\MailboxImport1' -Confirm:$false`]);
  });

  it("exchange_resume_mailboximportrequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_resume_mailboximportrequest");
    await fn({ identity: "kweku\\MailboxImport1" });
    expect(ps.commands).toEqual([`Resume-MailboxImportRequest -Identity 'kweku\\MailboxImport1'`]);
  });

  it("exchange_get_mailboxrestorerequeststatistics (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxrestorerequeststatistics");
    await fn({ identity: "Tony\\MailboxRestore1" });
    expect(ps.commands).toEqual([`Get-MailboxRestoreRequestStatistics -Identity 'Tony\\MailboxRestore1'`]);
  });

  it("exchange_set_mailboxrestorerequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_mailboxrestorerequest");
    await fn({ identity: "Ayla\\MailboxRestore1", badItemLimit: "10" });
    expect(ps.commands).toEqual([`Set-MailboxRestoreRequest -Identity 'Ayla\\MailboxRestore1' -BadItemLimit 10`]);
  });

  it("exchange_suspend_mailboxrestorerequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_suspend_mailboxrestorerequest");
    await fn({ identity: "Ayla\\MailboxRestore1" });
    expect(ps.commands).toEqual([`Suspend-MailboxRestoreRequest -Identity 'Ayla\\MailboxRestore1' -Confirm:$false`]);
  });

  it("exchange_resume_mailboxrestorerequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_resume_mailboxrestorerequest");
    await fn({ identity: "kweku\\RestoreFromDB01" });
    expect(ps.commands).toEqual([`Resume-MailboxRestoreRequest -Identity 'kweku\\RestoreFromDB01'`]);
  });

  it("exchange_remove_mailboxrestorerequest (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_mailboxrestorerequest");
    await fn({ identity: "Ayla\\MailboxRestore1" });
    expect(ps.commands).toEqual([`Remove-MailboxRestoreRequest -Identity 'Ayla\\MailboxRestore1' -Confirm:$false`]);
  });

  it("exchange_disable_serviceemailchannel (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_disable_serviceemailchannel");
    await fn({ identity: "JeffHay" });
    expect(ps.commands).toEqual([`Disable-ServiceEmailChannel -Identity 'JeffHay' -Confirm:$false`]);
  });

  it("exchange_enable_serviceemailchannel (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_enable_serviceemailchannel");
    await fn({ identity: "tony@contoso.com" });
    expect(ps.commands).toEqual([`Enable-ServiceEmailChannel -Identity 'tony@contoso.com'`]);
  });

  it("exchange_new_mailmessage (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_new_mailmessage");
    await fn({ subject: "Delivery Report", body: "Click here to view this report" });
    expect(ps.commands).toEqual([`New-MailMessage -Subject 'Delivery Report' -Body 'Click here to view this report'`]);
  });

  it("exchange_remove_calendarevents (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_calendarevents");
    await fn({ identity: "chris@contoso.com", cancelOrganizedMeetings: true, queryWindowInDays: 120 });
    expect(ps.commands).toEqual([`Remove-CalendarEvents -Identity 'chris@contoso.com' -CancelOrganizedMeetings -QueryWindowInDays 120 -Confirm:$false`]);
  });

  it("exchange_get_recoverableitems (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_get_recoverableitems");
    await fn({ identity: "laura@contoso.com", subjectContains: "FY17 Accounting", filterItemType: "IPM.Note", filterStartTime: "2/1/2018 12:00:00 AM", filterEndTime: "2/5/2018 11:59:59 PM" });
    expect(ps.commands).toEqual([`Get-RecoverableItems -Identity 'laura@contoso.com' -SubjectContains 'FY17 Accounting' -FilterItemType IPM.Note -FilterStartTime '2/1/2018 12:00:00 AM' -FilterEndTime '2/5/2018 11:59:59 PM'`]);
  });

  it("exchange_test_mapiconnectivity server (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_test_mapiconnectivity");
    await fn({ server: "Server01" });
    expect(ps.commands).toEqual([`Test-MAPIConnectivity -Server 'Server01'`]);
  });
});
