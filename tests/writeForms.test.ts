import { describe, expect, it } from "vitest";
import { describeWriteForm, WRITE_FORM_TOOLS } from "../src/desktop/writeForms.js";

describe("describeWriteForm", () => {
  it("covers every write tool that requires args", () => {
    const required = [
      "database.mount", "database.dismount", "exchange_retry_queue",
      "exchange_suspend_queue", "server.restart_service", "mailbox.new_move_request",
      "mailbox.set_quota", "exchange_remove_mailbox", "exchange_set_mailbox",
      "exchange_create_mailbox", "mailbox.remove_permission", "exchange_remove_transport_rule",
      "exchange_set_transport_rule", "group.new", "group.add_member",
      "mailflow.resume_queue", "mailflow.set_receive_connector", "mailflow.set_send_connector",
      "database.new_repair_request", "mailbox.add_permission",
    ];
    for (const tool of required) {
      expect(WRITE_FORM_TOOLS, tool).toContain(tool);
    }
  });

  it("describes create-mailbox with a sensitive password field", () => {
    const form = describeWriteForm("exchange_create_mailbox")!;
    expect(form.title).toBe("Create mailbox");
    const pw = form.fields.find((f) => f.name === "password")!;
    expect(pw.kind).toBe("password");
    expect(pw.sensitive).toBe(true);
  });

  it("describes add_permission with a rights select", () => {
    const form = describeWriteForm("mailbox.add_permission")!;
    expect(form.fields.find((f) => f.name === "accessRights")).toMatchObject({
      kind: "select",
      options: ["FullAccess", "SendAs"],
    });
  });

  it("marks required fields from the gate list", () => {
    const form = describeWriteForm("mailbox.new_move_request")!;
    const byName = Object.fromEntries(form.fields.map((f) => [f.name, f]));
    expect(byName["identity"].required).toBe(true);
    expect(byName["targetDatabase"].required).toBe(true);
  });

  it("returns null for read tools", () => {
    expect(describeWriteForm("exchange_list_mailboxes")).toBeNull();
  });
});
