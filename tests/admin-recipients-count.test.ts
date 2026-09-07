import { describe, expect, it } from "vitest";
import { registerRecipientAdminTools } from "../src/tools/admin-recipients.js";

function makeServer() {
  const tools: Record<string, (...args: any[]) => Promise<any>> = {};
  return {
    tool: (name: string, _desc: string, _schema: any, fn: (...args: any[]) => Promise<any>) => {
      tools[name] = fn;
    },
    tools,
  };
}

function psReturning(rows: any[]) {
  return { invokeJson: async () => rows, listMailboxes: async () => rows };
}

describe("exchange_list_mailboxes countOnly", () => {
  it("counts rows client-side instead of trusting Measure-Object output", async () => {
    const server = makeServer();
    registerRecipientAdminTools(
      server as any,
      psReturning([{ DisplayName: "A" }, { DisplayName: "B" }, { DisplayName: "C" }]) as any,
    );
    const res = await server.tools["exchange_list_mailboxes"]({ countOnly: true });
    expect(JSON.parse(res.content[0].text)).toEqual({ totalMailboxes: 3 });
  });

  it("returns zero when no mailboxes exist", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, psReturning([]) as any);
    const res = await server.tools["exchange_list_mailboxes"]({ countOnly: true });
    expect(JSON.parse(res.content[0].text)).toEqual({ totalMailboxes: 0 });
  });
});

describe("exchange_list_distribution_groups countOnly", () => {
  it("counts rows client-side instead of trusting Measure-Object output", async () => {
    const server = makeServer();
    registerRecipientAdminTools(
      server as any,
      psReturning([{ DisplayName: "G1" }, { DisplayName: "G2" }]) as any,
    );
    const res = await server.tools["exchange_list_distribution_groups"]({ countOnly: true });
    expect(JSON.parse(res.content[0].text)).toEqual({ totalDistributionGroups: 2 });
  });
});
