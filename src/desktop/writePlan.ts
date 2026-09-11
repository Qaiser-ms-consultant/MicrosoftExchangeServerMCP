// Pure write-operation planning: merge collected args, decide whether the
// user still owes fields (needsInfo + descriptors) or is ready to review
// (needsConfirm). No Electron imports — unit-testable. main.ts wires it
// into the exchange:ask handler and owns the pending-write session map.

import { describeWriteForm, isFieldRequired, type WriteField } from "./writeForms.js";

export const WRITE_REQUIRED_ARGS: Record<string, string[]> = {
  "database.mount": ["identity"],
  "database.dismount": ["identity"],
  "exchange_retry_queue": ["identity"],
  "exchange_suspend_queue": ["identity"],
  "server.restart_service": ["name"],
  "mailbox.new_move_request": ["identity", "targetDatabase"],
  "mailbox.set_quota": ["identity"],
  "exchange_remove_mailbox": ["identity"],
  "exchange_set_mailbox": ["identity"],
  "exchange_create_mailbox": ["name"],
  "mailbox.remove_permission": ["identity", "user"],
  "exchange_remove_transport_rule": ["identity"],
  "exchange_set_transport_rule": ["identity"],
  "group.new": ["name"],
  "group.add_member": ["identity", "member"],
  "mailflow.resume_queue": ["identity"],
  "mailflow.set_receive_connector": ["identity"],
  "mailflow.set_send_connector": ["identity"],
  "database.new_repair_request": ["database"],
  "mailbox.add_permission": ["identity", "user"],
  "exchange_export_autodiscoverconfig": ["targetForestDomainController"],
  "exchange_new_clientaccessrule": ["name", "action"],
  "exchange_new_outlookprovider": ["name"],
  "exchange_new_owamailboxpolicy": ["name"],
  "exchange_remove_clientaccessrule": ["identity"],
  "exchange_remove_outlookprovider": ["identity"],
  "exchange_remove_owamailboxpolicy": ["identity"],
  "exchange_set_casmailbox": ["identity"],
  "exchange_set_clientaccessrule": ["identity"],
  "exchange_set_mailboxcalendarconfiguration": ["identity"],
  "exchange_set_mailboxmessageconfiguration": ["identity"],
  "exchange_set_mailboxregionalconfiguration": ["identity"],
  "exchange_set_mailboxspellingconfiguration": ["identity"],
  "exchange_set_outlookprovider": ["identity"],
  "exchange_set_owamailboxpolicy": ["identity"],
  "exchange_disable_inboxrule": ["identity"],
  "exchange_enable_inboxrule": ["identity"],
  "exchange_remove_inboxrule": ["identity"],
  "exchange_add_mailboxfolderpermission": ["identity", "user", "accessRights"],
  "exchange_remove_mailboxfolderpermission": ["identity"],
  "exchange_set_mailboxfolderpermission": ["identity", "user", "accessRights"],
  "exchange_new_mailboxfolder": ["name", "parent"],
  "exchange_new_sweeprule": ["name", "provider"],
  "exchange_set_sweeprule": ["identity"],
  "exchange_remove_sweeprule": ["identity"],
  "exchange_enable_sweeprule": ["identity"],
  "exchange_disable_sweeprule": ["identity"],
  "exchange_set_calendarprocessing": ["identity"],
  "exchange_set_calendarnotification": ["identity"],
  "exchange_set_resourceconfig": ["resourcePropertySchema"],
  "exchange_remove_mailboxuserconfiguration": ["mailbox", "identity"],
  "exchange_import_recipientdataproperty": ["identity", "filePath"],
  "exchange_remove_userphoto": ["identity"],
  "exchange_set_userphoto": ["identity"],
  "exchange_set_mailboxexportrequest": ["identity"],
  "exchange_suspend_mailboxexportrequest": ["identity"],
  "exchange_resume_mailboxexportrequest": ["identity"],
  "exchange_set_mailboximportrequest": ["identity"],
  "exchange_suspend_mailboximportrequest": ["identity"],
  "exchange_resume_mailboximportrequest": ["identity"],
  "exchange_set_mailboxrestorerequest": ["identity"],
  "exchange_suspend_mailboxrestorerequest": ["identity"],
  "exchange_resume_mailboxrestorerequest": ["identity"],
  "exchange_disable_serviceemailchannel": ["identity"],
  "exchange_enable_serviceemailchannel": ["identity"],
  "exchange_remove_calendarevents": ["identity", "queryWindowInDays"],
};

