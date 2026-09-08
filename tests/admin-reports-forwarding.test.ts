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

const ROWS = [
  { DisplayName: "A", PrimarySmtpAddress: "a@contoso.com", ForwardingAddress: null, ForwardingSmtpAddress: null, DeliverToMailboxAndForward: false },
  { DisplayName: "B", PrimarySmtpAddress: "b@contoso.com", ForwardingAddress: "ext", ForwardingSmtpAddress: null, DeliverToMailboxAndForward: true },
  { DisplayName: "C", PrimarySmtpAddress: "c@contoso.com", ForwardingAddress: null, ForwardingSmtpAddress: "smtp:c@ext.com", DeliverToMailboxAndForward: false },
];

describe("report.generate_forwarding_report", () => {
  it("returns only mailboxes with forwarding enabled", async () => {
    const server = makeServer();
    const seen: string[] = [];
    const ps = { invokeJson: async (cmd: string) => {
      seen.push(cmd);
      return ROWS;
    } };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_forwarding_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.count).toBe(2);
    expect(body.forwardingEnabled.map((r: any) => r.DisplayName).sort()).toEqual(["B", "C"]);
    expect(seen[0]).toContain("Get-Mailbox");
    expect(seen[0]).toContain("ForwardingSmtpAddress");
  });

  it("reports zero when nothing is forwarded", async () => {
    const server = makeServer();
    const ps = { invokeJson: async () => [ROWS[0]] };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_forwarding_report"]({});
    expect(JSON.parse(res.content[0].text)).toEqual({ count: 0, forwardingEnabled: [] });
  });
});
