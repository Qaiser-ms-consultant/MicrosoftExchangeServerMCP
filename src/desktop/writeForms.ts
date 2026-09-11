// Field metadata for interactive write operations (ADD/Create/Edit/Modify).
// Pure + testable. The renderer builds guided forms from these descriptors;
// main.ts uses them to tell the user exactly which inputs are still missing.
// `confirm` booleans are intentionally omitted — the Confirm button covers them.

export interface WriteField {
  name: string;
  label: string;
  kind: "text" | "email" | "number" | "select" | "boolean" | "password";
  required: boolean;
  // Conditionally required: enforced when NONE of these sibling fields is
  // truthy (e.g. password unless shared/room/equipment is ticked).
  requiredUnless?: string[];
  options?: string[];
  placeholder?: string;
  help?: string;
  sensitive?: boolean;
}

// True when a field must still be filled given the collected args:
// unfilled required fields, plus unfilled requiredUnless fields whose
// exemption flags are all unset.
export function isFieldRequired(field: WriteField, args: Record<string, unknown>): boolean {
  const filled = (args ?? {})[field.name] !== undefined && (args ?? {})[field.name] !== "";
  if (filled) return false;
  if (field.required) return true;
  if (field.requiredUnless) return !field.requiredUnless.some((k) => (args ?? {})[k]);
  return false;
}

export interface WriteForm {
  tool: string;
  title: string;
  fields: WriteField[];
}

function f(field: WriteField): WriteField {
  return field;
}

