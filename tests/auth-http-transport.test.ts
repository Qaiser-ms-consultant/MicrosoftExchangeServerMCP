import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { createAuthMiddleware } from "../src/middleware/auth.js";
import type { AppConfig } from "../src/config.js";

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: "192.168.1.100",
    path: "/sse",
    method: "GET",
    headers: {},
    socket: { remoteAddress: "192.168.1.100" },
    ...overrides,
  } as Request;
}

function createMockRes(): Response {
  const res: Partial<Response> = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this as Response;
    },
    json(data: any) {
      this.body = data;
      return this as Response;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this as Response;
    },
    getHeader(name: string) {
      return this.headers[name];
    },
  };
  return res as Response;
}

function createMockNext(): NextFunction {
  return vi.fn();
}

function createTestConfig(overrides: Partial<AppConfig["server"]["httpAuth"]> = {}): AppConfig {
  return {
    exchange: {
      endpoint: "https://test.local",
      version: "auto",
      provider: "auto",
      ewsPath: "/EWS/Exchange.asmx",
      restPath: "/api/v2.0",
      powershellUri: "https://test.local/PowerShell",
      insecure: false,
      tls: { rejectUnauthorized: true },
    },
    auth: { method: "basic" },
    server: {
      transport: "http",
      port: 3000,
      host: "0.0.0.0",
      httpAuth: {
        enabled: true,
        method: "apikey",
        apiKeys: ["test-key-1", "test-key-2"],
        bearerTokens: ["test-token-1", "test-token-2"],
        basicAuth: { username: "admin", password: "secret" },
        allowlist: [],
        denylist: [],
        rateLimit: { windowMs: 60000, maxRequests: 100 },
        protectHealth: false,
        ...overrides,
      },
    },
    logging: { level: "info", file: "" },
  };
}

