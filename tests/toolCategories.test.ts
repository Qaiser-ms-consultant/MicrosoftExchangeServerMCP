import { describe, expect, it } from "vitest";
import { categorizeTool, TOOL_OPERATION_OVERRIDES } from "../src/desktop/toolCategories.js";
import { TOOL_EXAMPLE_PROMPTS } from "../src/desktop/toolExamples.js";

describe("categorizeTool", () => {
  const cases: Array<[string, string]> = [
    // read
    ["exchange_list_mailboxes", "read"],
    ["exchange_get_mailbox", "read"],
    ["database.list", "read"],
    ["exchange_search_mailbox", "read"],
    ["exchange_test_service_health", "read"],
    ["dag.simulate_failover_check", "read"],
    ["ai.ask_exchange", "read"],
    ["ai.tell_me_everything", "read"],
    ["report.generate_full_summary", "read"],
    ["log.tail_transport_log", "read"],
    // create
    ["exchange_create_mailbox", "create"],
    ["exchange_enable_mailbox", "create"],
    ["group.new", "create"],
    ["group.add_member", "create"],
    ["mailbox.new_move_request", "create"],
    ["exchange_send_message", "create"],
    ["exchange_reply_message", "create"],
    ["database.add_copy", "create"],
    ["mailbox.add_permission", "create"],
    // update
    ["exchange_set_mailbox", "update"],
    ["mailbox.set_quota", "update"],
    ["certificate.enable_services", "update"],
    ["server.restart_service", "update"],
    ["database.mount", "update"],
    ["database.dismount", "update"],
    ["database.move_active", "update"],
    ["exchange_move_message", "update"],
    ["exchange_connect_mailbox", "update"],
    ["exchange_undo_softdeleted_mailbox", "update"],
    ["exchange_retry_queue", "update"],
    ["exchange_suspend_queue", "update"],
    ["dag.set_activation_policy", "update"],
    // delete
    ["exchange_remove_mailbox", "delete"],
    ["exchange_disable_mailbox", "delete"],
    ["exchange_delete_message", "delete"],
    ["mailbox.remove_permission", "delete"],
    ["database.remove_copy", "delete"],
    ["exchange_remove_transport_rule", "delete"],
  ];
  for (const [tool, expected] of cases) {
    it(`${tool} is ${expected}`, () => {
      expect(categorizeTool(tool)).toBe(expected);
    });
  }

  it("only ever returns the four known categories", () => {
    for (const tool of Object.keys(TOOL_EXAMPLE_PROMPTS)) {
      expect(["create", "read", "update", "delete"]).toContain(categorizeTool(tool));
    }
  });

  it("overrides reference real tools only", () => {
    for (const tool of Object.keys(TOOL_OPERATION_OVERRIDES)) {
      expect(TOOL_EXAMPLE_PROMPTS[tool], tool).toBeDefined();
    }
  });
});
