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
};

export const WRITE_FORM_TOOLS = Object.keys(FORMS);

export function describeWriteForm(tool: string): WriteForm | null {
  return FORMS[tool] ?? null;
}
