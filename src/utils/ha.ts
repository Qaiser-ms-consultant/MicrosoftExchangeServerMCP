import type { AppConfig } from "../config.js";

type Health = { url: string; healthy: boolean; lastCheck: number; fails: number };

const healthMap = new Map<string, Health>();
let rrIndex = 0;

export function getHAServers(config: AppConfig): string[] {
  if (config.exchange.servers?.length) return config.exchange.servers;
  // Single-server mode — use powershellUri as the one entry for HA logic
  return [config.exchange.powershellUri];
}

function isRetryableError(msg: string): boolean {
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|Timeout|timeout|WRM/i.test(msg) || msg.includes("WinRM invoke failed");
}

export async function withHA<T>(
  config: AppConfig,
  action: (url: string) => Promise<T>,
  opts?: { isRetryable?: (err: unknown) => boolean },
): Promise<T> {
  const servers = getHAServers(config);
  const strategy = config.exchange.ha?.strategy ?? "failover";
  const retryCount = config.exchange.ha?.retryCount ?? 2;

  // Order: failover = health-first, round_robin = rotate
  let ordered: string[];
  if (strategy === "round_robin") {
    ordered = [...servers];
    // rotate
    const idx = rrIndex++ % servers.length;
    ordered = [...servers.slice(idx), ...servers.slice(0, idx)];
  } else {
    // failover: healthy first, then by fails
    ordered = [...servers].sort((a, b) => {
      const ha = healthMap.get(a);
      const hb = healthMap.get(b);
      if (!ha && !hb) return 0;
      if (!ha) return -1;
      if (!hb) return 1;
      if (ha.healthy !== hb.healthy) return ha.healthy ? -1 : 1;
      return ha.fails - hb.fails;
    });
  }

  let lastErr: unknown;
  for (let i = 0; i < Math.min(ordered.length, retryCount + 1); i++) {
    const url = ordered[i];
    try {
      const res = await action(url);
      // Mark healthy
      healthMap.set(url, { url, healthy: true, lastCheck: Date.now(), fails: 0 });
      if (i > 0) console.error(`HA failover: ${servers[0]} → ${url} succeeded (smart retry)`);
      return res;
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message ?? String(err);
      const retryable = opts?.isRetryable ? opts.isRetryable(err) : isRetryableError(msg) || err?.code === "SERVER_ERROR" || err?.code === "NOT_FOUND";
      healthMap.set(url, { url, healthy: false, lastCheck: Date.now(), fails: (healthMap.get(url)?.fails ?? 0) + 1 });
      console.error(`HA: ${url} failed (${err?.code ?? "error"}): ${msg.slice(0, 180)}${i + 1 < ordered.length && retryable ? " → trying next" : ""}`);
      if (!retryable || i === ordered.length - 1) throw err;
      // brief backoff
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

export function getHAStatus() {
  return { servers: Array.from(healthMap.values()), rrIndex };
}
