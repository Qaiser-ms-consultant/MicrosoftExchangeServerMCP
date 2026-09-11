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

describe("exchange_add_adpermission", () => {
  it("grants Send As via AccessRights set (docs Example 1)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    const fn = server.tools["exchange_add_adpermission"];
    expect(fn).toBeDefined();
    const res = await fn({
      identity: "Terry Adams",
      user: "AaronPainter",
      accessRights: "ExtendedRight",
      extendedRights: "Send As",
    });
    expect(ps.commands).toEqual([
      `Add-ADPermission -Identity 'Terry Adams' -User 'AaronPainter' -AccessRights ExtendedRight -ExtendedRights 'Send As' -Confirm:$false`,
    ]);
    expect(res.content[0].text).toContain("Terry Adams");
  });

  it("grants connector anonymous SMTP rights (docs Example 2)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    await server.tools["exchange_add_adpermission"]({
      identity: "IP Secured Inbound",
      user: "NT AUTHORITY\\ANONYMOUS LOGON",
      extendedRights: "ms-Exch-SMTP-Submit,ms-Exch-SMTP-Accept-Any-Recipient,ms-Exch-Bypass-Anti-Spam",
    });
    expect(ps.commands[0]).toContain(`Add-ADPermission -Identity 'IP Secured Inbound'`);
    expect(ps.commands[0]).toContain(`-User 'NT AUTHORITY\\ANONYMOUS LOGON'`);
    expect(ps.commands[0]).toContain(`ms-Exch-SMTP-Submit`);
  });

  it("supports Owner set and Deny switch", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    await server.tools["exchange_add_adpermission"]({
      identity: "Terry Adams",
      owner: "AaronPainter",
    });
    expect(ps.commands[0]).toContain(`-Owner 'AaronPainter'`);

    const ps2 = psCapturing();
    const server2 = makeServer();
    registerRecipientAdminTools(server2 as any, ps2 as any);
    await server2.tools["exchange_add_adpermission"]({
      identity: "Terry Adams",
      user: "AaronPainter",
      accessRights: "ExtendedRight",
      extendedRights: "Send As",
      deny: true,
    });
    expect(ps2.commands[0]).toContain(`-Deny`);
  });

  it("requires user or owner", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerRecipientAdminTools(server as any, ps as any);
    await expect(server.tools["exchange_add_adpermission"]({ identity: "Terry Adams" })).rejects.toThrow(
      /user|owner/i,
    );
  });
});
