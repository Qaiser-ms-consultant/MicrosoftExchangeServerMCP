import { describe, expect, it } from "vitest";
import { appendOp, clearOpLog, getOpRuns } from "../src/desktop/opLog.js";

describe("opLog", () => {
  it("groups entries into runs in append order", () => {
    clearOpLog();
    appendOp("r1", "prompt", "user prompt", { prompt: "list mailboxes" });
    appendOp("r1", "route", "keyword router", { tool: "exchange_discover_mailboxes" });
    const runs = getOpRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].entries.map((e) => e.stage)).toEqual(["prompt", "route"]);
  });

  it("redacts secrets in bodies", () => {
    clearOpLog();
    appendOp("r2", "mcp_request", "tools/call", { arguments: { password: "s3cret" } });
    appendOp("r2", "prompt", "user prompt", { prompt: "create with password: s3cret" });
    expect(JSON.stringify(getOpRuns())).not.toContain("s3cret");
  });

  it("carries ms at top level and serializes cleanly for IPC", () => {
    clearOpLog();
    const entry = appendOp("r9", "exchange", "Get-Mailbox", { command: "Get-Mailbox -ResultSize 100", ms: 1200, rows: 100, ok: true }, 1200);
    expect(entry.ms).toBe(1200);
    expect(JSON.parse(JSON.stringify(getOpRuns()))).toEqual(getOpRuns());
  });

  it("evicts oldest runs beyond the cap", () => {
    clearOpLog();
    for (let i = 0; i < 35; i++) appendOp(`r${i}`, "prompt", "p", {});
    expect(getOpRuns()).toHaveLength(30);
    expect(getOpRuns()[0].runId).toBe("r5");
  });
});
