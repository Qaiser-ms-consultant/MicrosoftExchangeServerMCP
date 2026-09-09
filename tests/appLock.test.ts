import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  consumeRecoveryCode,
  generateEnrollment,
  generateTotp,
  hashPin,
  hashRecoveryCode,
  isLockedOut,
  recordFailure,
  resetFailures,
  verifyPin,
  verifyTotp,
} from "../src/desktop/appLock.js";

// RFC 6238 Appendix B, SHA-1, secret "12345678901234567890" (ASCII).
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const RFC_VECTORS: Array<[number, string]> = [
  [59_000, "94287082"],
  [1_111_111_109_000, "07081804"],
  [1_111_111_111_000, "14050471"],
  [1_234_567_890_000, "89005924"],
  [2_000_000_000_000, "69279037"],
  [20_000_000_000_000, "65353130"],
];

describe("base32", () => {
  it("round-trips binary secrets", () => {
    const raw = Buffer.from("12345678901234567890", "ascii");
    expect(base32Decode(base32Encode(raw))).toEqual(raw);
    expect(base32Encode(raw)).toBe(RFC_SECRET_B32);
  });
});

describe("TOTP (RFC 6238 vectors, 8 digits)", () => {
  for (const [ms, expected] of RFC_VECTORS) {
    it(`matches vector at T=${ms / 1000}`, () => {
      expect(generateTotp(RFC_SECRET_B32, { atMs: ms, digits: 8 })).toBe(expected);
    });
  }
  it("zero-pads short codes", () => {
    expect(generateTotp(RFC_SECRET_B32, { atMs: 1_111_111_109_000, digits: 8 })).toHaveLength(8);
    expect(generateTotp(RFC_SECRET_B32, { atMs: 1_111_111_109_000, digits: 6 })).toHaveLength(6);
  });
});

describe("verifyTotp", () => {
  it("accepts the current code and ±1 step skew", () => {
    expect(verifyTotp(RFC_SECRET_B32, "94287082", { atMs: 59_000, digits: 8 })).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, "94287082", { atMs: 59_000 + 30_000, digits: 8 })).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, "94287082", { atMs: 59_000 - 30_000, digits: 8 })).toBe(true);
  });
  it("rejects wrong codes and far-apart windows", () => {
    expect(verifyTotp(RFC_SECRET_B32, "00000000", { atMs: 59_000, digits: 8 })).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, "94287082", { atMs: 59_000 + 120_000, digits: 8 })).toBe(false);
  });
  it("rejects malformed input without throwing", () => {
    expect(verifyTotp("!!!", "123456")).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, "12")).toBe(false);
  });
});

describe("enrollment", () => {
  it("generates a secret, otpauth URL, and 10 single-use recovery codes", () => {
    const e = generateEnrollment("admin@contoso.com");
    expect(e.secretBase32.length).toBeGreaterThanOrEqual(26);
    expect(e.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(e.otpauthUrl).toContain(encodeURIComponent("admin@contoso.com"));
    expect(e.recoveryCodes).toHaveLength(10);
    expect(new Set(e.recoveryCodes).size).toBe(10);
    expect(e.recoveryHashes).toHaveLength(10);
    // Hashes verify against the plaintext codes
    for (let i = 0; i < 10; i++) {
      expect(hashRecoveryCode(e.recoveryCodes[i])).toBe(e.recoveryHashes[i]);
    }
  });
});

describe("recovery codes", () => {
  it("consumes a valid code exactly once", () => {
    const e = generateEnrollment();
    const code = e.recoveryCodes[3];
    const first = consumeRecoveryCode(e.recoveryHashes, code);
    expect(first.ok).toBe(true);
    expect(first.remaining).toHaveLength(9);
    const second = consumeRecoveryCode(first.remaining, code);
    expect(second.ok).toBe(false);
    expect(consumeRecoveryCode(e.recoveryHashes, "WRONG-CODE").ok).toBe(false);
  });
});

describe("throttling", () => {
  it("locks out after 5 failures with escalating backoff", () => {
    let s = { failedAttempts: 0, lockoutUntil: 0 };
    for (let i = 0; i < 4; i++) {
      s = recordFailure(s, 1_000);
      expect(isLockedOut(s, 1_000).locked).toBe(false);
    }
    s = recordFailure(s, 1_000);
    const first = isLockedOut(s, 1_000);
    expect(first.locked).toBe(true);
    expect(first.retryAfterMs).toBe(30_000);
    // Escalates on further failures
    const s2 = recordFailure({ failedAttempts: 8, lockoutUntil: 0 }, 1_000);
    expect(isLockedOut(s2, 1_000).retryAfterMs).toBeGreaterThan(30_000);
    // Expires
    expect(isLockedOut(s, 1_000 + 31_000).locked).toBe(false);
    // Success resets
    expect(resetFailures()).toEqual({ failedAttempts: 0, lockoutUntil: 0 });
  });
});

describe("PIN", () => {
  it("hashes and verifies, rejects wrong PIN", () => {
    const stored = hashPin("4821");
    expect(verifyPin("4821", stored)).toBe(true);
    expect(verifyPin("0000", stored)).toBe(false);
    expect(verifyPin("", stored)).toBe(false);
  });
});
