import { describe, expect, it } from "vitest";
import { registerProvisioningTools } from "../src/tools/admin-provisioning.js";

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
  const seen: string[] = [];
  return {
    seen,
    ps: { invokeJson: async (cmd: string) => { seen.push(cmd); return []; } } as any,
  };
}

const EXPECTED_TOOLS = [
  "exchange_create_remote_mailbox",
  "exchange_enable_remote_mailbox",
  "exchange_create_mail_user",
  "exchange_enable_mail_user",
  "exchange_create_mail_contact",
  "exchange_create_dynamic_distribution_group",
  "exchange_create_mailbox_export_request",
  "exchange_get_mailbox_export_request",
  "exchange_create_inbox_rule",
  "exchange_enable_mail_public_folder",
];

describe("registerProvisioningTools", () => {
  it("registers all mailbox provisioning tools", () => {
    const server = makeServer();
    registerProvisioningTools(server as any, {} as any);
    for (const name of EXPECTED_TOOLS) {
      expect(Object.keys(server.tools), name).toContain(name);
    }
  });

  it("builds New-RemoteMailbox with SecureString prelude and routing address", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_create_remote_mailbox"]({
      name: "Kim Akers", userPrincipalName: "kim@contoso.com", password: "s3cret!",
      remoteRoutingAddress: "kim@contoso.mail.onmicrosoft.com",
    });
    expect(seen[0]).toContain("ConvertTo-SecureString");
    expect(seen[0]).toContain("New-RemoteMailbox");
    expect(seen[0]).toContain('-UserPrincipalName "kim@contoso.com"');
    expect(seen[0]).toContain('-RemoteRoutingAddress "kim@contoso.mail.onmicrosoft.com"');
  });

  it("requires a password for default remote mailboxes", async () => {
    const server = makeServer();
    const { ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await expect(server.tools["exchange_create_remote_mailbox"]({ name: "Kim", userPrincipalName: "kim@contoso.com" })).rejects.toThrow(
      "Password is required",
    );
  });

  it("builds Enable-RemoteMailbox", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_enable_remote_mailbox"]({ identity: "kim@contoso.com", remoteRoutingAddress: "kim@contoso.mail.onmicrosoft.com" });
    expect(seen[0]).toContain("Enable-RemoteMailbox");
    expect(seen[0]).toContain("kim@contoso.mail.onmicrosoft.com");
  });

  it("builds New-MailUser with external address", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_create_mail_user"]({ name: "Jeffrey Zeng", externalEmailAddress: "jzeng@tailspintoys.com" });
    expect(seen[0]).toContain("New-MailUser");
    expect(seen[0]).toContain("jzeng@tailspintoys.com");
  });

  it("builds Enable-MailUser", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_enable_mail_user"]({ identity: "jeffrey", externalEmailAddress: "jzeng@tailspintoys.com" });
    expect(seen[0]).toContain("Enable-MailUser");
  });

  it("builds New-MailContact", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_create_mail_contact"]({ name: "Vendor Contact", externalEmailAddress: "vendor@fabrikam.com" });
    expect(seen[0]).toContain("New-MailContact");
    expect(seen[0]).toContain("vendor@fabrikam.com");
  });

  it("builds precanned dynamic distribution groups", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_create_dynamic_distribution_group"]({ name: "Finance", includedRecipients: "MailboxUsers", conditionalDepartment: "Finance" });
    expect(seen[0]).toContain("New-DynamicDistributionGroup");
    expect(seen[0]).toContain("-IncludedRecipients MailboxUsers");
  });

  it("builds custom-filter dynamic distribution groups and rejects mixed filters", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_create_dynamic_distribution_group"]({ name: "FullTime", recipientFilter: "(RecipientTypeDetails -eq 'UserMailbox')" });
    expect(seen[0]).toContain("-RecipientFilter");
    await expect(
      server.tools["exchange_create_dynamic_distribution_group"]({ name: "Bad", includedRecipients: "MailboxUsers", recipientFilter: "(CustomAttribute1 -eq 'x')" }),
    ).rejects.toThrow("either");
    await expect(server.tools["exchange_create_dynamic_distribution_group"]({ name: "Bad" })).rejects.toThrow("either");
  });

  it("builds mailbox export requests with options", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_create_mailbox_export_request"]({ mailbox: "kreiter", filePath: "\\\\SERVER01\\PST\\k.pst", isArchive: true, priority: "High" });
    expect(seen[0]).toContain("New-MailboxExportRequest");
    expect(seen[0]).toContain("-IsArchive");
    expect(seen[0]).toContain("-Priority High");
  });

  it("checks export request status", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_get_mailbox_export_request"]({ mailbox: "kreiter" });
    expect(seen[0]).toContain("Get-MailboxExportRequest");
  });

  it("builds inbox rules with conditions and actions", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_create_inbox_rule"]({ mailbox: "alice@contoso.com", name: "Invoices", from: "invoices@contoso.com", moveToFolder: "alice@contoso.com:\\Archive", markAsRead: true });
    expect(seen[0]).toContain("New-InboxRule");
    expect(seen[0]).toContain("-MarkAsRead");
  });

  it("mail-enables public folders", async () => {
    const server = makeServer();
    const { seen, ps } = psCapturing();
    registerProvisioningTools(server as any, ps);
    await server.tools["exchange_enable_mail_public_folder"]({ identity: "\\Sales" });
    expect(seen[0]).toContain("Enable-MailPublicFolder");
  });
});
