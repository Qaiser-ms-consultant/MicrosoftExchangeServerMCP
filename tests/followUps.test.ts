import { describe, expect, it } from "vitest";
import { getFollowUps } from "../src/desktop/followUps.js";
import { routeQuery } from "../src/desktop/queryRouter.js";

describe("getFollowUps", () => {
  it("suggests readiness checks after a DB failover impact report, preserving the DB identity", () => {
    const actions = getFollowUps("ai.change_impact_report", { change: "failover DB01" }, "what is impact of failover DB01");
    const prompts = actions.map((a) => a.prompt);
    expect(prompts.some((p) => p.includes("DB01"))).toBe(true);
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.length).toBeLessThanOrEqual(3);
  });

  it("suggests replication health after a database copy status check", () => {
    const actions = getFollowUps("exchange_get_database_copy_status", { identity: "DB01" }, "copy status DB01");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.length).toBeLessThanOrEqual(3);
  });

  it("returns no noisy actions for unknown tools", () => {
    expect(getFollowUps("some.unknown_tool", {}, "hello")).toEqual([]);
  });

  it("never duplicates the just-run prompt", () => {
    const actions = getFollowUps("exchange_get_queue", {}, "show delayed queues");
    expect(actions.map((a) => a.prompt.toLowerCase())).not.toContain("show delayed queues");
  });

  it("keeps mailbox identity across mailbox follow-ups", () => {
    const actions = getFollowUps("ai.tell_me_everything", { identity: "alice@contoso.com" }, "tell me everything about alice@contoso.com");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.prompt.includes("alice@contoso.com"))).toBe(true);
  });

  it("covers queue, cert, health, and report families", () => {
    expect(getFollowUps("exchange_get_queue", {}, "show delayed queues").length).toBeGreaterThan(0);
    expect(getFollowUps("exchange_get_exchange_certificate", {}, "certificates expiring soon").length).toBeGreaterThan(0);
    expect(getFollowUps("exchange_test_service_health", {}, "is the server healthy").length).toBeGreaterThan(0);
    expect(getFollowUps("report.generate_mailbox_size_report", {}, "mailbox size report").length).toBeGreaterThan(0);
  });

  it("suggests drill-downs after mailbox discovery", () => {
    const actions = getFollowUps("exchange_discover_mailboxes", {}, "list all mailboxes");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.length).toBeLessThanOrEqual(3);
    for (const a of actions) {
      expect(routeQuery(a.prompt), `follow-up "${a.prompt}" should route`).not.toHaveProperty("help");
    }
  });

  it("every suggested prompt routes to a real tool (no dead buttons)", () => {
    const samples: Array<[string, Record<string, unknown>, string]> = [
      ["ai.change_impact_report", { change: "failover DB01" }, "what is impact of failover DB01"],
      ["exchange_get_database_copy_status", { identity: "DB01" }, "copy status DB01"],
      ["exchange_test_replication_health", {}, "test replication health"],
      ["exchange_get_queue", {}, "show delayed queues"],
      ["mailflow.get_message_trace", { sender: "alice@contoso.com" }, "trace messages from alice@contoso.com"],
      ["mailflow.get_ndr_details", { code: "5.7.1" }, "explain bounce 5.7.1"],
      ["exchange_get_transport_rules", {}, "show transport rules"],
      ["exchange_list_send_connectors", {}, "list send connectors"],
      ["exchange_get_exchange_certificate", {}, "certificates expiring soon"],
      ["exchange_test_service_health", {}, "is the server healthy"],
      ["exchange_list_servers", {}, "list exchange servers"],
      ["database.list", {}, "list databases"],
      ["database.get_whitespace_and_growth", {}, "database whitespace and growth"],
      ["ai.tell_me_everything", { identity: "alice@contoso.com" }, "tell me everything about alice@contoso.com"],
      ["exchange_get_mailbox_permissions", { identity: "alice@contoso.com" }, "permissions of alice@contoso.com"],
      ["exchange_list_mailboxes", {}, "how many mailboxes"],
      ["ai.things_you_should_know", {}, "things i should know"],
      ["ai.management_report", {}, "management report"],
      ["ai.migration_eta", {}, "migration ETA"],
      ["report.generate_hold_report", {}, "hold report"],
      ["database.dismount", { identity: "DB01" }, "dismount database DB01"],
      ["report.mailbox_full_config", { identity: "administrator" }, "show me full configuration details of administrator mailbox"],
    ];
    for (const [tool, args, prompt] of samples) {
      for (const a of getFollowUps(tool, args, prompt)) {
        const route = routeQuery(a.prompt);
        expect(route, `follow-up "${a.prompt}" for ${tool} should route`).not.toHaveProperty("help");
      }
    }
  });
});
