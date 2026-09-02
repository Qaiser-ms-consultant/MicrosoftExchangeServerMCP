import { describe, it, expect } from "vitest";
import { BasicAuthProvider } from "../src/auth/basic-auth.js";

describe("BasicAuthProvider", () => {
  it("produces Basic header", async () => {
    const p = new BasicAuthProvider({ username: "user", password: "pass" });
    const h = await p.getAuthHeader();
    expect(h).toBe("Basic " + Buffer.from("user:pass").toString("base64"));
  });
  it("includes domain", async () => {
    const p = new BasicAuthProvider({ username: "user", password: "pass", domain: "CONTOSO" });
    const h = await p.getAuthHeader();
    expect(h).toBe("Basic " + Buffer.from("CONTOSO\\user:pass").toString("base64"));
  });
});
