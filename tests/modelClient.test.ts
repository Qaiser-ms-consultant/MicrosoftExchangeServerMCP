import { describe, expect, it, vi } from "vitest";
import {
  buildSummaryMessages,
  buildToolPickerMessages,
  chatComplete,
  chatUrlFor,
  isAiProvider,
  isEmptyResult,
  isToolCallEcho,
  nativeBaseFor,
  parseNoToolVerdict,
  parseToolSelection,
  SUMMARY_JSON_BUDGET,
} from "../src/desktop/modelClient.js";

describe("isAiProvider", () => {
  it("accepts OpenAI-compatible providers", () => {
    for (const p of ["OpenAI", "Groq", "Together", "OpenRouter", "Mistral", "Ollama", "Ollama Cloud", "Custom", "OpenCode"]) {
      expect(isAiProvider(p)).toBe(true);
    }
  });
  it("rejects providers without a compatible chat endpoint", () => {
    for (const p of ["Anthropic", "Google", "Azure OpenAI", "AWS Bedrock", "Unknown"]) {
      expect(isAiProvider(p)).toBe(false);
    }
  });
});

describe("chatUrlFor", () => {
  it("maps OpenAI to chat completions", () => {
    expect(chatUrlFor("OpenAI")).toBe("https://api.openai.com/v1/chat/completions");
  });
  it("maps Groq preserving its openai prefix", () => {
    expect(chatUrlFor("Groq")).toBe("https://api.groqu.com/openai/v1/chat/completions");
  });
  it("maps Ollama tags endpoint to the compat chat path", () => {
    expect(chatUrlFor("Ollama")).toBe("http://localhost:11434/v1/chat/completions");
  });
  it("honors a custom base with or without a models suffix", () => {
    expect(chatUrlFor("Custom", "https://llm.local/v1")).toBe("https://llm.local/v1/chat/completions");
    expect(chatUrlFor("Custom", "https://llm.local/v1/models")).toBe("https://llm.local/v1/chat/completions");
  });
});

describe("parseToolSelection", () => {
  const catalog = ["exchange_list_mailboxes", "ai.anomaly_detection"];
  it("parses raw JSON", () => {
    expect(parseToolSelection('{"tool": "exchange_list_mailboxes", "args": {}}', catalog)).toEqual({
      tool: "exchange_list_mailboxes",
      args: {},
    });
  });
  it("parses fenced JSON with args", () => {
    const text = '```json\n{"tool": "ai.anomaly_detection", "args": {"a": 1}}\n```';
    expect(parseToolSelection(text, catalog)).toEqual({ tool: "ai.anomaly_detection", args: { a: 1 } });
  });
  it("rejects unknown tools and garbage", () => {
    expect(parseToolSelection('{"tool": "nope", "args": {}}', catalog)).toBeNull();
    expect(parseToolSelection("just do it", catalog)).toBeNull();
    expect(parseToolSelection('{"tool": 42}', catalog)).toBeNull();
  });
});

describe("buildToolPickerMessages", () => {
  it("lists catalog tools with a JSON-only instruction", () => {
    const msgs = buildToolPickerMessages("find spam", ["a.tool", "b.tool"]);
    expect(msgs[0].content).toContain("- a.tool");
    expect(msgs[0].content).toContain("ONLY a JSON object");
    expect(msgs[1].content).toBe("find spam");
  });
  it("includes conversation context and the no-tool verdict when provided", () => {
    const msgs = buildToolPickerMessages("why?", ["a.tool"], undefined, "Earlier: show queues");
    expect(msgs[0].content).toContain("Earlier: show queues");
    expect(msgs[0].content).toContain("__no_tool");
  });
  it("carries catalog description lines through verbatim", () => {
    const msgs = buildToolPickerMessages("remove it", ["a.tool — Remove a thing"]);
    expect(msgs[0].content).toContain("a.tool — Remove a thing");
  });
});

describe("parseNoToolVerdict", () => {
  it("accepts a fenced no-tool verdict", () => {
    expect(parseNoToolVerdict('```json\n{"tool": "__no_tool", "args": {}}\n```')).toBe(true);
  });
  it("rejects real tool picks and garbage", () => {
    expect(parseNoToolVerdict('{"tool": "a.tool", "args": {}}')).toBe(false);
    expect(parseNoToolVerdict("just answer it")).toBe(false);
  });
});

describe("buildSummaryMessages", () => {
  it("truncates huge results to budget with a marker", () => {
    const big = "x".repeat(SUMMARY_JSON_BUDGET + 100);
    const msgs = buildSummaryMessages("q", "t.tool", big);
    expect(msgs[1].content.length).toBeLessThan(big.length);
    expect(msgs[1].content).toContain("[truncated]");
  });
  it("leaves small results intact", () => {
    const msgs = buildSummaryMessages("q", "t.tool", '{"a":1}');
    expect(msgs[1].content).toContain('{"a":1}');
  });
  it("prepends conversation context when provided", () => {
    const msgs = buildSummaryMessages("why?", "t.tool", '{"a":1}', undefined, "Earlier: queues");
    expect(msgs[1].content).toContain("Earlier: queues");
    expect(msgs[1].content.indexOf("Earlier: queues")).toBeLessThan(msgs[1].content.indexOf("why?"));
  });
  it("scopes context to identity resolution, never re-reporting earlier exchanges", () => {
    const msgs = buildSummaryMessages("get transport rules", "exchange_get_transport_rules", '{"rules":[]}');
    expect(msgs[0].content).toMatch(/solely from the current tool result/i);
    expect(msgs[0].content).toMatch(/never re-report earlier exchanges/i);
  });
});

