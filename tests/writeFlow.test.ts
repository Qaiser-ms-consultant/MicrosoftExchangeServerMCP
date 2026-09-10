import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingWrite,
  getPendingWrite,
  planWriteStep,
  redactPromptText,
  redactSensitiveArgs,
  setPendingWrite,
} from "../src/desktop/writePlan.js";

describe("planWriteStep", () => {
  it("returns fields for missing args with collected values preserved", () => {
    const out = planWriteStep("mailbox.add_permission", { identity: "a@contoso.com" }, {});
    expect(out.needsInfo).toBe(true);
    if (!out.needsInfo) return;
    expect(out.missing).toEqual(["user"]);
    expect(out.fields.find((f) => f.name === "user")?.required).toBe(true);
    expect(out.collected).toEqual({ identity: "a@contoso.com" });
    expect(out.formTitle).toBe("Grant mailbox permission");
  });

  it("merges a form resubmit into the pending args without blank-overwrite", () => {
    const out = planWriteStep(
      "mailbox.add_permission",
      { identity: "a@contoso.com" },
      { user: "b@contoso.com", accessRights: "" },
    );
    expect(out.needsInfo).toBe(false);
    if (out.needsInfo) return;
    expect(out.needsConfirm).toBe(true);
    expect(out.args).toEqual({ identity: "a@contoso.com", user: "b@contoso.com" });
  });

  it("goes straight to confirm when nothing is missing, even without a registry entry", () => {
    const out = planWriteStep("some.unknown_write", {}, {});
    expect(out.needsInfo).toBe(false);
    if (out.needsInfo) return;
    expect(out.needsConfirm).toBe(true);
    expect(out.args).toEqual({});
  });
});

describe("pendingWrite session", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearPendingWrite("t1");
  });

  it("returns entries set in the same session", () => {
    setPendingWrite("t1", { tool: "database.dismount", args: { identity: "DB01" }, prompt: "dismount DB01" });
    expect(getPendingWrite("t1")).toEqual({ tool: "database.dismount", args: { identity: "DB01" }, prompt: "dismount DB01" });
  });

  it("expires entries older than 15 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setPendingWrite("t1", { tool: "database.dismount", args: { identity: "DB01" }, prompt: "x" });
    vi.setSystemTime(15 * 60 * 1000 + 1);
    expect(getPendingWrite("t1")).toBeNull();
  });

  it("keeps entries within the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setPendingWrite("t1", { tool: "database.dismount", args: { identity: "DB01" }, prompt: "x" });
    vi.setSystemTime(14 * 60 * 1000);
    expect(getPendingWrite("t1")).not.toBeNull();
  });
});

describe("redaction", () => {
  it("masks password-like arg values without touching the rest", () => {
    expect(redactSensitiveArgs({ identity: "a@contoso.com", password: "s3cret!", apiKey: "k" })).toEqual({
      identity: "a@contoso.com",
      password: "***",
      apiKey: "***",
    });
  });

  it("masks password assignments in prose but leaves explanations alone", () => {
    expect(redactPromptText("create mailbox with password: S3cret!")).toBe("create mailbox with password: ***");
    expect(redactPromptText("set -Password 'S3cret!'")).toBe("set -Password '***'");
    expect(redactPromptText("Password is required for user mailboxes")).toBe("Password is required for user mailboxes");
  });
});
