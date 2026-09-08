import { describe, expect, it } from "vitest";
import { resolveDoctorTargets } from "../src/cli/doctor.js";

describe("resolveDoctorTargets", () => {
  it("uses the real config file when present", () => {
    const r = resolveDoctorTargets({
      config: { endpoint: "https://mail.real.local", powershellUri: "https://mail.real.local/PowerShell", ewsPath: "/EWS/Exchange.asmx", insecure: true },
      hasConfigFile: true,
      env: {},
    });
    expect(r).toEqual({
      ok: true,
      source: "config",
      targets: {
        endpoint: "https://mail.real.local",
        powershellUri: "https://mail.real.local/PowerShell",
        ewsPath: "/EWS/Exchange.asmx",
        insecure: true,
      },
    });
  });

  it("lets explicit env override the config file", () => {
    const r = resolveDoctorTargets({
      config: { endpoint: "https://mail.real.local", powershellUri: "https://mail.real.local/PowerShell", ewsPath: "/EWS/Exchange.asmx", insecure: false },
      hasConfigFile: true,
      env: { EXCHANGE_ENDPOINT: "https://other.local", EXCHANGE_INSECURE: "true" },
    });
    expect(r).toEqual({
      ok: true,
      source: "env",
      targets: {
        endpoint: "https://other.local",
        powershellUri: "https://other.local/PowerShell",
        ewsPath: "/EWS/Exchange.asmx",
        insecure: true,
      },
    });
  });

  it("refuses placeholder probing with guidance instead", () => {
    const r = resolveDoctorTargets({ config: null, hasConfigFile: false, env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/init/);
  });
});
