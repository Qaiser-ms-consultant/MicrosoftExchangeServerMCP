import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  checkForUpdates,
  isDirtyStatus,
  parseBehindCount,
  performUpdate,
} from "../src/desktop/updater.js";

type ExecFn = (cmd: string, args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>;

// Fake git: dispatch canned outputs by "cmd args", optionally throwing.
function fakeExec(scripts: Record<string, string | Error>, calls: string[] = []): ExecFn {
  return async (cmd: string, args: string[]) => {
    const key = `${cmd} ${args.join(" ")}`;
    calls.push(key);
    const out = scripts[key];
    if (out instanceof Error) throw out;
    if (out === undefined) throw new Error(`unexpected call: ${key}`);
    return { stdout: out, stderr: "" };
  };
}

describe("parseBehindCount", () => {
  it("parses counts with whitespace", () => {
    expect(parseBehindCount("3\n")).toBe(3);
    expect(parseBehindCount("0")).toBe(0);
  });
  it("falls back to zero on garbage", () => {
    expect(parseBehindCount("nope")).toBe(0);
  });
});

describe("isDirtyStatus", () => {
  it("detects clean and dirty trees", () => {
    expect(isDirtyStatus("")).toBe(false);
    expect(isDirtyStatus("  \n")).toBe(false);
    expect(isDirtyStatus(" M src/index.ts\n")).toBe(true);
  });
});

describe("checkForUpdates", () => {
  // isGitCheckout reads the real fs — these tests use a temp dir stamped
  // with a .git marker so the gate passes and the fake exec drives the rest.
  function checkoutDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "upd-check-"));
    mkdirSync(join(dir, ".git"), { recursive: true });
    return dir;
  }

  it("reports not-a-checkout without touching git", async () => {
    const calls: string[] = [];
    const s = await checkForUpdates("Z:\\definitely\\not\\a\\checkout\\xyz", fakeExec({}, calls));
    expect(s.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("reports up to date", async () => {
    const s = await checkForUpdates(
      checkoutDir(),
      fakeExec({
        "git rev-parse HEAD": "abc123\n",
        "git status --porcelain": "",
        "git fetch --quiet origin": "",
        "git rev-list --count HEAD..@{u}": "0\n",
        "git rev-parse @{u}": "abc123\n",
      }),
    );
    expect(s).toMatchObject({ ok: true, current: "abc123", latest: "abc123", behind: 0, dirty: false });
  });

  it("reports behind count and dirty flag", async () => {
    const s = await checkForUpdates(
      checkoutDir(),
      fakeExec({
        "git rev-parse HEAD": "abc123\n",
        "git status --porcelain": " M src/a.ts\n",
        "git fetch --quiet origin": "",
        "git rev-list --count HEAD..@{u}": "3\n",
        "git rev-parse @{u}": "def456\n",
      }),
    );
    expect(s).toMatchObject({ ok: true, behind: 3, dirty: true, latest: "def456" });
  });

  it("fails cleanly with no upstream", async () => {
    const s = await checkForUpdates(
      checkoutDir(),
      fakeExec({
        "git rev-parse HEAD": "abc123\n",
        "git status --porcelain": "",
        "git fetch --quiet origin": "",
        "git rev-list --count HEAD..@{u}": new Error("no upstream configured"),
      }),
    );
    expect(s.ok).toBe(false);
    expect(s.error).toMatch(/upstream/i);
  });
});

describe("performUpdate", () => {
  // isGitCheckout reads the real fs, so every performUpdate test gets a temp
  // dir with a real .git marker plus a package-lock.json fixture.
  function gitDir(lockContent: string): string {
    const dir = mkdtempSync(join(tmpdir(), "upd-"));
    mkdirSync(join(dir, ".git"), { recursive: true });
    writeFileSync(join(dir, "package-lock.json"), lockContent);
    return dir;
  }

  it("aborts on a dirty tree without pulling", async () => {
    const dir = gitDir("{}");
    const calls: string[] = [];
    const r = await performUpdate(
      dir,
      fakeExec(
        {
          "git rev-parse HEAD": "abc\n",
          "git status --porcelain": " M x\n",
          "git fetch --quiet origin": "",
          "git rev-list --count HEAD..@{u}": "2\n",
          "git rev-parse @{u}": "def\n",
        },
        calls,
      ),
      vi.fn(),
    );
    expect(r.updated).toBe(false);
    expect(r.message).toMatch(/local changes/i);
    expect(calls.some((c) => c.includes("pull"))).toBe(false);
  });

  it("pulls cleanly when lockfile is unchanged", async () => {
    const dir = gitDir('{"v":1}');
    const install = vi.fn();
    const r = await performUpdate(
      dir,
      fakeExec({
        "git rev-parse HEAD": "abc\n",
        "git status --porcelain": "",
        "git fetch --quiet origin": "",
        "git rev-list --count HEAD..@{u}": "2\n",
        "git rev-parse @{u}": "def\n",
        "git pull --ff-only": "Updating abc..def\n",
      }),
      install,
    );
    expect(r.updated).toBe(true);
    expect(install).not.toHaveBeenCalled();
  });

  it("runs npm install when the pull changes the lockfile", async () => {
    const dir = gitDir('{"v":1}');
    const install = vi.fn();
    const r = await performUpdate(
      dir,
      async (cmd: string, args: string[]) => {
        if (args.join(" ").startsWith("pull")) {
          writeFileSync(join(dir, "package-lock.json"), '{"v":2}');
          return { stdout: "Updating\n", stderr: "" };
        }
        const table: Record<string, string> = {
          "rev-parse HEAD": "abc\n",
          "status --porcelain": "",
          "fetch --quiet origin": "",
          "rev-list --count HEAD..@{u}": "1\n",
          "rev-parse @{u}": "def\n",
        };
        return { stdout: table[args.join(" ")] ?? "", stderr: "" };
      },
      install,
    );
    expect(r.updated).toBe(true);
    expect(install).toHaveBeenCalledOnce();
  });

  it("reports pull failures without installing", async () => {
    const dir = gitDir("{}");
    const install = vi.fn();
    const r = await performUpdate(
      dir,
      fakeExec({
        "git rev-parse HEAD": "abc\n",
        "git status --porcelain": "",
        "git fetch --quiet origin": "",
        "git rev-list --count HEAD..@{u}": "2\n",
        "git rev-parse @{u}": "def\n",
        "git pull --ff-only": Object.assign(new Error("divergent"), { stderr: "divergent branches" }),
      }),
      install,
    );
    expect(r.updated).toBe(false);
    expect(r.message).toMatch(/pull failed/i);
    expect(install).not.toHaveBeenCalled();
  });
});
