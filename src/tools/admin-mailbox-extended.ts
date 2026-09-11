import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Mailbox Extended — calendar processing/notifications, resource config,
// diagnostics, photos (per index #mailboxes). Reads via invokeJson (no
// confirm); writes follow the New/Set (invokeJson) vs Remove (invoke +
// -Confirm:$false) pattern. Interactive Credential params omitted everywhere.

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function dcSuffix(domainController?: string): string {
  return domainController ? ` -DomainController '${esc(domainController)}'` : "";
}

function bool(v: boolean): string {
  return v ? "$true" : "$false";
}

function qlist(s: string): string {
  return s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `'${esc(x)}'`).join(",");
}

export function registerMailboxExtendedTools(server: McpServer, ps: PowerShellProvider) {
  server.tool("exchange_get_calendarprocessing", "View calendar processing options for a resource mailbox (Get-CalendarProcessing) — Calendar Attendant / booking assistant. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-calendarprocessing", {
    identity: z.string().describe("Resource mailbox, e.g. 'Room 212'"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
    readFromDomainController: z.boolean().optional(),
    resultSize: z.number().min(1).max(10000).optional(),
  }, async ({ identity, domainController, readFromDomainController, resultSize }) => {
    let cmd = `Get-CalendarProcessing -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    if (readFromDomainController) cmd += ` -ReadFromDomainController`;
    if (resultSize !== undefined) cmd += ` -ResultSize ${resultSize}`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_calendarprocessing", "Modify calendar processing for a resource mailbox (Set-CalendarProcessing) — AutoAccept/AutoUpdate, booking policies, delegates. Effective on resource mailboxes only. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-calendarprocessing", {
    identity: z.string().describe("Resource mailbox, e.g. 'Conf 212'"),
    automateProcessing: z.string().optional().describe("None, AutoUpdate, AutoAccept"),
    allowConflicts: z.boolean().optional(),
    allowRecurringMeetings: z.boolean().optional(),
    bookingWindowInDays: z.number().optional().describe("0-1080 (default 180)"),
    bookInPolicy: z.string().optional().describe("Comma-separated auto-approve users/groups (replaces list)"),
    allBookInPolicy: z.boolean().optional(),
    requestInPolicy: z.string().optional().describe("Comma-separated users needing delegate approval"),
    requestOutOfPolicy: z.string().optional(),
    allRequestInPolicy: z.boolean().optional(),
    allRequestOutOfPolicy: z.boolean().optional(),
    resourceDelegates: z.string().optional().describe("Comma-separated approvers"),
    forwardRequestsToDelegates: z.boolean().optional(),
    scheduleOnlyDuringWorkHours: z.boolean().optional(),
    processExternalMeetingMessages: z.boolean().optional(),
    deleteSubject: z.boolean().optional(),
    deleteComments: z.boolean().optional(),
    deleteAttachments: z.boolean().optional(),
    addOrganizerToSubject: z.boolean().optional(),
    removePrivateProperty: z.boolean().optional(),
    tentativePendingApproval: z.boolean().optional(),
    enforceSchedulingHorizon: z.boolean().optional(),
    maximumDurationInMinutes: z.number().optional(),
    domainController: z.string().optional().describe("FQDN (on-prem only)"),
  }, async (p) => {
    let cmd = `Set-CalendarProcessing -Identity '${esc(p.identity)}'`;
    if (p.automateProcessing) cmd += ` -AutomateProcessing ${p.automateProcessing}`;
    if (p.deleteComments !== undefined) cmd += ` -DeleteComments ${bool(p.deleteComments)}`;
    if (p.addOrganizerToSubject !== undefined) cmd += ` -AddOrganizerToSubject ${bool(p.addOrganizerToSubject)}`;
    if (p.allowConflicts !== undefined) cmd += ` -AllowConflicts ${bool(p.allowConflicts)}`;
    if (p.allowRecurringMeetings !== undefined) cmd += ` -AllowRecurringMeetings ${bool(p.allowRecurringMeetings)}`;
    if (p.bookingWindowInDays !== undefined) cmd += ` -BookingWindowInDays ${p.bookingWindowInDays}`;
    if (p.bookInPolicy) cmd += ` -BookInPolicy ${qlist(p.bookInPolicy)}`;
    if (p.allBookInPolicy !== undefined) cmd += ` -AllBookInPolicy ${bool(p.allBookInPolicy)}`;
    if (p.requestInPolicy) cmd += ` -RequestInPolicy ${qlist(p.requestInPolicy)}`;
    if (p.requestOutOfPolicy) cmd += ` -RequestOutOfPolicy ${qlist(p.requestOutOfPolicy)}`;
    if (p.allRequestInPolicy !== undefined) cmd += ` -AllRequestInPolicy ${bool(p.allRequestInPolicy)}`;
    if (p.allRequestOutOfPolicy !== undefined) cmd += ` -AllRequestOutOfPolicy ${bool(p.allRequestOutOfPolicy)}`;
    if (p.resourceDelegates) cmd += ` -ResourceDelegates ${qlist(p.resourceDelegates)}`;
    if (p.forwardRequestsToDelegates !== undefined) cmd += ` -ForwardRequestsToDelegates ${bool(p.forwardRequestsToDelegates)}`;
    if (p.scheduleOnlyDuringWorkHours !== undefined) cmd += ` -ScheduleOnlyDuringWorkHours ${bool(p.scheduleOnlyDuringWorkHours)}`;
    if (p.processExternalMeetingMessages !== undefined) cmd += ` -ProcessExternalMeetingMessages ${bool(p.processExternalMeetingMessages)}`;
    if (p.deleteSubject !== undefined) cmd += ` -DeleteSubject ${bool(p.deleteSubject)}`;
    if (p.deleteAttachments !== undefined) cmd += ` -DeleteAttachments ${bool(p.deleteAttachments)}`;
    if (p.removePrivateProperty !== undefined) cmd += ` -RemovePrivateProperty ${bool(p.removePrivateProperty)}`;
    if (p.tentativePendingApproval !== undefined) cmd += ` -TentativePendingApproval ${bool(p.tentativePendingApproval)}`;
    if (p.enforceSchedulingHorizon !== undefined) cmd += ` -EnforceSchedulingHorizon ${bool(p.enforceSchedulingHorizon)}`;
    if (p.maximumDurationInMinutes !== undefined) cmd += ` -MaximumDurationInMinutes ${p.maximumDurationInMinutes}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_mailboxcalendarfolder", "View calendar publishing/sharing settings (Get-MailboxCalendarFolder). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-mailboxcalendarfolder", {
    identity: z.string().describe("Calendar folder, e.g. kai:\\Calendar"),
    domainController: z.string().optional().describe("FQDN, e.g. DC1 (on-prem only)"),
  }, async ({ identity, domainController }) => {
    let cmd = `Get-MailboxCalendarFolder -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_calendarnotification", "View calendar text-message notification rules (Get-CalendarNotification) — on-prem only; discontinued/deprecated in Microsoft 365. Credential omitted. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-calendarnotification", {
    identity: z.string().describe("Mailbox, e.g. tony@contoso.com"),
    readFromDomainController: z.boolean().optional(),
    resultSize: z.number().min(1).max(10000).optional(),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ identity, readFromDomainController, resultSize, domainController }) => {
    let cmd = `Get-CalendarNotification -Identity '${esc(identity)}'`;
    if (readFromDomainController) cmd += ` -ReadFromDomainController`;
    if (resultSize !== undefined) cmd += ` -ResultSize ${resultSize}`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_calendarnotification", "Set calendar text-message notifications (Set-CalendarNotification) — on-prem only; discontinued/deprecated in Microsoft 365. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-calendarnotification", {
    identity: z.string().describe("Mailbox, e.g. TonySmith"),
    calendarUpdateNotification: z.boolean().optional(),
    calendarUpdateSendDuringWorkHour: z.boolean().optional(),
    dailyAgendaNotification: z.boolean().optional(),
    dailyAgendaNotificationSendTime: z.string().optional().describe("hh:mm:ss, default 08:00:00"),
    meetingReminderNotification: z.boolean().optional(),
    meetingReminderSendDuringWorkHour: z.boolean().optional(),
    nextDays: z.number().min(1).max(7).optional().describe("Agenda days (default 1)"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async (p) => {
    let cmd = `Set-CalendarNotification -Identity '${esc(p.identity)}'`;
    if (p.calendarUpdateNotification !== undefined) cmd += ` -CalendarUpdateNotification ${bool(p.calendarUpdateNotification)}`;
    if (p.calendarUpdateSendDuringWorkHour !== undefined) cmd += ` -CalendarUpdateSendDuringWorkHour ${bool(p.calendarUpdateSendDuringWorkHour)}`;
    if (p.meetingReminderNotification !== undefined) cmd += ` -MeetingReminderNotification ${bool(p.meetingReminderNotification)}`;
    if (p.meetingReminderSendDuringWorkHour !== undefined) cmd += ` -MeetingReminderSendDuringWorkHour ${bool(p.meetingReminderSendDuringWorkHour)}`;
    if (p.dailyAgendaNotification !== undefined) cmd += ` -DailyAgendaNotification ${bool(p.dailyAgendaNotification)}`;
    if (p.dailyAgendaNotificationSendTime) cmd += ` -DailyAgendaNotificationSendTime '${esc(p.dailyAgendaNotificationSendTime)}'`;
    if (p.nextDays !== undefined) cmd += ` -NextDays ${p.nextDays}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_resourceconfig", "View custom room/equipment properties (Get-ResourceConfig) — Identity is internal-use, omitted. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-resourceconfig", {
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com (on-prem only)"),
  }, async ({ domainController }) => {
    let cmd = `Get-ResourceConfig`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_set_resourceconfig", "Create custom room/equipment properties (Set-ResourceConfig) — Room/<Text> or Equipment/<Text>; then assign via Set-Mailbox -ResourceCustom. Overwrites unless @{Add/Remove} syntax passed raw. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-resourceconfig", {
    resourcePropertySchema: z.string().describe("Comma-separated, e.g. 'Room/Whiteboard,Equipment/Van' (or raw @{Add=\"Room/TV\"; Remove=\"Equipment/Laptop\"})"),
    domainController: z.string().optional().describe("FQDN (on-prem only)"),
  }, async ({ resourcePropertySchema, domainController }) => {
    const raw = resourcePropertySchema.trim().startsWith("@{") ? resourcePropertySchema : qlist(resourcePropertySchema);
    let cmd = `Set-ResourceConfig -ResourcePropertySchema ${raw}`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_messagecategory", "Retrieve message categories from a mailbox (Get-MessageCategory). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-messagecategory", {
    mailbox: z.string().optional().describe("Mailbox, e.g. User1"),
    identity: z.string().optional().describe("Category name"),
    domainController: z.string().optional().describe("FQDN (on-prem only)"),
  }, async ({ mailbox, identity, domainController }) => {
    let cmd = `Get-MessageCategory`;
    if (identity) cmd += ` -Identity '${esc(identity)}'`;
    if (mailbox) cmd += ` -Mailbox '${esc(mailbox)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_mailboxlocation", "View mailbox location info (Get-MailboxLocation) — on-prem Database/Identity sets; cloud-only User set omitted. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-mailboxlocation", {
    database: z.string().optional().describe("DB name/DN/GUID — all mailboxes on it (mutually exclusive with identity)"),
    identity: z.string().optional().describe("Mailbox GUID (ExchangeGuid from Get-Mailbox)"),
    mailboxLocationType: z.string().optional().describe("Primary, MainArchive, AuxPrimary, AuxArchive, Aggregated, ComponentShared"),
    resultSize: z.number().min(1).max(10000).optional(),
  }, async ({ database, identity, mailboxLocationType, resultSize }) => {
    if (database && identity) throw new Error("database and identity are mutually exclusive");
    let cmd = `Get-MailboxLocation`;
    if (database) cmd += ` -Database '${esc(database)}'`;
    if (identity) cmd += ` -Identity '${esc(identity)}'`;
    if (mailboxLocationType) cmd += ` -MailboxLocationType ${mailboxLocationType}`;
    if (resultSize !== undefined) cmd += ` -ResultSize ${resultSize}`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_mailboxuserconfiguration", "View user configuration items (Get-MailboxUserConfiguration) — e.g. Configuration\\IPM.Configuration.*. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-mailboxuserconfiguration", {
    mailbox: z.string().describe("Mailbox, e.g. laura@contoso.com"),
    identity: z.string().describe("Folder\\Item, e.g. 'Configuration\\*' or 'Configuration\\IPM.Configuration.Aggregated.OwaUserConfiguration'"),
    domainController: z.string().optional().describe("FQDN (on-prem only)"),
  }, async ({ mailbox, identity, domainController }) => {
    let cmd = `Get-MailboxUserConfiguration -Mailbox '${esc(mailbox)}' -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_remove_mailboxuserconfiguration", "Remove a user configuration item (Remove-MailboxUserConfiguration) — auto-recreated on next feature use. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/remove-mailboxuserconfiguration", {
    mailbox: z.string().describe("Mailbox, e.g. julia@contoso.com"),
    identity: z.string().describe("Folder\\Item, e.g. Configuration\\IPM.Configuration.Aggregated.OwaUserConfiguration"),
    domainController: z.string().optional().describe("FQDN (on-prem only)"),
  }, async ({ mailbox, identity, domainController }) => {
    let cmd = `Remove-MailboxUserConfiguration -Mailbox '${esc(mailbox)}' -Identity '${esc(identity)}'`;
    cmd += dcSuffix(domainController);
    cmd += ` -Confirm:$false`;
    await ps.invoke(cmd);
    return { content: [{ type: "text", text: `Removed user configuration ${identity} from ${mailbox}` }] };
  });

  server.tool("exchange_export_mailboxdiagnosticlogs", "Export mailbox diagnostic data (Export-MailboxDiagnosticLogs) — ComponentName set or ExtendedProperties set (mutually exclusive). Credential omitted. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/export-mailboxdiagnosticlogs", {
    identity: z.string().describe("Mailbox, e.g. 'Yuuto Sasaki'"),
    componentName: z.string().optional().describe("E.g. OOF, CalendarPermissions, MRM, SweepRules, RBA (requires no extendedProperties)"),
    extendedProperties: z.boolean().optional().describe("All well-known mailbox-table troubleshooting properties"),
    archive: z.boolean().optional().describe("Archive mailbox instead of primary (on-prem only)"),
    readFromDomainController: z.boolean().optional().describe("Read from a DC in the user domain (on-prem only)"),
    resultSize: z.number().min(1).max(10000).optional(),
    domainController: z.string().optional().describe("FQDN (on-prem only)"),
  }, async (p) => {
    if (p.componentName && p.extendedProperties) throw new Error("componentName and extendedProperties are mutually exclusive sets");
    if (!p.componentName && !p.extendedProperties) throw new Error("one of componentName or extendedProperties is required");
    let cmd = `Export-MailboxDiagnosticLogs -Identity '${esc(p.identity)}'`;
    if (p.componentName) cmd += ` -ComponentName ${p.componentName}`;
    if (p.extendedProperties) cmd += ` -ExtendedProperties`;
    if (p.archive) cmd += ` -Archive`;
    if (p.readFromDomainController) cmd += ` -ReadFromDomainController`;
    if (p.resultSize !== undefined) cmd += ` -ResultSize ${p.resultSize}`;
    cmd += dcSuffix(p.domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_export_recipientdataproperty", "Download a recipient picture (JPEG) or spoken-name (WMA) blob (Export-RecipientDataProperty) — save FileData via [System.IO.File]::WriteAllBytes. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/export-recipientdataproperty", {
    identity: z.string().describe("Mailbox/contact, e.g. 'Ayla Kol'"),
    picture: z.boolean().optional().describe("Export picture (mutually exclusive with spokenName)"),
    spokenName: z.boolean().optional().describe("Export spoken name audio"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ identity, picture, spokenName, domainController }) => {
    if (picture && spokenName) throw new Error("picture and spokenName are mutually exclusive");
    if (!picture && !spokenName) throw new Error("one of picture or spokenName is required");
    let cmd = `Export-RecipientDataProperty -Identity '${esc(identity)}'`;
    if (picture) cmd += ` -Picture`;
    if (spokenName) cmd += ` -SpokenName`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_import_recipientdataproperty", "Upload a picture (JPEG <10KB) or spoken name (WMA9 <32KB) from a server-local file (Import-RecipientDataProperty). See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/import-recipientdataproperty", {
    identity: z.string().describe("Mailbox/contact, e.g. Ayla"),
    filePath: z.string().describe("Server-local file path, e.g. M:\\Employee Photos\\AylaKol.jpg"),
    picture: z.boolean().optional().describe("Import as picture (mutually exclusive with spokenName)"),
    spokenName: z.boolean().optional().describe("Import as spoken name (on-prem only)"),
    domainController: z.string().optional().describe("FQDN (on-prem only)"),
  }, async ({ identity, picture, spokenName, filePath, domainController }) => {
    if (picture && spokenName) throw new Error("picture and spokenName are mutually exclusive");
    if (!picture && !spokenName) throw new Error("one of picture or spokenName is required");
    const prelude = `$data = [System.IO.File]::ReadAllBytes('${filePath.replace(/'/g, "''")}'); `;
    let cmd = `${prelude}Import-RecipientDataProperty -Identity '${esc(identity)}'`;
    if (picture) cmd += ` -Picture`;
    if (spokenName) cmd += ` -SpokenName`;
    cmd += ` -FileData $data`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_get_userphoto", "View user photo info (Get-UserPhoto) — on-prem only; photo must exist or it errors (try preview). Credential omitted. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/get-userphoto", {
    identity: z.string().optional().describe("User, e.g. 'Susan Burk'. Omit to list."),
    preview: z.boolean().optional().describe("Show unsaved preview photo"),
    organizationalUnit: z.string().optional().describe("OU/domain filter (Get-OrganizationalUnit values)"),
    resultSize: z.number().min(1).max(10000).optional(),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ identity, preview, organizationalUnit, resultSize, domainController }) => {
    let cmd = `Get-UserPhoto`;
    if (identity) cmd += ` -Identity '${esc(identity)}'`;
    if (preview) cmd += ` -Preview`;
    if (organizationalUnit) cmd += ` -OrganizationalUnit '${esc(organizationalUnit)}'`;
    if (resultSize !== undefined) cmd += ` -ResultSize ${resultSize}`;
    cmd += dcSuffix(domainController);
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });

  server.tool("exchange_remove_userphoto", "Delete a user photo (Remove-UserPhoto) — mailbox root + AD account. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/remove-userphoto", {
    identity: z.string().describe("User, e.g. 'Ann Beebe'"),
    clearMailboxPhotoRecord: z.boolean().optional().describe("Treat deleted photo as blank so AD is searched again"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ identity, clearMailboxPhotoRecord, domainController }) => {
    let cmd = `Remove-UserPhoto -Identity '${esc(identity)}'`;
    if (clearMailboxPhotoRecord) cmd += ` -ClearMailboxPhotoRecord`;
    cmd += dcSuffix(domainController);
    cmd += ` -Confirm:$false`;
    await ps.invoke(cmd);
    return { content: [{ type: "text", text: `Removed user photo for ${identity}` }] };
  });

  server.tool("exchange_set_userphoto", "Upload/save a user photo (Set-UserPhoto) — PictureData from server-local file; -Preview uploads unsaved, -Save saves, -Cancel drops preview. Built-in pause skipped. See https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/set-userphoto", {
    identity: z.string().describe("User, e.g. 'Paul Cannon'"),
    picturePath: z.string().optional().describe("Server-local JPEG path, e.g. C:\\Photos\\PaulCannon.jpg (uploads + saves)"),
    preview: z.boolean().optional().describe("Upload as unsaved preview (needs picturePath; save with save:true)"),
    save: z.boolean().optional().describe("Save the uploaded preview as the photo"),
    cancel: z.boolean().optional().describe("Delete the preview photo (no picturePath needed)"),
    domainController: z.string().optional().describe("FQDN, e.g. dc01.contoso.com"),
  }, async ({ identity, picturePath, preview, save, cancel, domainController }) => {
    if (cancel && (picturePath || preview || save)) throw new Error("cancel cannot be combined with picturePath/preview/save");
    if (!cancel && !picturePath && !save) throw new Error("picturePath or save or cancel is required");
    const prelude = picturePath ? `$data = [System.IO.File]::ReadAllBytes('${picturePath.replace(/'/g, "''")}'); ` : "";
    let cmd = `${prelude}Set-UserPhoto -Identity '${esc(identity)}'`;
    if (picturePath) cmd += ` -PictureData $data`;
    if (preview) cmd += ` -Preview`;
    if (save) cmd += ` -Save`;
    if (cancel) cmd += ` -Cancel`;
    cmd += dcSuffix(domainController);
    cmd += ` -Confirm:$false`;
    const d = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
  });
}