describe("isEmptyResult", () => {
  it("flags empty and all-null results", () => {
    expect(isEmptyResult(null)).toBe(true);
    expect(isEmptyResult("")).toBe(true);
    expect(isEmptyResult([])).toBe(true);
    expect(isEmptyResult({})).toBe(true);
    expect(isEmptyResult({ mailbox: null, statistics: null, permissions: [] })).toBe(true);
  });
  it("passes results carrying data", () => {
    expect(isEmptyResult([{ DisplayName: "Admin" }])).toBe(false);
    expect(isEmptyResult({ mailbox: { DisplayName: "Admin" }, statistics: null })).toBe(false);
    expect(isEmptyResult("found")).toBe(false);
  });
});

describe("isToolCallEcho", () => {
  it("detects echoed JSON tool calls", () => {
    expect(isToolCallEcho('using the tool. { "tool": "exchange_get_mailbox", "parameters": {} }')).toBe(true);
  });
  it("passes normal prose", () => {
    expect(isToolCallEcho("Found 1 mailbox: Admin (47.8 GB of 50 GB).")).toBe(false);
  });
});

describe("chatComplete", () => {
  const cfg = { provider: "OpenAI", apiKey: "k", model: "gpt-4o-mini" };
  const okFetch = (body: any, status = 200) =>
    vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

  it("posts to the chat endpoint with Bearer auth and parses text+usage", async () => {
    const f = okFetch({ choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 10, completion_tokens: 3 } });
    const r = await chatComplete(cfg, [{ role: "user", content: "hi" }], { fetchImpl: f as any });
    expect(f).toHaveBeenCalledOnce();
    expect(String(f.mock.calls[0][0])).toBe("https://api.openai.com/v1/chat/completions");
    expect(f.mock.calls[0][1].headers["Authorization"]).toBe("Bearer k");
    expect(r).toEqual({ text: "hi", usage: { input: 10, output: 3 } });
  });

  it("accepts Ollama-native message shape", async () => {
    const f = okFetch({ message: { content: "hey" } });
    const r = await chatComplete(cfg, [{ role: "user", content: "hi" }], { fetchImpl: f as any });
    expect(r.text).toBe("hey");
  });

  it("omits usage when the provider does not report it", async () => {
    const f = okFetch({ choices: [{ message: { content: "hi" } }] });
    const r = await chatComplete(cfg, [{ role: "user", content: "hi" }], { fetchImpl: f as any });
    expect(r.usage).toBeUndefined();
  });

  it("surfaces the provider error payload with the status", async () => {
    const f = vi.fn().mockResolvedValue({
      ok: false,
      status: 485,
      text: async () => '{"error":{"message":"account issue","type":"billing"}}',
    });
    await expect(
      chatComplete(cfg, [{ role: "user", content: "hi" }], { fetchImpl: f as any }),
    ).rejects.toThrow(/485.*account issue/);
  });

  it("throws on HTTP errors and empty content", async () => {
    await expect(
      chatComplete(cfg, [{ role: "user", content: "hi" }], { fetchImpl: okFetch({}, 401) as any }),
    ).rejects.toThrow(/401/);
    await expect(
      chatComplete(cfg, [{ role: "user", content: "hi" }], { fetchImpl: okFetch({ choices: [] }) as any }),
    ).rejects.toThrow(/Empty/);
  });

  it("falls back to native /api/chat when Ollama answers 404/405", async () => {
    const calls: string[] = [];
    const f = vi.fn().mockImplementation((url: any) => {
      calls.push(String(url));
      if (String(url).endsWith("/chat/completions")) {
        return Promise.resolve({ ok: false, status: 405, text: async () => "method not allowed" });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ message: { content: "native hi" }, prompt_eval_count: 7, eval_count: 2 }),
      });
    });
    const r = await chatComplete(
      { provider: "Ollama Cloud", apiKey: "k", model: "gpt-oss:20b" },
      [{ role: "user", content: "hi" }],
      { fetchImpl: f as any },
    );
    expect(calls[1]).toBe("https://api.ollama.com/api/chat");
    expect(r).toEqual({ text: "native hi", usage: { input: 7, output: 2 } });
  });

  it("does not retry native protocol on auth failures", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" });
    await expect(
      chatComplete({ provider: "Ollama Cloud", apiKey: "k", model: "m" }, [{ role: "user", content: "hi" }], {
        fetchImpl: f as any,
      }),
    ).rejects.toThrow(/401.*bad key/);
    expect(f).toHaveBeenCalledOnce();
  });

  it("does not retry native protocol for non-Ollama providers", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 405, text: async () => "nope" });
    await expect(
      chatComplete({ provider: "OpenAI", apiKey: "k", model: "m" }, [{ role: "user", content: "hi" }], {
        fetchImpl: f as any,
      }),
    ).rejects.toThrow(/405/);
    expect(f).toHaveBeenCalledOnce();
  });

  it("derives the native Ollama base from models URLs and bare hosts", () => {
    expect(nativeBaseFor("Ollama Cloud")).toBe("https://api.ollama.com");
    expect(nativeBaseFor("Ollama")).toBe("http://localhost:11434");
    expect(nativeBaseFor("Ollama", "http://srv:11434")).toBe("http://srv:11434");
    expect(nativeBaseFor("Ollama", "http://srv:11434/v1/models")).toBe("http://srv:11434");
  });

  it("aborts on timeout", async () => {
    const hanging = vi.fn().mockImplementation(
      (_u: any, init: any) =>
        new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))),
    );
    await expect(
      chatComplete(cfg, [{ role: "user", content: "hi" }], { fetchImpl: hanging as any, timeoutMs: 30 }),
    ).rejects.toThrow(/timed out/);
  });
});
