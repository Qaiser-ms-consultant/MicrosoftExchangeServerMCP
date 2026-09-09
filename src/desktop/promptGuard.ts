// Prompt guard + enhancer for the AI chat input area.
// Pure + testable — Electron IPC stays in main.ts. Providers without an
// OpenAI-compatible chat endpoint are reported as unsupported so callers can
// fall back to keyword routing.

export interface GuardFinding {
  code: string;
  severity: "error" | "warn" | "info";
  message: string;
  fix?: string;
}

export interface GuardResult {
  score: number;
  findings: GuardFinding[];
  errors: GuardFinding[];
  warnings: GuardFinding[];
}

// --- tiny helper ---
function finding(code: string, severity: GuardFinding["severity"], message: string, fix?: string): GuardFinding {
  return { code, severity, message, ...(fix ? { fix } : {}) };
}

// --- tokenisation ---
function tokens(p: string): string[] {
  return (p.toLowerCase().match(/[\w.-]+@[\w.-]+|\b[A-Z]+[0-9]*\b|\b[\w-]+\b/g) || []).map((t) => t.toLowerCase());
}

function hasEmail(p: string): boolean {
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(p);
}

function hasUppercaseId(p: string): boolean {
  return /\b(EXCH\d+|EX0\d+|MBX\d+|DB\d+|SRV\d+)\b/.test(p) || /\b[A-Z]{2,}[0-9]*\b/.test(p);
}

function hasNamedTarget(p: string): boolean {
  if (hasEmail(p) || hasUppercaseId(p)) return true;
  return /(?:mailbox|user|mail|account|database|server|host|connector|rule|group|domain|certificate|cert)\s+(?:named\s+)?["']?[A-Za-z0-9._@-]+/i.test(p) ||
    /["'][A-Za-z0-9._@-]+["']?\s*(?:mailbox|user|account|database|server)/i.test(p);
}

function hasTimeWindow(p: string): boolean {
  return /\b(last|past|previous|today|yesterday|since|until|in the last|\d+\s*(hour|hours|day|days|week|weeks|minute|minutes))\b/i.test(p);
}

const OVER_BROAD = ["everything", "all", "whole", "entire", "every", "stuff", "things", "data", "logs", "system", "environment", "exchange", "org", "organization"];
const VAGUE_VERBS = ["check", "look", "see", "show", "list", "review", "audit", "inspect", "analyze", "scan", "troubleshoot", "debug", "fix", "manage", "handle", "monitor", "watch", "track", "investigate", "find", "get", "give", "tell", "help", "what about", "how about"];
const WRITE_VERBS = ["delete", "disable", "enable", "remove", "set", "create", "new", "add", "move", "mount", "dismount", "resume", "suspend", "restart", "stop", "start", "repair", "purge", "restore"];
const TIMELESS = ["trace", "logs", "history", "tracking", "message trace", "audit", "since", "until"];

// --- validation ---

export function validatePrompt(prompt: string): GuardFinding[] {
  const p = (prompt || "").trim();
  if (!p) return [finding("empty", "error", "Prompt is empty", "Type a request first.")];
  const out: GuardFinding[] = [];
  const vague = tokens(p).find((v) => VAGUE_VERBS.includes(v));
  if (vague && !hasNamedTarget(p) && !/(\d+\s*(mailbox|mailboxes|top|largest|smallest)\b)/i.test(p)) {
    out.push(finding("vague-verb", "warn", `Vague verb "${vague}" with no named target`,
      "Name the mailbox, server, or database you mean (e.g. 'check server EXCH01')."));
    out.push(finding("no-target", "warn", "No concrete target in the prompt",
      "Add an identity — email, server name, database, or domain — so the check has a scope."));
  }
  if (OVER_BROAD.some((w) => tokens(p).includes(w)) && !/(\b(top|bottom|first|last)\s+\d+\b)/i.test(p)) {
    out.push(finding("over-broad", "warn", "Scope looks organization-wide",
      "Narrow it: top 10 mailboxes, one server, one database, or a 24h window."));
  }
  if (TIMELESS.some((w) => p.toLowerCase().includes(w)) && !hasTimeWindow(p)) {
    out.push(finding("no-time-window", "warn", "Log-style query without a time window",
      "Add a window (e.g. 'in the last 24 hours') to bound the result set."));
  }
  if (/(\bdelete\b|\bdisable\b|\benable\b|\bremove\b)/i.test(p) && !hasNamedTarget(p)) {
    out.push(finding("write-no-target", "error", "Write action without a named target",
      "Writes need a concrete identity (mailbox, server, database, rule). Refine the request or confirm intent."));
  }
  if (p.length < 12) {
    out.push(finding("too-short", "error", "Prompt is very short",
      "Add scope and target so the router can pick the right tool."));
  }
  return out;
}

export function guardResult(prompt: string): GuardResult {
  const findings = validatePrompt(prompt);
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warn");
  let score = 100;
  for (const f of findings) score -= f.severity === "error" ? 20 : 8;
  return { score: Math.max(0, score), findings, errors, warnings };
}

// --- Enhancer: deterministic template rewrite (works with no model) ---

const ROLE = "Role: You are a senior Exchange administrator assisting another Exchange admin.";
const FORMAT = "Output: a concise plain-language summary first, then at most 3 short sections with plain headings. Bold only key terms and values. End with one recommended next step when action is needed.";
const SCOPE_RULE = "Use only facts present in the tool results — never invent mailboxes, servers, numbers, or states. If the data is empty, say so plainly and suggest one next check.";
const NOFILL = "If a value is missing from the data, say so instead of guessing.";

const STRUCTURED_RE = /(\brole\b|\btask\b|\bscope\b|\bcontext\b|\bconstraint\b|\boutput\b|\bformat\b)\s*:/i;

function extractIdentities(p: string): string[] {
  const found: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (t && !found.some((x) => x.toLowerCase() === t.toLowerCase()) && found.length < 5) found.push(t);
  };
  for (const m of p.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) push(m[0]);
  for (const m of p.matchAll(/\b(EXCH\d+|EX0\d+|MBX\d+|DB\d+|SRV\d+)\b/g)) push(m[0]);
  const win = p.match(/\b(in the last \d+ \w+|last \d+ \w+|past \d+ \w+|today|yesterday)\b/i);
  if (win) push(`window: ${win[0]}`);
  return found;
}

function hasWriteVerb(p: string): boolean {
  return WRITE_VERBS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(p));
}

