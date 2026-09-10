import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

// Recipient Administration — covers EAC Recipients + Permissions (per learn.microsoft.com Exchange admin center)
export function registerRecipientAdminTools(server: McpServer, ps: PowerShellProvider) {
  server.tool("exchange_list_mailboxes", "List mailboxes (admin) — offset-paged discovery; pass offset for the next page, database to scope to one DB", {
    filter: z.string().optional().describe("Name filter (wildcard)"), recipientType: z.string().optional().describe("UserMailbox, SharedMailbox, RoomMailbox, EquipmentMailbox, etc."), resultSize: z.number().min(1).max(1000).optional(),
    pageSize: z.number().min(1).max(200).optional().describe("Page size for discovery (default 100)"),
    offset: z.number().min(0).optional().describe("Row offset from a previous page's nextOffset — omit for the first page"),
    database: z.string().optional().describe("Scope to one mailbox database (e.g. DB01)"),
    countOnly: z.boolean().optional().describe("Return only the total mailbox count (ignores filter) — use for 'how many mailboxes'"),
  }, async ({ filter, recipientType, resultSize, pageSize, offset, database, countOnly }) => {
    if (countOnly) {
      // Count client-side from a light DisplayName-only fetch: Measure-Object /
      // Select -ExpandProperty are unreliable on constrained endpoints (yield 0).
      const all = await ps.invokeJson(`Get-Mailbox -ResultSize Unlimited | Select-Object DisplayName`);
      const n = Array.isArray(all) ? all.length : 0;
      return { content: [{ type: "text", text: JSON.stringify({ totalMailboxes: n }, null, 2) }] };
    }
    const page = pageSize ?? Math.min(resultSize ?? 100, 200);
    const { items, nextOffset } = await ps.listMailboxes(filter, recipientType, page, { offset, database });
    // Paging keys first: narration clips long results, so the offset must
    // survive clipping. nextPage tells the narrator exactly how to continue.
    const nextPage = nextOffset !== null && nextOffset !== undefined
      ? {
          tool: "exchange_list_mailboxes",
          args: {
            ...(filter ? { filter } : {}),
            ...(recipientType ? { recipientType } : {}),
            ...(database ? { database } : {}),
            offset: nextOffset,
            pageSize: page,
          },
        }
      : undefined;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          nextOffset,
          pageSize: page,
          ...(nextPage ? { nextPage } : {}),
          mailboxes: items,
        }, null, 2),
      }],
    };
  });

  server.tool("exchange_discover_mailboxes", "Discover mailboxes granularly — total count, per-database breakdown, plus the first page (use cursor for next pages). Use this for 'list all mailboxes' on large orgs instead of fetching everything at once.", {
    database: z.string().optional().describe("Scope discovery to one mailbox database"),
    recipientType: z.string().optional().describe("UserMailbox, SharedMailbox, RoomMailbox, EquipmentMailbox, etc."),
    pageSize: z.number().min(1).max(200).optional().describe("First-page size (default 100)"),
  }, async ({ database, recipientType, pageSize }) => {
    const page = pageSize ?? 100;
    // Small inventory query: database names only.
    const dbs = await ps.invokeJson(`Get-MailboxDatabase | Select-Object Name`).catch(() => []);
    const names: string[] = Array.isArray(dbs)
      ? dbs.map((d: any) => String(d?.Name ?? "")).filter(Boolean)
      : [];
    let scoped = database ? names.filter((n) => n.toLowerCase() === database.toLowerCase()) : names;
    // A mistyped database name must not report a misleading total of 0 —
    // fall back to all databases and say so.
    let scopeNote: string | undefined;
    if (database && scoped.length === 0 && names.length > 0) {
      scopeNote = `Database '${database}' did not match any known database; showing all databases instead.`;
      scoped = names;
    }
    // Per-database light counts: one tiny Alias-only projection per DB, so a
    // single slow database cannot sink the whole summary.
    const byDatabase: Array<{ database: string; count: number; error?: string }> = [];
    for (const name of scoped.slice(0, 20)) {
      try {
        const rows = await ps.invokeJson(`Get-Mailbox -Database '${name.replace(/'/g, "''")}' -ResultSize Unlimited | Select-Object Alias`);
        byDatabase.push({ database: name, count: Array.isArray(rows) ? rows.length : 0 });
      } catch (err) {
        byDatabase.push({ database: name, count: 0, error: String((err as Error)?.message ?? err).slice(0, 200) });
      }
    }
    const totalMailboxes = byDatabase.reduce((sum, d) => sum + d.count, 0);
    const scopeForQuery = scopeNote ? undefined : database;
    const { items, nextOffset } = await ps.listMailboxes(undefined, recipientType, page, scopeForQuery ? { database: scopeForQuery } : undefined);
    // An empty first page against a nonzero total means the listing query
    // (not the data) failed — say so plainly with a pointer to the trace.
    let note: string | undefined;
    if (items.length === 0 && totalMailboxes > 0) {
      note = `Listing queries came back empty although ${totalMailboxes} mailboxes were counted. Check the PowerShell Trace tab for the failing command, or narrow by database or name filter and retry.`;
    }
    if (scopeNote) note = note ? `${scopeNote} ${note}` : scopeNote;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          totalMailboxes,
          nextOffset,
          pageSize: page,
          ...(nextOffset !== null && nextOffset !== undefined
            ? {
                nextPage: {
                  tool: "exchange_list_mailboxes",
                  args: {
                    ...(recipientType ? { recipientType } : {}),
                    ...(scopeForQuery ? { database: scopeForQuery } : {}),
                    offset: nextOffset,
                    pageSize: page,
                  },
                },
              }
            : {}),
          ...(note ? { note } : {}),
          byDatabase,
          ...(scoped.length > 20 ? { truncated: true } : {}),
          mailboxes: items,
        }, null, 2),
      }],
    };
  });

  server.tool("exchange_get_mailbox", "Get mailbox details by identity", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.getMailbox(identity);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_mailbox_statistics", "Get mailbox statistics (size, item count, last logon, DB) — troubleshooting storage/quota", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.getMailboxStatistics(identity);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_mailbox_permissions", "Get mailbox permissions (FullAccess, SendAs, etc.)", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.invokeJson(`Get-MailboxPermission -Identity "${identity}"`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_create_mailbox", "Create mailbox (New-Mailbox) — user/shared/room. For UserMailbox, password is required (SecureString).", {
    name: z.string().describe("Display name"),
    alias: z.string().optional(),
    userPrincipalName: z.string().optional().describe("UPN, e.g. newuser@contoso.com — required for UserMailbox"),
    password: z.string().optional().describe("Initial password for UserMailbox (required unless Shared/Room/Equipment). Will be converted to SecureString."),
    organizationalUnit: z.string().optional().describe("OU DN, e.g. contoso.com/Users"),
    shared: z.boolean().optional().describe("Create shared mailbox (no password needed)"),
    room: z.boolean().optional().describe("Create room mailbox"),
    equipment: z.boolean().optional().describe("Create equipment mailbox"),
    database: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  }, async ({ name, alias, userPrincipalName, password, organizationalUnit, shared, room, equipment, database, firstName, lastName }) => {
    const isSharedLike = !!(shared || room || equipment);
    if (!isSharedLike && !password) {
      throw new Error("Password is required for UserMailbox creation (New-Mailbox -Password). Provide 'password' param, or set shared/room/equipment:true for resource mailboxes.");
    }
    // Build PowerShell with SecureString handling for password
    let prelude = "";
    let pwVar = "";
    if (password && !isSharedLike) {
      const escPw = password.replace(/'/g, "''");
      prelude = `$secPw = ConvertTo-SecureString -String '${escPw}' -AsPlainText -Force; `;
      pwVar = " -Password $secPw";
    }
    let cmd = `${prelude}New-Mailbox -Name "${name.replace(/"/g, '""')}"${pwVar}`;
    if (alias) cmd += ` -Alias "${alias}"`;
    if (userPrincipalName) cmd += ` -UserPrincipalName "${userPrincipalName}"`;
    if (organizationalUnit) cmd += ` -OrganizationalUnit "${organizationalUnit}"`;
    if (firstName) cmd += ` -FirstName "${firstName}"`;
    if (lastName) cmd += ` -LastName "${lastName}"`;
    if (shared) cmd += ` -Shared`;
    if (room) cmd += ` -Room`;
    if (equipment) cmd += ` -Equipment`;
    if (database) cmd += ` -Database "${database}"`;
    const data = await ps.invokeJson(cmd);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_set_mailbox", "Set mailbox properties (prohibitSendQuota, retention, etc.)", {
    identity: z.string(), prohibitSendQuota: z.string().optional(), issueWarningQuota: z.string().optional(), customAttribute1: z.string().optional(),
  }, async ({ identity, prohibitSendQuota, issueWarningQuota, customAttribute1 }) => {
    let cmd = `Set-Mailbox -Identity "${identity}"`;
    if (prohibitSendQuota) cmd += ` -ProhibitSendQuota "${prohibitSendQuota}"`;
    if (issueWarningQuota) cmd += ` -IssueWarningQuota "${issueWarningQuota}"`;
    if (customAttribute1) cmd += ` -CustomAttribute1 "${customAttribute1}"`;
    const data = await ps.invokeJson(cmd + " -PassThru");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_remove_mailbox", "Remove mailbox (disable/delete)", { identity: z.string(), permanent: z.boolean().optional() }, async ({ identity, permanent }) => {
    const verb = permanent ? "Remove-Mailbox" : "Disable-Mailbox";
    const data = await ps.invoke(`${verb} -Identity "${identity}" -Confirm:$false | ConvertTo-Json`);
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_distribution_groups", "List distribution groups (light columns; resultSize default 100, countOnly for totals)", {
    filter: z.string().optional(), resultSize: z.number().min(1).max(1000).optional(),
    countOnly: z.boolean().optional().describe("Return only the total group count (ignores filter)"),
  }, async ({ filter, resultSize, countOnly }) => {
    if (countOnly) {
      // Count client-side from a light DisplayName-only fetch (see mailbox countOnly).
      const all = await ps.invokeJson(`Get-DistributionGroup -ResultSize Unlimited | Select-Object DisplayName`);
      const n = Array.isArray(all) ? all.length : 0;
      return { content: [{ type: "text", text: JSON.stringify({ totalDistributionGroups: n }, null, 2) }] };
    }
    const data = await ps.listDistributionGroups(filter, resultSize ?? 100);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_distribution_group_member", "Get distribution group members", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.invokeJson(`Get-DistributionGroupMember -Identity "${identity}"`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_dynamic_distribution_groups", "List dynamic distribution groups", {}, async () => {
    const data = await ps.invokeJson("Get-DynamicDistributionGroup -ResultSize 100 | Select-Object DisplayName,PrimarySmtpAddress,RecipientContainer");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_mail_contacts", "List mail contacts", { resultSize: z.number().optional() }, async ({ resultSize }) => {
    const data = await ps.invokeJson(`Get-MailContact -ResultSize ${resultSize ?? 20}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_list_mail_users", "List mail users", { resultSize: z.number().optional() }, async ({ resultSize }) => {
    const data = await ps.invokeJson(`Get-MailUser -ResultSize ${resultSize ?? 20}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("exchange_get_cas_mailbox", "Get Client Access mailbox settings (ActiveSync, OWA, MAPI)", { identity: z.string() }, async ({ identity }) => {
    const data = await ps.invokeJson(`Get-CASMailbox -Identity "${identity}"`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });
}