const FORMS: Record<string, WriteForm> = {
  "exchange_create_mailbox": {
    tool: "exchange_create_mailbox", title: "Create mailbox", fields: [
      f({ name: "name", label: "Display name", kind: "text", required: true, placeholder: "Alice Smith" }),
      f({ name: "userPrincipalName", label: "Email (UPN)", kind: "email", required: false, placeholder: "alice@contoso.com" }),
      f({ name: "password", label: "Password", kind: "password", required: false, requiredUnless: ["shared", "room", "equipment"], sensitive: true, help: "Required for user mailboxes; skip for shared / room / equipment." }),
      f({ name: "shared", label: "Shared mailbox", kind: "boolean", required: false }),
      f({ name: "room", label: "Room mailbox", kind: "boolean", required: false }),
      f({ name: "equipment", label: "Equipment mailbox", kind: "boolean", required: false }),
      f({ name: "database", label: "Database", kind: "text", required: false, placeholder: "DB01" }),
      f({ name: "organizationalUnit", label: "OU", kind: "text", required: false, placeholder: "contoso.com/Users" }),
      f({ name: "firstName", label: "First name", kind: "text", required: false }),
      f({ name: "lastName", label: "Last name", kind: "text", required: false }),
    ],
  },
  "exchange_set_mailbox": {
    tool: "exchange_set_mailbox", title: "Edit mailbox", fields: [
      f({ name: "identity", label: "Mailbox", kind: "email", required: true, placeholder: "alice@contoso.com" }),
      f({ name: "prohibitSendQuota", label: "Prohibit-send quota", kind: "text", required: false, placeholder: "50GB", help: "Sizes like 49GB, 50GB, 100GB." }),
      f({ name: "issueWarningQuota", label: "Warning quota", kind: "text", required: false, placeholder: "49GB" }),
      f({ name: "customAttribute1", label: "Custom attribute 1", kind: "text", required: false }),
    ],
  },
  "exchange_remove_mailbox": {
    tool: "exchange_remove_mailbox", title: "Remove mailbox", fields: [
      f({ name: "identity", label: "Mailbox", kind: "email", required: true, placeholder: "alice@contoso.com" }),
      f({ name: "permanent", label: "Delete permanently (otherwise disable only)", kind: "boolean", required: false }),
    ],
  },
  "mailbox.set_quota": {
    tool: "mailbox.set_quota", title: "Set mailbox quota", fields: [
      f({ name: "identity", label: "Mailbox", kind: "email", required: true, placeholder: "alice@contoso.com" }),
      f({ name: "prohibitSendQuota", label: "Prohibit-send quota", kind: "text", required: false, placeholder: "50GB", help: "Sizes like 49GB, 50GB, 100GB." }),
      f({ name: "issueWarningQuota", label: "Warning quota", kind: "text", required: false, placeholder: "49GB" }),
    ],
  },
  "mailbox.new_move_request": {
    tool: "mailbox.new_move_request", title: "Move mailbox", fields: [
      f({ name: "identity", label: "Mailbox", kind: "email", required: true, placeholder: "alice@contoso.com" }),
      f({ name: "targetDatabase", label: "Target database", kind: "text", required: true, placeholder: "DB02" }),
    ],
  },
  "mailbox.add_permission": {
    tool: "mailbox.add_permission", title: "Grant mailbox permission", fields: [
      f({ name: "identity", label: "Mailbox", kind: "email", required: true, placeholder: "alice@contoso.com" }),
      f({ name: "user", label: "Grantee", kind: "email", required: true, placeholder: "bob@contoso.com" }),
      f({ name: "accessRights", label: "Rights", kind: "select", required: false, options: ["FullAccess", "SendAs"] }),
    ],
  },
  "mailbox.remove_permission": {
    tool: "mailbox.remove_permission", title: "Remove mailbox permission", fields: [
      f({ name: "identity", label: "Mailbox", kind: "email", required: true, placeholder: "alice@contoso.com" }),
      f({ name: "user", label: "Grantee", kind: "email", required: true, placeholder: "bob@contoso.com" }),
      f({ name: "accessRights", label: "Rights", kind: "select", required: false, options: ["FullAccess", "SendAs"] }),
    ],
  },
  "group.new": {
    tool: "group.new", title: "New distribution group", fields: [
      f({ name: "name", label: "Group name", kind: "text", required: true, placeholder: "Sales Team" }),
      f({ name: "members", label: "Members (comma-separated emails)", kind: "text", required: false, placeholder: "a@contoso.com, b@contoso.com" }),
    ],
  },
  "group.add_member": {
    tool: "group.add_member", title: "Add group member", fields: [
      f({ name: "identity", label: "Group", kind: "text", required: true, placeholder: "Sales Team" }),
      f({ name: "member", label: "Member email", kind: "email", required: true, placeholder: "alice@contoso.com" }),
    ],
  },
  "exchange_set_transport_rule": {
    tool: "exchange_set_transport_rule", title: "Edit transport rule", fields: [
      f({ name: "identity", label: "Rule name", kind: "text", required: true, placeholder: "Old Rule" }),
      f({ name: "state", label: "State", kind: "select", required: false, options: ["Enabled", "Disabled"] }),
      f({ name: "priority", label: "Priority", kind: "number", required: false, placeholder: "0" }),
    ],
  },
  "exchange_remove_transport_rule": {
    tool: "exchange_remove_transport_rule", title: "Remove transport rule", fields: [
      f({ name: "identity", label: "Rule name", kind: "text", required: true, placeholder: "Old Rule" }),
    ],
  },
  "database.mount": {
    tool: "database.mount", title: "Mount database", fields: [
      f({ name: "identity", label: "Database", kind: "text", required: true, placeholder: "DB01" }),
    ],
  },
  "database.dismount": {
    tool: "database.dismount", title: "Dismount database", fields: [
      f({ name: "identity", label: "Database", kind: "text", required: true, placeholder: "DB01" }),
    ],
  },
  "database.new_repair_request": {
    tool: "database.new_repair_request", title: "New repair request", fields: [
      f({ name: "database", label: "Database", kind: "text", required: true, placeholder: "DB01" }),
      f({ name: "mailbox", label: "Mailbox (optional, else whole DB)", kind: "email", required: false, placeholder: "alice@contoso.com" }),
      f({ name: "corruptions", label: "Corruption types", kind: "text", required: false, placeholder: "SearchFolder, AggregateCounts", help: "Comma-separated, e.g. SearchFolder, AggregateCounts." }),
    ],
  },
  "database.move_active": {
    tool: "database.move_active", title: "Move active database (failover)", fields: [
      f({ name: "identity", label: "Database", kind: "text", required: false, placeholder: "DB01" }),
      f({ name: "server", label: "Target server", kind: "text", required: false, placeholder: "EXCH02" }),
    ],
  },
  "database.add_copy": {
    tool: "database.add_copy", title: "Add database copy", fields: [
      f({ name: "identity", label: "Database", kind: "text", required: false, placeholder: "DB01" }),
      f({ name: "mailboxServer", label: "Mailbox server", kind: "text", required: false, placeholder: "EXCH02" }),
    ],
  },
  "database.remove_copy": {
    tool: "database.remove_copy", title: "Remove database copy", fields: [
      f({ name: "identity", label: "Database", kind: "text", required: false, placeholder: "DB01" }),
      f({ name: "mailboxServer", label: "Mailbox server", kind: "text", required: false, placeholder: "EXCH02" }),
    ],
  },
  "database.suspend_copy": {
    tool: "database.suspend_copy", title: "Suspend database copy", fields: [
      f({ name: "identity", label: "Copy identity", kind: "text", required: false, placeholder: "DB01\\EXCH02" }),
    ],
  },
  "exchange_retry_queue": {
    tool: "exchange_retry_queue", title: "Retry queue", fields: [
      f({ name: "identity", label: "Queue identity", kind: "text", required: true, placeholder: "EXCH01\\Submission" }),
      f({ name: "server", label: "Server", kind: "text", required: false, placeholder: "EXCH01" }),
    ],
  },
  "exchange_suspend_queue": {
    tool: "exchange_suspend_queue", title: "Suspend queue", fields: [
      f({ name: "identity", label: "Queue identity", kind: "text", required: true, placeholder: "EXCH01\\Submission" }),
    ],
  },
  "mailflow.resume_queue": {
    tool: "mailflow.resume_queue", title: "Resume queue", fields: [
      f({ name: "identity", label: "Queue identity", kind: "text", required: true, placeholder: "EXCH01\\Submission" }),
      f({ name: "server", label: "Server", kind: "text", required: false, placeholder: "EXCH01" }),
    ],
  },
  "mailflow.set_receive_connector": {
    tool: "mailflow.set_receive_connector", title: "Edit receive connector", fields: [
      f({ name: "identity", label: "Connector", kind: "text", required: true, placeholder: "Default Frontend" }),
      f({ name: "banner", label: "Banner", kind: "text", required: false, placeholder: "220 mail.contoso.com" }),
      f({ name: "maxMessageSize", label: "Max message size", kind: "text", required: false, placeholder: "36MB", help: "Sizes like 10MB, 36MB, 150MB." }),
    ],
  },
  "mailflow.set_send_connector": {
    tool: "mailflow.set_send_connector", title: "Edit send connector", fields: [
      f({ name: "identity", label: "Connector", kind: "text", required: true, placeholder: "Outbound" }),
      f({ name: "addressSpaces", label: "Address spaces", kind: "text", required: false, placeholder: "contoso.com", help: "Comma-separated domains." }),
    ],
  },
  "server.restart_service": {
    tool: "server.restart_service", title: "Restart service", fields: [
      f({ name: "name", label: "Service name", kind: "text", required: true, placeholder: "MSExchangeTransport" }),
      f({ name: "server", label: "Server", kind: "text", required: false, placeholder: "EXCH01" }),
    ],
  },
  "dag.set_activation_policy": {
    tool: "dag.set_activation_policy", title: "Set activation preference", fields: [
      f({ name: "identity", label: "Copy identity", kind: "text", required: false, placeholder: "DB01\\EXCH02" }),
      f({ name: "activationPreference", label: "Preference (1 = most preferred)", kind: "number", required: false, placeholder: "1" }),
    ],
  },
  "exchange_disable_pushnotificationproxy": {
    tool: "exchange_disable_pushnotificationproxy", title: "Disable push notification proxy", fields: [],
  },
  "exchange_enable_pushnotificationproxy": {
    tool: "exchange_enable_pushnotificationproxy", title: "Enable push notification proxy", fields: [
      f({ name: "organization", label: "Microsoft 365 org domain", kind: "text", required: false, placeholder: "contoso.onmicrosoft.com" }),
      f({ name: "uri", label: "Push service endpoint", kind: "text", required: false, placeholder: "https://outlook.office365.com/PushNotifications" }),
    ],
  },
  "exchange_export_autodiscoverconfig": {
    tool: "exchange_export_autodiscoverconfig", title: "Export Autodiscover config", fields: [
      f({ name: "targetForestDomainController", label: "Target forest/DC", kind: "text", required: true, placeholder: "contoso.com" }),
      f({ name: "multipleExchangeDeployments", label: "Multiple Exchange forests", kind: "boolean", required: false }),
      f({ name: "preferredSourceFqdn", label: "Preferred source FQDN", kind: "text", required: false }),
    ],
  },
  "exchange_new_clientaccessrule": {
    tool: "exchange_new_clientaccessrule", title: "New client access rule", fields: [
      f({ name: "name", label: "Rule name", kind: "text", required: true, placeholder: "AllowRemotePS" }),
      f({ name: "action", label: "Action", kind: "select", required: true, options: ["AllowAccess", "DenyAccess"] }),
      f({ name: "anyOfProtocols", label: "Protocols (comma-separated)", kind: "text", required: false, placeholder: "RemotePowerShell", help: "2019+: ExchangeAdminCenter, RemotePowerShell only." }),
      f({ name: "anyOfClientIPAddressesOrRanges", label: "Client IPs/ranges", kind: "text", required: false, placeholder: "192.168.1.0/24" }),
      f({ name: "priority", label: "Priority (0 = highest)", kind: "number", required: false, placeholder: "1" }),
      f({ name: "scope", label: "Scope", kind: "select", required: false, options: ["Users", "All"] }),
    ],
  },
  "exchange_new_outlookprovider": {
    tool: "exchange_new_outlookprovider", title: "New Outlook provider", fields: [
      f({ name: "name", label: "Object name", kind: "text", required: true, placeholder: "MyOABUrl" }),
    ],
  },
  "exchange_new_owamailboxpolicy": {
    tool: "exchange_new_owamailboxpolicy", title: "New OWA mailbox policy", fields: [
      f({ name: "name", label: "Policy name", kind: "text", required: true, placeholder: "Corporate" }),
    ],
  },
  "exchange_remove_clientaccessrule": {
    tool: "exchange_remove_clientaccessrule", title: "Remove client access rule", fields: [
      f({ name: "identity", label: "Rule name", kind: "text", required: true, placeholder: "Block ActiveSync" }),
    ],
  },
  "exchange_remove_outlookprovider": {
    tool: "exchange_remove_outlookprovider", title: "Remove Outlook provider", fields: [
      f({ name: "identity", label: "Object name", kind: "text", required: true, placeholder: "Test Object" }),
    ],
  },
  "exchange_remove_owamailboxpolicy": {
    tool: "exchange_remove_owamailboxpolicy", title: "Remove OWA mailbox policy", fields: [
      f({ name: "identity", label: "Policy name", kind: "text", required: true, placeholder: "Executives" }),
    ],
  },
  "exchange_set_casmailbox": {
    tool: "exchange_set_casmailbox", title: "Edit mailbox client access", fields: [
      f({ name: "identity", label: "Mailbox", kind: "email", required: true, placeholder: "adam@contoso.com" }),
      f({ name: "owaEnabled", label: "OWA enabled", kind: "boolean", required: false }),
      f({ name: "activeSyncEnabled", label: "ActiveSync enabled", kind: "boolean", required: false }),
      f({ name: "popEnabled", label: "POP enabled", kind: "boolean", required: false }),
      f({ name: "imapEnabled", label: "IMAP enabled", kind: "boolean", required: false }),
      f({ name: "mapiEnabled", label: "MAPI enabled", kind: "boolean", required: false }),
      f({ name: "ewsEnabled", label: "EWS enabled", kind: "boolean", required: false }),
    ],
  },
  "exchange_set_clientaccessrule": {
    tool: "exchange_set_clientaccessrule", title: "Edit client access rule", fields: [
      f({ name: "identity", label: "Rule name", kind: "text", required: true, placeholder: "Allow IMAP4" }),
      f({ name: "enabled", label: "Enabled", kind: "boolean", required: false }),
      f({ name: "priority", label: "Priority (0 = highest)", kind: "number", required: false, placeholder: "1" }),
      f({ name: "action", label: "Action", kind: "select", required: false, options: ["AllowAccess", "DenyAccess"] }),
    ],
  },
  "exchange_set_imapsettings": {
    tool: "exchange_set_imapsettings", title: "Edit IMAP settings", fields: [
      f({ name: "server", label: "Server", kind: "text", required: false, placeholder: "MBX01" }),
      f({ name: "banner", label: "Banner", kind: "text", required: false }),
      f({ name: "protocolLogEnabled", label: "Protocol logging", kind: "boolean", required: false }),
      f({ name: "x509CertificateName", label: "Certificate FQDN", kind: "text", required: false, placeholder: "mail.contoso.com" }),
    ],
  },
  "exchange_set_mailboxcalendarconfiguration": {
    tool: "exchange_set_mailboxcalendarconfiguration", title: "Edit calendar settings", fields: [
      f({ name: "identity", label: "Mailbox", kind: "email", required: true, placeholder: "peter@contoso.com" }),
      f({ name: "remindersEnabled", label: "Reminders", kind: "boolean", required: false }),
      f({ name: "workingHoursTimeZone", label: "Working-hours timezone", kind: "text", required: false, placeholder: "Pacific Standard Time" }),
      f({ name: "weekStartDay", label: "Week start day", kind: "text", required: false, placeholder: "Monday" }),
    ],
  },
  "exchange_set_mailboxmessageconfiguration": {
    tool: "exchange_set_mailboxmessageconfiguration", title: "Edit OWA message settings", fields: [
      f({ name: "identity", label: "Mailbox", kind: "email", required: true, placeholder: "kai@contoso.com" }),
      f({ name: "hideDeletedItems", label: "Hide deleted items", kind: "boolean", required: false }),
      f({ name: "alwaysShowBcc", label: "Always show Bcc", kind: "boolean", required: false }),
    ],
  },
  "exchange_set_mailboxregionalconfiguration": {
    tool: "exchange_set_mailboxregionalconfiguration", title: "Edit regional settings", fields: [
      f({ name: "identity", label: "Mailbox", kind: "text", required: true, placeholder: "Marcelo Teixeira" }),
      f({ name: "language", label: "Language", kind: "text", required: false, placeholder: "pt-br" }),
      f({ name: "localizeDefaultFolderName", label: "Localize folder names", kind: "boolean", required: false }),
      f({ name: "timeZone", label: "Time zone", kind: "text", required: false }),
    ],
  },
  "exchange_set_mailboxspellingconfiguration": {
    tool: "exchange_set_mailboxspellingconfiguration", title: "Edit spelling settings", fields: [
      f({ name: "identity", label: "Mailbox", kind: "text", required: true, placeholder: "kai" }),
      f({ name: "ignoreUppercase", label: "Ignore uppercase", kind: "boolean", required: false }),
      f({ name: "ignoreMixedDigits", label: "Ignore mixed digits", kind: "boolean", required: false }),
      f({ name: "dictionaryLanguage", label: "Dictionary language", kind: "text", required: false }),
    ],
  },
  "exchange_set_outlookprovider": {
    tool: "exchange_set_outlookprovider", title: "Edit Outlook provider", fields: [
      f({ name: "identity", label: "Provider", kind: "text", required: true, placeholder: "WEB" }),
      f({ name: "ttl", label: "TTL (hours)", kind: "number", required: false, placeholder: "2" }),
      f({ name: "server", label: "Mailbox server", kind: "text", required: false }),
    ],
  },
  "exchange_set_owamailboxpolicy": {
    tool: "exchange_set_owamailboxpolicy", title: "Edit OWA mailbox policy", fields: [
      f({ name: "identity", label: "Policy name", kind: "text", required: true, placeholder: "Default" }),
      f({ name: "calendarEnabled", label: "Calendar", kind: "boolean", required: false }),
      f({ name: "tasksEnabled", label: "Tasks", kind: "boolean", required: false }),
      f({ name: "contactsEnabled", label: "Contacts", kind: "boolean", required: false }),
    ],
  },
  "exchange_set_popsettings": {
    tool: "exchange_set_popsettings", title: "Edit POP settings", fields: [
      f({ name: "server", label: "Server", kind: "text", required: false, placeholder: "MBX01" }),
      f({ name: "banner", label: "Banner", kind: "text", required: false }),
      f({ name: "protocolLogEnabled", label: "Protocol logging", kind: "boolean", required: false }),
      f({ name: "x509CertificateName", label: "Certificate FQDN", kind: "text", required: false, placeholder: "mail.contoso.com" }),
    ],
  },
  "exchange_disable_inboxrule": {
    tool: "exchange_disable_inboxrule", title: "Disable inbox rule", fields: [
      f({ name: "identity", label: "Rule name", kind: "text", required: true, placeholder: "MoveAnnouncements" }),
      f({ name: "mailbox", label: "Mailbox", kind: "email", required: false, placeholder: "alice@contoso.com" }),
    ],
  },
  "exchange_enable_inboxrule": {
    tool: "exchange_enable_inboxrule", title: "Enable inbox rule", fields: [
      f({ name: "identity", label: "Rule name", kind: "text", required: true, placeholder: "MoveAnnouncements" }),
      f({ name: "mailbox", label: "Mailbox", kind: "email", required: false, placeholder: "alice@contoso.com" }),
    ],
  },
  "exchange_set_inboxrule": {
    tool: "exchange_set_inboxrule", title: "Edit inbox rule", fields: [
      f({ name: "identity", label: "Rule name/ID", kind: "text", required: false, placeholder: "ProjectContoso" }),
      f({ name: "mailbox", label: "Mailbox", kind: "email", required: false, placeholder: "alice@contoso.com" }),
      f({ name: "markImportance", label: "Importance", kind: "select", required: false, options: ["High", "Normal", "Low"] }),
      f({ name: "priority", label: "Priority", kind: "number", required: false, placeholder: "0" }),
    ],
  },
  "exchange_remove_inboxrule": {
    tool: "exchange_remove_inboxrule", title: "Remove inbox rule", fields: [
      f({ name: "identity", label: "Rule name", kind: "text", required: true, placeholder: "ProjectA-MoveToFolderA" }),
      f({ name: "mailbox", label: "Mailbox", kind: "email", required: false, placeholder: "alice@contoso.com" }),
    ],
  },
  "exchange_add_mailboxfolderpermission": {
    tool: "exchange_add_mailboxfolderpermission", title: "Grant folder permission", fields: [
      f({ name: "identity", label: "Folder", kind: "text", required: true, placeholder: "alice@contoso.com:\\Calendar" }),
      f({ name: "user", label: "Grantee", kind: "email", required: true, placeholder: "bob@contoso.com" }),
      f({ name: "accessRights", label: "Rights", kind: "text", required: true, placeholder: "Editor" }),
    ],
  },
  "exchange_remove_mailboxfolderpermission": {
    tool: "exchange_remove_mailboxfolderpermission", title: "Remove folder permission", fields: [
      f({ name: "identity", label: "Folder", kind: "text", required: true, placeholder: "alice@contoso.com:\\Calendar" }),
      f({ name: "user", label: "Grantee", kind: "email", required: false, placeholder: "bob@contoso.com" }),
    ],
  },
  "exchange_set_mailboxfolderpermission": {
    tool: "exchange_set_mailboxfolderpermission", title: "Edit folder permission", fields: [
      f({ name: "identity", label: "Folder", kind: "text", required: true, placeholder: "alice@contoso.com:\\Calendar" }),
      f({ name: "user", label: "Grantee", kind: "email", required: true, placeholder: "bob@contoso.com" }),
      f({ name: "accessRights", label: "Rights", kind: "text", required: true, placeholder: "Editor" }),
    ],
  },
  "exchange_new_mailboxfolder": {
    tool: "exchange_new_mailboxfolder", title: "New mailbox folder", fields: [
      f({ name: "name", label: "Folder name", kind: "text", required: true, placeholder: "Personal" }),
      f({ name: "parent", label: "Parent path", kind: "text", required: true, placeholder: ":\\Inbox" }),
    ],
  },
  "exchange_new_sweeprule": {
    tool: "exchange_new_sweeprule", title: "New sweep rule", fields: [
      f({ name: "name", label: "Rule name", kind: "text", required: true, placeholder: "From Michelle" }),
      f({ name: "provider", label: "Provider", kind: "text", required: true, placeholder: "Exchange16" }),
      f({ name: "mailbox", label: "Mailbox", kind: "email", required: false, placeholder: "alice@contoso.com" }),
      f({ name: "sender", label: "Sender filter", kind: "email", required: false }),
      f({ name: "keepLatest", label: "Keep newest N", kind: "number", required: false }),
      f({ name: "keepForDays", label: "Keep days", kind: "number", required: false }),
    ],
  },
  "exchange_set_sweeprule": {
    tool: "exchange_set_sweeprule", title: "Edit sweep rule", fields: [
      f({ name: "identity", label: "Rule ID", kind: "text", required: true }),
      f({ name: "keepForDays", label: "Keep days", kind: "number", required: false }),
      f({ name: "keepLatest", label: "Keep newest N", kind: "number", required: false }),
    ],
  },
  "exchange_remove_sweeprule": {
    tool: "exchange_remove_sweeprule", title: "Remove sweep rule", fields: [
      f({ name: "identity", label: "Rule ID", kind: "text", required: true }),
    ],
  },
  "exchange_enable_sweeprule": {
    tool: "exchange_enable_sweeprule", title: "Enable sweep rule", fields: [
      f({ name: "identity", label: "Rule ID", kind: "text", required: true }),
    ],
  },
  "exchange_disable_sweeprule": {
    tool: "exchange_disable_sweeprule", title: "Disable sweep rule", fields: [
      f({ name: "identity", label: "Rule ID", kind: "text", required: true }),
    ],
  },
  "exchange_set_calendarprocessing": {
    tool: "exchange_set_calendarprocessing", title: "Edit room booking", fields: [
      f({ name: "identity", label: "Room/equipment mailbox", kind: "text", required: true, placeholder: "Conf 212" }),
      f({ name: "automateProcessing", label: "Automation", kind: "select", required: false, options: ["None", "AutoUpdate", "AutoAccept"] }),
      f({ name: "allowConflicts", label: "Allow conflicts", kind: "boolean", required: false }),
      f({ name: "bookingWindowInDays", label: "Booking window (days)", kind: "number", required: false, placeholder: "180" }),
    ],
  },
  "exchange_set_calendarnotification": {
    tool: "exchange_set_calendarnotification", title: "Edit calendar text notifications", fields: [
      f({ name: "identity", label: "Mailbox", kind: "text", required: true, placeholder: "TonySmith" }),
      f({ name: "calendarUpdateNotification", label: "Calendar updates", kind: "boolean", required: false }),
      f({ name: "meetingReminderNotification", label: "Meeting reminders", kind: "boolean", required: false }),
      f({ name: "dailyAgendaNotification", label: "Daily agenda", kind: "boolean", required: false }),
    ],
  },
  "exchange_set_resourceconfig": {
    tool: "exchange_set_resourceconfig", title: "Edit resource properties", fields: [
      f({ name: "resourcePropertySchema", label: "Properties", kind: "text", required: true, placeholder: "Room/Whiteboard,Equipment/Van" }),
    ],
  },
  "exchange_remove_mailboxuserconfiguration": {
    tool: "exchange_remove_mailboxuserconfiguration", title: "Remove user configuration", fields: [
      f({ name: "mailbox", label: "Mailbox", kind: "email", required: true, placeholder: "julia@contoso.com" }),
      f({ name: "identity", label: "Item", kind: "text", required: true, placeholder: "Configuration\\IPM.Configuration.Aggregated.OwaUserConfiguration" }),
    ],
  },
  "exchange_import_recipientdataproperty": {
    tool: "exchange_import_recipientdataproperty", title: "Import picture/spoken name", fields: [
      f({ name: "identity", label: "Recipient", kind: "text", required: true, placeholder: "Ayla" }),
      f({ name: "filePath", label: "Server file path", kind: "text", required: true, placeholder: "M:\\Employee Photos\\AylaKol.jpg" }),
      f({ name: "picture", label: "Picture (else spoken name)", kind: "boolean", required: false }),
    ],
  },
  "exchange_remove_userphoto": {
    tool: "exchange_remove_userphoto", title: "Remove user photo", fields: [
      f({ name: "identity", label: "User", kind: "text", required: true, placeholder: "Ann Beebe" }),
    ],
  },
  "exchange_set_userphoto": {
    tool: "exchange_set_userphoto", title: "Set user photo", fields: [
      f({ name: "identity", label: "User", kind: "text", required: true, placeholder: "Paul Cannon" }),
      f({ name: "picturePath", label: "Server JPEG path", kind: "text", required: false, placeholder: "C:\\Photos\\PaulCannon.jpg" }),
      f({ name: "save", label: "Save preview", kind: "boolean", required: false }),
      f({ name: "cancel", label: "Cancel preview", kind: "boolean", required: false }),
    ],
  },
  "exchange_set_mailboxexportrequest": {
    tool: "exchange_set_mailboxexportrequest", title: "Edit export request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: true, placeholder: "Ayla\\MailboxExport1" }),
      f({ name: "badItemLimit", label: "Bad item limit", kind: "text", required: false, placeholder: "10" }),
      f({ name: "priority", label: "Priority", kind: "text", required: false, placeholder: "High" }),
    ],
  },
  "exchange_suspend_mailboxexportrequest": {
    tool: "exchange_suspend_mailboxexportrequest", title: "Suspend export request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: true, placeholder: "Ayla\\MailboxExport1" }),
      f({ name: "suspendComment", label: "Comment", kind: "text", required: false }),
    ],
  },
  "exchange_resume_mailboxexportrequest": {
    tool: "exchange_resume_mailboxexportrequest", title: "Resume export request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: true, placeholder: "kweku\\export" }),
    ],
  },
  "exchange_remove_mailboxexportrequest": {
    tool: "exchange_remove_mailboxexportrequest", title: "Remove export request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: false, placeholder: "Ayla\\MailboxExport1" }),
    ],
  },
  "exchange_set_mailboximportrequest": {
    tool: "exchange_set_mailboximportrequest", title: "Edit import request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: true, placeholder: "Kweku\\Import" }),
      f({ name: "badItemLimit", label: "Bad item limit", kind: "text", required: false, placeholder: "5" }),
    ],
  },
  "exchange_suspend_mailboximportrequest": {
    tool: "exchange_suspend_mailboximportrequest", title: "Suspend import request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: true, placeholder: "Ayla\\MailboxImport1" }),
    ],
  },
  "exchange_resume_mailboximportrequest": {
    tool: "exchange_resume_mailboximportrequest", title: "Resume import request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: true, placeholder: "kweku\\MailboxImport1" }),
    ],
  },
  "exchange_set_mailboxrestorerequest": {
    tool: "exchange_set_mailboxrestorerequest", title: "Edit restore request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: true, placeholder: "Ayla\\MailboxRestore1" }),
      f({ name: "badItemLimit", label: "Bad item limit", kind: "text", required: false, placeholder: "10" }),
    ],
  },
  "exchange_suspend_mailboxrestorerequest": {
    tool: "exchange_suspend_mailboxrestorerequest", title: "Suspend restore request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: true, placeholder: "Ayla\\MailboxRestore1" }),
    ],
  },
  "exchange_resume_mailboxrestorerequest": {
    tool: "exchange_resume_mailboxrestorerequest", title: "Resume restore request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: true, placeholder: "kweku\\RestoreFromDB01" }),
    ],
  },
  "exchange_remove_mailboxrestorerequest": {
    tool: "exchange_remove_mailboxrestorerequest", title: "Remove restore request", fields: [
      f({ name: "identity", label: "Request", kind: "text", required: false, placeholder: "Ayla\\MailboxRestore1" }),
    ],
  },
  "exchange_disable_serviceemailchannel": {
    tool: "exchange_disable_serviceemailchannel", title: "Disable service channel", fields: [
      f({ name: "identity", label: "Mailbox", kind: "text", required: true, placeholder: "JeffHay" }),
    ],
  },
  "exchange_enable_serviceemailchannel": {
    tool: "exchange_enable_serviceemailchannel", title: "Enable service channel", fields: [
      f({ name: "identity", label: "Mailbox", kind: "text", required: true, placeholder: "tony@contoso.com" }),
    ],
  },
  "exchange_new_mailmessage": {
    tool: "exchange_new_mailmessage", title: "New draft message", fields: [
      f({ name: "subject", label: "Subject", kind: "text", required: false, placeholder: "Delivery Report" }),
      f({ name: "body", label: "Body", kind: "text", required: false }),
      f({ name: "bodyFormat", label: "Format", kind: "select", required: false, options: ["PlainText", "Rtf", "Html"] }),
    ],
  },
  "exchange_remove_calendarevents": {
    tool: "exchange_remove_calendarevents", title: "Cancel future meetings", fields: [
      f({ name: "identity", label: "Organizer mailbox", kind: "email", required: true, placeholder: "chris@contoso.com" }),
      f({ name: "queryWindowInDays", label: "Window (days, max 1825)", kind: "number", required: true, placeholder: "120" }),
      f({ name: "cancelOrganizedMeetings", label: "Actually cancel (else no-op)", kind: "boolean", required: false }),
      f({ name: "previewOnly", label: "Preview only", kind: "boolean", required: false }),
    ],
  },
};

export const WRITE_FORM_TOOLS = Object.keys(FORMS);

export function describeWriteForm(tool: string): WriteForm | null {
  return FORMS[tool] ?? null;
}
