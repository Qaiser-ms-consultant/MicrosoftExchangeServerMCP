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

  it("pages with Select-Object -First and never touches Sort-Object or Get-Recipient", async () => {
    const { ps, seen } = providerWithSpy();
    await ps.listMailboxes(undefined, undefined, 100);
    
    expect(seen[0].startsWith("Get-Mailbox")).toBe(true);
    expect(seen[0]).not.toContain("Sort-Object");
    expect(seen[0]).not.toContain("Get-Recipient");
  });

  it("clamps resultSize to a maximum of 1000", async () => {
    const { ps, seen } = providerWithSpy();
    await ps.listMailboxes(undefined, undefined, 5000);
    expect(seen[0]).toContain("-ResultSize 1000");
  });
});

describe("listMailboxes offset pagination", () => {
  function providerWithRows(rows: any[]) {
    const ps = new PowerShellProvider({ exchange: {}, auth: {} } as any, {} as any);
    const seen: string[] = [];
    vi.spyOn(ps, "invokeJson").mockImplementation(async (cmd: string) => {
      seen.push(cmd);
      return rows;
    });
    return { ps, seen };
  }

  it("pages with Select-Object -Skip/-First and returns the next offset", async () => {
    const { ps, seen } = providerWithRows([
      { DisplayName: "B", Alias: "b" },
      { DisplayName: "C", Alias: "c" },
    ]);
    const res = await ps.listMailboxes(undefined, undefined, 2, { offset: 2 });
    expect(seen[0]).toContain("-Skip 2 -First 2");
    expect(seen[0]).toContain("-ResultSize 4");
    expect(res.items).toHaveLength(2);
    expect(res.nextOffset).toBe(4);
  });

  it("returns a null offset on the final partial page", async () => {
    const { ps } = providerWithRows([{ DisplayName: "Z", Alias: "z" }]);
    const res = await ps.listMailboxes(undefined, undefined, 100);
    expect(res.items).toHaveLength(1);
    expect(res.nextOffset).toBeNull();
  });

  it("omits -Skip on the first page", async () => {
    const { ps, seen } = providerWithRows([]);
    await ps.listMailboxes(undefined, undefined, 100);
    expect(seen[0]).not.toContain("-Skip");
    
  });

  it("scopes the query to one database via the -Database parameter", async () => {
    const { ps, seen } = providerWithRows([]);
    await ps.listMailboxes(undefined, undefined, 100, { database: "DB01" });
    expect(seen[0]).toContain("-Database 'DB01'");
  });

  it("combines a name filter with the offset", async () => {
    const { ps, seen } = providerWithRows([{ DisplayName: "Al", Alias: "al" }]);
    await ps.listMailboxes("al*", undefined, 100, { offset: 50 });
    expect(seen[0]).toContain("Name -like 'al*'");
    expect(seen[0]).toContain("-Skip 50");
  });

  it("sorts pages client-side by Alias", async () => {
    const { ps } = providerWithRows([
      { DisplayName: "C", Alias: "c" },
      { DisplayName: "B", Alias: "b" },
    ]);
    const res = await ps.listMailboxes(undefined, undefined, 2);
    expect(res.items.map((i: any) => i.Alias)).toEqual(["b", "c"]);
    expect(res.nextOffset).toBe(2);
  });

  it("projects only DisplayName and Alias", async () => {
    const { ps, seen } = providerWithRows([]);
    await ps.listMailboxes(undefined, undefined, 100);
    expect(seen[0]).toContain("Select-Object DisplayName,Alias");
  });
});

