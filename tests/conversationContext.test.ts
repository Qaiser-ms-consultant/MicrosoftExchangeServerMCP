import { describe, expect, it } from "vitest";
import { appendExchange, buildContextBlocks, clipText, fillMissingArgs, narrowCatalog, recallIdentities } from "../src/desktop/conversationContext.js";

describe("clipText", () => {
  it("leaves short text intact", () => {
    expect(clipText("hello", 100)).toBe("hello");
  });
  it("truncates huge text with a marker", () => {
    const out = clipText("x".repeat(3000), 100);
    expect(out.length).toBeLessThan(3000);
    expect(out).toContain("[truncated]");
  });
});

describe("appendExchange", () => {
  it("keeps only the most recent exchanges", () => {
    let xs = [];
    for (let i = 0; i < 7; i++) {
      xs = appendExchange(xs, { prompt: `q${i}`, tool: "t", resultJson: "{}" }, { maxExchanges: 5 });
    }
    expect(xs.map((x) => x.prompt)).toEqual(["q2", "q3", "q4", "q5", "q6"]);
  });
});

describe("buildContextBlocks", () => {
  it("returns empty string with no history", () => {
    expect(buildContextBlocks([])).toBe("");
  });
  it("renders oldest-first blocks with prompt, tool and answer", () => {
    const out = buildContextBlocks([
      { prompt: "show queues", tool: "exchange_get_queue", resultJson: '{"count":3}', aiAnswer: "3 queues delayed." },
      { prompt: "why?", tool: "exchange_get_queue", resultJson: '{"count":3}' },
    ]);
    expect(out.indexOf("show queues")).toBeLessThan(out.indexOf("why?"));
    expect(out).toContain("exchange_get_queue");
    expect(out).toContain("3 queues delayed.");
  });
  it("caps total size with a marker", () => {
    const big = "y".repeat(20000);
    const out = buildContextBlocks([{ prompt: "q", tool: "t", resultJson: big }], { totalBudget: 100 });
    expect(out.length).toBeLessThan(big.length);
    expect(out).toContain("[truncated]");
  });
});

describe("recallIdentities", () => {
  it("returns nulls with no history", () => {
    expect(recallIdentities([])).toEqual({ email: null, db: null });
  });
  it("recalls the newest email and DB identity", () => {
    const out = recallIdentities([
      { prompt: "tell me everything about alice@contoso.com", tool: "ai.tell_me_everything", resultJson: "{}" },
      { prompt: "check database copy status for DB01", tool: "exchange_get_database_copy_status", resultJson: "{}" },
    ]);
    expect(out).toEqual({ email: "alice@contoso.com", db: "DB01" });
  });
  it("ignores generic words after 'database'", () => {
    const out = recallIdentities([
      { prompt: "database whitespace and growth", tool: "database.get_whitespace_and_growth", resultJson: "{}" },
    ]);
    expect(out.db).toBeNull();
  });
});

describe("fillMissingArgs", () => {
  it("fills a database identity for DB tools", () => {
    const out = fillMissingArgs("database.dismount", {}, ["identity"], { email: null, db: "DB01" });
    expect(out).toEqual({ identity: "DB01" });
  });
  it("fills a mailbox identity for mailbox tools", () => {
    const out = fillMissingArgs("mailbox.set_quota", {}, ["identity"], { email: "alice@contoso.com", db: "DB01" });
    expect(out).toEqual({ identity: "alice@contoso.com" });
  });
  it("fills user/member keys from the recalled email", () => {
    const out = fillMissingArgs("mailbox.add_permission", { identity: "alice@contoso.com" }, ["user"], { email: "bob@contoso.com", db: null });
    expect(out).toEqual({ identity: "alice@contoso.com", user: "bob@contoso.com" });
  });
  it("never overwrites values already present", () => {
    const out = fillMissingArgs("database.dismount", { identity: "DB02" }, ["identity"], { email: null, db: "DB01" });
    expect(out).toEqual({ identity: "DB02" });
  });
  it("leaves unresolvable keys alone", () => {
    const out = fillMissingArgs("group.new", {}, ["name"], { email: "alice@contoso.com", db: "DB01" });
    expect(out).toEqual({});
  });
});

describe("narrowCatalog", () => {
  const catalog = [
    "exchange_get_transport_rules",
    "exchange_remove_transport_rule",
    "exchange_set_transport_rule",
    "mailflow.get_transport_rules",
    "database.mount",
    "exchange_list_mailboxes",
  ];
  it("keeps the recent tool family and drops unrelated tools", () => {
    const out = narrowCatalog(catalog, ["exchange_get_transport_rules"]);
    expect(out).toEqual(expect.arrayContaining([
      "exchange_remove_transport_rule",
      "exchange_set_transport_rule",
      "mailflow.get_transport_rules",
    ]));
    expect(out).not.toContain("database.mount");
    expect(out).not.toContain("exchange_list_mailboxes");
  });
  it("falls back to the full catalog with no usable signal", () => {
    expect(narrowCatalog(catalog, [])).toEqual(catalog);
    expect(narrowCatalog(catalog, ["help", "history"])).toEqual(catalog);
  });
});
