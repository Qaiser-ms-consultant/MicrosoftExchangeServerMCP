import { chatComplete, buildToolPickerMessages } from "./modelClient.js";
import type { ModelConfig, ChatMessage } from "./modelClient.js";

export interface ModelFirstResult {
  tool: string;
  args: Record<string, unknown>;
  write: boolean;
  rawResponse?: string;
}

export async function modelFirstRoute(
  prompt: string,
  toolNames: string[],
  modelCfg: ModelConfig,
  context?: string
): Promise<{ tool: string; args: Record<string, unknown>; write: boolean } | null> {
  if (!toolNames.length) return null;

  const messages = buildToolPickerMessages(prompt, toolNames);
  const reply = await chatComplete({ ...modelCfg }, messages);
  
  // Parse tool selection from model response
  try {
    const parsed = JSON.parse(reply.text);
    if (parsed.tool && typeof parsed.tool === "string") {
      return {
        tool: parsed.tool,
        args: parsed.args || {},
        write: false // Will be determined by WRITE_REQUIRED_ARGS later
      };
    }
  } catch {
    // Failed to parse, return null to fallback to keyword router
  }
  return null;
}