describe("exchange_list_mailboxes paged envelope", () => {
  it("returns mailboxes with nextOffset and pageSize", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async () => [],
      listMailboxes: async () => ({ items: [{ DisplayName: "B", Alias: "b" }], nextOffset: 100 }),
    } as any);
    const res = await server.tools["exchange_list_mailboxes"]({ pageSize: 100 });
    expect(JSON.parse(res.content[0].text)).toEqual({
      mailboxes: [{ DisplayName: "B", Alias: "b" }],
      nextOffset: 100,
      pageSize: 100,
      nextPage: { tool: "exchange_list_mailboxes", args: { offset: 100, pageSize: 100 } },
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
      listMailboxes: async () => ({ items: [{ DisplayName: "A", Alias: "a" }], nextOffset: 100 }),
    } as any);
    const res = await server.tools["exchange_discover_mailboxes"]({ pageSize: 100 });
    expect(JSON.parse(res.content[0].text)).toEqual({
      totalMailboxes: 3,
      byDatabase: [
        { database: "DB1", count: 2 },
        { database: "DB2", count: 1 },
      ],
      mailboxes: [{ DisplayName: "A", Alias: "a" }],
      nextOffset: 100,
      pageSize: 100,
      nextPage: { tool: "exchange_list_mailboxes", args: { offset: 100, pageSize: 100 } },
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
      listMailboxes: async () => ({ items: [], nextOffset: null }),
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
      listMailboxes: async () => ({ items: [{ DisplayName: "B", Alias: "b" }], nextOffset: 100 }),
    } as any);
    const body = JSON.parse((await server.tools["exchange_list_mailboxes"]({ pageSize: 100 })).content[0].text);
    expect(body.nextPage).toEqual({
      tool: "exchange_list_mailboxes",
      args: { offset: 100, pageSize: 100 },
    });
    // Paging keys come before the mailbox array so narration clipping keeps them.
    const keys = Object.keys(body);
    expect(keys.indexOf("nextOffset")).toBeLessThan(keys.indexOf("mailboxes"));
  });

  it("explains when the listing page comes back empty despite a nonzero total", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        if (cmd.startsWith("Get-MailboxDatabase")) return [{ Name: "DB1" }];
        if (cmd.includes("-Database 'DB1'")) return [{ Alias: "a" }];
        return [];
      },
      listMailboxes: async () => ({ items: [], nextOffset: null }),
    } as any);
    const body = JSON.parse((await server.tools["exchange_discover_mailboxes"]({})).content[0].text);
    expect(body.totalMailboxes).toBe(1);
    expect(body.mailboxes).toEqual([]);
    expect(body.nextOffset).toBeNull();
    expect(body.note).toContain("came back empty");
  });

  it("falls back to unscoped discovery when the database name matches nothing", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        if (cmd.startsWith("Get-MailboxDatabase")) return [{ Name: "DB1" }];
        if (cmd.includes("-Database 'DB1'")) return [{ Alias: "a" }, { Alias: "b" }];
        return [];
      },
      listMailboxes: async () => ({ items: [{ DisplayName: "A", Alias: "a" }], nextOffset: 100 }),
    } as any);
    const body = JSON.parse((await server.tools["exchange_discover_mailboxes"]({ database: "TypoDB" })).content[0].text);
    expect(body.totalMailboxes).toBe(2);
    expect(body.byDatabase).toHaveLength(1);
    expect(body.note).toContain("TypoDB");
    expect(body.mailboxes).toHaveLength(1);
  });

  it("passes offset and database through to the provider", async () => {
    const server = makeServer();
    let got: any = null;
    registerRecipientAdminTools(server as any, {
      invokeJson: async () => [],
      listMailboxes: async (_f: any, _t: any, n: number, opts: any) => {
        got = { n, opts };
        return { items: [], nextOffset: null };
      },
    } as any);
    await server.tools["exchange_list_mailboxes"]({ offset: 200, database: "DB01", pageSize: 50 });
    expect(got).toEqual({ n: 50, opts: { offset: 200, database: "DB01" } });
  });

  it("auto-pages past the first 100 when resultSize is given", async () => {
    const server = makeServer();
    const calls: any[] = [];
    const pages = [
      { items: [{ DisplayName: "A", Alias: "a" }, { DisplayName: "B", Alias: "b" }], nextOffset: 2 },
      { items: [{ DisplayName: "C", Alias: "c" }], nextOffset: null },
    ];
    registerRecipientAdminTools(server as any, {
      invokeJson: async () => [],
      listMailboxes: async (_f: any, _t: any, n: number, opts: any) => {
        calls.push({ n, opts });
        return pages[calls.length - 1] ?? { items: [], nextOffset: null };
      },
    } as any);
    const body = JSON.parse((await server.tools["exchange_list_mailboxes"]({ resultSize: 5, pageSize: 2 })).content[0].text);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ n: 2, opts: { offset: 0, database: undefined } });
    expect(calls[1]).toEqual({ n: 2, opts: { offset: 2, database: undefined } });
    expect(body.mailboxes).toHaveLength(3);
    expect(body.resultSize).toBe(5);
    expect(body.totalFetched).toBe(3);
    expect(body.nextOffset).toBeNull();
    expect(body.nextPage).toBeUndefined();
  });

  it("keeps the cursor when resultSize is satisfied but more rows exist", async () => {
    const server = makeServer();
    registerRecipientAdminTools(server as any, {
      invokeJson: async () => [],
      listMailboxes: async (_f: any, _t: any, _n: number, opts: any) => ({
        items: [{ DisplayName: "A", Alias: "a" }, { DisplayName: "B", Alias: "b" }],
        nextOffset: (opts?.offset ?? 0) + 2,
      }),
    } as any);
    const body = JSON.parse((await server.tools["exchange_list_mailboxes"]({ resultSize: 3, pageSize: 2 })).content[0].text);
    expect(body.mailboxes).toHaveLength(3);
    expect(body.nextOffset).toBe(4);
    expect(body.nextPage).toEqual({
      tool: "exchange_list_mailboxes",
      args: { offset: 4, pageSize: 2 },
    });
  });

  it("fetches everything with no args (no 100-row bound)", async () => {
    const server = makeServer();
    let seenCmd = "";
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        seenCmd = cmd;
        return [{ DisplayName: "A", Alias: "a" }, { DisplayName: "B", Alias: "b" }];
      },
      listMailboxes: async () => { throw new Error("should not page for the unbounded default"); },
    } as any);
    const body = JSON.parse((await server.tools["exchange_list_mailboxes"]({})).content[0].text);
    expect(seenCmd).toContain("-ResultSize Unlimited");
    expect(body.mailboxes).toHaveLength(2);
    expect(body.totalFetched).toBe(2);
    expect(body.nextOffset).toBeNull();
    expect(body.nextPage).toBeUndefined();
  });

  it("scopes the unbounded default to one database", async () => {
    const server = makeServer();
    let seenCmd = "";
    registerRecipientAdminTools(server as any, {
      invokeJson: async (cmd: string) => {
        seenCmd = cmd;
        return [];
      },
      listMailboxes: async () => { throw new Error("should not page for the unbounded default"); },
    } as any);
    await server.tools["exchange_list_mailboxes"]({ database: "DB01" });
    expect(seenCmd).toContain("-Database 'DB01'");
    expect(seenCmd).toContain("-ResultSize Unlimited");
  });

  it("stops looping when pages repeat without exhaustion (10-trip cap)", async () => {
    const server = makeServer();
    let calls = 0;
    registerRecipientAdminTools(server as any, {
      invokeJson: async () => [],
      listMailboxes: async () => {
        calls++;
        return { items: [{ DisplayName: "A", Alias: "a" }], nextOffset: calls };
      },
    } as any);
    const body = JSON.parse((await server.tools["exchange_list_mailboxes"]({ resultSize: 1000, pageSize: 100 })).content[0].text);
    expect(calls).toBe(10);
    expect(body.mailboxes).toHaveLength(10);
  });
});
