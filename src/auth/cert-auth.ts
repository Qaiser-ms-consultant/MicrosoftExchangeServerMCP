import { readFileSync } from "node:fs";
import type { AuthProvider } from "./auth-manager.js";

export class CertAuthProvider implements AuthProvider {
  constructor(
    private opts: { pfxPath?: string; passphrase?: string; certPath?: string; keyPath?: string },
  ) {}

  async getAuthHeader(): Promise<string> {
    // Certificate auth uses mTLS, not a header — return empty and rely on agent
    return "";
  }

  async getExtraOptions(): Promise<{ httpsAgent?: unknown }> {
    const { default: https } = await import("node:https");
    let agent: unknown;
    if (this.opts.pfxPath) {
      const pfx = readFileSync(this.opts.pfxPath);
      agent = new https.Agent({ pfx, passphrase: this.opts.passphrase });
    } else if (this.opts.certPath && this.opts.keyPath) {
      const cert = readFileSync(this.opts.certPath);
      const key = readFileSync(this.opts.keyPath);
      agent = new https.Agent({ cert, key, passphrase: this.opts.passphrase });
    }
    return { httpsAgent: agent };
  }
}
