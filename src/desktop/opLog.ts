// Append-only per-run operation log backing the Logs tab. Pure + testable:
// no Electron imports. Secrets are redacted at append time so stored,
// displayed, and exported entries can never leak credentials.
import { redactPromptText, redactSensitiveArgs } from "./writePlan.js";

export type OpStage =
  | "prompt"
  | "route"
  | "model_request"
  | "model_response"
  | "mcp_request"
  | "mcp_response"
  | "exchange"
  | "narration"
  | "result";

export interface OpEntry {
  seq: number;
  runId: string;
  at: string;
  stage: OpStage;
  label: string;
  ms?: number;
  body?: unknown;
}

export interface OpRun {
  runId: string;
  prompt: string;
  startedAt: string;
  entries: OpEntry[];
}

const MAX_RUNS = 30;
const MAX_ENTRIES = 400;

let seq = 0;
const runs: OpRun[] = [];

function scrub(value: unknown): unknown {
  if (typeof value === "string") return redactPromptText(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const redacted = redactSensitiveArgs(value as Record<string, unknown>);
    return Object.fromEntries(Object.entries(redacted).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

export function appendOp(
  runId: string,
  stage: OpStage,
  label: string,
  body?: unknown,
  ms?: number,
): OpEntry {
  let run = runs.find((r) => r.runId === runId);
  if (!run) {
    run = { runId, prompt: "", startedAt: new Date().toISOString(), entries: [] };
    runs.push(run);
  }
  const entry: OpEntry = {
    seq: seq++,
    runId,
    at: new Date().toISOString(),
    stage,
    label,
    ...(ms !== undefined ? { ms } : {}),
    ...(body !== undefined ? { body: scrub(body) } : {}),
  };
  run.entries.push(entry);
  if (stage === "prompt" && typeof (entry.body as any)?.prompt === "string") {
    run.prompt = String((entry.body as any).prompt).slice(0, 200);
  }
  let total = runs.reduce((n, r) => n + r.entries.length, 0);
  while ((runs.length > MAX_RUNS || total > MAX_ENTRIES) && runs.length) {
    const evicted = runs.shift()!;
    total -= evicted.entries.length;
  }
  return entry;
}

export function getOpRuns(): OpRun[] {
  return runs.map((r) => ({ ...r, entries: [...r.entries] }));
}

export function clearOpLog(): void {
  runs.length = 0;
}
