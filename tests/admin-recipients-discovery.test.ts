import { describe, expect, it, vi } from "vitest";
import { PowerShellProvider } from "../src/clients/powershell-provider.js";
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

function providerWithSpy() {
  const ps = new PowerShellProvider({ exchange: {}, auth: {} } as any, {} as any);
  const seen: string[] = [];
  vi.spyOn(ps, "invokeJson").mockImplementation(async (cmd: string) => {
    seen.push(cmd);
    return [];
  });
  return { ps, seen };
}

describe("listMailboxes honors resultSize without filter", () => {
  it("appends -ResultSize to the unfiltered query", async () => {
    const { ps, seen } = providerWithSpy();
    await ps.listMailboxes(undefined, undefined, 100);
    expect(seen[0]).toContain("-ResultSize 100");
  });

  it("sorts server-side with -SortBy (no Sort-Object: blocked on constrained endpoints)", async () => {
    const { ps, seen } = providerWithSpy();
    await ps.listMailboxes(undefined, undefined, 100);
    expect(seen[0]).toContain("-SortBy Alias");
    expect(seen[0]).not.toContain("Sort-Object");
  });

  it("clamps resultSize to a maximum of 1000", async () => {
    const { ps, seen } = providerWithSpy();
    await ps.listMailboxes(undefined, undefined, 5000);
    expect(seen[0]).toContain("-ResultSize 1000");
  });
});

describe("listMailboxes keyset pagination", () => {
  function providerWithRows(rows: any[]) {
    const ps = new PowerShellProvider({ exchange: {}, auth: {} } as any, {} as any);
    const seen: string[] = [];
    vi.spyOn(ps, "invokeJson").mockImplementation(async (cmd: string) => {
      seen.push(cmd);
      return rows;
    });
    return { ps, seen };
  }

  it("pages with an Alias cursor filter and returns nextCursor", async () => {
    const { ps, seen } = providerWithRows([
      { DisplayName: "B", Alias: "b" },
      { DisplayName: "C", Alias: "c" },
    ]);
    const res = await ps.listMailboxes(undefined, undefined, 2, { cursor: "a" });
    expect(seen[0]).toContain("Alias -gt 'a'");
    expect(seen[0]).toContain("-SortBy Alias");
    expect(seen[0]).not.toContain("Sort-Object");
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBe("c");
  });

  it("returns a null cursor on the final partial page", async () => {
    const { ps } = providerWithRows([{ DisplayName: "Z", Alias: "z" }]);
    const res = await ps.listMailboxes(undefined, undefined, 100);
    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });

  it("scopes the query to one database via -Filter (no -Database param on Get-Recipient)", async () => {
    const { ps, seen } = providerWithRows([]);
    await ps.listMailboxes(undefined, undefined, 100, { database: "DB01" });
    expect(seen[0]).toContain("Database -eq 'DB01'");
  });

  it("combines a name filter with the Alias cursor", async () => {
    const { ps, seen } = providerWithRows([{ DisplayName: "Al", Alias: "al" }]);
    await ps.listMailboxes("al*", undefined, 100, { cursor: "ak" });
    expect(seen[0]).toContain("Name -like 'al*'");
    expect(seen[0]).toContain("Alias -gt 'ak'");
  });

  it("sorts fallback pages client-side by Alias", async () => {
    const { ps } = providerWithRows([
      { DisplayName: "C", Alias: "c" },
      { DisplayName: "B", Alias: "b" },
    ]);
    const res = await ps.listMailboxes(undefined, undefined, 2);
    expect(res.items.map((i: any) => i.Alias)).toEqual(["b", "c"]);
    expect(res.nextCursor).toBe("c");
  });
});

