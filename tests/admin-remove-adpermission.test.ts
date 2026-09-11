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

describe("exchange_remove_adpermission", () => {
  it("removes Send As (docs Example 1)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    const fn = server.tools["exchange_remove_adpermission"];
    expect(fn).toBeDefined();
    const res = await fn({ identity: "Administrator", user: "Kim", extendedRights: "Send As" });
    expect(ps.commands).toEqual([
      `Remove-ADPermission -Identity 'Administrator' -User 'Kim' -ExtendedRights 'Send As' -Confirm:$false`,
    ]);
    expect(res.content[0].text).toContain("Administrator");
  });

  it("removes connector anonymous SMTP rights (docs Example 2)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    await server.tools["exchange_remove_adpermission"]({
      identity: "IP Secured Inbound",
      user: "NT AUTHORITY\\ANONYMOUS LOGON",
      extendedRights: "ms-Exch-SMTP-Submit,ms-Exch-SMTP-Accept-Any-Recipient,ms-Exch-Bypass-Anti-Spam",
    });
    expect(ps.commands[0]).toContain(`Remove-ADPermission -Identity 'IP Secured Inbound'`);
    expect(ps.commands[0]).toContain(`-User 'NT AUTHORITY\\ANONYMOUS LOGON'`);
    expect(ps.commands[0]).toContain(`ms-Exch-SMTP-Submit`);
  });

  it("requires user", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    await expect(server.tools["exchange_remove_adpermission"]({ identity: "Administrator" })).rejects.toThrow(
      /user/i,
    );
  });
});
