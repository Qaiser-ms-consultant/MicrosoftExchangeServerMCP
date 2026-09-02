import axios from "axios";
import type { AuthProvider } from "./auth-manager.js";
import { ExchangeError } from "../errors.js";

interface OAuthOpts {
  authority: string;
  clientId: string;
  clientSecret?: string;
  tenantId?: string;
  scope?: string;
}

export class OAuthProvider implements AuthProvider {
  private cachedToken?: { token: string; expiresAt: number };

  constructor(private opts: OAuthOpts & { insecure?: boolean }) {}

  async getAuthHeader(): Promise<string> {
    const token = await this.getToken();
    return `Bearer ${token}`;
  }

  private async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.token;
    }
    const url = `${this.opts.authority.replace(/\/$/, "")}/oauth2/v2.0/token`;
    const scope = this.opts.scope ?? "https://outlook.office365.com/.default";
    const params = new URLSearchParams();
    params.set("client_id", this.opts.clientId);
    params.set("scope", scope);
    params.set("grant_type", "client_credentials");
    if (this.opts.clientSecret) params.set("client_secret", this.opts.clientSecret);

    try {
      let httpsAgent: unknown;
      if ((this.opts as any).insecure) {
        const https = await import("node:https");
        httpsAgent = new https.Agent({ rejectUnauthorized: false });
      }
      const res = await axios.post(url, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        // @ts-ignore
        httpsAgent,
        validateStatus: () => true,
      });
      if ((res as any).status >= 400) throw new Error(`OAuth ${ (res as any).status}: ${JSON.stringify((res as any).data).slice(0,300)}`);
      const data = res.data as { access_token: string; expires_in: number };
      this.cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
      return data.access_token;
    } catch (err: any) {
      throw new ExchangeError({
        message: `OAuth token acquisition failed: ${err.response?.data?.error_description ?? err.message}`,
        code: "AUTH_FAILED",
        cause: err,
      });
    }
  }
}
