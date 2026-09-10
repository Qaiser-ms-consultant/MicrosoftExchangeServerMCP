import { describe, expect, it } from "vitest";
import { planWriteStep } from "../src/desktop/writePlan.js";

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
