import { describe, expect, it } from "vitest";
import { TOOL_EXAMPLE_PROMPTS, examplePromptsFor } from "../src/desktop/toolExamples.js";
import { routeQuery } from "../src/desktop/queryRouter.js";
import { registerClientAccessTools } from "../src/tools/admin-clientaccess.js";

function setupServer() {
  const s: any = { tool: (_name: string, _desc: string, _fn: any) => {} };
  registerClientAccessTools(s, {});
  return s as any;
}

describe("exchange_get_casmailbox tool examples", () => {
  it("has at least one non-empty sample", () => {
    const samples = examplePromptsFor("exchange_get_casmailbox");
    expect(samples.length).toBeGreaterThan(0);
  });

  it("routes basic identity query", () => {
    const result = routeQuery("Show CAS mailbox settings for alice@contoso.com");
    expect(result.tool).toBe("exchange_get_casmailbox");
  });

  it("routes ANR query", () => {
    const result = routeQuery("Show CAS mailbox using ANR search for Marketing");
    expect(result.tool).toBe("exchange_get_casmailbox");
  });

  it("routes protocol settings query", () => {
    const result = routeQuery("Get protocol settings for CAS mailbox");
    expect(result.tool).toBe("exchange_get_casmailbox");
  });
});