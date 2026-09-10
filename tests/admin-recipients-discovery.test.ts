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
