// Self-update for source-checkout installs (`npm run desktop`).
//
// Users run this app from a git clone, so "updating" is: fast-forward pull,
// `npm install` when dependencies changed, rebuild on next launch. Everything
// git/npm-facing goes through an injectable ExecFn so the flow is unit
// testable; the Electron IPC layer in main.ts stays thin.
import { execFile as execFileCb } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

// ---- ZIP installs (no .git): sync to the latest GitHub ZIP instead ----

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export function repoRef(): RepoRef {
  const [owner, repo] = (process.env.EXCHANGE_UPDATER_REPO || "Qaiser-ms-consultant/MicrosoftExchangeServerMCP").split("/");
  return { owner, repo, branch: process.env.EXCHANGE_UPDATER_BRANCH || "master" };
}

export type FetchJsonFn = (url: string) => Promise<any>;
export type DownloadFn = (url: string, destPath: string) => Promise<void>;
export type ExtractFn = (zipPath: string, destDir: string) => Promise<void>;

export interface RemoteHead {
  sha: string;
  date: string;
}

function defaultFetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  return fetch(url, {
    headers: { "User-Agent": "exchange-desktop-updater", Accept: "application/vnd.github+json" },
    signal: ctrl.signal,
  })
    .then(async (res) => {
      clearTimeout(timer);
      if (!res.ok) throw new Error(`GitHub API ${res.status} (rate limited?)`);
      return res.json();
    })
    .catch((e: any) => {
      clearTimeout(timer);
      throw e instanceof Error ? e : new Error(String(e));
    });
}

export async function fetchRemoteHead(owner: string, repo: string, branch: string, fetchJson: FetchJsonFn = defaultFetchJson): Promise<RemoteHead> {
  const j = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`);
  const sha = String(j?.sha || "");
  const date = String(j?.commit?.committer?.date || j?.commit?.author?.date || "");
  if (!sha) throw new Error("GitHub API returned no commit");
  return { sha, date };
}

export interface ZipUpdateStatus {
  ok: boolean;
  kind: "zip";
  behind: boolean | null;
  latest: string;
  date: string;
  error?: string;
}

const META_FILE = ".update-meta.json";

function readMeta(cwd: string): { sha: string; appliedAt: string } | null {
  try {
    const m = JSON.parse(readFileSync(join(cwd, META_FILE), "utf-8"));
    return typeof m?.sha === "string" ? m : null;
  } catch {
    return null;
  }
}

export async function checkZipUpdate(cwd: string, deps: { fetchJson?: FetchJsonFn } = {}): Promise<ZipUpdateStatus> {
  const ref = repoRef();
  try {
    const head = await fetchRemoteHead(ref.owner, ref.repo, ref.branch, deps.fetchJson);
    const meta = readMeta(cwd);
    return { ok: true, kind: "zip", behind: meta ? meta.sha !== head.sha : null, latest: head.sha, date: head.date };
  } catch (e: any) {
    return { ok: false, kind: "zip", behind: null, latest: "", date: "", error: `Update check failed: ${String(e?.message || e).slice(0, 200)}` };
  }
}

function defaultDownloadZip(url: string, destPath: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300000);
  return fetch(url, { headers: { "User-Agent": "exchange-desktop-updater" }, signal: ctrl.signal })
    .then(async (res) => {
      if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
      writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
      clearTimeout(timer);
    })
    .catch((e: any) => {
      clearTimeout(timer);
      throw e instanceof Error ? e : new Error(String(e));
    });
}

function defaultExtractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (err: any) => {
      if (err) reject(new Error(`Extract failed: ${String((err as any)?.message || err).slice(0, 200)}`));
      else resolve();
    };
    if (process.platform === "win32") {
      const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
      execFileCb("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath ${q(zipPath)} -DestinationPath ${q(destDir)} -Force`], { timeout: 120000, windowsHide: true }, done);
    } else {
      execFileCb("unzip", ["-o", "-q", zipPath, "-d", destDir], { timeout: 120000 }, done);
    }
  });
}

// Local files that must survive an overlay (never shipped in the ZIP).
const PRESERVED_FILES = ["config.yaml", "config.yml", "config.json", "config.local.yaml", ".env"];

export interface ZipDeps {
  fetchJson?: FetchJsonFn;
  downloadZip?: DownloadFn;
  extractZip?: ExtractFn;
  runNpm?: NpmFn;
}

export async function performZipUpdate(cwd: string, deps: ZipDeps = {}): Promise<UpdateResult> {
  const { fetchJson = defaultFetchJson, downloadZip = defaultDownloadZip, extractZip = defaultExtractZip, runNpm = defaultNpm } = deps;
  const ref = repoRef();
  let head: RemoteHead;
  try {
    head = await fetchRemoteHead(ref.owner, ref.repo, ref.branch, fetchJson);
  } catch (e: any) {
    return { updated: false, message: `Update check failed: ${String(e?.message || e).slice(0, 200)}` };
  }
  const tmp = mkdtempSync(join(tmpdir(), "exch-zip-"));
  const cleanup = () => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  };
  try {
    const zipPath = join(tmp, "update.zip");
    try {
      await downloadZip(`https://codeload.github.com/${ref.owner}/${ref.repo}/zip/refs/heads/${ref.branch}`, zipPath);
    } catch (e: any) {
      return { updated: false, message: `Download failed: ${String(e?.message || e).slice(0, 200)}. Check connectivity and retry.` };
    }
    const outDir = join(tmp, "unpacked");
    mkdirSync(outDir, { recursive: true });
    try {
      await extractZip(zipPath, outDir);
    } catch (e: any) {
      return { updated: false, message: `Extract failed: ${String(e?.message || e).slice(0, 200)}` };
    }
    const names = readdirSync(outDir);
    const dirs = names.filter((n) => {
      try {
        return statSync(join(outDir, n)).isDirectory();
      } catch {
        return false;
      }
    });
    const expected = `${ref.repo}-${ref.branch}`;
    const root = dirs.includes(expected) ? join(outDir, expected) : dirs.length === 1 && names.length === 1 ? join(outDir, dirs[0]) : outDir;
    const lockBefore = readLockfile(cwd);
    const backups = new Map<string, string>();
    for (const f of PRESERVED_FILES) {
      const p = join(cwd, f);
      if (existsSync(p)) backups.set(f, readFileSync(p, "utf-8"));
    }
    cpSync(root, cwd, { recursive: true });
    for (const [f, content] of backups) writeFileSync(join(cwd, f), content);
    writeFileSync(join(cwd, META_FILE), JSON.stringify({ sha: head.sha, appliedAt: new Date().toISOString() }, null, 2));
    if (readLockfile(cwd) !== lockBefore) {
      try {
        await runNpm(["install"], cwd);
      } catch (e: any) {
        return { updated: false, message: `Applied latest code, but npm install failed: ${String(e?.message || e).slice(0, 300)}. Run npm install manually, then restart.` };
      }
    }
    const short = head.sha.slice(0, 7);
    const when = head.date ? ` (${head.date.slice(0, 10)})` : "";
    return { updated: true, message: `Updated to GitHub commit ${short}${when}. Restart the app to run the new build.` };
  } finally {
    cleanup();
  }
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
