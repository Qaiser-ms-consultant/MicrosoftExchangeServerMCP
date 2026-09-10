import { describe, expect, it } from "vitest";
import { extractIdentity, hasWriteIntent, helpExamplesFor, helpHintFor, normalizePrompt, routeQuery } from "../src/desktop/queryRouter.js";

describe("extractIdentity", () => {
  it("pulls an email out of free text", () => {
    expect(extractIdentity("Tell me everything about admin@contoso.com")).toBe("admin@contoso.com");
  });
  it("returns null when no email present", () => {
    expect(extractIdentity("what version of exchange")).toBeNull();
  });
});

describe("routeQuery", () => {
  it("routes version prompts", () => {
    expect(routeQuery("what version of exchange i have")).toEqual({ tool: "report.exchange_version_and_cu", args: {}, write: false });
  });
  it("routes queue prompts", () => {
    expect(routeQuery("show delayed queues")).toEqual({ tool: "exchange_get_queue", args: {}, write: false });
  });
  it("routes health prompts to the fast service check", () => {
    expect(routeQuery("is the server healthy")).toEqual({ tool: "exchange_test_service_health", args: {}, write: false });
  });
  it("routes full health report prompts", () => {
    expect(routeQuery("full health report")).toEqual({ tool: "exchange_get_health_report", args: {}, write: false });
  });
  it("routes replication health prompts", () => {
    expect(routeQuery("test replication health")).toEqual({ tool: "exchange_test_replication_health", args: {}, write: false });
  });
  it("routes database list prompts", () => {
    expect(routeQuery("list databases")).toEqual({ tool: "database.list", args: {}, write: false });
  });
  it("routes whitespace prompts", () => {
    expect(routeQuery("database whitespace and growth")).toEqual({ tool: "database.get_whitespace_and_growth", args: {}, write: false });
  });
  it("routes backup prompts", () => {
    expect(routeQuery("last backup status")).toEqual({ tool: "database.get_backup_status", args: {}, write: false });
  });
  it("routes dag prompts", () => {
    expect(routeQuery("show dags")).toEqual({ tool: "dag.list", args: {}, write: false });
  });
  it("routes certificate prompts", () => {
    expect(routeQuery("certificates expiring soon")).toEqual({ tool: "exchange_get_exchange_certificate", args: {}, write: false });
  });
  it("routes disk space prompts", () => {
    expect(routeQuery("disk space on server")).toEqual({ tool: "server.get_disk_space", args: {}, write: false });
  });
  it("routes short disk size prompts", () => {
    expect(routeQuery("disk size")).toEqual({ tool: "server.get_disk_space", args: {}, write: false });
  });
  it("routes disk usage prompts to disk space", () => {
    expect(routeQuery("disk usage")).toEqual({ tool: "server.get_disk_space", args: {}, write: false });
  });
  it("routes database count prompts", () => {
    expect(routeQuery("number of mailbox databases")).toEqual({ tool: "database.list", args: {}, write: false });
  });
  it("routes bare databases questions", () => {
    expect(routeQuery("mailbox databases?")).toEqual({ tool: "database.list", args: {}, write: false });
  });
  it("still routes dismount as write, not list", () => {
    expect(routeQuery("dismount database DB01")).toEqual({ tool: "database.dismount", args: { identity: "DB01" }, write: true });
  });
  it("routes capacity forecast prompts", () => {
    expect(routeQuery("capacity forecast")).toEqual({ tool: "database.get_whitespace_and_growth", args: {}, write: false });
  });
  it("routes how-many prompts to an exact count, not a capped list", () => {
    expect(routeQuery("how many mailboxes")).toEqual({ tool: "exchange_list_mailboxes", args: { countOnly: true }, write: false });
  });
  it("routes number-of prompts to an exact count", () => {
    expect(routeQuery("number of mailboxes")).toEqual({ tool: "exchange_list_mailboxes", args: { countOnly: true }, write: false });
  });
  it("routes bare count prompts to an exact count", () => {
    expect(routeQuery("mailbox count")).toEqual({ tool: "exchange_list_mailboxes", args: { countOnly: true }, write: false });
  });
  it("routes bare list-all prompts to granular discovery, not a giant fetch", () => {
    expect(routeQuery("list mailboxes")).toEqual({ tool: "exchange_discover_mailboxes", args: { pageSize: 100 }, write: false });
  });
  it("routes show-all prompts to granular discovery", () => {
    expect(routeQuery("show all mailboxes")).toEqual({ tool: "exchange_discover_mailboxes", args: { pageSize: 100 }, write: false });
  });
  it("parses an explicit mailbox count from the prompt as a page size", () => {
    expect(routeQuery("show 50 mailboxes")).toEqual({ tool: "exchange_list_mailboxes", args: { pageSize: 50 }, write: false });
  });
  it("clamps explicit mailbox counts to the page maximum", () => {
    expect(routeQuery("list 2000 mailboxes")).toEqual({ tool: "exchange_list_mailboxes", args: { pageSize: 200 }, write: false });
  });
  it("routes inbox prompts to message listing", () => {
    expect(routeQuery("show recent inbox mail")).toEqual({ tool: "exchange_list_messages", args: {}, write: false });
  });
  it("routes calendar prompts to event listing", () => {
    expect(routeQuery("list calendar events")).toEqual({ tool: "exchange_list_calendar_events", args: {}, write: false });
  });
  it("routes task list prompts", () => {
    expect(routeQuery("list tasks")).toEqual({ tool: "exchange_list_tasks", args: {}, write: false });
  });
  it("routes autodiscover prompts with the extracted domain", () => {
    expect(routeQuery("autodiscover for contoso.com")).toEqual({ tool: "clientaccess.get_autodiscover_info", args: { domain: "contoso.com" }, write: false });
  });
  it("routes soft-deleted mailbox prompts", () => {
    expect(routeQuery("soft-deleted mailboxes")).toEqual({ tool: "exchange_get_softdeleted_mailbox", args: {}, write: false });
  });
  it("routes folder statistics prompts", () => {
    expect(routeQuery("folder statistics for alice@contoso.com")).toEqual({ tool: "mailbox.get_folder_statistics", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes uptime prompts", () => {
    expect(routeQuery("server uptime")).toEqual({ tool: "server.get_uptime", args: {}, write: false });
  });
  it("routes service status prompts", () => {
    expect(routeQuery("are exchange services running")).toEqual({ tool: "exchange_test_service_health", args: {}, write: false });
  });
  it("routes connector prompts", () => {
    expect(routeQuery("list send connectors")).toEqual({ tool: "exchange_list_send_connectors", args: {}, write: false });
  });
  it("routes transport rule prompts", () => {
    expect(routeQuery("show transport rules")).toEqual({ tool: "exchange_get_transport_rules", args: {}, write: false });
  });
  it("routes server list prompts", () => {
    expect(routeQuery("list exchange servers")).toEqual({ tool: "exchange_list_servers", args: {}, write: false });
  });
  it("routes topology prompts", () => {
    expect(routeQuery("show topology")).toEqual({ tool: "report.exchange_topology", args: {}, write: false });
  });
  it("routes overview prompts", () => {
    expect(routeQuery("environment overview")).toEqual({ tool: "report.exchange_environment_overview", args: {}, write: false });
  });
  it("routes NDR code prompts", () => {
    expect(routeQuery("explain bounce 5.7.1")).toEqual({ tool: "mailflow.get_ndr_details", args: { code: "5.7.1" }, write: false });
  });
  it("routes NDR keyword prompts without code", () => {
    expect(routeQuery("what does this ndr mean")).toEqual({ tool: "mailflow.get_ndr_details", args: {}, write: false });
  });
  it("routes trace prompts with sender", () => {
    const r = routeQuery("trace messages from bob@contoso.com");
    expect(r).toEqual({ tool: "mailflow.get_message_trace", args: { sender: "bob@contoso.com" }, write: false });
  });
  it("routes permission prompts", () => {
    const r = routeQuery("permissions of alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_mailbox_permissions", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes org-wide full access prompts to the audit report", () => {
    expect(routeQuery("which mailboxes have full access enabled")).toEqual({ tool: "report.generate_fullaccess_audit_report", args: {}, write: false });
  });
  it("keeps per-mailbox full access prompts on the individual report", () => {
    const r = routeQuery("full access for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_mailbox_permissions", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes statistics prompts", () => {
    const r = routeQuery("mailbox statistics for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_mailbox_statistics", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("falls back to tell_me_everything on bare email", () => {
    const r = routeQuery("alice@contoso.com");
    expect(r).toEqual({ tool: "ai.tell_me_everything", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes dismount as a write needing confirm", () => {
    const r = routeQuery("dismount database DB01");
    expect(r).toEqual({ tool: "database.dismount", args: { identity: "DB01" }, write: true });
  });
  it("routes queue retry as a write needing confirm", () => {
    const r = routeQuery("retry queue EXCH01\\Submission");
    expect(r).toEqual({ tool: "exchange_retry_queue", args: { identity: "EXCH01\\Submission" }, write: true });
  });
  it("returns help when nothing matches", () => {
    expect(routeQuery("hello there")).toEqual({ help: true });
  });

  // AI insight reports
  it("routes daily report prompts", () => {
    expect(routeQuery("daily exchange report")).toEqual({ tool: "ai.daily_report", args: {}, write: false });
  });
  it("routes things you should know prompts", () => {
    expect(routeQuery("things i should know")).toEqual({ tool: "ai.things_you_should_know", args: {}, write: false });
  });
  it("routes management report prompts", () => {
    expect(routeQuery("management report")).toEqual({ tool: "ai.management_report", args: {}, write: false });
  });
  it("routes anomaly detection prompts", () => {
    expect(routeQuery("anomaly detection")).toEqual({ tool: "ai.anomaly_detection", args: {}, write: false });
  });
  it("routes executive summary prompts to the AI health summary", () => {
    expect(routeQuery("executive summary")).toEqual({ tool: "ai.exchange_executive_summary", args: {}, write: false });
  });
  it("routes capacity exhaustion prompts to the AI forecast, not the whitespace report", () => {
    expect(routeQuery("predict database capacity exhaustion")).toEqual({ tool: "ai.capacity_forecast", args: {}, write: false });
  });
  it("keeps the capacity forecast phrase on the whitespace report", () => {
    expect(routeQuery("capacity forecast")).toEqual({ tool: "database.get_whitespace_and_growth", args: {}, write: false });
  });
  it("routes per-mailbox cleanup advisor prompts", () => {
    expect(routeQuery("cleanup advisor for alice@contoso.com")).toEqual({ tool: "ai.mailbox_cleanup_advisor", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes NDR bounce statistics prompts to NDR intelligence", () => {
    expect(routeQuery("NDR bounce statistics")).toEqual({ tool: "ai.ndr_intelligence", args: {}, write: false });
  });
  it("routes litigation hold report prompts", () => {
    expect(routeQuery("litigation hold report")).toEqual({ tool: "report.generate_hold_report", args: {}, write: false });
  });
  it("routes organization config prompts", () => {
    expect(routeQuery("organization config")).toEqual({ tool: "organization.get_config", args: {}, write: false });
  });
  it("routes what-if failover prompts with the full prompt as change context", () => {
    expect(routeQuery("what if DB01 fails over?")).toEqual({ tool: "ai.change_impact_report", args: { change: "what if DB01 fails over?" }, write: false });
  });
  it("routes capability questions to the live tool catalog", () => {
    expect(routeQuery("what tools do you offer")).toEqual({ tool: "__mcp_tools_list", args: {}, write: false });
  });
  it("routes list-tools phrasing to the live tool catalog", () => {
    expect(routeQuery("list your tools")).toEqual({ tool: "__mcp_tools_list", args: {}, write: false });
  });
  it("routes what-can-you-do phrasing to the live tool catalog", () => {
    expect(routeQuery("what can you do")).toEqual({ tool: "__mcp_tools_list", args: {}, write: false });
  });
  it("keeps concrete intents away from the capability route", () => {
    expect(routeQuery("transport queue report")).toEqual({ tool: "report.generate_transport_queue_report", args: {}, write: false });
  });
  it("keeps mailbox detail prompts away from the capability route", () => {
    expect(routeQuery("mailbox detail for alice@contoso.com")).toEqual({ tool: "report.mailbox_detail", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes first-mailbox sampling prompts to a small live fetch", () => {
    expect(routeQuery("first mailbox")).toEqual({ tool: "exchange_list_mailboxes", args: { resultSize: 5 }, write: false });
  });
  it("routes cleanup recommendation prompts", () => {
    expect(routeQuery("cleanup recommendations")).toEqual({ tool: "ai.cleanup_recommendation", args: {}, write: false });
  });
  it("routes migration prioritization prompts", () => {
    expect(routeQuery("migration batches in what order")).toEqual({ tool: "ai.migration_prioritization", args: {}, write: false });
  });
  it("routes migration ETA prompts", () => {
    expect(routeQuery("migration ETA")).toEqual({ tool: "ai.migration_eta", args: {}, write: false });
  });
  it("routes migration readiness prompts", () => {
    expect(routeQuery("migration readiness")).toEqual({ tool: "ai.migration_advisor", args: {}, write: false });
  });
  it("routes what-if analysis prompts", () => {
    const r = routeQuery("what if i move 500 mailboxes from DB01 to DB05?");
    expect(r).toEqual({ tool: "ai.change_impact_report", args: { change: "what if i move 500 mailboxes from DB01 to DB05?" }, write: false });
  });
  it("routes incident report prompts", () => {
    const r = routeQuery("outage last night");
    expect(r).toEqual({ tool: "ai.incident_report", args: { incident: "outage last night" }, write: false });
  });
  it("routes permission risk report prompts", () => {
    expect(routeQuery("permission risk report")).toEqual({ tool: "ai.permission_risk_report", args: {}, write: false });
  });
  it("routes security risk report prompts", () => {
    expect(routeQuery("security risk report")).toEqual({ tool: "ai.security_risk_report", args: {}, write: false });
  });
  it("routes compromised account detection prompts", () => {
    expect(routeQuery("compromised accounts")).toEqual({ tool: "ai.compromised_account_detection", args: {}, write: false });
  });
  it("routes mail flow intelligence prompts", () => {
    expect(routeQuery("who is spamming")).toEqual({ tool: "ai.mail_flow_intelligence", args: {}, write: false });
  });
  it("routes bounce rate stats prompts", () => {
    expect(routeQuery("bounce rate stats")).toEqual({ tool: "ai.mail_flow_intelligence", args: {}, write: false });
  });
  it("routes config risk prompts", () => {
    expect(routeQuery("config hardening risks")).toEqual({ tool: "ai.configuration_risk", args: {}, write: false });
  });
  it("routes root cause analysis prompts", () => {
    expect(routeQuery("root cause of delayed mail")).toEqual({ tool: "ai.root_cause_analysis", args: {}, write: false });
  });
  it("routes mailbox size report prompts", () => {
    expect(routeQuery("mailbox size report")).toEqual({ tool: "report.generate_mailbox_size_report", args: {}, write: false });
  });
  it("routes growth trend prompts", () => {
    expect(routeQuery("growth trend")).toEqual({ tool: "report.generate_database_growth_trend", args: {}, write: false });
  });
  it("routes transport queue report prompts", () => {
    expect(routeQuery("transport queue report")).toEqual({ tool: "report.generate_transport_queue_report", args: {}, write: false });
  });
  it("routes archive report prompts", () => {
    expect(routeQuery("archive report")).toEqual({ tool: "report.generate_archive_report", args: {}, write: false });
  });
  it("routes inactive mailbox report prompts", () => {
    expect(routeQuery("inactive mailbox report")).toEqual({ tool: "report.generate_inactive_mailbox_report", args: {}, write: false });
  });
  it("routes mobile device report prompts", () => {
    expect(routeQuery("mobile device report")).toEqual({ tool: "report.generate_mobile_device_report", args: {}, write: false });
  });
  it("routes oof report prompts", () => {
    expect(routeQuery("oof report")).toEqual({ tool: "report.generate_oof_report", args: {}, write: false });
  });
  it("routes dag report prompts", () => {
    expect(routeQuery("dag report")).toEqual({ tool: "report.generate_dag_report", args: {}, write: false });
  });
  it("routes hold report prompts", () => {
    expect(routeQuery("hold report")).toEqual({ tool: "report.generate_hold_report", args: {}, write: false });
  });
  it("routes full summary prompts", () => {
    expect(routeQuery("full exchange summary")).toEqual({ tool: "report.generate_full_summary", args: {}, write: false });
  });
  it("routes build compliance prompts", () => {
    expect(routeQuery("build compliance")).toEqual({ tool: "report.exchange_build_compliance", args: {}, write: false });
  });
  it("routes server role report prompts", () => {
    expect(routeQuery("server role report")).toEqual({ tool: "report.server_role_report", args: {}, write: false });
  });
  it("routes ad site mapping prompts", () => {
    expect(routeQuery("ad site mapping")).toEqual({ tool: "report.ad_site_exchange_mapping", args: {}, write: false });
  });
  it("routes dependency check prompts", () => {
    expect(routeQuery("dependency check")).toEqual({ tool: "report.exchange_dependency", args: {}, write: false });
  });
  it("routes infrastructure summary prompts", () => {
    expect(routeQuery("infrastructure summary")).toEqual({ tool: "report.exchange_infrastructure_summary", args: {}, write: false });
  });
  it("routes organization config prompts", () => {
    expect(routeQuery("organization config")).toEqual({ tool: "organization.get_config", args: {}, write: false });
  });
  it("routes mail contacts prompts", () => {
    expect(routeQuery("list mail contacts")).toEqual({ tool: "exchange_list_mail_contacts", args: {}, write: false });
  });
  it("routes mail users prompts", () => {
    expect(routeQuery("list mail users")).toEqual({ tool: "exchange_list_mail_users", args: {}, write: false });
  });
  it("routes dynamic distribution groups prompts", () => {
    expect(routeQuery("dynamic distribution groups")).toEqual({ tool: "exchange_list_dynamic_distribution_groups", args: {}, write: false });
  });
  it("routes distribution group prompts with a full fetch for the pager", () => {
    expect(routeQuery("list distribution groups")).toEqual({ tool: "exchange_list_distribution_groups", args: { resultSize: 1000 }, write: false });
  });
  it("routes distribution group count prompts to an exact count", () => {
    expect(routeQuery("how many distribution groups")).toEqual({ tool: "exchange_list_distribution_groups", args: { countOnly: true }, write: false });
  });
  it("parses an explicit distribution group count from the prompt", () => {
    expect(routeQuery("show 30 distribution groups")).toEqual({ tool: "exchange_list_distribution_groups", args: { resultSize: 30 }, write: false });
  });
  it("routes role group prompts", () => {
    expect(routeQuery("role groups")).toEqual({ tool: "exchange_get_role_groups", args: {}, write: false });
  });
  it("routes journal rule prompts", () => {
    expect(routeQuery("journal rules")).toEqual({ tool: "exchange_get_journal_rule", args: {}, write: false });
  });
  it("routes retention tag prompts", () => {
    expect(routeQuery("retention tags")).toEqual({ tool: "exchange_get_retention_policy_tag", args: {}, write: false });
  });
  it("routes litigation hold prompts", () => {
    const r = routeQuery("litigation hold for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_litigation_hold", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes in-place hold prompts", () => {
    const r = routeQuery("in-place hold for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_inplace_hold", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes OOF status prompts", () => {
    const r = routeQuery("OOF status for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_oof", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes inbox rule prompts", () => {
    const r = routeQuery("inbox rules for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_inbox_rules", args: { mailbox: "alice@contoso.com" }, write: false });
  });
  it("routes mailbox audit prompts", () => {
    const r = routeQuery("mailbox audit for alice@contoso.com");
    expect(r).toEqual({ tool: "security.get_mailbox_audit_log", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes admin audit log prompts", () => {
    expect(routeQuery("audit log")).toEqual({ tool: "exchange_search_admin_audit_log", args: {}, write: false });
  });
  it("routes archive status prompts", () => {
    const r = routeQuery("archive status for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_archive_status", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes quota prompts", () => {
    const r = routeQuery("quota for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_mailbox_quota", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes mobile device prompts", () => {
    const r = routeQuery("mobile devices for alice@contoso.com");
    expect(r).toEqual({ tool: "exchange_get_mobile_device", args: { mailbox: "alice@contoso.com" }, write: false });
  });
  it("routes public folder prompts", () => {
    expect(routeQuery("public folders")).toEqual({ tool: "exchange_get_public_folder", args: {}, write: false });
  });
  it("routes folder statistics prompts", () => {
    const r = routeQuery("folder statistics for alice@contoso.com");
    expect(r).toEqual({ tool: "mailbox.get_folder_statistics", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes move request status prompts", () => {
    expect(routeQuery("move request status")).toEqual({ tool: "mailbox.get_move_request_status", args: {}, write: false });
  });
  it("routes import request prompts", () => {
    expect(routeQuery("import request status")).toEqual({ tool: "exchange_get_mailbox_import_request", args: {}, write: false });
  });
  it("routes restore request prompts", () => {
    expect(routeQuery("restore request status")).toEqual({ tool: "exchange_get_mailbox_restore_request", args: {}, write: false });
  });
  it("routes soft-deleted mailbox prompts", () => {
    expect(routeQuery("soft-deleted mailboxes")).toEqual({ tool: "exchange_get_softdeleted_mailbox", args: {}, write: false });
  });
  it("routes mailbox detail prompts", () => {
    const r = routeQuery("mailbox detail for alice@contoso.com");
    expect(r).toEqual({ tool: "report.mailbox_detail", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes full-configuration phrasing with an email to mailbox detail", () => {
    expect(routeQuery("full configuration details of alice@contoso.com mailbox")).toEqual({ tool: "report.mailbox_detail", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes full-configuration phrasing with a bare name to a single-call report", () => {
    expect(routeQuery("show me full configuration details of administrator mailbox")).toEqual({ tool: "report.mailbox_full_config", args: { identity: "administrator" }, write: false });
    expect(routeQuery("complete details of the helpdesk mailbox")).toEqual({ tool: "report.mailbox_full_config", args: { identity: "helpdesk" }, write: false });
  });
  it("routes full-config phrasing without the mailbox word to the single-call report", () => {
    expect(routeQuery("full config for devlabadmin")).toEqual({ tool: "report.mailbox_full_config", args: { identity: "devlabadmin" }, write: false });
    expect(routeQuery("show full configuration")).toEqual({ help: true });
  });
  it("routes plain 'get details' mailbox prompts instead of help", () => {
    expect(routeQuery("get details of devlabadmin mailbox")).toEqual({ tool: "report.mailbox_full_config", args: { identity: "devlabadmin" }, write: false });
    expect(routeQuery("get details of alice@contoso.com mailbox")).toEqual({ tool: "report.mailbox_detail", args: { identity: "alice@contoso.com" }, write: false });
    expect(routeQuery("get details of devlabadmin")).toEqual({ tool: "report.mailbox_full_config", args: { identity: "devlabadmin" }, write: false });
  });
  it("routes mailbox health prompts", () => {
    const r = routeQuery("mailbox health for alice@contoso.com");
    expect(r).toEqual({ tool: "report.mailbox_health_individual", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes mailbox compliance prompts", () => {
    const r = routeQuery("mailbox compliance for alice@contoso.com");
    expect(r).toEqual({ tool: "report.mailbox_compliance_individual", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes forwarding prompts", () => {
    const r = routeQuery("forwarding for alice@contoso.com");
    expect(r).toEqual({ tool: "report.mailbox_forwarding_individual", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes org-wide forwarding prompts to the forwarding report", () => {
    expect(routeQuery("which mailboxes have forwarding enabled")).toEqual({ tool: "report.generate_forwarding_report", args: {}, write: false });
  });
  it("routes quota pressure prompts to the quota report", () => {
    expect(routeQuery("mailboxes approaching quota")).toEqual({ tool: "report.generate_quota_pressure_report", args: {}, write: false });
  });
  it("routes protocol sprawl prompts to the protocol report", () => {
    expect(routeQuery("which mailboxes have pop enabled")).toEqual({ tool: "report.generate_protocol_report", args: {}, write: false });
  });
  it("routes connector inventory prompts to the connector report", () => {
    expect(routeQuery("connector inventory")).toEqual({ tool: "report.generate_connector_report", args: {}, write: false });
  });
  it("routes transport rule inventory prompts to the rule report", () => {
    expect(routeQuery("transport rule inventory")).toEqual({ tool: "report.generate_transport_rule_report", args: {}, write: false });
  });
  it("routes empty group prompts to the hygiene report", () => {
    expect(routeQuery("empty distribution groups")).toEqual({ tool: "report.generate_group_hygiene_report", args: {}, write: false });
  });
  it("routes move request board prompts to the move report", () => {
    expect(routeQuery("list all move requests")).toEqual({ tool: "report.generate_move_request_report", args: {}, write: false });
  });
  it("routes per-database distribution prompts to the distribution report", () => {
    expect(routeQuery("mailboxes per database")).toEqual({ tool: "report.generate_database_distribution_report", args: {}, write: false });
  });
  it("routes domain inventory prompts to the domain report", () => {
    expect(routeQuery("domain inventory")).toEqual({ tool: "report.generate_domain_report", args: {}, write: false });
  });
  it("routes client access prompts", () => {
    const r = routeQuery("client access for alice@contoso.com");
    expect(r).toEqual({ tool: "report.mailbox_client_access_individual", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes mailbox size prompts", () => {
    const r = routeQuery("mailbox size for alice@contoso.com");
    expect(r).toEqual({ tool: "report.mailbox_size_individual", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes mailbox activity prompts", () => {
    const r = routeQuery("mailbox activity for alice@contoso.com");
    expect(r).toEqual({ tool: "report.mailbox_activity_individual", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes flow profile prompts", () => {
    const r = routeQuery("flow profile for alice@contoso.com");
    expect(r).toEqual({ tool: "report.mailflow_profile", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes cleanup advisor prompts", () => {
    const r = routeQuery("cleanup advisor for alice@contoso.com");
    expect(r).toEqual({ tool: "ai.mailbox_cleanup_advisor", args: { identity: "alice@contoso.com" }, write: false });
  });
  it("routes accepted domains prompts", () => {
    expect(routeQuery("accepted domains")).toEqual({ tool: "exchange_list_accepted_domains", args: {}, write: false });
  });
  it("routes virtual directory prompts", () => {
    expect(routeQuery("virtual directories")).toEqual({ tool: "exchange_get_virtual_directory", args: {}, write: false });
  });
  it("routes autodiscover prompts", () => {
    const r = routeQuery("autodiscover for contoso.com");
    expect(r).toEqual({ tool: "clientaccess.get_autodiscover_info", args: { domain: "contoso.com" }, write: false });
  });
  it("routes test OWA prompts", () => {
    expect(routeQuery("test OWA")).toEqual({ tool: "clientaccess.test_owa", args: {}, write: false });
  });
  it("routes transport config prompts", () => {
    expect(routeQuery("transport config")).toEqual({ tool: "exchange_get_transport_config", args: {}, write: false });
  });
  it("routes copy status prompts", () => {
    expect(routeQuery("copy status")).toEqual({ tool: "exchange_get_database_copy_status", args: {}, write: false });
  });
  it("routes witness status prompts", () => {
    expect(routeQuery("witness status")).toEqual({ tool: "dag.get_witness_status", args: {}, write: false });
  });
  it("routes smtp test prompts", () => {
    const r = routeQuery("smtp test for contoso.com");
    expect(r).toEqual({ tool: "mailflow.test_smtp_connectivity", args: { host: "contoso.com" }, write: false });
  });
  it("routes search mailbox prompts", () => {
    const r = routeQuery('search mailbox for alice@contoso.com with "quarantine"');
    expect(r).toEqual({ tool: "exchange_search_mailbox", args: { identity: "alice@contoso.com", searchQuery: "quarantine" }, write: false });
  });
  it("routes event log prompts", () => {
    expect(routeQuery("event log errors")).toEqual({ tool: "server.get_event_log_errors", args: {}, write: false });
  });
  it("routes performance counter prompts", () => {
    expect(routeQuery("performance counters")).toEqual({ tool: "server.get_performance_counters", args: {}, write: false });
  });
  it("routes connectivity test prompts", () => {
    expect(routeQuery("test exchange connect")).toEqual({ tool: "exchange_test_connection", args: {}, write: false });
  });
  it("routes inbox messages prompts", () => {
    expect(routeQuery("show inbox")).toEqual({ tool: "exchange_list_messages", args: {}, write: false });
  });
  it("routes calendar events prompts", () => {
    expect(routeQuery("calendar events")).toEqual({ tool: "exchange_list_calendar_events", args: {}, write: false });
  });
  it("routes tasks prompts", () => {
    expect(routeQuery("my tasks")).toEqual({ tool: "exchange_list_tasks", args: {}, write: false });
  });
  it("routes content index health prompts", () => {
    expect(routeQuery("content index health")).toEqual({ tool: "diagnostics.test_exchange_search", args: {}, write: false });
  });
  it("routes endpoint connectivity check prompts", () => {
    expect(routeQuery("test exchange connect")).toEqual({ tool: "exchange_test_connection", args: {}, write: false });
  });
  it("routes SMTP test prompts", () => {
    const r = routeQuery("smtp test for contoso.com");
    expect(r).toEqual({ tool: "mailflow.test_smtp_connectivity", args: { host: "contoso.com" }, write: false });
  });
  it("routes autodiscover prompts", () => {
    const r = routeQuery("autodiscover for contoso.com");
    expect(r).toEqual({ tool: "clientaccess.get_autodiscover_info", args: { domain: "contoso.com" }, write: false });
  });
  it("routes copy status prompts", () => {
    expect(routeQuery("copy status")).toEqual({ tool: "exchange_get_database_copy_status", args: {}, write: false });
  });
  it("routes witness status prompts", () => {
    expect(routeQuery("witness status")).toEqual({ tool: "dag.get_witness_status", args: {}, write: false });
  });
  it("routes event log prompts", () => {
    expect(routeQuery("event log errors")).toEqual({ tool: "server.get_event_log_errors", args: {}, write: false });
  });
  it("routes performance counter prompts", () => {
    expect(routeQuery("performance counters")).toEqual({ tool: "server.get_performance_counters", args: {}, write: false });
  });
  it("routes connectivity test prompts", () => {
    expect(routeQuery("test exchange connect")).toEqual({ tool: "exchange_test_connection", args: {}, write: false });
  });
  it("routes inbox messages prompts", () => {
    expect(routeQuery("show inbox")).toEqual({ tool: "exchange_list_messages", args: {}, write: false });
  });
  it("routes calendar events prompts", () => {
    expect(routeQuery("calendar events")).toEqual({ tool: "exchange_list_calendar_events", args: {}, write: false });
  });
  it("routes tasks prompts", () => {
    expect(routeQuery("my tasks")).toEqual({ tool: "exchange_list_tasks", args: {}, write: false });
  });
  it("routes content index health prompts", () => {
    expect(routeQuery("content index health")).toEqual({ tool: "diagnostics.test_exchange_search", args: {}, write: false });
  });
  it("routes endpoint connectivity check prompts", () => {
    expect(routeQuery("test exchange connect")).toEqual({ tool: "exchange_test_connection", args: {}, write: false });
  });
  it("routes SMTP test prompts", () => {
    const r = routeQuery("smtp test for contoso.com");
    expect(r).toEqual({ tool: "mailflow.test_smtp_connectivity", args: { host: "contoso.com" }, write: false });
  });
  it("routes autodiscover prompts", () => {
    const r = routeQuery("autodiscover for contoso.com");
    expect(r).toEqual({ tool: "clientaccess.get_autodiscover_info", args: { domain: "contoso.com" }, write: false });
  });
  it("routes copy status prompts", () => {
    expect(routeQuery("copy status")).toEqual({ tool: "exchange_get_database_copy_status", args: {}, write: false });
  });
  it("routes witness status prompts", () => {
    expect(routeQuery("witness status")).toEqual({ tool: "dag.get_witness_status", args: {}, write: false });
  });
  it("routes search mailbox prompts", () => {
    const r = routeQuery('search mailbox for alice@contoso.com with "quarantine"');
    expect(r).toEqual({ tool: "exchange_search_mailbox", args: { identity: "alice@contoso.com", searchQuery: "quarantine" }, write: false });
  });
  it("routes autodiscover prompts", () => {
    const r = routeQuery("autodiscover for contoso.com");
    expect(r).toEqual({ tool: "clientaccess.get_autodiscover_info", args: { domain: "contoso.com" }, write: false });
  });
  it("routes SMTP test prompts", () => {
    const r = routeQuery("smtp test for contoso.com");
    expect(r).toEqual({ tool: "mailflow.test_smtp_connectivity", args: { host: "contoso.com" }, write: false });
  });
  it("routes search mailbox prompts with quoted query", () => {
    const r = routeQuery('search mailbox for alice@contoso.com with "quarantine"');
    expect(r).toEqual({ tool: "exchange_search_mailbox", args: { identity: "alice@contoso.com", searchQuery: "quarantine" }, write: false });
  });
  it("routes autodiscover prompts", () => {
    const r = routeQuery("autodiscover for contoso.com");
    expect(r).toEqual({ tool: "clientaccess.get_autodiscover_info", args: { domain: "contoso.com" }, write: false });
  });
  it("routes SMTP test prompts", () => {
    const r = routeQuery("smtp test for contoso.com");
    expect(r).toEqual({ tool: "mailflow.test_smtp_connectivity", args: { host: "contoso.com" }, write: false });
  });
  it("routes search mailbox prompts with quoted query", () => {
    const r = routeQuery('search mailbox for alice@contoso.com with "quarantine"');
    expect(r).toEqual({ tool: "exchange_search_mailbox", args: { identity: "alice@contoso.com", searchQuery: "quarantine" }, write: false });
  });
  // Write intents
  it("routes suspend copy as write", () => {
    const r = routeQuery("suspend copy DB01");
    expect(r).toEqual({ tool: "database.suspend_copy", args: { identity: "DB01" }, write: true });
  });
  it("routes resume copy as write", () => {
    const r = routeQuery("resume copy DB01");
    expect(r).toEqual({ tool: "database.resume_copy", args: { identity: "DB01" }, write: true });
  });
  it("routes move active database as write", () => {
    expect(routeQuery("move active database")).toEqual({ tool: "database.move_active", args: {}, write: true });
  });
  it("routes add copy as write", () => {
    expect(routeQuery("add copy DB01")).toEqual({ tool: "database.add_copy", args: {}, write: true });
  });
  it("routes remove copy as write", () => {
    expect(routeQuery("remove copy DB01")).toEqual({ tool: "database.remove_copy", args: {}, write: true });
  });
  it("routes set activation policy as write", () => {
    expect(routeQuery("set activation policy")).toEqual({ tool: "dag.set_activation_policy", args: {}, write: true });
  });
  it("routes delete mailbox as a write, not a read report", () => {
    expect(routeQuery("delete mailbox alice@contoso.com")).toEqual({ tool: "exchange_remove_mailbox", args: { identity: "alice@contoso.com" }, write: true });
  });
  it("routes disable mailbox as a soft remove write", () => {
    expect(routeQuery("disable mailbox alice@contoso.com")).toEqual({ tool: "exchange_remove_mailbox", args: { identity: "alice@contoso.com" }, write: true });
  });
  it("routes permanent delete with the permanent flag", () => {
    expect(routeQuery("permanently delete mailbox alice@contoso.com")).toEqual({ tool: "exchange_remove_mailbox", args: { identity: "alice@contoso.com", permanent: true }, write: true });
  });
  it("routes remove permission as a write with identity and user", () => {
    expect(routeQuery("remove FullAccess for alice@contoso.com from bob@contoso.com")).toEqual({ tool: "mailbox.remove_permission", args: { identity: "alice@contoso.com", user: "bob@contoso.com", accessRights: "FullAccess" }, write: true });
  });
  it("routes create mailbox as a write needing a name", () => {
    expect(routeQuery("create mailbox")).toEqual({ tool: "exchange_create_mailbox", args: {}, write: true });
  });
  it("routes set mailbox as a write", () => {
    expect(routeQuery("set mailbox alice@contoso.com")).toEqual({ tool: "exchange_set_mailbox", args: { identity: "alice@contoso.com" }, write: true });
  });
  it("extracts the target database on move mailbox", () => {
    expect(routeQuery("move mailbox alice@contoso.com to DB05")).toEqual({ tool: "mailbox.new_move_request", args: { identity: "alice@contoso.com", targetDatabase: "DB05" }, write: true });
  });
  it("routes delete transport rule as a write, not a list", () => {
    expect(routeQuery('delete transport rule "Block Executables"')).toEqual({ tool: "exchange_remove_transport_rule", args: { identity: "Block Executables" }, write: true });
  });
  it("routes disable transport rule as a state-change write", () => {
    expect(routeQuery("disable transport rule Block Executables")).toEqual({ tool: "exchange_set_transport_rule", args: { identity: "Block Executables", state: "Disabled" }, write: true });
  });
  it("routes add group member as a write", () => {
    expect(routeQuery('add alice@contoso.com to group "Sales Team"')).toEqual({ tool: "group.add_member", args: { identity: "Sales Team", member: "alice@contoso.com" }, write: true });
  });
  it("routes new distribution group as a write", () => {
    expect(routeQuery('create distribution group "Sales"')).toEqual({ tool: "group.new", args: { name: "Sales" }, write: true });
  });
  it("routes resume queue as a write", () => {
    expect(routeQuery("resume queue EXCH01\\Submission")).toEqual({ tool: "mailflow.resume_queue", args: { identity: "EXCH01\\Submission" }, write: true });
  });
  it("routes set send connector as a write", () => {
    expect(routeQuery("set send connector Outbound")).toEqual({ tool: "mailflow.set_send_connector", args: { identity: "Outbound" }, write: true });
  });
  it("routes bare update rule phrasing to the transport rule setter", () => {
    expect(routeQuery('update "Block Executables" rule')).toEqual({ tool: "exchange_set_transport_rule", args: { identity: "Block Executables" }, write: true });
  });
  it("strips a trailing rule word from bare update phrasing", () => {
    expect(routeQuery("update Block Executables rule")).toEqual({ tool: "exchange_set_transport_rule", args: { identity: "Block Executables" }, write: true });
  });
  it("routes bare delete rule phrasing to the transport rule remover", () => {
    expect(routeQuery('delete "Old Rule" rule')).toEqual({ tool: "exchange_remove_transport_rule", args: { identity: "Old Rule" }, write: true });
  });
  it("routes bare disable rule phrasing to a state change", () => {
    expect(routeQuery("disable Block Executables rule")).toEqual({ tool: "exchange_set_transport_rule", args: { identity: "Block Executables", state: "Disabled" }, write: true });
  });
  it("suggests rule examples for rule-flavored misses", () => {
    const ex = helpExamplesFor("frobnicate the rule thing");
    expect(ex).toContain("list transport rules");
    expect(ex.some((e) => e.includes("delete transport rule"))).toBe(true);
  });
  it("suggests mailbox examples for mailbox-flavored misses", () => {
    const ex = helpExamplesFor("alice@contoso.com frobnicate");
    expect(ex.some((e) => e.includes("tell me everything"))).toBe(true);
  });
  it("falls back to generic examples with no signal", () => {
    const ex = helpExamplesFor("hello there");
    expect(ex).toContain("what version of exchange do i have");
    expect(ex.length).toBeGreaterThan(0);
  });
  it("hints the rule family when the kind is missing", () => {
    expect(helpHintFor("update X rule")).toContain("transport rule");
  });
  it("hints the missing object for bare write verbs", () => {
    expect(helpHintFor("update test dc_1200")).toContain("mailbox");
  });
  it("hints the missing address for bare mailbox prompts", () => {
    expect(helpHintFor("mailbox")).toContain("alice@contoso.com");
  });
  it("stays silent when nothing specific applies", () => {
    expect(helpHintFor("hello there")).toBe("");
  });
  it("tolerates transport typos on delete", () => {
    expect(routeQuery('delete tranport rule "Block Executables"')).toEqual({ tool: "exchange_remove_transport_rule", args: { identity: "Block Executables" }, write: true });
  });
  it("understands mail flow rule as transport rule", () => {
    expect(routeQuery("disable mail flow rule Block Executables")).toEqual({ tool: "exchange_set_transport_rule", args: { identity: "Block Executables", state: "Disabled" }, write: true });
  });
  it("tolerates mailbox typos on delete", () => {
    expect(routeQuery("delete mailobx alice@contoso.com")).toEqual({ tool: "exchange_remove_mailbox", args: { identity: "alice@contoso.com" }, write: true });
  });
  it("normalizes common typos", () => {
    expect(normalizePrompt("delete tranport rule")).toBe("delete transport rule");
    expect(normalizePrompt("distrubution permision")).toBe("distribution permission");
  });
  it("detects write intent in loose phrasing", () => {
    expect(hasWriteIntent("get rid of that rule blocking executables")).toBe(true);
    expect(hasWriteIntent("please remove alice@contoso.com")).toBe(true);
  });
  it("does not flag pure reads as writes", () => {
    expect(hasWriteIntent("show transport rules")).toBe(false);
    expect(hasWriteIntent("mailbox size report")).toBe(false);
    expect(hasWriteIntent("how healthy is my environment")).toBe(false);
  });
  it("returns help when nothing matches", () => {
    expect(routeQuery("hello there")).toEqual({ help: true });
  });
});
