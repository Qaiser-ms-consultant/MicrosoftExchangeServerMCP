import { chatComplete, buildToolPickerMessages } from "./modelClient.js";
import type { ModelConfig, ChatMessage } from "./modelClient.js";

export interface ModelFirstResult {
  tool: string;
  args: Record<string, unknown>;
  write: boolean;
  rawResponse?: string;
  ms?: number;
}

export async function modelFirstRoute(
  prompt: string,
  toolNames: string[],
  modelCfg: ModelConfig
): Promise<ModelFirstResult | null> {
  if (!toolNames.length) return null;

  const messages = buildToolPickerMessages(prompt, toolNames);
  const t0 = Date.now();
  const reply = await chatComplete({ ...modelCfg }, messages);
  const ms = Date.now() - t0;

  // Parse tool selection from model response
  try {
    const parsed = JSON.parse(reply.text);
    if (parsed.tool && typeof parsed.tool === "string") {
      return {
        tool: parsed.tool,
        args: parsed.args || {},
        write: false, // Caller resolves via WRITE_REQUIRED_ARGS
        rawResponse: reply.text,
        ms
      };
    }
  } catch {
    // Failed to parse or no usable pick — caller falls back (never keyword in AI mode)
  }
  return null;
}