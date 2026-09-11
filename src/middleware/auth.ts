import { Request, Response, NextFunction } from "express";
import type { AppConfig } from "../config.js";

export interface HttpAuthConfig {
  enabled: boolean;
  method: "apikey" | "bearer" | "basic" | "none" | ("apikey" | "bearer" | "basic" | "none")[];
  apiKeys: string[];
  bearerTokens: string[];
  basicAuth?: { username: string; password: string };
  allowlist: string[];
  denylist: string[];
  rateLimit: { windowMs: number; maxRequests: number };
  protectHealth: boolean;
}

const ipCache = new Map<string, { count: number; resetTime: number }>();

function parseCIDR(cidr: string): { ip: string; mask: number } | null {
  const [ip, maskStr] = cidr.split("/");
  const mask = maskStr ? parseInt(maskStr, 10) : 32;
  if (isNaN(mask) || mask < 0 || mask > 32) return null;
  return { ip, mask };
}

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function matchCIDR(clientIP: string, cidr: string): boolean {
  const parsed = parseCIDR(cidr);
  if (!parsed) return false;
  const clientInt = ipToInt(clientIP);
  const targetInt = ipToInt(parsed.ip);
  const mask = parsed.mask === 0 ? 0 : ~((1 << (32 - parsed.mask)) - 1);
  return (clientInt & mask) === (targetInt & mask);
}

function checkIPAllowlist(clientIP: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some((cidr) => matchCIDR(clientIP, cidr));
}

function checkIPDenylist(clientIP: string, denylist: string[]): boolean {
  if (denylist.length === 0) return false;
  return denylist.some((cidr) => matchCIDR(clientIP, cidr));
}

function getClientIP(req: Request): string {
  return (
    req.ip ||
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function checkRateLimit(clientIP: string, windowMs: number, maxRequests: number): boolean {
  const now = Date.now();
  const entry = ipCache.get(clientIP);
  if (!entry || now > entry.resetTime) {
    ipCache.set(clientIP, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count++;
  return true;
}

function parseAuthHeader(authHeader: string | undefined): { type: string; credentials: string } | null {
  if (!authHeader) return null;
  const [type, ...rest] = authHeader.trim().split(/\s+/);
  return { type: type.toLowerCase(), credentials: rest.join(" ") };
}

function verifyApiKey(credentials: string, validKeys: string[]): boolean {
  return validKeys.includes(credentials);
}

function verifyBearerToken(credentials: string, validTokens: string[]): boolean {
  return validTokens.includes(credentials);
}

function verifyBasicAuth(credentials: string, expected: { username: string; password: string }): boolean {
  try {
    const decoded = Buffer.from(credentials, "base64").toString("utf-8");
    const [username, password] = decoded.split(":");
    return username === expected.username && password === expected.password;
  } catch {
    return false;
  }
}

function sendUnauthorized(res: Response, methods: string[]): void {
  const wwwAuth = methods.map((m) => {
    switch (m) {
      case "apikey":
        return 'ApiKey realm="MCP"';
      case "bearer":
        return 'Bearer realm="MCP"';
      case "basic":
        return 'Basic realm="MCP"';
      default:
        return "";
    }
  }).join(", ");
  res.setHeader("WWW-Authenticate", wwwAuth);
  res.status(401).json({ error: "Unauthorized", message: "Valid authentication required" });
}

function sendForbidden(res: Response, message: string): void {
  res.status(403).json({ error: "Forbidden", message });
}

function sendRateLimited(res: Response, windowMs: number): void {
  res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
  res.status(429).json({ error: "Too Many Requests", message: "Rate limit exceeded" });
}

export function createAuthMiddleware(config: AppConfig) {
  const httpAuth = config.server.httpAuth as HttpAuthConfig;
  const methods = Array.isArray(httpAuth.method) ? httpAuth.method : [httpAuth.method];

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip auth if disabled
    if (!httpAuth.enabled) {
      return next();
    }

    // Skip auth for health endpoint if not protected
    if (req.path === "/health" && !httpAuth.protectHealth) {
      return next();
    }

    const clientIP = getClientIP(req);

    // Check IP denylist
    if (checkIPDenylist(clientIP, httpAuth.denylist)) {
      console.error(`[HTTP Auth] Denied IP: ${clientIP} ${req.method} ${req.path}`);
      return sendForbidden(res, "Access denied from this IP");
    }

    // Check IP allowlist
    if (!checkIPAllowlist(clientIP, httpAuth.allowlist)) {
      console.error(`[HTTP Auth] IP not in allowlist: ${clientIP} ${req.method} ${req.path}`);
      return sendForbidden(res, "IP not authorized");
    }

    // Check rate limit
    if (!checkRateLimit(clientIP, httpAuth.rateLimit.windowMs, httpAuth.rateLimit.maxRequests)) {
      console.error(`[HTTP Auth] Rate limited: ${clientIP} ${req.method} ${req.path}`);
      return sendRateLimited(res, httpAuth.rateLimit.windowMs);
    }

    // Check authentication
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers["x-api-key"] as string | undefined;
    const parsed = parseAuthHeader(authHeader);

    let authenticated = false;

    for (const method of methods) {
      switch (method) {
        case "apikey": {
          const key = apiKeyHeader || (parsed?.type === "apikey" ? parsed.credentials : null);
          if (key && verifyApiKey(key, httpAuth.apiKeys)) {
            authenticated = true;
          }
          break;
        }
        case "bearer": {
          if (parsed?.type === "bearer" && verifyBearerToken(parsed.credentials, httpAuth.bearerTokens)) {
            authenticated = true;
          }
          break;
        }
        case "basic": {
          if (parsed?.type === "basic" && httpAuth.basicAuth && verifyBasicAuth(parsed.credentials, httpAuth.basicAuth)) {
            authenticated = true;
          }
          break;
        }
        case "none": {
          authenticated = true;
          break;
        }
      }
      if (authenticated) break;
    }

    if (!authenticated) {
      console.error(`[HTTP Auth] Failed auth: ${clientIP} ${req.method} ${req.path} (methods: ${methods.join(", ")})`);
      return sendUnauthorized(res, methods);
    }

    console.error(`[HTTP Auth] Success: ${clientIP} ${req.method} ${req.path}`);
    next();
  };
}