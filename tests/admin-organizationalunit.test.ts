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

describe("exchange_get_organizationalunit", () => {
  it("lists first-level children (docs Example 1)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    const fn = server.tools["exchange_get_organizationalunit"];
    expect(fn).toBeDefined();
    const res = await fn({ identity: "North America", singleNodeOnly: true });
    expect(ps.commands[0]).toContain(`Get-OrganizationalUnit -Identity 'North America'`);
    expect(ps.commands[0]).toContain(`-SingleNodeOnly`);
    expect(res.content[0].text).toBeDefined();
  });

  it("searches by text (docs Example 2)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await server.tools["exchange_get_organizationalunit"]({ searchText: "Executives" });
    expect(ps.commands[0]).toContain(`Get-OrganizationalUnit -SearchText 'Executives'`);
  });

  it("rejects identity+searchText combo (separate sets)", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerOrganizationTools(server as any, ps as any);
    await expect(
      server.tools["exchange_get_organizationalunit"]({ identity: "North America", searchText: "Executives" }),
    ).rejects.toThrow(/identity.*searchText|searchText.*identity/i);
  });
});
