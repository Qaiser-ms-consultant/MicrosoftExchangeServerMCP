import { expect, test, vi } from "vitest";

// Use vi.hoisted to create mocks that are available at module load time
const { mockChatComplete, mockBuildToolPickerMessages } = vi.hoisted(() => {
  const mockChatComplete = vi.fn();
  const mockBuildToolPickerMessages = vi.fn((prompt: string, tools: string[]) => [
    { role: "system", content: "test" },
    { role: "user", content: prompt }
  ]);
  return { mockChatComplete, mockBuildToolPickerMessages };
});

vi.mock("../src/desktop/modelClient.js", () => ({
  get chatComplete() { return mockChatComplete; },
  get buildToolPickerMessages() { return mockBuildToolPickerMessages; }
}));

const { modelFirstRoute } = await import("../src/desktop/modelFirst.js");

test("returns tool selection from model when given prompt and tool list", async () => {
  mockChatComplete.mockResolvedValue({
    text: '{"tool": "exchange_list_mailboxes", "args": {}}',
    usage: { input: 100, output: 50 }
  });

  const res = await modelFirstRoute("list all mailboxes", ["exchange_list_mailboxes"], { provider: "OpenAI", apiKey: "test", model: "gpt-4o" });
  expect(res).not.toBeNull();
  expect(res!.tool).toBe("exchange_list_mailboxes");
  expect(res!.args).toEqual({});
  expect(res!.write).toBe(false);
});

test("returns null when model response cannot be parsed", async () => {
  const { modelFirstRoute } = await import("../src/desktop/modelFirst.js");
  mockChatComplete.mockResolvedValue({
    text: "not valid json",
    usage: { input: 100, output: 50 }
  });
  const res = await modelFirstRoute("list all mailboxes", ["exchange_list_mailboxes"], { provider: "OpenAI", apiKey: "test", model: "gpt-4o" });
  expect(res).toBeNull();
});

test("returns null when toolNames is empty", async () => {
  const res = await modelFirstRoute("list all mailboxes", [], { provider: "OpenAI", apiKey: "test", model: "gpt-4o" });
  expect(res).toBeNull();
});

test("returns null when model response has invalid tool name", async () => {
  mockChatComplete.mockResolvedValue({
    text: '{"tool": "", "args": {}}',
    usage: { input: 100, output: 50 }
  });
  const res = await modelFirstRoute("list all mailboxes", ["exchange_list_mailboxes"], { provider: "OpenAI", apiKey: "test", model: "gpt-4o" });
  expect(res).toBeNull();
});