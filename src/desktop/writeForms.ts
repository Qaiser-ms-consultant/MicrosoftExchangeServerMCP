// Field metadata for interactive write operations (ADD/Create/Edit/Modify).
// Pure + testable. The renderer builds guided forms from these descriptors;
// main.ts uses them to tell the user exactly which inputs are still missing.
// `confirm` booleans are intentionally omitted — the Confirm button covers them.

export interface WriteField {
  name: string;
  label: string;
  kind: "text" | "email" | "number" | "select" | "boolean" | "password";
  required: boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
  sensitive?: boolean;
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
      f({ name: "password", label: "Password", kind: "password", required: false, sensitive: true, help: "Required for user mailboxes; skip for shared / room / equipment." }),
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
};

export const WRITE_FORM_TOOLS = Object.keys(FORMS);

export function describeWriteForm(tool: string): WriteForm | null {
  return FORMS[tool] ?? null;
}
