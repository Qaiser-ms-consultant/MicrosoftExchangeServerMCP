import { describe, expect, it } from "vitest";
import { registerTellMeEverything } from "../src/tools/ai-tellmeeverything.js";

function makeServer() {
  const tools: Record<string, (...args: any[]) => Promise<any>> = {};
  return {
    tool: (name: string, _desc: string, _schema: any, fn: (...args: any[]) => Promise<any>) => {
      tools[name] = fn;
    },
    tools,
  };
}

const emptyPs = { invokeJson: async () => [] };

function mailboxPs() {
  return {
    invokeJson: async (cmd: string) => {
      if (cmd.includes("Get-Mailbox -Identity")) {
        return [{ DisplayName: "Alice", PrimarySmtpAddress: "alice@contoso.com", ServerName: "EXCH01" }];
      }
      return [];
    },
  };
}

describe("ai.tell_me_everything existence gate", () => {
  it("throws NOT_FOUND instead of a dummy summary for a missing mailbox", async () => {
    const server = makeServer();
    registerTellMeEverything(server as any, emptyPs as any);
    await expect(server.tools["ai.tell_me_everything"]({ identity: "ghost@contoso.com" })).rejects.toThrow(
      /not found/i,
    );
  });

  it("returns a real summary for an existing mailbox", async () => {
    const server = makeServer();
    registerTellMeEverything(server as any, mailboxPs() as any);
    const res = await server.tools["ai.tell_me_everything"]({ identity: "alice@contoso.com" });
    const data = JSON.parse(res.content[0].text);
    expect(data.mailbox).toBe("alice@contoso.com");
    expect(data.displayName).toBe("Alice");
  });

  it("alias throws NOT_FOUND for a missing mailbox", async () => {
    const server = makeServer();
    registerTellMeEverything(server as any, emptyPs as any);
    await expect(server.tools["ai.analyze_mailbox"]({ identity: "ghost@contoso.com" })).rejects.toThrow(
      /not found/i,
    );
  });
});
