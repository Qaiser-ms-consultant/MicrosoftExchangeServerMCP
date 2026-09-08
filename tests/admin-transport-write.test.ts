import { describe, expect, it } from "vitest";
import { registerTransportAdminTools } from "../src/tools/admin-transport.js";

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
    invokeJson: async () => [],
    invoke: async (cmd: string) => {
      commands.push(cmd);
      return "";
    },
  };
}

describe("exchange_remove_transport_rule", () => {
  it("removes by identity without prompting", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerTransportAdminTools(server as any, ps as any);
    const res = await server.tools["exchange_remove_transport_rule"]({ identity: "Block Executables" });
    expect(ps.commands).toEqual(['Remove-TransportRule -Identity "Block Executables" -Confirm:$false']);
    expect(res.content[0].text).toContain("Block Executables");
  });
});

describe("exchange_set_transport_rule", () => {
  it("disables by identity via state", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerTransportAdminTools(server as any, ps as any);
    await server.tools["exchange_set_transport_rule"]({ identity: "Block Executables", state: "Disabled" });
    expect(ps.commands).toEqual(['Set-TransportRule -Identity "Block Executables" -State Disabled']);
  });

  it("sets priority when provided", async () => {
    const server = makeServer();
    const ps = psCapturing();
    registerTransportAdminTools(server as any, ps as any);
    await server.tools["exchange_set_transport_rule"]({ identity: "Block Executables", priority: 1 });
    expect(ps.commands).toEqual(['Set-TransportRule -Identity "Block Executables" -Priority 1']);
  });
});