export type WritePlan =
  | {
      needsInfo: true;
      missing: string[];
      args: Record<string, unknown>;
      fields: WriteField[];
      collected: Record<string, unknown>;
      formTitle: string;
    }
  | { needsInfo: false; needsConfirm: true; args: Record<string, unknown> };

function genericField(name: string): WriteField {
  return { name, label: name, kind: "text", required: true };
}

export function planWriteStep(
  tool: string,
  baseArgs: Record<string, unknown>,
  patch: Record<string, unknown>,
): WritePlan {
  const args: Record<string, unknown> = { ...baseArgs };
  for (const [k, v] of Object.entries(patch ?? {})) {
    // Blanks never overwrite already-collected values.
    if (v !== undefined && v !== "") args[k] = v;
  }
  const required = WRITE_REQUIRED_ARGS[tool] ?? [];
  const missing = required.filter((k) => args[k] === undefined || args[k] === "");
  const form = describeWriteForm(tool);
  // Conditionally required fields (e.g. password for user mailboxes) join
  // the missing list when their exemption flags are all unset.
  for (const fld of form?.fields ?? []) {
    if (!missing.includes(fld.name) && isFieldRequired(fld, args)) missing.push(fld.name);
  }
  if (missing.length === 0) return { needsInfo: false, needsConfirm: true, args };
  const byName = new Map((form?.fields ?? []).map((fld) => [fld.name, fld]));
  return {
    needsInfo: true,
    missing,
    args,
    fields: missing.map((m) => byName.get(m) ?? genericField(m)),
    collected: args,
    formTitle: form?.title ?? tool,
  };
}

// Server-side pending writes: survives across turns (unlike renderer-only
// state) so a form resubmit continues instead of restarting. Entries expire
// after 15 minutes so a stale "yes" can never confirm an old request.
export interface PendingWrite {
  tool: string;
  args: Record<string, unknown>;
  prompt: string;
  touchedAt: number;
}

export const PENDING_WRITE_TTL_MS = 15 * 60 * 1000;

const pendingWrites = new Map<string, PendingWrite>();

export function pendingKey(conversationId?: string): string {
  return conversationId || "default";
}

export function setPendingWrite(key: string, entry: Omit<PendingWrite, "touchedAt">): void {
  pendingWrites.set(key, { ...entry, touchedAt: Date.now() });
}

export function getPendingWrite(key: string): Omit<PendingWrite, "touchedAt"> | null {
  const p = pendingWrites.get(key);
  if (!p) return null;
  if (Date.now() - p.touchedAt > PENDING_WRITE_TTL_MS) {
    pendingWrites.delete(key);
    return null;
  }
  return { tool: p.tool, args: p.args, prompt: p.prompt };
}

export function clearPendingWrite(key: string): void {
  pendingWrites.delete(key);
}

const SENSITIVE_ARG_RE = /^(password|passwd|secret|apikey|api_key|token|pin)$/i;

// Mask credential values in arg bags before they reach logs, memory, or the
// model. Non-matching keys pass through untouched.
export function redactSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    out[k] = SENSITIVE_ARG_RE.test(k) ? "***" : v;
  }
  return out;
}

// Mask `password: X`, `password=X`, `password 'X'` assignments in prose.
// Bare `password X` (no delimiter) is left alone so explanations like
// "Password is required for user mailboxes" survive verbatim.
export function redactPromptText(text: string): string {
  if (!text) return text;
  return String(text).replace(/(password\s*[:=]\s*["']?|password\s+["'])([^\s"';,]+)/gi, "$1***");
}