describe("HTTP Auth Middleware", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  describe("IP Allowlist/Denylist", () => {
    it("should allow request when allowlist is empty", async () => {
      const config = createTestConfig({ allowlist: [], enabled: false });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ ip: "10.0.0.1" });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should allow request when IP matches allowlist", async () => {
      const config = createTestConfig({ allowlist: ["192.168.1.0/24", "10.0.0.5"], enabled: false });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ ip: "192.168.1.50" });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should deny request when IP not in allowlist", async () => {
      const config = createTestConfig({ allowlist: ["192.168.1.0/24"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ ip: "10.0.0.1" });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: "Forbidden", message: "IP not authorized" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should deny request when IP in denylist", async () => {
      const config = createTestConfig({ denylist: ["192.168.1.100"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ ip: "192.168.1.100" });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: "Forbidden", message: "Access denied from this IP" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should deny when IP in both allowlist and denylist (denylist wins)", async () => {
      const config = createTestConfig({ allowlist: ["192.168.1.0/24"], denylist: ["192.168.1.100"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ ip: "192.168.1.100" });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: "Forbidden", message: "Access denied from this IP" });
    });
  });

  describe("Rate Limiting", () => {
    it("should allow requests under rate limit", async () => {
      const config = createTestConfig({ rateLimit: { windowMs: 60000, maxRequests: 5 }, method: "none" });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ ip: "192.168.1.200" });
      const res = createMockRes();
      const next = createMockNext();

      for (let i = 0; i < 5; i++) {
        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(i + 1);
      }
    });

    it("should block requests exceeding rate limit", async () => {
      const config = createTestConfig({ rateLimit: { windowMs: 60000, maxRequests: 2 }, method: "none" });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ ip: "192.168.1.201" });
      const next = createMockNext();

      // Request 1
      let res = createMockRes();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Request 2
      res = createMockRes();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);

      // Request 3 - should be blocked
      res = createMockRes();
      middleware(req, res, next);
      expect(res.statusCode).toBe(429);
      expect(res.body).toEqual({ error: "Too Many Requests", message: "Rate limit exceeded" });
    });

    it("should reset rate limit after window expires", async () => {
      const config = createTestConfig({ rateLimit: { windowMs: 60000, maxRequests: 1 }, method: "none" });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ ip: "192.168.1.202" });
      const next = createMockNext();

      // Request 1
      let res = createMockRes();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Request 2 - blocked
      res = createMockRes();
      middleware(req, res, next);
      expect(res.statusCode).toBe(429);

      vi.advanceTimersByTime(61000); // advance past window

      // Request 3 - should work now
      const res2 = createMockRes();
      const next2 = createMockNext();
      middleware(req, res2, next2);
      expect(next2).toHaveBeenCalledTimes(1);
    });
  });

  describe("API Key Authentication", () => {
    it("should authenticate with valid API key in X-API-Key header", async () => {
      const config = createTestConfig({ method: "apikey", apiKeys: ["valid-key"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ headers: { "x-api-key": "valid-key" } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should authenticate with valid API key in Authorization header", async () => {
      const config = createTestConfig({ method: "apikey", apiKeys: ["valid-key"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ headers: { authorization: "ApiKey valid-key" } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should reject invalid API key", async () => {
      const config = createTestConfig({ method: "apikey", apiKeys: ["valid-key"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ headers: { "x-api-key": "invalid-key" } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized", message: "Valid authentication required" });
      expect(res.getHeader("WWW-Authenticate")).toContain("ApiKey");
    });

    it("should reject missing API key", async () => {
      const config = createTestConfig({ method: "apikey", apiKeys: ["valid-key"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ headers: {} });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(401);
    });
  });

  describe("Bearer Token Authentication", () => {
    it("should authenticate with valid bearer token", async () => {
      const config = createTestConfig({ method: "bearer", bearerTokens: ["valid-token"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ headers: { authorization: "Bearer valid-token" } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should reject invalid bearer token", async () => {
      const config = createTestConfig({ method: "bearer", bearerTokens: ["valid-token"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ headers: { authorization: "Bearer invalid-token" } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.getHeader("WWW-Authenticate")).toContain("Bearer");
    });
  });

  describe("Basic Authentication", () => {
    it("should authenticate with valid basic auth", async () => {
      const config = createTestConfig({ method: "basic", basicAuth: { username: "admin", password: "secret" } });
      const middleware = createAuthMiddleware(config);
      const credentials = Buffer.from("admin:secret").toString("base64");
      const req = createMockReq({ headers: { authorization: `Basic ${credentials}` } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should reject invalid basic auth", async () => {
      const config = createTestConfig({ method: "basic", basicAuth: { username: "admin", password: "secret" } });
      const middleware = createAuthMiddleware(config);
      const credentials = Buffer.from("admin:wrong").toString("base64");
      const req = createMockReq({ headers: { authorization: `Basic ${credentials}` } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.getHeader("WWW-Authenticate")).toContain("Basic");
    });
  });

  describe("Multiple Auth Methods", () => {
    it("should try methods in order and succeed on first valid", async () => {
      const config = createTestConfig({ method: ["apikey", "bearer"], apiKeys: ["key1"], bearerTokens: ["token1"] });
      const middleware = createAuthMiddleware(config);

      // First request with API key
      let req = createMockReq({ headers: { "x-api-key": "key1" } });
      let res = createMockRes();
      let next = createMockNext();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();

      // Second request with bearer token
      req = createMockReq({ headers: { authorization: "Bearer token1" } });
      res = createMockRes();
      next = createMockNext();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should fail when no method matches", async () => {
      const config = createTestConfig({ method: ["apikey", "bearer"], apiKeys: ["key1"], bearerTokens: ["token1"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ headers: { "x-api-key": "wrong", authorization: "Bearer wrong" } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(401);
    });
  });

  describe("Health Endpoint Protection", () => {
    it("should allow health check without auth when protectHealth=false", async () => {
      const config = createTestConfig({ protectHealth: false, method: "apikey", apiKeys: ["key1"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ path: "/health" });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should require auth for health check when protectHealth=true", async () => {
      const config = createTestConfig({ protectHealth: true, method: "apikey", apiKeys: ["key1"] });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ path: "/health" });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(401);
    });
  });

  describe("Auth Disabled", () => {
    it("should allow all requests when auth disabled", async () => {
      const config = createTestConfig({ enabled: false });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({ ip: "10.0.0.1" });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("X-Forwarded-For Support", () => {
    it("should use X-Forwarded-For header for client IP", async () => {
      const config = createTestConfig({ allowlist: ["203.0.113.0/24"], enabled: false });
      const middleware = createAuthMiddleware(config);
      const req = createMockReq({
        ip: "192.168.1.1", // local proxy IP
        headers: { "x-forwarded-for": "203.0.113.50, 198.51.100.1" },
      });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});