import { describe, expect, it } from "vitest";
import { PowerShellProvider } from "../src/clients/powershell-provider.js";

function stubbedProvider() {
  const ps = new PowerShellProvider({ exchange: {}, auth: {} } as any, {} as any);
  (ps as any).invokeForUrl = async () => [];
  return ps;
}

describe("assertAllowed with variable-assignment prelude", () => {
  it("allows our SecureString prelude before New-Mailbox", async () => {
    const ps = stubbedProvider();
    await expect(
      ps.invoke(`$secPw = ConvertTo-SecureString -String 's3cret' -AsPlainText -Force; New-Mailbox -Name "Alice" -Password $secPw`),
    ).resolves.toEqual([]);
  });

  it("still rejects non-allowlisted cmdlets", async () => {
    const ps = stubbedProvider();
    await expect(ps.invoke(`Remove-Item C:\\temp\\x`)).rejects.toThrow("Cmdlet not allowed: Remove-Item");
  });

  it("still rejects a prelude smuggling a blocked cmdlet", async () => {
    const ps = stubbedProvider();
    await expect(ps.invoke(`$x = 1; Remove-Item C:\\temp\\x`)).rejects.toThrow("Cmdlet not allowed: Remove-Item");
  });
});
