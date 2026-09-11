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

function psCapturing() {
  const commands: string[] = [];
  return {
    commands,
    invokeJson: async (cmd: string) => {
      commands.push(cmd);
      return [];
    },
    invoke: async (cmd: string) => {
      commands.push(cmd);
      return "";
    },
  };
}

describe("exchange_get_adpermission", () => {
  it("returns permissions for an identity (docs Example 1)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    const fn = server.tools["exchange_get_adpermission"];
    expect(fn).toBeDefined();
    const res = await fn({ identity: "Ed" });
    expect(ps.commands).toEqual([`Get-ADPermission -Identity 'Ed'`]);
    expect(res.content[0].text).toBeDefined();
  });

  it("filters by user (docs Example 2)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    await server.tools["exchange_get_adpermission"]({ identity: "Contoso.com", user: "Chris" });
    expect(ps.commands).toEqual([`Get-ADPermission -Identity 'Contoso.com' -User 'Chris'`]);
  });

  it("supports Owner switch and rejects owner+user combo", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    await server.tools["exchange_get_adpermission"]({ identity: "Ed", owner: true });
    expect(ps.commands[0]).toContain(`-Owner`);

    await expect(
      server.tools["exchange_get_adpermission"]({ identity: "Ed", user: "Chris", owner: true }),
    ).rejects.toThrow(/owner.*user|user.*owner/i);
  });
});
