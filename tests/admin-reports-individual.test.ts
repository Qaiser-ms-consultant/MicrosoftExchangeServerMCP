import { describe, expect, it } from "vitest";
import { registerIndividualMailboxReports } from "../src/tools/reports-mailbox-individual.js";

function makeServer() {
  const tools: Record<string, (...args: any[]) => Promise<any>> = {};
  return {
    tool: (name: string, _desc: string, _schema: any, fn: (...args: any[]) => Promise<any>) => {
      tools[name] = fn;
    },
    tools,
  };
}

const HIT = { DisplayName: "Lab Admin", PrimarySmtpAddress: "devlabadmin@contoso.com", Alias: "devlabadmin", Name: "devlabadmin" };

function mockPs(mode: "direct" | "fallback" | "miss") {
  return {
    invokeJson: async (cmd: string) => {
      if (mode === "miss") return [];
      if (mode === "direct" && cmd.includes("Get-Mailbox -Identity 'devlabadmin'")) {
        return cmd.includes("Select-Object DisplayName,PrimarySmtpAddress,Alias,Name") ? [HIT] : [{ DisplayName: "Lab Admin" }];
      }
      if (mode === "fallback") {
        if (cmd.includes("Get-Mailbox -Identity 'devlabadmin'")) return [];
        if (cmd.includes('Name -like')) return [HIT];
        return [{ DisplayName: "Lab Admin" }];
      }
      return [{ DisplayName: "Lab Admin" }];
    },
  };
}

describe("report.mailbox_full_config", () => {
  it("resolves a direct identity hit and bundles all five sections", async () => {
    const server = makeServer();
    registerIndividualMailboxReports(server as any, mockPs("direct") as any);
    const res = await server.tools["report.mailbox_full_config"]({ identity: "devlabadmin" });
    const body = JSON.parse(res.content[0].text);
    expect(body.found).toBe(true);
    expect(body.resolvedAs).toBe("devlabadmin@contoso.com");
    for (const k of ["mailbox", "statistics", "oof", "hold", "permissions"]) {
      expect(body).toHaveProperty(k);
    }
  });

  it("falls back to a Name -like search for bare display names", async () => {
    const server = makeServer();
    registerIndividualMailboxReports(server as any, mockPs("fallback") as any);
    const res = await server.tools["report.mailbox_full_config"]({ identity: "devlabadmin" });
    const body = JSON.parse(res.content[0].text);
    expect(body.found).toBe(true);
    expect(body.searchedAs).toBe("devlabadmin");
  });

  it("returns a structured not-found shape instead of nulls", async () => {
    const server = makeServer();
    registerIndividualMailboxReports(server as any, mockPs("miss") as any);
    const res = await server.tools["report.mailbox_full_config"]({ identity: "ghost" });
    const body = JSON.parse(res.content[0].text);
    expect(body.found).toBe(false);
    expect(body.hint).toMatch(/full email address/i);
  });
});
