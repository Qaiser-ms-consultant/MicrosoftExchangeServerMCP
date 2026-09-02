import type { AppConfig } from "../config.js";

export function isInsecure(config: AppConfig): boolean {
  return !!config.exchange.insecure || config.exchange.tls?.rejectUnauthorized === false || config.exchange.tls?.allowSelfSigned === true;
}

export async function getHttpsAgent(config: AppConfig, extraAgent?: unknown): Promise<unknown | undefined> {
  if (!isInsecure(config) && !extraAgent) return undefined;
  const https = await import("node:https");
  if (!isInsecure(config)) return extraAgent;

  // insecure: create agent with rejectUnauthorized:false, preserving cert/pfx if present
  const baseOpts = (extraAgent as any)?.options ?? {};
  const opts: Record<string, unknown> = {
    rejectUnauthorized: false,
    ...((baseOpts.pfx ? { pfx: baseOpts.pfx, passphrase: baseOpts.passphrase } : {}) as any),
    ...((baseOpts.cert ? { cert: baseOpts.cert, key: baseOpts.key, passphrase: baseOpts.passphrase } : {}) as any),
  };
  // if extraAgent has no options but is an agent with certs, preserve them via spread attempt
  // fallback: if no base opts, just insecure
  return new https.Agent(opts);
}
