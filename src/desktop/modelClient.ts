// LLM client for desktop AI answers: OpenAI-compatible chat completions.
// Pure + testable — Electron IPC stays in main.ts. Providers without an
// OpenAI-compatible chat endpoint (Anthropic, Google, Azure, Bedrock) are
// reported as unsupported so callers can fall back to keyword routing.
export interface ModelConfig {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatUsage {
  input: number;
  output: number;
}

export interface ChatResult {
  text: string;
  usage?: ChatUsage;
}

// Providers serving an OpenAI-compatible POST {base}/chat/completions.
export const AI_COMPATIBLE_PROVIDERS = [
  "OpenAI",
  "Groq",
  "Together",
  "OpenRouter",
  "Mistral",
  "Ollama",
  "Ollama Cloud",
  "Custom",
  "OpenCode",
];

export function isAiProvider(provider: string): boolean {
  return AI_COMPATIBLE_PROVIDERS.includes(provider);
}

const MODELS_URL_FALLBACK = "https://api.openai.com/v1/models";

export function chatUrlFor(provider: string, baseUrl?: string): string {
  const modelsUrlMap: Record<string, string> = {
    OpenAI: "https://api.openai.com/v1/models",
    Groq: "https://api.groqu.com/openai/v1/models",
    Together: "https://api.together.xyz/v1/models",
    OpenRouter: "https://openrouter.ai/api/v1/models",
    Mistral: "https://api.mistral.ai/v1/models",
    Ollama: "http://localhost:11434/api/tags",
    "Ollama Cloud": "https://api.ollama.com/v1/models",
    Custom: "https://api.openai.com/v1/models",
    OpenCode: "http://localhost:4096/models",
  };
  const raw = (baseUrl || modelsUrlMap[provider] || MODELS_URL_FALLBACK).split("?")[0].replace(/\/+$/, "");
  const base = raw.endsWith("/api/tags")
    ? raw.slice(0, -"/api/tags".length) + "/v1"
    : raw.replace(/\/models$/, "");
  return `${base}/chat/completions`;
}

export interface ChatOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  temperature?: number;
}

export class ModelHttpError extends Error {
  status: number;
  constructor(status: number, detail?: string) {
    super(`Model API error ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "ModelHttpError";
    this.status = status;
  }
}

async function throwHttpError(res: any): Promise<never> {
  // Read the provider's error payload (often names the real cause:
  // bad key, unknown model, no credits, wrong endpoint).
  let detail = "";
  try {
    const t = await (res as any)?.text?.();
    if (typeof t === "string" && t.trim()) detail = t.trim().slice(0, 300);
  } catch {}
  throw new ModelHttpError((res as any)?.status ?? 0, detail);
}

function toAbortError(e: any): Error {
  if (e?.name === "AbortError") return new Error("Model request timed out");
  return e instanceof Error ? e : new Error(String(e));
}

async function postChat(
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal } as any);
  } catch (e: any) {
    throw toAbortError(e);
  } finally {
    clearTimeout(timer);
  }
}

const OLLAMA_FAMILY = ["Ollama", "Ollama Cloud"];

// Host root for the native /api/chat protocol (Ollama Cloud included).
export function nativeBaseFor(provider: string, baseUrl?: string): string {
  const fallback = provider === "Ollama Cloud" ? "https://api.ollama.com/v1/models" : "http://localhost:11434/api/tags";
  const raw = (baseUrl || fallback).split("?")[0].replace(/\/+$/, "");
  return raw.replace(/\/(v1\/models|models|v1|api\/tags)$/, "") || raw;
}

async function ollamaNativeChat(
  cfg: ModelConfig,
  messages: ChatMessage[],
  temperature: number,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<ChatResult> {
  const url = `${nativeBaseFor(cfg.provider, cfg.baseUrl)}/api/chat`;
  const res: any = await postChat(
    url, cfg.apiKey,
    { model: cfg.model, messages, stream: false, options: { temperature } },
    timeoutMs, fetchImpl,
  );
  if (!res.ok) await throwHttpError(res);
  const json: any = await res.json().catch(() => ({}));
  const text = String(json?.message?.content ?? "");
  if (!text) throw new Error("Empty model response");
  const usage = Number.isFinite(+json?.prompt_eval_count) && Number.isFinite(+json?.eval_count)
    ? { input: +json.prompt_eval_count, output: +json.eval_count }
    : undefined;
  return { text, usage };
}

export async function chatComplete(
  cfg: ModelConfig,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const { timeoutMs = 60000, fetchImpl = fetch, temperature = 0.2 } = opts;
  try {
    const res: any = await postChat(
      chatUrlFor(cfg.provider, cfg.baseUrl), cfg.apiKey,
      { model: cfg.model, messages, temperature },
      timeoutMs, fetchImpl,
    );
    if (!res.ok) await throwHttpError(res);
    const json: any = await res.json().catch(() => ({}));
    // OpenAI-compatible shape first, Ollama-native { message: { content } } as fallback.
    const text = String(json?.choices?.[0]?.message?.content ?? json?.message?.content ?? "");
    if (!text) throw new Error("Empty model response");
    const u = json?.usage;
    const usage = u && Number.isFinite(+u.prompt_tokens) && Number.isFinite(+u.completion_tokens)
      ? { input: +u.prompt_tokens, output: +u.completion_tokens }
      : undefined;
    return { text, usage };
  } catch (e: any) {
    // Ollama endpoints that reject the compat path get one native-protocol retry.
    if (OLLAMA_FAMILY.includes(cfg.provider) && e instanceof ModelHttpError && (e.status === 404 || e.status === 405)) {
      return ollamaNativeChat(cfg, messages, temperature, timeoutMs, fetchImpl);
    }
    throw toAbortError(e);
  }
}

// --- Tool-picker (model interprets unknown prompts into MCP tool calls) ---

export function buildToolPickerMessages(prompt: string, toolNames: string[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You route an Exchange admin request to exactly one MCP tool.",
        "Reply with ONLY a JSON object, no markdown fences, no prose:",
        '{"tool": "<exact tool name from the list>", "args": {}}',
        "Use {} for args unless the request names values (identity, mailbox, server, domain, code, subject).",
        "Available tools:",
        ...toolNames.map((n) => `- ${n}`),
      ].join("\n"),
    },
    { role: "user", content: prompt },
  ];
}

export function parseToolSelection(
  text: string,
  toolNames: string[],
): { tool: string; args: Record<string, unknown> } | null {
  const m = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    if (typeof obj?.tool !== "string" || !toolNames.includes(obj.tool)) return null;
    const args = obj.args && typeof obj.args === "object" ? obj.args : {};
    return { tool: obj.tool, args: args as Record<string, unknown> };
  } catch {
    return null;
  }
}

// --- Narrator (model answers from executed tool results) ---

export const SUMMARY_JSON_BUDGET = 12000;

export function buildSummaryMessages(prompt: string, tool: string, resultJson: string): ChatMessage[] {
  const clipped = resultJson.length > SUMMARY_JSON_BUDGET
    ? resultJson.slice(0, SUMMARY_JSON_BUDGET) + '\n...[truncated]'
    : resultJson;
  return [
    {
      role: "system",
      content: [
        "You are an Exchange Server admin assistant. Answer the user's request",
        "using ONLY the tool result below. Be concise and token-efficient:",
        "short executive summary first, then key facts as tight bullets.",
        "Never invent mailboxes, servers, numbers, or states not in the data.",
        "If the data is empty, say nothing was found.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Request: ${prompt}\nTool used: ${tool}\nResult JSON:\n${clipped}`,
    },
  ];
}
