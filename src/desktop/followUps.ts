// Contextual follow-up actions for AI chat responses.
// Pure + testable. Backend-driven (tool + args), never regex-scraped from
// AI prose — so suggestions stay accurate, grounded, and low-noise.
// Prompts are natural-language (not raw PowerShell) so they route through
// the keyword router / AI tool-picker exactly like user-typed prompts.
// Every prompt below was verified against routeQuery (see tests).

export interface FollowUpAction {
  label: string;
  prompt: string;
}

interface Ctx {
  db: string | null;
  email: string | null;
  server: string | null;
  domain: string | null;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const DB_RE = /\b([A-Z]{2,}\d+)\b/;
const SERVER_RE = /\b((?:EXCH|MBX|SRV)\d+)\b/i;
const DOMAIN_RE = /(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function extractDb(args: Record<string, unknown>, text: string): string | null {
  // Prefer an explicit identity arg when the conversation is about a database.
  if (/database|\bdb\b|\bdag\b|failover|switchover|copy/i.test(text)) {
    const id = str(args?.identity) ?? str(args?.database);
    if (id) return id;
  }
  return (
    text.match(/database\s+([A-Za-z0-9_\-]+)/i)?.[1] ??
    text.match(DB_RE)?.[1] ??
    str(args?.change)?.match?.(/database\s+([A-Za-z0-9_\-]+)/i)?.[1] ??
    str(args?.change)?.match?.(DB_RE)?.[1] ??
    null
  );
}

function extractCtx(tool: string, args: Record<string, unknown>, prompt: string): Ctx {
  const text = `${prompt} ${typeof args?.change === "string" ? args.change : ""} ${typeof args?.incident === "string" ? args.incident : ""}`;
  const email = text.match(EMAIL_RE)?.[0] ?? str(args?.identity && EMAIL_RE.test(String(args.identity)) ? args.identity : null) ?? str(args?.member) ?? null;
  const server =
    str(args?.server) ??
    text.match(SERVER_RE)?.[1]?.toUpperCase() ??
    null;
  const domain =
    (email ? email.split("@")[1] : null) ??
    str(args?.domain) ??
    text.match(DOMAIN_RE)?.[0] ??
    null;
  return { db: extractDb(args, text), email, server, domain };
}

function dedupe(actions: FollowUpAction[], currentPrompt: string): FollowUpAction[] {
  const seen = new Set<string>();
  const current = currentPrompt.trim().toLowerCase();
  const out: FollowUpAction[] = [];
  for (const a of actions) {
    const key = a.prompt.trim().toLowerCase();
    if (!key || key === current || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.slice(0, 3);
}

/**
 * High-confidence follow-ups for a just-executed tool. Returns [] when
 * nothing relevant can be grounded — no generic noise.
 */
export function getFollowUps(
  tool: string,
  args: Record<string, unknown> = {},
  prompt = "",
): FollowUpAction[] {
  const ctx = extractCtx(tool, args, prompt);
  const { db, email } = ctx;
  const mail = (p: string, label: string): FollowUpAction => ({ label, prompt: p });
  const forMail = (p: string): string => (email ? p.replace(/alice@contoso\.com/g, email) : p);
  let actions: FollowUpAction[] = [];

  switch (tool) {
    // ---------- Databases, DAG, capacity ----------
    case "ai.change_impact_report":
      actions = db
        ? [
            mail(`check database copy status for ${db}`, `Check copy status: ${db}`),
            mail("test replication health", "Test replication health"),
            mail("transport queue report", "Transport queue report"),
          ]
        : [
            mail("test replication health", "Test replication health"),
            mail("transport queue report", "Transport queue report"),
          ];
      break;

    case "exchange_get_database_copy_status":
    case "database.get_copy_status":
      actions = [
        mail("test replication health", "Test replication health"),
        mail("dag report", "DAG report"),
        mail("database whitespace and growth", "Whitespace & growth"),
      ];
      break;

    case "exchange_test_replication_health":
      actions = [
        mail("dag report", "DAG report"),
        ...(db ? [mail(`check database copy status for ${db}`, `Check copy status: ${db}`)] : []),
        mail("transport queue report", "Transport queue report"),
      ];
      break;

    case "dag.list":
    case "dag.get_info":
    case "dag.get_witness_status":
    case "report.generate_dag_report":
    case "dag.simulate_failover_check":
      actions = [
        mail("test replication health", "Test replication health"),
        ...(db
          ? [mail(`check database copy status for ${db}`, `Check copy status: ${db}`)]
          : [mail("database whitespace and growth", "Whitespace & growth")]),
        mail("transport queue report", "Transport queue report"),
      ];
      break;

    case "database.list":
    case "exchange_list_mailbox_databases":
    case "exchange_get_mailbox_database":
      actions = [
        mail("database whitespace and growth", "Whitespace & growth"),
        mail("last backup status", "Backup status"),
        mail("growth trend", "Growth trend"),
      ];
      break;

    case "database.get_whitespace_and_growth":
    case "ai.capacity_forecast":
    case "report.generate_database_growth_trend":
    case "report.generate_database_distribution_report":
      actions = [
        mail("last backup status", "Backup status"),
        mail("growth trend", "Growth trend"),
        mail("list databases", "List databases"),
      ];
      break;

    case "database.get_backup_status":
      actions = [
        mail("database whitespace and growth", "Whitespace & growth"),
        mail("growth trend", "Growth trend"),
      ];
      break;

    case "database.mount":
    case "database.dismount":
    case "database.move_active":
    case "database.suspend_copy":
    case "database.resume_copy":
    case "database.add_copy":
    case "database.remove_copy":
    case "database.new_repair_request":
      actions = db
        ? [
            mail(`check database copy status for ${db}`, `Check copy status: ${db}`),
            mail("test replication health", "Test replication health"),
          ]
        : [mail("test replication health", "Test replication health")];
      break;

    // ---------- Mail flow, queues, NDR, connectors ----------
    case "exchange_get_queue":
    case "exchange_get_queue_digest":
    case "report.generate_transport_queue_report":
      actions = [
        mail("why is mail delayed", "Why is mail delayed?"),
        mail("NDR bounce statistics", "NDR statistics"),
        mail("show transport rules", "Transport rules"),
      ];
      break;

    case "mailflow.get_message_trace":
      actions = [
        mail("why is mail delayed", "Why is mail delayed?"),
        mail("transport queue report", "Transport queue report"),
        mail("explain bounce 5.7.1", "Explain NDR 5.7.1"),
      ];
      break;

    case "mailflow.get_ndr_details":
    case "ai.ndr_intelligence":
      actions = [
        mail("transport queue report", "Transport queue report"),
        mail("who is spamming", "Top senders"),
        ...(email ? [mail(`trace messages from ${email}`, `Trace ${email}`)] : []),
      ];
      break;

    case "ai.mail_flow_intelligence":
    case "ai.root_cause_analysis":
      actions = [
        mail("transport queue report", "Transport queue report"),
        mail("show delayed queues", "Delayed queues"),
        mail("NDR bounce statistics", "NDR statistics"),
      ];
      break;

    case "exchange_get_transport_rules":
    case "report.generate_transport_rule_report":
      actions = [
        mail("list send connectors", "Send connectors"),
        mail("connector inventory", "Connector inventory"),
        mail("transport queue report", "Transport queue report"),
      ];
      break;

    case "exchange_list_send_connectors":
    case "exchange_list_receive_connectors":
    case "report.generate_connector_report":
      actions = [
        mail("show transport rules", "Transport rules"),
        mail("transport queue report", "Transport queue report"),
        mail("environment overview", "Environment overview"),
      ];
      break;

    case "mailflow.set_send_connector":
    case "mailflow.set_receive_connector":
      actions = [
        mail("list send connectors", "Send connectors"),
        mail("show transport rules", "Transport rules"),
      ];
      break;

    case "exchange_get_transport_config":
      actions = [
        mail("show transport rules", "Transport rules"),
        mail("list send connectors", "Send connectors"),
      ];
      break;

    case "mailflow.test_smtp_connectivity":
    case "clientaccess.get_autodiscover_info":
    case "clientaccess.test_owa":
    case "exchange_get_virtual_directory":
      actions = [
        mail("test owa connectivity", "Test OWA"),
        mail("environment overview", "Environment overview"),
        mail("show transport rules", "Transport rules"),
      ];
      break;

    case "exchange_retry_queue":
    case "exchange_suspend_queue":
    case "mailflow.resume_queue":
      actions = [
        mail("show delayed queues", "Delayed queues"),
        mail("transport queue report", "Transport queue report"),
      ];
      break;

    case "exchange_remove_transport_rule":
    case "exchange_set_transport_rule":
      actions = [mail("show transport rules", "Transport rules")];
      break;

    // ---------- Mailboxes & recipients ----------
    case "ai.tell_me_everything":
    case "exchange_get_mailbox":
    case "report.mailbox_detail":
    case "report.mailbox_full_config":
      actions = email
        ? [
            mail(forMail("mailbox statistics for alice@contoso.com"), `Statistics: ${email}`),
            mail(forMail("permissions of alice@contoso.com"), `Permissions: ${email}`),
            mail(forMail("mailbox health for alice@contoso.com"), `Health: ${email}`),
          ]
        : [
            mail("mailbox size report", "Largest mailboxes"),
            mail("inactive mailbox report", "Inactive mailboxes"),
          ];
      break;

    case "exchange_get_mailbox_statistics":
    case "report.mailbox_size_individual":
    case "report.mailbox_activity_individual":
    case "report.mailflow_profile":
      actions = email
        ? [
            mail(forMail("mailbox detail for alice@contoso.com"), `Detail: ${email}`),
            mail(forMail("quota for alice@contoso.com"), `Quota: ${email}`),
            mail(forMail("cleanup advisor for alice@contoso.com"), `Cleanup: ${email}`),
          ]
        : [
            mail("mailbox size report", "Largest mailboxes"),
            mail("quota pressure report", "Quota pressure"),
          ];
      break;

    case "exchange_get_mailbox_permissions":
    case "report.generate_fullaccess_audit_report":
      actions = email
        ? [
            mail(forMail("forwarding for alice@contoso.com"), `Forwarding: ${email}`),
            mail("permission risk report", "Permission risk"),
          ]
        : [
            mail("permission risk report", "Permission risk"),
            mail("forwarding report", "Forwarding report"),
          ];
      break;

    case "mailbox.add_permission":
    case "mailbox.remove_permission":
      actions = email
        ? [mail(forMail("permissions of alice@contoso.com"), `Permissions: ${email}`)]
        : [mail("permission risk report", "Permission risk")];
      break;

    case "exchange_get_mailbox_quota":
    case "report.generate_quota_pressure_report":
      actions = email
        ? [
            mail(forMail("cleanup advisor for alice@contoso.com"), `Cleanup: ${email}`),
            mail("mailbox size report", "Largest mailboxes"),
          ]
        : [
            mail("mailbox size report", "Largest mailboxes"),
            mail("inactive mailbox report", "Inactive mailboxes"),
          ];
      break;

    case "mailbox.set_quota":
      actions = email
        ? [mail(forMail("quota for alice@contoso.com"), `Quota: ${email}`)]
        : [mail("quota pressure report", "Quota pressure")];
      break;

    case "report.mailbox_health_individual":
    case "report.mailbox_compliance_individual":
    case "exchange_get_archive_status":
    case "exchange_get_oof":
    case "exchange_get_inbox_rules":
    case "exchange_get_mobile_device":
    case "mailbox.get_folder_statistics":
    case "security.get_mailbox_audit_log":
    case "exchange_get_cas_mailbox":
      actions = email
        ? [
            mail(forMail("mailbox detail for alice@contoso.com"), `Detail: ${email}`),
            mail(forMail("mailbox health for alice@contoso.com"), `Health: ${email}`),
            mail(forMail("cleanup advisor for alice@contoso.com"), `Cleanup: ${email}`),
          ]
        : [mail("full exchange summary", "Full summary")];
      break;

    case "report.mailbox_forwarding_individual":
    case "report.generate_forwarding_report":
    case "report.mailbox_client_access_individual":
    case "report.generate_protocol_report":
      actions = email
        ? [
            mail(forMail("permissions of alice@contoso.com"), `Permissions: ${email}`),
            mail("permission risk report", "Permission risk"),
          ]
        : [
            mail("permission risk report", "Permission risk"),
            mail("forwarding report", "Forwarding report"),
          ];
      break;

    case "ai.mailbox_cleanup_advisor":
      actions = email
        ? [
            mail(forMail("mailbox statistics for alice@contoso.com"), `Statistics: ${email}`),
            mail(forMail("quota for alice@contoso.com"), `Quota: ${email}`),
          ]
        : [
            mail("inactive mailbox report", "Inactive mailboxes"),
            mail("mailbox size report", "Largest mailboxes"),
          ];
      break;

    case "exchange_list_mailboxes":
      actions = [
        mail("mailbox size report", "Largest mailboxes"),
        mail("inactive mailbox report", "Inactive mailboxes"),
        mail("quota pressure report", "Quota pressure"),
      ];
      break;

    case "exchange_discover_mailboxes":
      actions = [
        mail("mailbox size report", "Largest mailboxes"),
        mail("inactive mailbox report", "Inactive mailboxes"),
        mail("list databases", "List databases"),
      ];
      break;

    case "exchange_get_softdeleted_mailbox":
    case "exchange_get_mailbox_import_request":
    case "exchange_get_mailbox_restore_request":
    case "report.generate_move_request_report":
    case "mailbox.get_move_request_status":
      actions = [
        mail("full exchange summary", "Full summary"),
        mail("inactive mailbox report", "Inactive mailboxes"),
      ];
      break;

    case "mailbox.new_move_request":
      actions = [mail("move request status", "Move status")];
      break;

    case "exchange_create_mailbox":
    case "exchange_set_mailbox":
    case "exchange_remove_mailbox":
      actions = email
        ? [mail(`tell me everything about ${email}`, `Verify: ${email}`)]
        : [mail("how many mailboxes", "Count mailboxes")];
      break;

    case "exchange_list_distribution_groups":
    case "exchange_get_distribution_group_member":
    case "exchange_list_dynamic_distribution_groups":
    case "report.generate_group_hygiene_report":
      actions = [
        mail("group hygiene", "Group hygiene"),
        mail("list mail contacts", "Mail contacts"),
        mail("list mail users", "Mail users"),
      ];
      break;

    case "exchange_list_mail_contacts":
    case "exchange_list_mail_users":
      actions = [
        mail("list distribution groups", "Distribution groups"),
        mail("group hygiene", "Group hygiene"),
      ];
      break;

    case "group.new":
    case "group.add_member":
      actions = [mail("list distribution groups", "Distribution groups")];
      break;

    case "exchange_get_public_folder":
    case "exchange_list_messages":
    case "exchange_list_calendar_events":
    case "exchange_list_tasks":
    case "exchange_search_mailbox":
      actions = email
        ? [mail(`tell me everything about ${email}`, `Verify: ${email}`)]
        : [mail("full exchange summary", "Full summary")];
      break;

    // ---------- Health, servers, infrastructure ----------
    case "exchange_test_service_health":
    case "exchange_get_health_report":
    case "exchange_get_server_health":
    case "exchange_get_server_component_state":
    case "exchange_get_monitoring_item":
      actions = [
        mail("full health report", "Full health report"),
        mail("environment overview", "Environment overview"),
        mail("things i should know", "Things to know"),
      ];
      break;

    case "exchange_list_servers":
    case "exchange_get_server":
    case "server.get_services_status":
    case "report.server_role_report":
    case "report.exchange_topology":
      actions = [
        mail("is the server healthy", "Server health"),
        mail("environment overview", "Environment overview"),
        mail("server uptime", "Uptime"),
      ];
      break;

    case "server.get_uptime":
    case "server.get_disk_space":
    case "server.get_event_log_errors":
    case "server.get_performance_counters":
    case "server.run_healthchecker":
    case "diagnostics.test_exchange_search":
      actions = [
        mail("is the server healthy", "Server health"),
        mail("disk size", "Disk space"),
        mail("things i should know", "Things to know"),
      ];
      break;

    case "server.restart_service":
      actions = [mail("are exchange services running", "Services running")];
      break;

    case "report.exchange_environment_overview":
    case "report.exchange_infrastructure_summary":
    case "report.generate_full_summary":
      actions = [
        mail("things i should know", "Things to know"),
        mail("executive summary", "Executive summary"),
        mail("what version of exchange do i have", "Exchange version"),
      ];
      break;

    case "report.exchange_version_and_cu":
    case "report.exchange_build_compliance":
      actions = [
        mail("what version of exchange do i have", "Exchange version"),
        mail("environment overview", "Environment overview"),
      ];
      break;

    case "report.exchange_server_inventory":
    case "report.exchange_server_os":
    case "report.exchange_server_hardware":
    case "report.exchange_virtualization":
    case "report.exchange_server_uptime":
    case "report.exchange_service_status":
    case "report.exchange_dependency":
    case "report.ad_site_exchange_mapping":
    case "organization.get_config":
    case "report.exchange_organization_configuration":
      actions = [
        mail("environment overview", "Environment overview"),
        mail("list exchange servers", "List servers"),
      ];
      break;

    // ---------- Security, certs, compliance ----------
    case "exchange_get_exchange_certificate":
    case "certificate.get_expiring":
    case "report.generate_certificate_expiry_report":
      actions = [
        mail("config hardening risks", "Config risk"),
        mail("dependency check", "Dependencies"),
        mail("transport queue report", "Transport queue report"),
      ];
      break;

    case "certificate.enable_services":
      actions = [mail("certificates expiring soon", "Expiring certs")];
      break;

    case "ai.configuration_risk":
      actions = [
        mail("security risk report", "Security risk"),
        mail("certificates expiring soon", "Expiring certs"),
      ];
      break;

    case "ai.security_risk_report":
      actions = [
        mail("config hardening risks", "Config risk"),
        mail("permission risk report", "Permission risk"),
      ];
      break;

    case "ai.permission_risk_report":
      actions = [
        mail("which mailboxes have full access enabled", "FullAccess audit"),
        mail("forwarding report", "Forwarding report"),
      ];
      break;

    case "ai.compromised_account_detection":
      actions = [
        mail("permission risk report", "Permission risk"),
        mail("who is spamming", "Top senders"),
      ];
      break;

    case "report.generate_hold_report":
    case "report.generate_compliance_report":
    case "exchange_get_litigation_hold":
    case "exchange_get_inplace_hold":
    case "exchange_get_journal_rule":
    case "exchange_get_retention_policy_tag":
    case "exchange_get_role_groups":
    case "exchange_search_admin_audit_log":
      actions = [
        mail("hold report", "Hold report"),
        mail("compliance report", "Compliance snapshot"),
        mail("audit log", "Audit log"),
      ];
      break;

    // ---------- AI briefs, migration, aggregate reports ----------
    case "ai.daily_report":
    case "ai.things_you_should_know":
    case "ai.management_report":
    case "ai.exchange_executive_summary":
    case "ai.anomaly_detection":
      actions = [
        mail("things i should know", "Things to know"),
        mail("full exchange summary", "Full summary"),
        mail("executive summary", "Executive summary"),
      ];
      break;

    case "ai.cleanup_recommendation":
      actions = [
        mail("inactive mailbox report", "Inactive mailboxes"),
        mail("mailbox size report", "Largest mailboxes"),
      ];
      break;

    case "ai.migration_prioritization":
    case "ai.migration_eta":
    case "ai.migration_advisor":
      actions = [
        mail("migration readiness", "Readiness"),
        mail("migration ETA", "Migration ETA"),
        mail("migration batches in what order", "Batch order"),
      ];
      break;

    case "ai.incident_report":
      actions = [
        mail("things i should know", "Things to know"),
        mail("management report", "Management report"),
      ];
      break;

    case "report.generate_mailbox_size_report":
    case "report.generate_archive_report":
    case "report.generate_inactive_mailbox_report":
    case "report.generate_mobile_device_report":
    case "report.generate_oof_report":
      actions = [
        mail("mailbox size report", "Largest mailboxes"),
        mail("inactive mailbox report", "Inactive mailboxes"),
        mail("quota pressure report", "Quota pressure"),
      ];
      break;

    // ---------- Catalog / history / help: no noise ----------
    case "__mcp_tools_list":
    case "tools":
    case "history":
    case "help":
    default:
      actions = [];
  }

  return dedupe(actions, prompt);
}
