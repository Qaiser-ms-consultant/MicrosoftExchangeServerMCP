import { describe, expect, it } from "vitest";
import { TOOL_EXAMPLE_PROMPTS, examplePromptsFor } from "../src/desktop/toolExamples.js";
import { routeQuery } from "../src/desktop/queryRouter.js";
import { registerComplianceTools } from "../src/tools/admin-compliance.js";
import { registerDiagnosticsExtended } from "../src/tools/admin-diagnostics-extended.js";
import { registerDiagnosticTools } from "../src/tools/admin-diagnostics.js";
import { registerMailboxFeatureTools } from "../src/tools/admin-mailbox-features.js";
import { registerMailboxRecoveryTools } from "../src/tools/admin-mailbox-recovery.js";
import { registerMonitoringTools } from "../src/tools/admin-monitoring.js";
import { registerOrganizationTools } from "../src/tools/admin-organization.js";
import { registerRecipientAdminTools } from "../src/tools/admin-recipients.js";
import { registerInfraReports } from "../src/tools/admin-reports-infra.js";
import { registerReportTools } from "../src/tools/admin-reports.js";
import { registerSearchTools } from "../src/tools/admin-search.js";
import { registerServerAdminTools } from "../src/tools/admin-servers.js";
import { registerAdminTools } from "../src/tools/admin-tools.js";
import { registerTransportAdminTools } from "../src/tools/admin-transport.js";
import { registerAIAdvancedTools } from "../src/tools/ai-advanced.js";
import { registerAICleanupAdvisor } from "../src/tools/ai-cleanup-advisor.js";
import { registerAICoreTools } from "../src/tools/ai-core.js";
import { registerAISuiteTools } from "../src/tools/ai-suite.js";
import { registerTellMeEverything } from "../src/tools/ai-tellmeeverything.js";
import { registerCalendarTools } from "../src/tools/calendar-tools.js";
import { registerContactTools } from "../src/tools/contact-tools.js";
import { registerMailTools } from "../src/tools/mail-tools.js";
import { registerPsTrace } from "../src/tools/ps-trace.js";
import { registerIndividualMailboxReports } from "../src/tools/reports-mailbox-individual.js";
import { registerSpecMissingTools } from "../src/tools/spec-missing.js";

const REGISTRARS: Array<(server: any, extra: any) => void> = [
  registerComplianceTools,
  registerDiagnosticsExtended,
  registerDiagnosticTools,
  registerMailboxFeatureTools,
  registerMailboxRecoveryTools,
  registerMonitoringTools,
  registerOrganizationTools,
  registerRecipientAdminTools,
  registerInfraReports,
  registerReportTools,
  registerSearchTools,
  registerServerAdminTools,
  registerAdminTools,
  registerTransportAdminTools,
  registerAIAdvancedTools,
  registerAICleanupAdvisor,
  registerAICoreTools,
  registerAISuiteTools,
  registerTellMeEverything,
  registerCalendarTools,
  registerContactTools,
  registerMailTools,
  registerPsTrace,
  registerIndividualMailboxReports,
  registerSpecMissingTools,
];

function collectToolNames(): string[] {
  const names: string[] = [];
  const server = { tool: (name: string) => { names.push(name); } };
  for (const register of REGISTRARS) register(server, {});
  return [...new Set(names)];
}

describe("toolExamples coverage", () => {
  it("has at least one non-empty sample for every registered tool", () => {
    const missing = collectToolNames().filter((t) => {
      const samples = TOOL_EXAMPLE_PROMPTS[t] ?? [];
      return samples.length === 0 || samples.some((s) => !s || !s.trim());
    });
    expect(missing).toEqual([]);
  });

  it("returns [] for unknown tools", () => {
    expect(examplePromptsFor("no.such_tool")).toEqual([]);
  });
});

describe("toolExamples routing honesty", () => {
  const cases: Array<[string, string]> = [
    ["exchange_discover_mailboxes", "How many mailboxes in DB01"],
    ["exchange_list_mailboxes", "Show 50 mailboxes"],
    ["exchange_list_mailboxes", "List all mailboxes"],
    ["ai.tell_me_everything", "Tell me everything about admin@contoso.com"],
    ["exchange_get_mailbox_statistics", "Mailbox statistics for alice@contoso.com"],
    ["exchange_get_mailbox_permissions", "Permissions of alice@contoso.com"],
    ["database.list", "List databases"],
    ["exchange_get_queue", "Show delayed queues"],
    ["database.dismount", "Dismount database DB01"],
    ["mailbox.new_move_request", "Move mailbox alice@contoso.com to DB05"],
    ["mailbox.remove_permission", "Remove FullAccess for alice@contoso.com from bob@contoso.com"],
    ["mailbox.set_quota", "Set quota for alice@contoso.com to 50GB"],
    ["report.generate_fullaccess_audit_report", "Which mailboxes have full access enabled"],
    ["report.generate_forwarding_report", "Which mailboxes have forwarding enabled"],
    ["report.mailbox_full_config", "Full config for devlabadmin"],
    ["report.mailbox_detail", "Mailbox detail for alice@contoso.com"],
    ["exchange_list_send_connectors", "List send connectors"],
    ["mailflow.get_message_trace", "Trace messages from admin@contoso.com"],
    ["ai.daily_report", "Daily exchange report"],
    ["ai.exchange_executive_summary", "Executive summary"],
    ["ai.root_cause_analysis", "Root cause of delayed mail"],
    ["mailbox.add_permission", "Grant FullAccess permission on alice@contoso.com to bob@contoso.com"],
    ["exchange_create_mailbox", "Create mailbox"],
    ["exchange_remove_transport_rule", "Delete transport rule \"Block Executables\""],
    ["exchange_set_transport_rule", "Disable transport rule Block Executables"],
  ];
  for (const [tool, sample] of cases) {
    it(`"${sample}" routes to ${tool}`, () => {
      expect(TOOL_EXAMPLE_PROMPTS[tool]).toContain(sample);
      const route = routeQuery(sample);
      expect("tool" in route && (route as any).tool).toBe(tool);
    });
  }
});
