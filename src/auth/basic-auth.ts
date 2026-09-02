import type { AuthProvider } from "./auth-manager.js";

export class BasicAuthProvider implements AuthProvider {
  constructor(private opts: { username: string; password: string; domain?: string }) {}

  async getAuthHeader(): Promise<string> {
    const user = this.opts.domain ? `${this.opts.domain}\\${this.opts.username}` : this.opts.username;
    const token = Buffer.from(`${user}:${this.opts.password}`).toString("base64");
    return `Basic ${token}`;
  }
}
