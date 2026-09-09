// App-launch MFA gate (TOTP app lock) — pure + testable.
// No Electron imports here: persistence + OS-keychain encryption live in
// main.ts; this module owns the crypto, throttling, and state transitions.
// TOTP is implemented directly on node:crypto and verified against the
// RFC 6238 Appendix B vectors (see tests/appLock.test.ts).

import { createHash, createHmac, randomBytes } from "node:crypto";

export interface TotpOptions {
  atMs?: number;
  digits?: 6 | 8;
  periodSec?: number;
}

export interface ThrottleState {
  failedAttempts: number;
  lockoutUntil: number; // epoch ms, 0 = none
}

export interface PinStored {
  salt: string;
  hash: string;
}

export interface Enrollment {
  secretBase32: string;
  otpauthUrl: string;
  recoveryCodes: string[];
  recoveryHashes: string[];
}

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(raw: Buffer | Uint8Array): string {
  const bytes = Buffer.from(raw);
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const s = String(input ?? "").trim().replace(/[\s=]+/g, "").toUpperCase();
  if (!s || !/^[A-Z2-7]+$/.test(s)) throw new Error("Invalid base32 secret");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of s) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(key: Buffer, counter: bigint, digits: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const mac = createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

/** Current TOTP code for a base32 secret (throws on malformed secret). */
export function generateTotp(secretBase32: string, opts: TotpOptions = {}): string {
  const { atMs = Date.now(), digits = 6, periodSec = 30 } = opts;
  const key = base32Decode(secretBase32);
  const counter = BigInt(Math.floor(Math.floor(atMs / 1000) / periodSec));
  return hotp(key, counter, digits);
}

/** Verify with a ±1 step clock-skew window. Never throws. */
export function verifyTotp(secretBase32: string, token: string, opts: TotpOptions = {}): boolean {
  // Accept spaces/dashes users add for readability ("123 456") — the input
  // placeholder itself suggests a spaced format, so normalize before check.
  const t = String(token ?? "").replace(/[\s-]+/g, "");
  const digits = opts.digits ?? 6;
  if (!/^\d+$/.test(t) || t.length !== digits) return false;
  try {
    const { atMs = Date.now(), periodSec = 30 } = opts;
    const key = base32Decode(secretBase32);
    const center = Math.floor(Math.floor(atMs / 1000) / periodSec);
    for (const step of [-1, 0, 1]) {
      if (center + step < 0) continue;
      if (hotp(key, BigInt(center + step), digits) === t) return true;
    }
    return false;
  } catch {
    return false;
  }
}

const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // unambiguous

function randomCode(chars: number): string {
  const buf = randomBytes(chars);
  let out = "";
  for (const b of buf) out += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function hashRecoveryCode(code: string): string {
  // Strip whitespace only — issued codes contain dashes ("XXXX-XXXX") and
  // their stored hashes were computed with dashes intact.
  return createHash("sha256").update(`applock-recovery:${String(code).replace(/\s+/g, "").toUpperCase()}`).digest("hex");
}

export function generateEnrollment(label = "exchange-desktop"): Enrollment {
  const secretBase32 = base32Encode(randomBytes(20));
  const account = encodeURIComponent(label);
  const otpauthUrl =
    `otpauth://totp/ExchangeAgenticAdmin:${account}` +
    `?secret=${secretBase32}&issuer=ExchangeAgenticAdmin&algorithm=SHA1&digits=6&period=30`;
  const recoveryCodes = Array.from({ length: 10 }, () => randomCode(8));
  return { secretBase32, otpauthUrl, recoveryCodes, recoveryHashes: recoveryCodes.map(hashRecoveryCode) };
}

/** Consume a recovery code exactly once. */
export function consumeRecoveryCode(
  hashes: string[],
  code: string,
): { ok: boolean; remaining: string[] } {
  const h = hashRecoveryCode(code);
  const idx = hashes.indexOf(h);
  if (idx < 0) return { ok: false, remaining: hashes };
  return { ok: true, remaining: [...hashes.slice(0, idx), ...hashes.slice(idx + 1)] };
}

const MAX_FREE_ATTEMPTS = 5;
const MAX_LOCKOUT_MS = 3_600_000;

export function recordFailure(state: ThrottleState, nowMs: number): ThrottleState {
  const failedAttempts = state.failedAttempts + 1;
  let lockoutUntil = state.lockoutUntil;
  if (failedAttempts >= MAX_FREE_ATTEMPTS) {
    const backoff = Math.min(30_000 * 2 ** (failedAttempts - MAX_FREE_ATTEMPTS), MAX_LOCKOUT_MS);
    lockoutUntil = nowMs + backoff;
  }
  return { failedAttempts, lockoutUntil };
}

export function resetFailures(): ThrottleState {
  return { failedAttempts: 0, lockoutUntil: 0 };
}

export function isLockedOut(state: ThrottleState, nowMs: number): { locked: boolean; retryAfterMs: number } {
  if (state.lockoutUntil > nowMs) return { locked: true, retryAfterMs: state.lockoutUntil - nowMs };
  return { locked: false, retryAfterMs: 0 };
}

export function hashPin(pin: string): PinStored {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`applock-pin:${salt}:${pin}`).digest("hex");
  return { salt, hash };
}

export function verifyPin(pin: string, stored: PinStored | undefined): boolean {
  if (!stored || !pin) return false;
  const hash = createHash("sha256").update(`applock-pin:${stored.salt}:${pin}`).digest("hex");
  return hash === stored.hash;
}
