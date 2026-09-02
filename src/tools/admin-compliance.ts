import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Compliance & Hold — LitigationHold, InPlaceHold, Retention, Journal (TechNet: Holds)
export function registerComplianceTools(server: McpServer, ps: PowerShellProvider) {
  server.tool(
    "exchange_get_litigation_hold",
    "Get litigation hold status for mailboxes (LitigationHoldEnabled, Duration, Owner). TechNet: Set-Mailbox -LitigationHoldEnabled",
    {
      identity: z.string().optional().describe("Mailbox identity, omit for all (ResultSize 20)"),
      filter: z.string().optional().describe("OPATH filter, e.g. LitigationHoldEnabled -eq $true"),
    },
    async ({ identity, filter }) => {
      let cmd = identity
        ? `Get-Mailbox -Identity "${identity}" | Select-Object DisplayName,PrimarySmtpAddress,LitigationHoldEnabled,LitigationHoldDuration,LitigationHoldOwner,InPlaceHolds,RetentionHoldEnabled,RetentionComment`
        : `Get-Mailbox -ResultSize 20${filter ? ` -Filter {${filter}}` : ""} | Select-Object DisplayName,PrimarySmtpAddress,LitigationHoldEnabled,LitigationHoldDuration,InPlaceHolds | Select-Object -First 20`;
      const data = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_set_litigation_hold",
    "Enable/disable litigation hold on a mailbox",
    {
      identity: z.string(),
      enabled: z.boolean(),
      duration: z.string().optional().describe("Duration like '365.00:00:00' or 'Unlimited'"),
      owner: z.string().optional(),
    },
    async ({ identity, enabled, duration, owner }) => {
      let cmd = `Set-Mailbox -Identity "${identity}" -LitigationHoldEnabled $${enabled}`;
      if (duration) cmd += ` -LitigationHoldDuration "${duration}"`;
      if (owner) cmd += ` -LitigationHoldOwner "${owner}"`;
      await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: `LitigationHold ${enabled ? "enabled" : "disabled"} for ${identity}` }] };
    },
  );

  server.tool(
    "exchange_get_inplace_hold",
    "Get In-Place Hold via mailbox InPlaceHolds property or MailboxSearch (eDiscovery). Shows query-based holds.",
    { identity: z.string().optional() },
    async ({ identity }) => {
      if (identity) {
        const data = await ps.invokeJson(`Get-Mailbox -Identity "${identity}" | Select-Object DisplayName,InPlaceHolds`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      // List all mailbox searches that represent holds (Exchange 2013 style)
      try {
        const data = await ps.invokeJson(`Get-MailboxSearch | Select-Object Name,Source,Status,InPlaceHoldEnabled,CreatedBy | Select-Object -First 20`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch {
        const data = await ps.invokeJson(`Get-Mailbox -ResultSize 20 | Where-Object { $_.InPlaceHolds -ne $null } | Select-Object DisplayName,InPlaceHolds | Select-Object -First 20`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    },
  );

  server.tool(
    "exchange_get_retention_policy",
    "Get retention policies and tags (MRM) — Get-RetentionPolicy / Get-RetentionPolicyTag",
    { identity: z.string().optional() },
    async ({ identity }) => {
      const cmd = identity ? `Get-RetentionPolicy -Identity "${identity}"` : `Get-RetentionPolicy | Select-Object Name,RetentionPolicyTagLinks | Select-Object -First 20`;
      const data = await ps.invokeJson(cmd);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_retention_policy_tag",
    "Get retention policy tags (Get-RetentionPolicyTag)",
    {},
    async () => {
      const data = await ps.invokeJson(`Get-RetentionPolicyTag | Select-Object Name,Type,RetentionEnabled,AgeLimitForRetention,RetentionAction | Select-Object -First 20`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_journal_rule",
    "Get journal rules (Get-JournalRule) — compliance journaling",
    {},
    async () => {
      const data = await ps.invokeJson(`Get-JournalRule | Select-Object Name,JournalEmailAddress,Scope,Enabled | Select-Object -First 20`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "exchange_get_mailbox_junk_config",
    "Get mailbox junk email configuration (Get-MailboxJunkEmailConfiguration)",
    { identity: z.string() },
    async ({ identity }) => {
      const data = await ps.invokeJson(`Get-MailboxJunkEmailConfiguration -Identity "${identity}" | Select-Object Enabled,TrustedSendersAndDomains,BlockedSendersAndDomains`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  );
}
