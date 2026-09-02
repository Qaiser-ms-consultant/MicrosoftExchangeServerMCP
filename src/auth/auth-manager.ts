import type { AppConfig } from "../config.js";
import { ExchangeError } from "../errors.js";
import { BasicAuthProvider } from "./basic-auth.js";
import { OAuthProvider } from "./oauth-auth.js";
import { CertAuthProvider } from "./cert-auth.js";

export interface AuthProvider {
  getAuthHeader(): Promise<string>;
  getExtraOptions?(): Promise<{ headers?: Record<string, string>; httpsAgent?: unknown }>;
}

export class AuthManager implements AuthProvider {
  private provider: AuthProvider;

  constructor(private config: AppConfig) {
    switch (config.auth.method) {
      case "basic":
        this.provider = new BasicAuthProvider(config.auth.basic ?? { username: "", password: "" });
        break;
      case "oauth":
        this.provider = new OAuthProvider({ ...(config.auth.oauth ?? { authority: "", clientId: "" }), insecure: !!config.exchange.insecure || config.exchange.tls?.rejectUnauthorized === false });
        break;
      case "certificate":
        this.provider = new CertAuthProvider(config.auth.certificate ?? {});
        break;
      default:
        throw new ExchangeError({ message: `Unknown auth method: ${config.auth.method}`, code: "VALIDATION_ERROR" });
    }
  }

  getAuthHeader(): Promise<string> {
    // Lazy validation so server can start without credentials (fails on tool call)
    if (this.config.auth.method === "basic" && (!this.config.auth.basic?.username || !this.config.auth.basic?.password)) {
      throw new ExchangeError({ message: "Basic auth requires username and password (set via config.yaml or EXCHANGE_PASSWORD env)", code: "AUTH_FAILED" });
    }
    if (this.config.auth.method === "oauth" && (!this.config.auth.oauth?.authority || !this.config.auth.oauth?.clientId)) {
      throw new ExchangeError({ message: "OAuth requires authority and clientId", code: "AUTH_FAILED" });
    }
    if (this.config.auth.method === "certificate" && !this.config.auth.certificate?.pfxPath && !this.config.auth.certificate?.certPath) {
      throw new ExchangeError({ message: "Certificate auth requires pfxPath or certPath", code: "AUTH_FAILED" });
    }
    return this.provider.getAuthHeader();
  }

  async getExtraOptions(): Promise<{ headers?: Record<string, string>; httpsAgent?: unknown }> {
    if (this.provider.getExtraOptions) return this.provider.getExtraOptions();
    return {};
  }
}