export function enhancePrompt(prompt: string): string {
  const p = (prompt || "").trim();
  if (!p) return p;
  if (STRUCTURED_RE.test(p)) return p;
  const scope = inferScope(p);
  const lines: string[] = [
    ROLE,
    "",
    `Task: ${p}`,
    "",
    `Scope: ${scope}.`,
  ];
  const ids = extractIdentities(p);
  if (ids.length) lines.push(`Context: ${ids.join(", ")}.`);
  if (hasWriteVerb(p)) lines.push("Constraint: this is a write action — confirm the exact target before running.");
  lines.push(SCOPE_RULE, NOFILL, FORMAT);
  return lines.join("\n");
}

function inferScope(p: string): string {
  if (/mailbox|mailboxes|user|account/i.test(p)) return "mailboxes and recipients";
  if (/queue|mail flow|mailflow|delay|ndr|bounce/i.test(p)) return "mail flow and queues";
  if (/database|db\b|whitespace|capacity/i.test(p)) return "databases and capacity";
  if (/cert|certificate/i.test(p)) return "certificates";
  if (/server|health|service|role/i.test(p)) return "server health and roles";
  if (/connector|receive|send/i.test(p)) return "transport connectors";
  if (/rule|transport rule|journal/i.test(p)) return "transport rules";
  if (/group|distribution|dl\b/i.test(p)) return "distribution groups";
  return "the Exchange environment";
}

export async function enhancePromptWithModel(
  prompt: string,
  rewrite: (p: string) => Promise<string>,
): Promise<string> {
  try {
    const out = await rewrite(prompt);
    if (out && out.trim().length >= Math.max(20, prompt.length)) return out.trim();
  } catch {}
  return enhancePrompt(prompt);
}