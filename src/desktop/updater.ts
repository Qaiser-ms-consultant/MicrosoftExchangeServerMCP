// Self-update for source-checkout installs (`npm run desktop`).
//
// Users run this app from a git clone, so "updating" is: fast-forward pull,
// `npm install` when dependencies changed, rebuild on next launch. Everything
// git/npm-facing goes through an injectable ExecFn so the flow is unit
// testable; the Electron IPC layer in main.ts stays thin.
import { execFile as execFileCb } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ExecFn = (cmd: string, args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>;
export type NpmFn = (args: string[], cwd: string) => Promise<void>;

const GIT_TIMEOUT_MS = 25000;
const NPM_TIMEOUT_MS = 600000;

function defaultExec(cmd: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileCb(cmd, args, { cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const e = err as any;
        reject(Object.assign(new Error(String(e?.message || err)), { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }));
      } else {
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      }
    });
  });
}

function defaultNpm(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
    execFileCb(cmd, args, { cwd, timeout: NPM_TIMEOUT_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`npm ${args.join(" ")} failed: ${String(stderr || err).slice(0, 500)}`));
      else resolve();
    });
  });
}

export function isGitCheckout(cwd: string): boolean {
  try {
    return existsSync(join(cwd, ".git"));
  } catch {
    return false;
  }
}

export function parseBehindCount(out: string): number {
  const n = parseInt(String(out ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function isDirtyStatus(porcelain: string): boolean {
  return String(porcelain ?? "").trim().length > 0;
}

function readLockfile(cwd: string): string {
  try {
    return readFileSync(join(cwd, "package-lock.json"), "utf-8");
  } catch {
    return "";
  }
}

export interface UpdateStatus {
  ok: boolean;
  current: string;
  latest: string;
  behind: number;
  dirty: boolean;
  error?: string;
}

export async function checkForUpdates(cwd: string, exec: ExecFn = defaultExec): Promise<UpdateStatus> {
  if (!isGitCheckout(cwd)) {
    return { ok: false, current: "", latest: "", behind: 0, dirty: false, error: "Not a git checkout — update by reinstalling." };
  }
  try {
    const current = (await exec("git", ["rev-parse", "HEAD"], cwd)).stdout.trim();
    const dirty = isDirtyStatus((await exec("git", ["status", "--porcelain"], cwd)).stdout);
    await exec("git", ["fetch", "--quiet", "origin"], cwd);
    const behind = parseBehindCount((await exec("git", ["rev-list", "--count", "HEAD..@{u}"], cwd)).stdout);
    const latest = (await exec("git", ["rev-parse", "@{u}"], cwd)).stdout.trim();
    return { ok: true, current, latest, behind, dirty };
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/upstream|no upstream|no such branch/i.test(msg + String(e?.stderr || ""))) {
      return { ok: false, current: "", latest: "", behind: 0, dirty: false, error: "No upstream branch configured for this checkout." };
    }
    return { ok: false, current: "", latest: "", behind: 0, dirty: false, error: `Update check failed: ${msg.slice(0, 300)}` };
  }
}

export interface UpdateResult {
  updated: boolean;
  message: string;
}

export async function performUpdate(cwd: string, exec: ExecFn = defaultExec, runNpm: NpmFn = defaultNpm): Promise<UpdateResult> {
  const status = await checkForUpdates(cwd, exec);
  if (!status.ok) return { updated: false, message: status.error || "Update check failed." };
  if (status.dirty) {
    return { updated: false, message: "Working tree has local changes — commit or stash them before updating. Nothing was changed." };
  }
  if (status.behind === 0) return { updated: false, message: "Already up to date." };
  const lockBefore = readLockfile(cwd);
  try {
    await exec("git", ["pull", "--ff-only"], cwd);
  } catch (e: any) {
    const detail = String((e as any)?.stderr || e?.message || e).slice(0, 300);
    return { updated: false, message: `Pull failed (fast-forward only, nothing merged): ${detail}` };
  }
  if (readLockfile(cwd) !== lockBefore) {
    try {
      await runNpm(["install"], cwd);
    } catch (e: any) {
      return { updated: false, message: `Pulled latest code, but npm install failed: ${String(e?.message || e).slice(0, 300)}. Run npm install manually, then restart.` };
    }
  }
  return { updated: true, message: `Updated: pulled ${status.behind} commit(s). Restart the app to run the new build.` };
}
