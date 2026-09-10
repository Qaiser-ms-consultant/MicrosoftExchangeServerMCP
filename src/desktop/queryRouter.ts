// Keyword router: free-text prompt -> MCP tool + args. Pure, no I/O.
export interface RouteResult { tool: string; args: Record<string, unknown>; write: boolean; }
export interface HelpRoute { help: true; }
export type Route = RouteResult | HelpRoute;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const DOMAIN_RE = /(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/;
const NDR_RE = /\b(\d\.\d+\.\d+)\b/;
const QUOTED_RE = /["""]([^"""]+)["""]/;

export function extractIdentity(prompt: string): string | null {
  const m = prompt.match(EMAIL_RE);
  return m ? m[0] : null;
}

export function extractDomain(prompt: string): string | null {
  const m = prompt.match(DOMAIN_RE);
  return m ? m[0] : null;
}

function afterWord(prompt: string, word: string): string | null {
  const i = prompt.toLowerCase().indexOf(word);
  if (i < 0) return null;
  const rest = prompt.slice(i + word.length).trim().replace(/^["'\s:]+|["'\s.]+$/g, "");
  return rest || null;
}

// "list mailboxes in Exchange DB B" / "show mailboxes on DB01" — the
// database scoping for mailbox discovery. Deliberately narrow (in/on/from
// right after "mailbox(es)") so identity prompts like
// "mailbox detail for alice@contoso.com" never match.
export function extractMailboxDatabase(prompt: string): string | null {
  const m = prompt.match(/mailboxes?\s+(?:in|on|from)\s+(?:the\s+)?(?:database\s+)?(.+?)\s*$/i);
  if (!m) return null;
  const db = m[1].replace(/^["']+|["'.]+$/g, "").trim();
  return db || null;
}

// Loose-language tolerance: common typos + synonyms, applied to the
// lowercased prompt before keyword matching. Extraction (emails, quotes,
// afterWord) keeps using the original prompt.
const TYPO_FIXES: Array<[RegExp, string]> = [
  [/\btranport\b/g, "transport"],
  [/\bmailobx\b/g, "mailbox"],
  [/\bdistrubution\b/g, "distribution"],
  [/\bdistibution\b/g, "distribution"],
  [/\bpermision\b/g, "permission"],
  [/\bpermisison\b/g, "permission"],
  [/\bdatabse\b/g, "database"],
  [/\bdatabasae\b/g, "database"],
  [/\bpolicie\b/g, "policy"],
  [/\bquue\b/g, "queue"],
  [/\bqueu\b/g, "queue"],
  [/\bservcie\b/g, "service"],
  [/\bcertficate\b/g, "certificate"],
  [/\bmial\b/g, "mail"],
  [/\bdelet\b/g, "delete"],
  [/\bremvoe\b/g, "remove"],
  [/\bdisbale\b/g, "disable"],
  [/\bcretae\b/g, "create"],
  [/\bmail\s*flow\s+rule\b/g, "transport rule"],
];

export function normalizePrompt(lowered: string): string {
  let s = lowered;
  for (const [re, fix] of TYPO_FIXES) s = s.replace(re, fix);
  return s;
}

const WRITE_VERBS = /\b(remove|delete|disable|enable|create|set|change|update|modify|add|grant|give|revoke|suspend|resume|retry|restart|mount|dismount|move|purge|rid)\b/;

export function hasWriteIntent(prompt: string): boolean {
  return WRITE_VERBS.test(normalizePrompt(prompt.toLowerCase()));
}

const GENERIC_HELP_EXAMPLES = ["what version of exchange do i have", "show delayed queues", "server health report", "database whitespace and growth", "certificates expiring soon", "explain bounce 5.7.1", "trace messages from admin@contoso.com", "tell me everything about admin@contoso.com", "dismount database DB01", "what tools do you offer"];

const HELP_EXAMPLE_SETS: Array<{ match: RegExp; examples: string[] }> = [
  { match: /\btransport\b|\bmail\s*flow\s+rule\b|\brules?\b/, examples: ["list transport rules", 'delete transport rule "Old Rule"', 'disable transport rule "Old Rule"', 'set transport rule "Old Rule" priority 1'] },
  { match: /\bmailbox\b|@/, examples: ["tell me everything about admin@contoso.com", "mailbox statistics for admin@contoso.com", "show 50 mailboxes"] },
  { match: /\bdatabase\b|\b\w*db\d*\b|\bdag\b|\bmount\b/, examples: ["list databases", "database whitespace and growth", "dismount database DB01"] },
  { match: /\bqueue\b|\bdelayed\b|\bstuck\b|\bmailflow\b|\bmail flow\b/, examples: ["show delayed queues", "resume queue EXCH01\\Submission", "transport queue report"] },
  { match: /\bcert\b|\bexpir\b/, examples: ["certificates expiring soon"] },
  { match: /\bquota\b/, examples: ["quota for alice@contoso.com", "mailbox statistics for alice@contoso.com"] },
  { match: /\bpermission\b|\baccess\b/, examples: ["permissions of alice@contoso.com", "permission risk report"] },
  { match: /\bconnector\b/, examples: ["list send connectors", "set send connector Outbound"] },
  { match: /\bservice\b|\brestart\b|\bhealth\b/, examples: ["is the server healthy", "full health report", "restart service MSExchangeTransport"] },
  { match: /\bmigrat/, examples: ["migration ETA", "migration readiness"] },
];

/** Relevant example prompts for the help card, based on what the user typed. */
export function helpExamplesFor(prompt: string): string[] {
  const p = normalizePrompt(prompt.toLowerCase());
  const out: string[] = [];
  for (const set of HELP_EXAMPLE_SETS) {
    if (set.match.test(p)) out.push(...set.examples);
    if (out.length >= 6) break;
  }
  return out.length ? out.slice(0, 6) : GENERIC_HELP_EXAMPLES;
}

const EMAIL_LIKE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const OBJECT_WORDS = ["mailbox", "transport", "database", "queue", "connector", "group", "permission", "service", "certificate", "dag", "contact", "domain", "rule"];

/**
 * A specific clue about which keywords the backend mappings expect, so an
 * unparseable prompt teaches instead of dead-ending. Empty when nothing
 * specific applies (the generic examples suffice).
 */
export function helpHintFor(prompt: string): string {
  const p = normalizePrompt(prompt.toLowerCase());
  const has = (...words: string[]) => words.some((w) => p.includes(w));
  if (has("rule") && !has("transport", "inbox", "journal", "retention")) {
    return "Tip: say which kind of rule — “transport rule” for mail flow — plus an action (list, delete, disable, set) and the rule name in quotes.";
  }
  if (WRITE_VERBS.test(p) && !OBJECT_WORDS.some((w) => p.includes(w))) {
    return "Tip: tell me what to change — a mailbox, transport rule, database, queue, connector, group, permission, or service — and which one by name.";
  }
  if (has("mailbox") && !EMAIL_LIKE.test(p)) {
    return "Tip: include the mailbox address, e.g. “…for alice@contoso.com”.";
  }
  return "";
}

export function routeQuery(prompt: string): Route {
  const p = normalizePrompt(prompt.toLowerCase());
  const email = extractIdentity(prompt);
  const has = (...words: string[]) => words.some((w) => p.includes(w));

  if (has("version", "cumulative", " cu", "build", "patch") && !has("compliance")) return { tool: "report.exchange_version_and_cu", args: {}, write: false };
  if (has("queue", "delayed", "stuck", "backlog", "mailflow", "mail flow", "pending mail") && !has("retry", "suspend", "resume", "report", "intelligence", "root cause")) return { tool: "exchange_get_queue", args: {}, write: false };
  if (has("search health", "content index")) return { tool: "diagnostics.test_exchange_search", args: {}, write: false };
  if (has("replication")) return { tool: "exchange_test_replication_health", args: {}, write: false };
  if (has("health", "healthy", "unhealthy") && has("full", "report", "detail", "dag")) return { tool: "exchange_get_health_report", args: {}, write: false };
  // Per-mailbox health (email-gated) must come before general health
  if (has("mailbox health") && email) return { tool: "report.mailbox_health_individual", args: { identity: email }, write: false };
  if (has("health", "healthy", "unhealthy")) return { tool: "exchange_test_service_health", args: {}, write: false };
  // Mailboxes scoped to a database beat the generic database rules below:
  // "list mailboxes in Exchange DB B" is a mailbox discovery, not database.list.
  if (has("mailbox", "mailboxes") && has("list", "number", "count", "how many", "show", "all")) {
    const db = extractMailboxDatabase(prompt);
    if (db) {
      if (has("how many", "number of") || (has("count") && !has("list", "show", "all"))) {
        return { tool: "exchange_discover_mailboxes", args: { pageSize: 100, database: db }, write: false };
      }
      const dm = prompt.match(/(\d+)\s*mailbox/i);
      if (dm) {
        return { tool: "exchange_list_mailboxes", args: { pageSize: Math.min(200, Math.max(1, parseInt(dm[1], 10))), database: db }, write: false };
      }
      return { tool: "exchange_discover_mailboxes", args: { pageSize: 100, database: db }, write: false };
    }
  }
  if (has("database", "databases", "db01", "db0") && has("list", "number", "count", "how many", "show", "all")) return { tool: "database.list", args: {}, write: false };
  if (has("databases") && !has("dismount", "mount", "backup", "whitespace", "growth", "repair")) return { tool: "database.list", args: {}, write: false };
  if (has("per database") || (has("distribution") && has("database", "mailbox"))) return { tool: "report.generate_database_distribution_report", args: {}, write: false };
  if (has("disk")) return { tool: "server.get_disk_space", args: {}, write: false };
  // AI capacity prediction must precede the whitespace rules below (both mention capacity)
  if (has("capacity") && has("predict", "exhaust", "run out", "fill up")) return { tool: "ai.capacity_forecast", args: {}, write: false };
  if (has("capacity forecast")) return { tool: "database.get_whitespace_and_growth", args: {}, write: false };
  if (has("whitespace", "growth", "storage", "size of database", "forecast", "capacity") && !has("trend")) return { tool: "database.get_whitespace_and_growth", args: {}, write: false };
  if (has("backup")) return { tool: "database.get_backup_status", args: {}, write: false };
  if (has("dag") && !has("report")) return { tool: "dag.list", args: {}, write: false };
  if (has("cert", "expir")) return { tool: "exchange_get_exchange_certificate", args: {}, write: false };
  if (has("uptime", "reboot", "last boot")) return { tool: "server.get_uptime", args: {}, write: false };
  if (has("service") && has("status", "running")) return { tool: "exchange_test_service_health", args: {}, write: false };
  // Connector writes must precede the list-all read below
  if (has("set", "change", "update", "modify") && has("send connector")) { const id = afterWord(prompt, "connector"); return { tool: "mailflow.set_send_connector", args: id ? { identity: id } : {}, write: true }; }
  if (has("set", "change", "update", "modify") && has("receive connector")) {
    const id = afterWord(prompt, "connector");
    const bm = prompt.match(/banner\s+"([^"]+)"|banner\s+(\S+)/i);
    const mm = prompt.match(/max\w*\s*message\w*\s*size\s+(\S+)/i);
    return { tool: "mailflow.set_receive_connector", args: { ...(id ? { identity: id } : {}), ...(bm ? { banner: bm[1] || bm[2] } : {}), ...(mm ? { maxMessageSize: mm[1] } : {}) }, write: true };
  }
  if (has("connector") && has("inventory", "overview", "all", "audit")) return { tool: "report.generate_connector_report", args: {}, write: false };
  if (has("connector")) return { tool: "exchange_list_send_connectors", args: {}, write: false };
  // Transport-rule writes must precede the list-all read below
  if (has("remove", "delete") && has("transport rule")) {
    const q = QUOTED_RE.exec(prompt)?.[1];
    const raw = afterWord(prompt, "rule")?.replace(/^(with\s+name|named?|called)\s+/i, "") || null;
    const id = q || raw;
    return { tool: "exchange_remove_transport_rule", args: id ? { identity: id } : {}, write: true };
  }
  if (has("enable", "disable") && has("transport rule")) {
    const q = QUOTED_RE.exec(prompt)?.[1];
    const raw = afterWord(prompt, "rule")?.replace(/^(with\s+name|named?|called)\s+/i, "") || null;
    const id = q || raw;
    return { tool: "exchange_set_transport_rule", args: { ...(id ? { identity: id } : {}), state: has("disable") ? "Disabled" : "Enabled" }, write: true };
  }
  if (has("set", "change", "update", "modify", "priorit") && has("transport rule")) {
    const q = QUOTED_RE.exec(prompt)?.[1];
    const raw = afterWord(prompt, "rule")?.replace(/^(with\s+name|named?|called)\s+/i, "") || null;
    const pm = prompt.match(/priority\s+(\d+)/i);
    return { tool: "exchange_set_transport_rule", args: { ...(q || raw ? { identity: (q || raw)! } : {}), ...(pm ? { priority: parseInt(pm[1], 10) } : {}) }, write: true };
  }
  // Bare "X rule" phrasing (no "transport" word): assume transport rule unless
  // the prompt names another rule family with its own read path.
  if (has("rule") && !has("inbox", "journal", "retention", "transport")) {
    const q = QUOTED_RE.exec(prompt)?.[1];
    const raw = afterWord(prompt, "rule")?.replace(/^(with\s+name|named?|called)\s+/i, "") || null;
    const unquoted = afterWord(prompt, "update") || afterWord(prompt, "delete") || afterWord(prompt, "remove") || afterWord(prompt, "disable") || afterWord(prompt, "enable") || afterWord(prompt, "set");
    const bare = (q || (unquoted ? unquoted.replace(/\s+rules?$/i, "") : null) || raw) || null;
    const id = bare && bare.length < 80 ? bare : null;
    if (has("remove", "delete")) return { tool: "exchange_remove_transport_rule", args: id ? { identity: id } : {}, write: true };
    if (has("enable", "disable")) return { tool: "exchange_set_transport_rule", args: { ...(id ? { identity: id } : {}), state: has("disable") ? "Disabled" : "Enabled" }, write: true };
    if (has("set", "change", "update", "modify", "priorit")) {
      const pm = prompt.match(/priority\s+(\d+)/i);
      return { tool: "exchange_set_transport_rule", args: { ...(id ? { identity: id } : {}), ...(pm ? { priority: parseInt(pm[1], 10) } : {}) }, write: true };
    }
  }
  if (has("transport rule") && has("inventory", "overview", "summary", "report")) return { tool: "report.generate_transport_rule_report", args: {}, write: false };
  if (has("transport rule")) return { tool: "exchange_get_transport_rules", args: {}, write: false };
  if (has("server") && has("list")) return { tool: "exchange_list_servers", args: {}, write: false };
  if (has("topology")) return { tool: "report.exchange_topology", args: {}, write: false };
  if (has("overview", "environment")) return { tool: "report.exchange_environment_overview", args: {}, write: false };
  // AI insight reports (no-arg tools)
  if (has("daily report", "daily brief", "morning brief", "daily exchange report")) return { tool: "ai.daily_report", args: {}, write: false };
  if (has("things you should know", "things i should know", "should know", "need to know")) return { tool: "ai.things_you_should_know", args: {}, write: false };
  if (has("management report", "cto dashboard", "executive dashboard")) return { tool: "ai.management_report", args: {}, write: false };
  if (has("executive summary")) return { tool: "ai.exchange_executive_summary", args: {}, write: false };
  if (has("anomal")) return { tool: "ai.anomaly_detection", args: {}, write: false };
  if (has("cleanup", "stale mailbox", "recover space", "dead mailbox") && !email) return { tool: "ai.cleanup_recommendation", args: {}, write: false };
  if (has("migration") && has("batch", "order", "sequence", "priorit")) return { tool: "ai.migration_prioritization", args: {}, write: false };
  if (has("migration") && has("eta", "progress", "how long", "status")) return { tool: "ai.migration_eta", args: {}, write: false };
  if (has("migration", "migrate") && has("advisor", "readiness", "plan", "assess", "should we")) return { tool: "ai.migration_advisor", args: {}, write: false };
  if (has("what if", "what happens if") || (has("impact") && has("change", "of"))) return { tool: "ai.change_impact_report", args: { change: prompt }, write: false };
  if (has("incident", "outage", "postmortem", "post-mortem")) return { tool: "ai.incident_report", args: { incident: prompt }, write: false };
  if (has("permission risk", "excessive access", "over-privileged", "too much access", "who has access")) return { tool: "ai.permission_risk_report", args: {}, write: false };
  if (has("security risk", "risk report", "vulnerab", "exposure", "attack surface")) return { tool: "ai.security_risk_report", args: {}, write: false };
  if (has("compromised", "hacked", "breach", "phish", "suspicious send")) return { tool: "ai.compromised_account_detection", args: {}, write: false };
  if (has("spam") || has("mail flow intelligence", "top sender", "mail volume", "sending pattern", "bounce rate")) return { tool: "ai.mail_flow_intelligence", args: {}, write: false };
  if (has("ndr insight", "bounce stat", "ndr stat")) return { tool: "ai.ndr_intelligence", args: {}, write: false };
  if (has("config risk", "misconfig", "hardening", "best practice")) return { tool: "ai.configuration_risk", args: {}, write: false };
  if (has("compliance report", "compliance snapshot")) return { tool: "report.generate_compliance_report", args: {}, write: false };
  if (has("root cause") || (has("why") && has("delay", "queue", "slow", "fail"))) return { tool: "ai.root_cause_analysis", args: {}, write: false };
  // Aggregate reports (no-arg)
  if (has("mailbox size report", "biggest mailbox", "largest mailbox", "top mailbox")) {
    // Explicit top-N ("top 50 largest") is honored; otherwise the tool default applies.
    const tm = prompt.match(/(?:top|first)\s+(\d+)|(\d+)\s*(?:largest|biggest|top)/i);
    const top = tm ? Math.min(100, Math.max(1, parseInt(tm[1] || tm[2], 10))) : undefined;
    return { tool: "report.generate_mailbox_size_report", args: top ? { top } : {}, write: false };
  }
  if (has("growth trend")) return { tool: "report.generate_database_growth_trend", args: {}, write: false };
  if (has("transport queue report")) return { tool: "report.generate_transport_queue_report", args: {}, write: false };
  if (has("archive report")) return { tool: "report.generate_archive_report", args: {}, write: false };
  if (has("inactive report", "stale report", "inactive mailbox report")) return { tool: "report.generate_inactive_mailbox_report", args: {}, write: false };
  if (has("mobile report", "device report")) return { tool: "report.generate_mobile_device_report", args: {}, write: false };
  if (has("oof report")) return { tool: "report.generate_oof_report", args: {}, write: false };
  if (has("dag report")) return { tool: "report.generate_dag_report", args: {}, write: false };
  if (has("hold report")) return { tool: "report.generate_hold_report", args: {}, write: false };
  if (has("full summary", "everything summary", "complete summary", "full exchange summary")) return { tool: "report.generate_full_summary", args: {}, write: false };
  if (has("build compliance", "cu compliance", "patch compliance")) return { tool: "report.exchange_build_compliance", args: {}, write: false };
  if (has("server role")) return { tool: "report.server_role_report", args: {}, write: false };
  if (has("ad site", "site mapping")) return { tool: "report.ad_site_exchange_mapping", args: {}, write: false };
  if (has("dependenc")) return { tool: "report.exchange_dependency", args: {}, write: false };
  if (has("infrastructure summary")) return { tool: "report.exchange_infrastructure_summary", args: {}, write: false };
  if (has("org config", "organization config")) return { tool: "organization.get_config", args: {}, write: false };
  // People & groups
  if (has("contact") && !has("mailbox")) return { tool: "exchange_list_mail_contacts", args: {}, write: false };
  if (has("mail user")) return { tool: "exchange_list_mail_users", args: {}, write: false };
  if (has("dynamic") && has("group")) return { tool: "exchange_list_dynamic_distribution_groups", args: {}, write: false };
  // Group writes must precede the distribution-group read below
  if (has("add", "create", "give") && has("group", "member") && email && !has("permission", "access")) {
    const gq = QUOTED_RE.exec(prompt)?.[1];
    const graw = afterWord(prompt, "group")?.replace(/^(for|named?|called)\s+/i, "") || null;
    const gname = gq || (graw && graw.indexOf("@") < 0 ? graw : null);
    return { tool: "group.add_member", args: { ...(gname ? { identity: gname } : {}), member: email }, write: true };
  }
  if (has("create", "new") && has("group") && !email) {
    const gq = QUOTED_RE.exec(prompt)?.[1];
    const graw = afterWord(prompt, "group")?.replace(/^(for|named?|called)\s+/i, "") || null;
    const gname = gq || (graw && graw.indexOf("@") < 0 ? graw : null);
    return { tool: "group.new", args: gname ? { name: gname } : {}, write: true };
  }
  if (has("group") && has("empty", "oversized", "oversize", "unused", "hygiene")) return { tool: "report.generate_group_hygiene_report", args: {}, write: false };
  if (has("distribution group", "distribution list")) {
    // Pure count questions get the exact total; listings fetch up to 1000
    // so the output card pager covers large orgs.
    if (has("how many", "number of") || (has("count") && !has("list", "show", "all"))) {
      return { tool: "exchange_list_distribution_groups", args: { countOnly: true }, write: false };
    }
    const m = prompt.match(/(\d+)\s*distribution/i);
    const n = m ? Math.min(1000, Math.max(1, parseInt(m[1], 10))) : 1000;
    return { tool: "exchange_list_distribution_groups", args: { resultSize: n }, write: false };
  }
  if (has("role group", "rbac")) return { tool: "exchange_get_role_groups", args: {}, write: false };
  // Compliance & mailbox features
  if (has("journal")) return { tool: "exchange_get_journal_rule", args: {}, write: false };
  if (has("retention polic", "retention tag", "mrm")) return { tool: "exchange_get_retention_policy_tag", args: {}, write: false };
  if (has("litigation hold") && email) return { tool: "exchange_get_litigation_hold", args: { identity: email }, write: false };
  if (has("in-place hold", "inplace hold", "ediscovery", "e-discovery") && email) return { tool: "exchange_get_inplace_hold", args: { identity: email }, write: false };
  if (has("oof", "out of office", "automatic repl") && email) return { tool: "exchange_get_oof", args: { identity: email }, write: false };
  if (has("inbox rule") && email) return { tool: "exchange_get_inbox_rules", args: { mailbox: email }, write: false };
  if (has("mailbox audit") && email) return { tool: "security.get_mailbox_audit_log", args: { identity: email }, write: false };
  if (has("audit log")) return { tool: "exchange_search_admin_audit_log", args: {}, write: false };
  if (has("archive") && email) return { tool: "exchange_get_archive_status", args: { identity: email }, write: false };
  if (has("quota") && !has("set", "change", "increase", "raise") && email) return { tool: "exchange_get_mailbox_quota", args: { identity: email }, write: false };
  if (has("quota") && !has("set", "change", "increase", "raise") && !email) return { tool: "report.generate_quota_pressure_report", args: {}, write: false };
  if (has("mobile", "activesync device", "phone") && email) return { tool: "exchange_get_mobile_device", args: { mailbox: email }, write: false };
  if (has("public folder")) return { tool: "exchange_get_public_folder", args: {}, write: false };
  if (has("folder statistic") && email) return { tool: "mailbox.get_folder_statistics", args: { identity: email }, write: false };
  if (has("move request") && has("all", "board", "list", "overview", "dashboard")) return { tool: "report.generate_move_request_report", args: {}, write: false };
  if (has("move request status", "move status")) return { tool: "mailbox.get_move_request_status", args: {}, write: false };
  if (has("import request")) return { tool: "exchange_get_mailbox_import_request", args: {}, write: false };
  if (has("restore request")) return { tool: "exchange_get_mailbox_restore_request", args: {}, write: false };
  if (has("soft-deleted", "soft deleted", "disconnected mailbox")) return { tool: "exchange_get_softdeleted_mailbox", args: {}, write: false };
  // Per-mailbox deep reports (email-gated)
  if (has("mailbox detail", "detailed mailbox report", "full configuration", "full details", "complete details", "configuration details", "full config", "details of", "get details", "show details", "detail of") && has("mailbox") && email) return { tool: "report.mailbox_detail", args: { identity: email }, write: false };
  // Full-config phrasing with a bare name ("...of administrator mailbox"):
  // no email, so resolve + report in one call instead of dumping the org.
  if (has("full configuration", "full details", "complete details", "configuration details", "full config", "details of", "get details", "show details", "detail of") && has("mailbox") && !email) {
    const nm = prompt.match(/(?:of|for|named?|called)\s+(?:the\s+)?([A-Za-z0-9_\-]+)\s+mailbox/i)?.[1]
      || prompt.match(/mailbox\s+(?:for|named?|called)\s+(?:the\s+)?([A-Za-z0-9_\-]+)/i)?.[1];
    if (nm) return { tool: "report.mailbox_full_config", args: { identity: nm }, write: false };
  }
  // Same intent without the word "mailbox" ("full config for devlabadmin"):
  // extract a name-like candidate so agents pick the single-call report
  // instead of fanning out separate detail calls. Skipped when the prompt
  // names another object family (queue, cert, dag, ...) with its own path.
  if (has("full configuration", "full details", "complete details", "configuration details", "full config", "details of", "get details", "show details", "detail of") && !email
      && !has("queue", "cert", "dag", "database", "server", "connector", "rule", "group")) {
    const stop = new Set(["the", "a", "an", "me", "my", "mailbox", "mailboxes", "user", "details", "detail", "configuration", "config", "full", "complete", "for", "of"]);
    const cand = QUOTED_RE.exec(prompt)?.[1]
      || afterWord(prompt, "for")?.replace(/^the\s+/i, "")
      || afterWord(prompt, "of")?.replace(/^the\s+/i, "");
    const tok = cand?.split(/\s+/)[0]?.replace(/["'.]+$/g, "");
    if (tok && !stop.has(tok.toLowerCase()) && /^[A-Za-z0-9_\-@.]+$/.test(tok)) {
      return { tool: "report.mailbox_full_config", args: { identity: tok }, write: false };
    }
  }
  if (has("mailbox health") && email) return { tool: "report.mailbox_health_individual", args: { identity: email }, write: false };
  if (has("mailbox compliance") && email) return { tool: "report.mailbox_compliance_individual", args: { identity: email }, write: false };
  if (has("forwarding") && email) return { tool: "report.mailbox_forwarding_individual", args: { identity: email }, write: false };
  if (has("forwarding")) return { tool: "report.generate_forwarding_report", args: {}, write: false };
  if (has("client access", "owa enabled", "mapi enabled", "pop enabled", "imap enabled", "ews enabled") && email) return { tool: "report.mailbox_client_access_individual", args: { identity: email }, write: false };
  if ((/\bpop3?\b|\bimap\b/.test(p) || (has("mapi", "activesync", "protocol") && has("enabled", "disabled", "who", "which", "sprawl"))) && !email) return { tool: "report.generate_protocol_report", args: {}, write: false };
  if (has("mailbox size for", "size of mailbox") && email) return { tool: "report.mailbox_size_individual", args: { identity: email }, write: false };
  if (has("mailbox activity", "activity for", "user activity") && email) return { tool: "report.mailbox_activity_individual", args: { identity: email }, write: false };
  if (has("flow profile") && email) return { tool: "report.mailflow_profile", args: { identity: email }, write: false };
  if (has("cleanup advisor") && email) return { tool: "ai.mailbox_cleanup_advisor", args: { identity: email }, write: false };
  // Org & misc reads
  if (has("domain") && has("inventory", "overview")) return { tool: "report.generate_domain_report", args: {}, write: false };
  if (has("accepted domain", "remote domain")) return { tool: "exchange_list_accepted_domains", args: {}, write: false };
  if (has("virtual director", "vdir")) return { tool: "exchange_get_virtual_directory", args: {}, write: false };
  if (has("autodiscover")) { const d = (email && email.split("@")[1]) || extractDomain(prompt); return { tool: "clientaccess.get_autodiscover_info", args: d ? { domain: d } : {}, write: false }; }
  if (has("test owa", "owa connect")) return { tool: "clientaccess.test_owa", args: {}, write: false };
  if (has("transport config", "transport setting", "max send", "message size limit")) return { tool: "exchange_get_transport_config", args: {}, write: false };
  if (has("smtp test", "test smtp", "banner check", "ehlo")) { const d = extractDomain(prompt); return { tool: "mailflow.test_smtp_connectivity", args: d ? { host: d } : {}, write: false }; }
  if (has("copy status", "copy queue", "replay queue")) return { tool: "exchange_get_database_copy_status", args: {}, write: false };
  if (has("witness")) return { tool: "dag.get_witness_status", args: {}, write: false };
  if (has("search mailbox")) { const q = QUOTED_RE.exec(prompt)?.[1]; return { tool: "exchange_search_mailbox", args: { ...(email ? { identity: email } : {}), ...(q ? { searchQuery: q } : {}) }, write: false }; }
  if (has("event log", "eventlog", "application error", "system error")) return { tool: "server.get_event_log_errors", args: {}, write: false };
  if (has("performance", "perf counter", "cpu usage", "memory usage", "rpc lat")) return { tool: "server.get_performance_counters", args: {}, write: false };
  if (has("connectivity test", "test exchange connect", "endpoint check")) return { tool: "exchange_test_connection", args: {}, write: false };
  if (has("inbox", "recent mail", "latest email")) return { tool: "exchange_list_messages", args: {}, write: false };
  if (has("calendar", "meeting", "appointment", "free busy", "availability")) return { tool: "exchange_list_calendar_events", args: {}, write: false };
  if (has("tasks", "to-do", "todo list")) return { tool: "exchange_list_tasks", args: {}, write: false };
  if (has("ndr insight", "bounce stat", "ndr stat")) return { tool: "ai.ndr_intelligence", args: {}, write: false };
  if (has("ndr", "bounce", "bounced") || NDR_RE.test(prompt)) {
    const code = prompt.match(NDR_RE)?.[1];
    return { tool: "mailflow.get_ndr_details", args: code ? { code } : {}, write: false };
  }
  if (has("trace", "tracking", "delivery status", "did") && has("receiv", "trace", "tracking", "delivery", "did")) {
    const q = QUOTED_RE.exec(prompt)?.[1];
    return { tool: "mailflow.get_message_trace", args: { ...(email ? { sender: email } : {}), ...(q ? { subject: q } : {}) }, write: false };
  }
  // Write intents that must precede the read-only permission/mailbox fallbacks
  if (has("remove", "revoke") && has("permission", "access", "sendas", "send as", "fullaccess", "full access") && email) {
    const all = prompt.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
    const from = prompt.match(/from\s+([\w.+-]+@[\w-]+\.[\w.]+)/i);
    const user = from ? from[1] : all[1];
    return { tool: "mailbox.remove_permission", args: { identity: email, ...(user ? { user } : {}), accessRights: /send[\s-]*as/i.test(prompt) ? "SendAs" : "FullAccess" }, write: true };
  }
  if (has("remove", "delete", "disable") && has("mailbox") && !has("permission", "access") && email) {
    const permanent = has("permanent", "forever", "purge", "hard delete");
    return { tool: "exchange_remove_mailbox", args: { identity: email, ...(permanent ? { permanent: true } : {}) }, write: true };
  }
  // Grant phrasing ("grant ...", "... to bob@...") is a write; plain
  // "give me the permissions of X" stays a read.
  if (has("permission", "access", "fullaccess", "sendas", "send as") && email && !(has("grant") || /to\s+[\w.+-]+@[\w-]+\.[\w.]+/i.test(prompt))) return { tool: "exchange_get_mailbox_permissions", args: { identity: email }, write: false };
  if (has("fullaccess", "full access", "full_access") && !email) return { tool: "report.generate_fullaccess_audit_report", args: {}, write: false };
  if (has("statistic", "how big", "item count", "last logon") && email) return { tool: "exchange_get_mailbox_statistics", args: { identity: email }, write: false };
  // Write intents (need confirm — enforced by caller)
  if (has("dismount")) { const raw = afterWord(prompt, "dismount"); const id = raw?.replace(/^database\s+/i, "") || null; return { tool: "database.dismount", args: id ? { identity: id } : {}, write: true }; }
  if (has("mount") && !has("amount")) { const raw = afterWord(prompt, "mount"); const id = raw?.replace(/^database\s+/i, "") || null; return { tool: "database.mount", args: id ? { identity: id } : {}, write: true }; }
  if (has("retry") && has("queue")) { const id = afterWord(prompt, "queue"); return { tool: "exchange_retry_queue", args: id ? { identity: id } : {}, write: true }; }
  if (has("suspend") && has("queue")) { const id = afterWord(prompt, "queue"); return { tool: "exchange_suspend_queue", args: id ? { identity: id } : {}, write: true }; }
  if (has("resume") && has("queue")) { const id = afterWord(prompt, "queue"); return { tool: "mailflow.resume_queue", args: id ? { identity: id } : {}, write: true }; }
  if (has("restart") && has("service")) { const m = prompt.match(/restart\s+(?:the\s+)?([A-Za-z*]+)/i); return { tool: "server.restart_service", args: { ...(m ? { name: m[1] } : {}), confirm: true }, write: true }; }
  if (has("move") && has("mailbox", "request")) {
    const dbm = prompt.match(/(?:\bto\b|\btarget\b(?:\s+database\b)?|\bdatabase\b)\s+([A-Za-z0-9_\-]+)/i);
    const targetDatabase = dbm && dbm[1].indexOf("@") < 0 ? dbm[1] : undefined;
    return { tool: "mailbox.new_move_request", args: { ...(email ? { identity: email } : {}), ...(targetDatabase ? { targetDatabase } : {}) }, write: true };
  }
  const sizeArg = prompt.match(/(\d+\s?(?:MB|GB|TB))\b/i)?.[1]?.replace(/\s+/g, "");
  if (has("quota") && has("set", "change", "increase", "raise")) return { tool: "mailbox.set_quota", args: { ...(email ? { identity: email } : {}), ...(sizeArg ? { prohibitSendQuota: sizeArg } : {}) }, write: true };
  if (has("set") && has("mailbox") && email) return { tool: "exchange_set_mailbox", args: { identity: email, ...(sizeArg ? { prohibitSendQuota: sizeArg } : {}) }, write: true };
  if (has("create", "new") && has("mailbox") && !has("move request", "move status")) {
    const q = QUOTED_RE.exec(prompt)?.[1];
    const dbm = prompt.match(/(?:\bin\b|\bon\b)\s+(?:database\s+)?([A-Za-z0-9_\-]+)/i);
    const db = dbm && !dbm[1].includes("@") ? dbm[1] : undefined;
    return { tool: "exchange_create_mailbox", args: { ...(q ? { name: q } : {}), ...(email ? { userPrincipalName: email } : {}), ...(db ? { database: db } : {}), ...(has("shared") ? { shared: true } : {}), ...(has("room") ? { room: true } : {}), ...(has("equipment") ? { equipment: true } : {}) }, write: true };
  }
  if (has("repair") && has("database", "mailbox")) {
    const dbm = prompt.match(/database\s+([A-Za-z0-9_\-]+)/i);
    return { tool: "database.new_repair_request", args: { ...(dbm ? { database: dbm[1] } : {}) }, write: true };
  }
  if ((has("grant", "give", "add") && has("permission", "access")) && email) {
    const m = prompt.match(/to\s+([\w.+-]+@[\w-]+\.[\w.]+)/i);
    const rights = /send[\s-]*as/i.test(prompt) ? "SendAs" : "FullAccess";
    return { tool: "mailbox.add_permission", args: { identity: email, ...(m ? { user: m[1] } : {}), accessRights: rights }, write: true };
  }
  if (has("suspend") && has("copy")) { const id = afterWord(prompt, "copy"); return { tool: "database.suspend_copy", args: id ? { identity: id } : {}, write: true }; }
  if (has("resume") && has("copy")) { const id = afterWord(prompt, "copy"); return { tool: "database.resume_copy", args: id ? { identity: id } : {}, write: true }; }
  if (has("move active", "failover database", "switchover")) return { tool: "database.move_active", args: {}, write: true };
  if (has("add copy")) return { tool: "database.add_copy", args: {}, write: true };
  if (has("remove copy")) return { tool: "database.remove_copy", args: {}, write: true };
  if (has("set activation", "activation polic")) return { tool: "dag.set_activation_policy", args: {}, write: true };
  if (has("mailbox", "mailboxes") && has("list", "number", "count", "how many", "show", "all")) {
    // Pure count questions get the exact total. Bare list-all prompts go to
    // granular discovery (summary + first page) so large orgs never trigger
    // one giant fetch. An explicit count in the prompt becomes a bounded
    // page size, clamped to the page maximum (200).
    if (has("how many", "number of") || (has("count") && !has("list", "show", "all"))) {
      return { tool: "exchange_list_mailboxes", args: { countOnly: true }, write: false };
    }
    const m = prompt.match(/(\d+)\s*mailbox/i);
    if (m) {
      const n = Math.min(200, Math.max(1, parseInt(m[1], 10)));
      return { tool: "exchange_list_mailboxes", args: { pageSize: n }, write: false };
    }
    return { tool: "exchange_discover_mailboxes", args: { pageSize: 100 }, write: false };
  }
  // Live sample for UI placeholder substitution (small, cheap fetch)
  if (has("first mailbox")) return { tool: "exchange_list_mailboxes", args: { resultSize: 5 }, write: false };
  // MCP capability questions — answered live via tools/list (see desktop main.ts).
  // Placed last so every concrete intent keeps precedence.
  if (has("tools", "capabilit", "what can you do", "offer", "feature", "function")) {
    return { tool: "__mcp_tools_list", args: {}, write: false };
  }
  if (email) return { tool: "ai.tell_me_everything", args: { identity: email }, write: false };
  return { help: true };
}