describe("exchange_list_mailboxes paged envelope", () => {
  it("returns mailboxes with nextCursor and pageSize", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async () => [],
      listMailboxes: async () => ({ items: [{ DisplayName: "B", Alias: "b" }], nextCursor: "b" }),
    } as any);
    const res = await server.tools["exchange_list_mailboxes"]({ pageSize: 100 });
    expect(JSON.parse(res.content[0].text)).toEqual({
      mailboxes: [{ DisplayName: "B", Alias: "b" }],
      nextCursor: "b",
      pageSize: 100,
      nextPage: { tool: "exchange_list_mailboxes", args: { cursor: "b", pageSize: 100 } },
    });
  });

  it("counts mailboxes per database without fetching them all at once", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        if (cmd.startsWith("Get-MailboxDatabase")) return [{ Name: "DB1" }, { Name: "DB2" }];
        if (cmd.includes("-Database 'DB1'")) return [{ Alias: "a" }, { Alias: "b" }];
        if (cmd.includes("-Database 'DB2'")) return [{ Alias: "c" }];
        return [];
      },
      listMailboxes: async () => ({ items: [{ DisplayName: "A", Alias: "a" }], nextCursor: "a" }),
    } as any);
    const res = await server.tools["exchange_discover_mailboxes"]({ pageSize: 100 });
    expect(JSON.parse(res.content[0].text)).toEqual({
      totalMailboxes: 3,
      byDatabase: [
        { database: "DB1", count: 2 },
        { database: "DB2", count: 1 },
      ],
      mailboxes: [{ DisplayName: "A", Alias: "a" }],
      nextCursor: "a",
      pageSize: 100,
      nextPage: { tool: "exchange_list_mailboxes", args: { cursor: "a", pageSize: 100 } },
    });
  });

  it("still summarizes when one database query fails", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        if (cmd.startsWith("Get-MailboxDatabase")) return [{ Name: "DB1" }, { Name: "DB2" }];
        if (cmd.includes("-Database 'DB1'")) throw new Error("timeout");
        if (cmd.includes("-Database 'DB2'")) return [{ Alias: "c" }];
        return [];
      },
      listMailboxes: async () => ({ items: [], nextCursor: null }),
    } as any);
    const res = await server.tools["exchange_discover_mailboxes"]({});
    const body = JSON.parse(res.content[0].text);
    expect(body.totalMailboxes).toBe(1);
    expect(body.byDatabase).toEqual([
      { database: "DB1", count: 0, error: "timeout" },
      { database: "DB2", count: 1 },
    ]);
  });

  it("includes a nextPage hint the narrator can follow", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async () => [],
      listMailboxes: async () => ({ items: [{ DisplayName: "B", Alias: "b" }], nextCursor: "b" }),
    } as any);
    const body = JSON.parse((await server.tools["exchange_list_mailboxes"]({ pageSize: 100 })).content[0].text);
    expect(body.nextPage).toEqual({
      tool: "exchange_list_mailboxes",
      args: { cursor: "b", pageSize: 100 },
    });
    // Paging keys come before the mailbox array so narration clipping keeps them.
    const keys = Object.keys(body);
    expect(keys.indexOf("nextCursor")).toBeLessThan(keys.indexOf("mailboxes"));
  });

  it("falls back to a bounded Get-Mailbox sample when the ordered page is empty but mailboxes exist", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        if (cmd.startsWith("Get-MailboxDatabase")) return [{ Name: "DB1" }];
        if (cmd.includes("-Database 'DB1'")) return [{ Alias: "a" }, { Alias: "b" }];
        if (cmd.startsWith("Get-Mailbox -ResultSize")) return [{ DisplayName: "A", Alias: "a" }];
        return [];
      },
      listMailboxes: async () => ({ items: [], nextCursor: null }),
    } as any);
    const body = JSON.parse((await server.tools["exchange_discover_mailboxes"]({})).content[0].text);
    expect(body.totalMailboxes).toBe(2);
    expect(body.mailboxes).toHaveLength(1);
    expect(body.partial).toBe(true);
    expect(body.note).toContain("unsorted sample");
  });

  it("explains when every listing query comes back empty despite a nonzero total", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        if (cmd.startsWith("Get-MailboxDatabase")) return [{ Name: "DB1" }];
        if (cmd.includes("-Database 'DB1'")) return [{ Alias: "a" }];
        return [];
      },
      listMailboxes: async () => ({ items: [], nextCursor: null }),
    } as any);
    const body = JSON.parse((await server.tools["exchange_discover_mailboxes"]({})).content[0].text);
    expect(body.totalMailboxes).toBe(1);
    expect(body.mailboxes).toEqual([]);
    expect(body.partial).toBeUndefined();
    expect(body.note).toContain("came back empty");
  });

  it("scopes the fallback sample to the requested database", async () => {
    const server = makeServer();
    const seen: string[] = [];
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        seen.push(cmd);
        if (cmd.startsWith("Get-MailboxDatabase")) return [{ Name: "DB1" }, { Name: "DB2" }];
        if (cmd.includes("-Database 'DB1'") && !cmd.startsWith("Get-Mailbox -ResultSize")) return [{ Alias: "a" }];
        if (cmd.includes("-Database 'DB2'") && !cmd.startsWith("Get-Mailbox -ResultSize")) return [];
        if (cmd.startsWith("Get-Mailbox -ResultSize")) return [{ DisplayName: "A", Alias: "a" }];
        return [];
      },
      listMailboxes: async () => ({ items: [], nextCursor: null }),
    } as any);
    const body = JSON.parse((await server.tools["exchange_discover_mailboxes"]({ database: "DB1" })).content[0].text);
    expect(body.mailboxes).toHaveLength(1);
    expect(body.partial).toBe(true);
    expect(seen.some((c) => c.startsWith("Get-Mailbox -Database 'DB1' -ResultSize 100 | Select-Object"))).toBe(true);
  });

  it("falls back to unscoped discovery when the database name matches nothing", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        if (cmd.startsWith("Get-MailboxDatabase")) return [{ Name: "DB1" }];
        if (cmd.includes("-Database 'DB1'")) return [{ Alias: "a" }, { Alias: "b" }];
        return [];
      },
      listMailboxes: async () => ({ items: [{ DisplayName: "A", Alias: "a" }], nextCursor: "a" }),
    } as any);
    const body = JSON.parse((await server.tools["exchange_discover_mailboxes"]({ database: "TypoDB" })).content[0].text);
    expect(body.totalMailboxes).toBe(2);
    expect(body.byDatabase).toHaveLength(1);
    expect(body.note).toContain("TypoDB");
    expect(body.mailboxes).toHaveLength(1);
  });

  it("passes cursor and database through to the provider", async () => {
    const server = makeServer();
    let got: any = null;
    registerRecipientAdminTools(server as any, {
      invokeJson: async () => [],
      listMailboxes: async (_f: any, _t: any, n: number, opts: any) => {
        got = { n, opts };
        return { items: [], nextCursor: null };
      },
    } as any);
    await server.tools["exchange_list_mailboxes"]({ cursor: "m", database: "DB01", pageSize: 50 });
    expect(got).toEqual({ n: 50, opts: { cursor: "m", database: "DB01" } });
  });
});
