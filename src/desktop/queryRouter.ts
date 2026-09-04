// Keyword router: free-text prompt -> MCP tool + args. Pure, no I/O.
export interface RouteResult { tool: string; args: Record<string, unknown>; write: boolean; }
export interface HelpRoute { help: true; }
export type Route = RouteResult | HelpRoute;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const NDR_RE = /\b(\d\.\d+\.\d+)\b/;
const QUOTED_RE = /["""]([^"""]+)["""]/;

export function extractIdentity(prompt: string): string | null {
  const m = prompt.match(EMAIL_RE);
  return m ? m[0] : null;
}

function afterWord(prompt: string, word: string): string | null {
  const i = prompt.toLowerCase().indexOf(word);
  if (i < 0) return null;
  const rest = prompt.slice(i + word.length).trim().replace(/^["'\s:]+|["'\s.]+$/g, "");
  return rest || null;
}

export function routeQuery(prompt: string): Route {
  const p = prompt.toLowerCase();
  const email = extractIdentity(prompt);
  const has = (...words: string[]) => words.some((w) => p.includes(w));

  if (has("version", "cumulative", " cu", "build", "patch")) return { tool: "report.exchange_version_and_cu", args: {}, write: false };
  if (has("queue", "delayed", "stuck", "backlog", "mailflow", "mail flow", "pending mail") && !has("retry", "suspend")) return { tool: "exchange_get_queue", args: {}, write: false };
  if (has("replication")) return { tool: "exchange_test_replication_health", args: {}, write: false };
  if (has("health", "healthy", "unhealthy") && has("full", "report", "detail", "dag")) return { tool: "exchange_get_health_report", args: {}, write: false };
  if (has("health", "healthy", "unhealthy")) return { tool: "exchange_test_service_health", args: {}, write: false };
  if (has("database", "databases", "db01", "db0") && has("list", "number", "count", "how many", "show", "all")) return { tool: "database.list", args: {}, write: false };
  if (has("databases") && !has("dismount", "mount", "backup", "whitespace", "growth", "repair")) return { tool: "database.list", args: {}, write: false };
  if (has("disk")) return { tool: "server.get_disk_space", args: {}, write: false };
  if (has("whitespace", "growth", "storage", "size of database", "forecast", "capacity")) return { tool: "database.get_whitespace_and_growth", args: {}, write: false };
  if (has("backup")) return { tool: "database.get_backup_status", args: {}, write: false };
  if (has("dag")) return { tool: "dag.list", args: {}, write: false };
  if (has("cert", "expir")) return { tool: "exchange_get_exchange_certificate", args: {}, write: false };
  if (has("uptime", "reboot", "last boot")) return { tool: "server.get_uptime", args: {}, write: false };
  if (has("service") && has("status", "running")) return { tool: "exchange_test_service_health", args: {}, write: false };
  if (has("connector")) return { tool: "exchange_list_send_connectors", args: {}, write: false };
  if (has("transport rule")) return { tool: "exchange_get_transport_rules", args: {}, write: false };
  if (has("server") && has("list")) return { tool: "exchange_list_servers", args: {}, write: false };
  if (has("topology")) return { tool: "report.exchange_topology", args: {}, write: false };
  if (has("overview", "environment")) return { tool: "report.exchange_environment_overview", args: {}, write: false };
  if (has("ndr", "bounce", "bounced") || NDR_RE.test(prompt)) {
    const code = prompt.match(NDR_RE)?.[1];
    return { tool: "mailflow.get_ndr_details", args: code ? { code } : {}, write: false };
  }
  if (has("trace", "tracking", "delivery status", "did") && has("receiv", "trace", "tracking", "delivery", "did")) {
    const q = QUOTED_RE.exec(prompt)?.[1];
    return { tool: "mailflow.get_message_trace", args: { ...(email ? { sender: email } : {}), ...(q ? { subject: q } : {}) }, write: false };
  }
  if (has("permission", "access", "fullaccess", "sendas", "send as") && email) return { tool: "exchange_get_mailbox_permissions", args: { identity: email }, write: false };
  if (has("statistic", "how big", "item count", "last logon") && email) return { tool: "exchange_get_mailbox_statistics", args: { identity: email }, write: false };
  // Write intents (need confirm — enforced by caller)
  if (has("dismount")) { const raw = afterWord(prompt, "dismount"); const id = raw?.replace(/^database\s+/i, "") || null; return { tool: "database.dismount", args: id ? { identity: id } : {}, write: true }; }
  if (has("mount") && !has("amount")) { const raw = afterWord(prompt, "mount"); const id = raw?.replace(/^database\s+/i, "") || null; return { tool: "database.mount", args: id ? { identity: id } : {}, write: true }; }
  if (has("retry") && has("queue")) { const id = afterWord(prompt, "queue"); return { tool: "exchange_retry_queue", args: id ? { identity: id } : {}, write: true }; }
  if (has("suspend") && has("queue")) { const id = afterWord(prompt, "queue"); return { tool: "exchange_suspend_queue", args: id ? { identity: id } : {}, write: true }; }
  if (has("restart") && has("service")) { const m = prompt.match(/restart\s+(?:the\s+)?([A-Za-z*]+)/i); return { tool: "server.restart_service", args: { ...(m ? { name: m[1] } : {}), confirm: true }, write: true }; }
  if (has("move") && has("mailbox", "request")) return { tool: "mailbox.new_move_request", args: email ? { identity: email } : {}, write: true };
  if (has("quota") && has("set", "change", "increase", "raise")) return { tool: "mailbox.set_quota", args: email ? { identity: email } : {}, write: true };
  if (has("repair") && has("database", "mailbox")) return { tool: "database.new_repair_request", args: {}, write: true };
  if ((has("grant", "give", "add") && has("permission", "access")) && email) {
    const m = prompt.match(/to\s+([\w.+-]+@[\w-]+\.[\w.]+)/i);
    const rights = /sendas/i.test(prompt) ? "SendAs" : "FullAccess";
    return { tool: "mailbox.add_permission", args: { identity: email, ...(m ? { user: m[1] } : {}), accessRights: rights }, write: true };
  }
  if (has("mailbox", "mailboxes") && has("list", "number", "count", "how many", "show", "all")) return { tool: "exchange_list_mailboxes", args: {}, write: false };
  if (email) return { tool: "ai.tell_me_everything", args: { identity: email }, write: false };
  return { help: true };
}
