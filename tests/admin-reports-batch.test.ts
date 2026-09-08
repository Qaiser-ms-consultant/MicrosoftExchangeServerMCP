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

describe("report.generate_quota_pressure_report", () => {
  it("ranks mailboxes by quota usage and skips unlimited quotas", async () => {
    const server = makeServer();
    const ps = {
      invokeJson: async (cmd: string) => {
        if (cmd.includes("Get-MailboxStatistics")) {
          return [
            { DisplayName: "A", TotalItemSize: "48 GB (51,539,607,552 bytes)" },
            { DisplayName: "B", TotalItemSize: "10 GB (10,737,418,240 bytes)" },
            { DisplayName: "C", TotalItemSize: "5 GB (5,368,709,120 bytes)" },
          ];
        }
        return [
          { DisplayName: "A", PrimarySmtpAddress: "a@contoso.com", ProhibitSendQuota: "50 GB (53,687,091,200 bytes)" },
          { DisplayName: "B", PrimarySmtpAddress: "b@contoso.com", ProhibitSendQuota: "50 GB (53,687,091,200 bytes)" },
          { DisplayName: "C", PrimarySmtpAddress: "c@contoso.com", ProhibitSendQuota: "Unlimited" },
        ];
      },
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_quota_pressure_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.count).toBe(2);
    expect(body.top[0].DisplayName).toBe("A");
    expect(body.top[0].percentUsed).toBeGreaterThan(90);
    expect(body.top[1].DisplayName).toBe("B");
  });
});

describe("report.generate_protocol_report", () => {
  it("counts legacy protocol usage", async () => {
    const server = makeServer();
    const ps = {
      invokeJson: async () => [
        { DisplayName: "A", PrimarySmtpAddress: "a@contoso.com", PopEnabled: true, ImapEnabled: false, MAPIEnabled: true, ActiveSyncEnabled: true },
        { DisplayName: "B", PrimarySmtpAddress: "b@contoso.com", PopEnabled: false, ImapEnabled: true, MAPIEnabled: true, ActiveSyncEnabled: false },
        { DisplayName: "C", PrimarySmtpAddress: "c@contoso.com", PopEnabled: false, ImapEnabled: false, MAPIEnabled: true, ActiveSyncEnabled: true },
      ],
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_protocol_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.count).toBe(3);
    expect(body.summary.popEnabled).toBe(1);
    expect(body.summary.imapEnabled).toBe(1);
    expect(body.summary.mapiEnabled).toBe(3);
  });
});

describe("report.generate_connector_report", () => {
  it("returns send and receive connectors together", async () => {
    const server = makeServer();
    const ps = {
      invokeJson: async (cmd: string) => {
        if (cmd.includes("Get-ReceiveConnector")) return [{ Name: "R1", Enabled: true }];
        return [{ Name: "S1", Enabled: true }];
      },
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_connector_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.sendConnectors).toHaveLength(1);
    expect(body.receiveConnectors).toHaveLength(1);
  });
});

describe("report.generate_transport_rule_report", () => {
  it("summarizes rules by state", async () => {
    const server = makeServer();
    const ps = {
      getTransportRules: async () => [
        { Name: "R1", Priority: 0, State: "Enabled", Mode: "Enforce" },
        { Name: "R2", Priority: 1, State: "Disabled", Mode: "Enforce" },
      ],
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_transport_rule_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.count).toBe(2);
    expect(body.byState).toEqual({ Enabled: 1, Disabled: 1 });
  });
});

describe("report.generate_group_hygiene_report", () => {
  it("flags empty groups and ranks largest", async () => {
    const server = makeServer();
    const members: Record<string, any[]> = {
      G1: [],
      G2: [{ DisplayName: "M1" }, { DisplayName: "M2" }, { DisplayName: "M3" }],
    };
    const ps = {
      invokeJson: async (cmd: string) => {
        if (cmd.includes("Get-DistributionGroupMember")) {
          const m = cmd.match(/-Identity "([^"]+)"/);
          return (m && members[m[1]]) || [];
        }
        return [
          { Name: "G1", PrimarySmtpAddress: "g1@contoso.com" },
          { Name: "G2", PrimarySmtpAddress: "g2@contoso.com" },
        ];
      },
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_group_hygiene_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.empty.map((g: any) => g.name)).toEqual(["G1"]);
    expect(body.largest[0]).toMatchObject({ name: "G2", memberCount: 3 });
  });
});

describe("report.generate_move_request_report", () => {
  it("summarizes move requests by status", async () => {
    const server = makeServer();
    const ps = {
      invokeJson: async () => [
        { DisplayName: "A", Status: "Completed", PercentComplete: 100, TargetDatabase: "DB05" },
        { DisplayName: "B", Status: "InProgress", PercentComplete: 40, TargetDatabase: "DB05" },
      ],
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_move_request_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.count).toBe(2);
    expect(body.byStatus).toEqual({ Completed: 1, InProgress: 1 });
  });
});

describe("report.generate_database_distribution_report", () => {
  it("groups mailbox counts per database", async () => {
    const server = makeServer();
    const ps = {
      invokeJson: async () => [
        { DisplayName: "A", Database: "DB01" },
        { DisplayName: "B", Database: "DB01" },
        { DisplayName: "C", Database: "DB02" },
      ],
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_database_distribution_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.total).toBe(3);
    expect(body.perDatabase).toEqual([
      { database: "DB01", count: 2 },
      { database: "DB02", count: 1 },
    ]);
  });
});

describe("report.generate_domain_report", () => {
  it("returns accepted and remote domains together", async () => {
    const server = makeServer();
    const ps = {
      invokeJson: async (cmd: string) => {
        if (cmd.includes("Get-RemoteDomain")) return [{ Name: "External", DomainName: "*" }];
        return [{ Name: "Contoso", DomainName: "contoso.com", Default: true }];
      },
    };
    registerReportTools(server as any, ps as any);
    const res = await server.tools["report.generate_domain_report"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.acceptedDomains).toHaveLength(1);
    expect(body.remoteDomains).toHaveLength(1);
  });
});
