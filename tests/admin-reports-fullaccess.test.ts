import { describe, expect, it } from "vitest";
import { registerReportTools } from "../src/tools/admin-reports.js";

function makeServer() {
  const tools: Record<string, (...args: any[]) => Promise<any>> = {};
  return {
    tool: (name: string, _desc: string, _schema: any, fn: (...args: any[]) => Promise<any>) => {
      tools[name] = fn;
    },
    tools,
  };
}

const ACLS: Record<string, any[]> = {
  "a@contoso.com": [
    { Identity: "a", User: "NT AUTHORITY\\SELF", AccessRights: ["FullAccess"], IsInherited: false, Deny: false },
    { Identity: "a", User: "admin@contoso.com", AccessRights: ["FullAccess"], IsInherited: false, Deny: false },
  ],
  "b@contoso.com": [
    { Identity: "b", User: "NT AUTHORITY\\SELF", AccessRights: ["FullAccess"], IsInherited: false, Deny: false },
  ],
};

describe("report.generate_fullaccess_audit_report", () => {
  it("counts mailboxes delegating FullAccess to non-owners", async () => {
    const server = makeServer();
    const ps = {
      invokeJson: async (cmd: string) => {
        if (cmd.includes("Get-MailboxPermission")) {
          const m = cmd.match(/-Identity "([^"]+)"/);
          return (m && ACLS[m[1]]) || [];
        }
        return [
          { DisplayName: "A", PrimarySmtpAddress: "a@contoso.com" },
          { DisplayName: "B", PrimarySmtpAddress: "b@contoso.com" },
        ];
      },
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_fullaccess_audit_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.mailboxesChecked).toBe(2);
    expect(body.mailboxesWithDelegatedAccess).toBe(1);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].mailbox).toBe("a@contoso.com");
    expect(body.entries[0].grantedTo).toEqual(["admin@contoso.com"]);
  });

  it("reports zero when only SELF holds FullAccess", async () => {
    const server = makeServer();
    const ps = {
      invokeJson: async (cmd: string) => {
        if (cmd.includes("Get-MailboxPermission")) return ACLS["b@contoso.com"];
        return [{ DisplayName: "B", PrimarySmtpAddress: "b@contoso.com" }];
      },
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_fullaccess_audit_report"]({});
    expect(JSON.parse(res.content[0].text)).toEqual({
      mailboxesChecked: 1,
      mailboxesWithDelegatedAccess: 0,
      entries: [],
    });
  });
});
