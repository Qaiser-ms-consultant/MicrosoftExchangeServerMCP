import { describe, expect, it } from "vitest";
import { enhancePrompt, enhancePromptWithModel, guardResult, validatePrompt } from "../src/desktop/promptGuard.js";

const none = (p: string) => validatePrompt(p);
const errs = (p: string) => none(p).filter((f) => f.severity === "error");
const warns = (p: string) => none(p).filter((f) => f.severity === "warn");

describe("validatePrompt", () => {
  it("flags empty prompts", () => {
    expect(errs("")).toHaveLength(1);
    expect(errs("   ")).toHaveLength(1);
    expect(errs("hi")).toHaveLength(1);
  });

  it("flags vague verbs without a target", () => {
    const f = warns("check exchange");
    expect(f.some((x) => x.code === "vague-verb")).toBe(true);
    expect(f.some((x) => x.code === "no-target")).toBe(true);
  });

  it("does not flag a vague verb when a target is named", () => {
    expect(warns("check the health of server EXCH01")).toHaveLength(0);
  });

  it("flags over-broad scope", () => {
    expect(warns("show me everything in exchange").some((x) => x.code === "over-broad")).toBe(true);
    expect(warns("list all mailboxes").some((x) => x.code === "over-broad")).toBe(true);
  });

  it("does not flag a bounded scope", () => {
    expect(warns("show me the top 10 largest mailboxes")).toHaveLength(0);
  });

  it("suggests a time window for log-style queries", () => {
    expect(warns("trace messages from admin@contoso.com").some((x) => x.code === "no-time-window")).toBe(true);
    expect(warns("trace messages from admin@contoso.com in the last 24 hours").some((x) => x.code === "no-time-window")).toBe(false);
  });

  it("flags write intent without an identity", () => {
    expect(errs("delete the mailbox")).toHaveLength(1);
    expect(errs("disable the user")).toHaveLength(1);
  });

  it("allows a write with a named identity", () => {
    expect(errs("dismount database DB01")).toHaveLength(0);
    expect(errs("disable mailbox jsmith@contoso.com")).toHaveLength(0);
  });

  it("scores a good starter prompt highly", () => {
    const r = guardResult("how healthy is my exchange environment");
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it("scores a vague prompt lowly", () => {
    const r = guardResult("check stuff");
    expect(r.score).toBeLessThan(60);
  });
});

describe("enhancePrompt", () => {
  it("returns a structured professional prompt", () => {
    const e = enhancePrompt("show me all mailboxes");
    expect(e).toMatch(/role:/i);
    expect(e).toMatch(/task:/i);
    expect(e.toLowerCase()).toContain("mailbox");
  });

  it("preserves the original intent tokens", () => {
    const e = enhancePrompt("dismount database DB01");
    expect(e).toContain("DB01");
    expect(e).toMatch(/dismount/i);
  });

  it("adds an output format line", () => {
    const e = enhancePrompt("why is mail flow delayed");
    expect(e).toMatch(/output:/i);
  });

  it("is idempotent-ish: enhancing an already-structured prompt keeps it", () => {
    const once = enhancePrompt("list queues");
    const twice = enhancePrompt(once);
    expect(twice).toContain("queue");
  });

  it("lists detected identities in a Context line", () => {
    const e = enhancePrompt("mailbox statistics for alice@contoso.com on DB01");
    expect(e).toMatch(/context:/i);
    expect(e).toContain("alice@contoso.com");
    expect(e).toContain("DB01");
  });

  it("adds a write constraint for write actions", () => {
    expect(enhancePrompt("dismount database DB01")).toMatch(/constraint:/i);
    expect(enhancePrompt("show delayed queues")).not.toMatch(/constraint:/i);
  });

  it("stays idempotent with the new Context/Constraint labels", () => {
    const once = enhancePrompt("dismount database DB01");
    expect(enhancePrompt(once)).toBe(once);
  });
});

describe("enhancePromptWithModel", () => {
  it("uses the model rewrite when provided", async () => {
    const out = await enhancePromptWithModel("check exchange", async (p) => `Rewritten: ${p}`);
    expect(out).toContain("Rewritten:");
  });

  it("falls back to rules when the model fails", async () => {
    const out = await enhancePromptWithModel("list queues", async () => {
      throw new Error("offline");
    });
    expect(out).toMatch(/role:/i);
  });
});