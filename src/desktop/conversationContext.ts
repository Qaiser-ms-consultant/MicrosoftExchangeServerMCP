// Rolling per-conversation context for follow-up questions ("why is DB03
// unhealthy?" after a health listing). Pure + testable — the live buffer
// lives in main.ts; this module only shapes and budgets the text so a long
// session cannot blow up model input. All budgets are characters (no
// tokenizer on the node side).
export interface ExchangeRecord {
  prompt: string;
  tool: string;
  resultJson: string;
  aiAnswer?: string;
}

export interface ContextBudgets {
  maxExchanges?: number;
  resultBudget?: number;
  answerBudget?: number;
  totalBudget?: number;
}

export const CONTEXT_DEFAULTS = {
  maxExchanges: 5,
  resultBudget: 2500,
  answerBudget: 1500,
  totalBudget: 12000,
};

export function clipText(text: string, budget: number): string {
  const s = String(text ?? "");
  if (s.length <= budget) return s;
  return s.slice(0, budget) + "\n...[truncated]";
}

/** Append a record, keeping only the most recent exchanges. */
export function appendExchange(
  exchanges: ExchangeRecord[],
  record: ExchangeRecord,
  cfg: ContextBudgets = {},
): ExchangeRecord[] {
  const max = cfg.maxExchanges ?? CONTEXT_DEFAULTS.maxExchanges;
  const next = [...exchanges, record];
  return next.length > max ? next.slice(next.length - max) : next;
}

const FAMILY_STOPLIST = new Set([
  "exchange", "get", "list", "set", "new", "remove", "add", "delete",
  "enable", "disable", "test", "report", "server", "mailflow", "database",
  "service", "services", "group", "dag", "data", "help", "history", "tools",
]);

function familyTokens(tool: string): string[] {
  return String(tool ?? "")
    .toLowerCase()
    .split(/[._]/)
    .filter((t) => t.length >= 4 && !FAMILY_STOPLIST.has(t));
}

/**
 * Narrow a tool catalog to the family of recently used tools (e.g. a vague
 * "update X" after listing transport rules retries against the transport
 * family instead of 200+ tools). Falls back to the full catalog when there
 * is no usable signal, so callers can retry blindly-picked failures.
 */
export function narrowCatalog(catalog: string[], recentTools: string[]): string[] {
  const needles = new Set<string>();
  for (const t of recentTools ?? []) {
    for (const tok of familyTokens(t)) {
      needles.add(tok);
      needles.add(tok.replace(/s$/, ""));
    }
  }
  if (!needles.size) return catalog;
  const narrowed = catalog.filter((name) => {
    const low = name.toLowerCase();
    for (const n of needles) {
      if (n.length >= 4 && low.includes(n)) return true;
    }
    return false;
  });
  return narrowed.length >= 2 ? narrowed : catalog;
}

/** Render prior exchanges oldest-first for model context. Empty when none. */
export function buildContextBlocks(exchanges: ExchangeRecord[], cfg: ContextBudgets = {}): string {
  if (!exchanges.length) return "";
  const resultBudget = cfg.resultBudget ?? CONTEXT_DEFAULTS.resultBudget;
  const answerBudget = cfg.answerBudget ?? CONTEXT_DEFAULTS.answerBudget;
  const totalBudget = cfg.totalBudget ?? CONTEXT_DEFAULTS.totalBudget;
  const blocks = exchanges.map((x, i) => {
    const lines = [
      `[${i + 1}] You asked: ${x.prompt}`,
      `    Tool: ${x.tool}`,
      `    Result: ${clipText(x.resultJson, resultBudget)}`,
    ];
    if (x.aiAnswer) lines.push(`    Answer given: ${clipText(x.aiAnswer, answerBudget)}`);
    return lines.join("\n");
  });
  const full = "Earlier in this conversation (oldest first):\n" + blocks.join("\n");
  if (full.length <= totalBudget) return full;
  return full.slice(0, totalBudget) + "\n...[truncated]";
}
