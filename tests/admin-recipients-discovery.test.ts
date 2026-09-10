import { describe, expect, it, vi } from "vitest";
import { PowerShellProvider } from "../src/clients/powershell-provider.js";

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
  it("appends -ResultSize to the unfiltered Get-Mailbox", async () => {
    const { ps, seen } = providerWithSpy();
    await ps.listMailboxes(undefined, undefined, 100);
    expect(seen[0]).toContain("-ResultSize 100");
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
    expect(seen[0]).toContain("Sort-Object Alias");
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBe("c");
  });

  it("returns a null cursor on the final partial page", async () => {
    const { ps } = providerWithRows([{ DisplayName: "Z", Alias: "z" }]);
    const res = await ps.listMailboxes(undefined, undefined, 100);
    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });

  it("scopes the query to one database", async () => {
    const { ps, seen } = providerWithRows([]);
    await ps.listMailboxes(undefined, undefined, 100, { database: "DB01" });
    expect(seen[0]).toContain("-Database 'DB01'");
  });
});
