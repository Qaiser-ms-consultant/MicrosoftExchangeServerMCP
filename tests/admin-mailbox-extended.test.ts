import { describe, expect, it } from "vitest";
import { registerMailboxExtendedTools } from "../src/tools/admin-mailbox-extended.js";

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
  registerMailboxExtendedTools(server as any, ps as any);
  const fn = server.tools[name];
  expect(fn, `${name} registered`).toBeDefined();
  return { fn, ps };
}

describe("mailbox calendar/config/photos Batch 2", () => {
  it("exchange_get_calendarprocessing (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_get_calendarprocessing");
    await fn({ identity: "Room 212" });
    expect(ps.commands).toEqual([`Get-CalendarProcessing -Identity 'Room 212'`]);
  });

  it("exchange_set_calendarprocessing (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_calendarprocessing");
    await fn({ identity: "Conf 212", automateProcessing: "AutoAccept", deleteComments: true, addOrganizerToSubject: true, allowConflicts: false });
    expect(ps.commands).toEqual([`Set-CalendarProcessing -Identity 'Conf 212' -AutomateProcessing AutoAccept -DeleteComments $true -AddOrganizerToSubject $true -AllowConflicts $false`]);
  });

  it("exchange_get_mailboxcalendarfolder (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxcalendarfolder");
    await fn({ identity: "kai:\\Calendar" });
    expect(ps.commands).toEqual([`Get-MailboxCalendarFolder -Identity 'kai:\\Calendar'`]);
  });

  it("exchange_get_calendarnotification (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_get_calendarnotification");
    await fn({ identity: "tony@contoso.com" });
    expect(ps.commands).toEqual([`Get-CalendarNotification -Identity 'tony@contoso.com'`]);
  });

  it("exchange_set_calendarnotification (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_calendarnotification");
    await fn({ identity: "TonySmith", calendarUpdateNotification: true, meetingReminderNotification: true, meetingReminderSendDuringWorkHour: true, dailyAgendaNotification: true });
    expect(ps.commands).toEqual([`Set-CalendarNotification -Identity 'TonySmith' -CalendarUpdateNotification $true -MeetingReminderNotification $true -MeetingReminderSendDuringWorkHour $true -DailyAgendaNotification $true`]);
  });

  it("exchange_get_resourceconfig (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_get_resourceconfig");
    await fn({});
    expect(ps.commands).toEqual([`Get-ResourceConfig`]);
  });

  it("exchange_set_resourceconfig (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_resourceconfig");
    await fn({ resourcePropertySchema: "Room/Whiteboard,Equipment/Van" });
    expect(ps.commands).toEqual([`Set-ResourceConfig -ResourcePropertySchema 'Room/Whiteboard','Equipment/Van'`]);
  });

  it("exchange_get_messagecategory (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_get_messagecategory");
    await fn({ mailbox: "User1" });
    expect(ps.commands).toEqual([`Get-MessageCategory -Mailbox 'User1'`]);
  });

  it("exchange_get_mailboxlocation by identity (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxlocation");
    await fn({ identity: "e15664af-82ed-4635-b02a-df7c2e03d950" });
    expect(ps.commands).toEqual([`Get-MailboxLocation -Identity 'e15664af-82ed-4635-b02a-df7c2e03d950'`]);
  });

  it("exchange_get_mailboxuserconfiguration (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_get_mailboxuserconfiguration");
    await fn({ mailbox: "julia@contoso.com", identity: "Configuration\\IPM.Configuration.Aggregated.OwaUserConfiguration" });
    expect(ps.commands).toEqual([`Get-MailboxUserConfiguration -Mailbox 'julia@contoso.com' -Identity 'Configuration\\IPM.Configuration.Aggregated.OwaUserConfiguration'`]);
  });

  it("exchange_remove_mailboxuserconfiguration (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_mailboxuserconfiguration");
    await fn({ mailbox: "julia@contoso.com", identity: "Configuration\\IPM.Configuration.Aggregated.OwaUserConfiguration" });
    expect(ps.commands).toEqual([`Remove-MailboxUserConfiguration -Mailbox 'julia@contoso.com' -Identity 'Configuration\\IPM.Configuration.Aggregated.OwaUserConfiguration' -Confirm:$false`]);
  });

  it("exchange_export_mailboxdiagnosticlogs (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_export_mailboxdiagnosticlogs");
    await fn({ identity: "Yuuto Sasaki", componentName: "CalendarPermissions" });
    expect(ps.commands).toEqual([`Export-MailboxDiagnosticLogs -Identity 'Yuuto Sasaki' -ComponentName CalendarPermissions`]);
  });

  it("exchange_export_recipientdataproperty picture (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_export_recipientdataproperty");
    await fn({ identity: "Ayla Kol", picture: true });
    expect(ps.commands).toEqual([`Export-RecipientDataProperty -Identity 'Ayla Kol' -Picture`]);
  });

  it("exchange_import_recipientdataproperty picture (docs Example 2)", async () => {
    const { fn, ps } = await tool("exchange_import_recipientdataproperty");
    await fn({ identity: "Ayla", picture: true, filePath: "M:\\Employee Photos\\AylaKol.jpg" });
    expect(ps.commands[0]).toContain(`Import-RecipientDataProperty -Identity 'Ayla' -Picture -FileData $data`);
    expect(ps.commands[0]).toContain(`ReadAllBytes('M:\\Employee Photos\\AylaKol.jpg')`);
  });

  it("exchange_get_userphoto (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_get_userphoto");
    await fn({ identity: "Susan Burk" });
    expect(ps.commands).toEqual([`Get-UserPhoto -Identity 'Susan Burk'`]);
  });

  it("exchange_remove_userphoto (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_remove_userphoto");
    await fn({ identity: "Ann Beebe" });
    expect(ps.commands).toEqual([`Remove-UserPhoto -Identity 'Ann Beebe' -Confirm:$false`]);
  });

  it("exchange_set_userphoto upload (docs Example 1)", async () => {
    const { fn, ps } = await tool("exchange_set_userphoto");
    await fn({ identity: "Paul Cannon", picturePath: "C:\\Users\\Administrator\\Desktop\\PaulCannon.jpg" });
    expect(ps.commands[0]).toContain(`Set-UserPhoto -Identity 'Paul Cannon' -PictureData $data`);
    expect(ps.commands[0]).toContain(`ReadAllBytes('C:\\Users\\Administrator\\Desktop\\PaulCannon.jpg')`);
  });
});
