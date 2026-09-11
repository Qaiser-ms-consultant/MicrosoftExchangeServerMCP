import { describe, expect, it } from "vitest";
import { registerOrganizationTools } from "../src/tools/admin-organization.js";

function makeServer() {
  const tools: Record<string, (...args: any[]) => Promise<any>> = {};
  return {
    tool: (name: string, _desc: string, _schema: any, fn: (...args: any[]) => Promise<any>) => {
      tools[name] = fn;
    },
    tools,
  };
}

function psCapturing() {
  const commands: string[] = [];
  return {
    commands,
    invokeJson: async (cmd: string) => {
      commands.push(cmd);
      return [];
    },
    invoke: async (cmd: string) => {
      commands.push(cmd);
      return "";
    },
  };
}

describe("exchange_get_adserversettings", () => {
  it("displays session AD settings (docs Example 1: Get-ADServerSettings | Format-List)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    const fn = server.tools["exchange_get_adserversettings"];
    expect(fn).toBeDefined();
    const res = await fn({});
    expect(ps.commands).toEqual([`Get-ADServerSettings`]);
    expect(res.content[0].text).toBeDefined();
  });
});
