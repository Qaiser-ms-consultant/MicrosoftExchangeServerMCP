import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkZipUpdate, fetchRemoteHead, performZipUpdate } from "../src/desktop/updater.js";

const HEAD_JSON = { sha: "def456", commit: { committer: { date: "2026-09-01T00:00:00Z" } } };
const fakeFetchJson = (json: any = HEAD_JSON) => vi.fn(async () => json);

function zipDir(withMeta?: any): string {
  const dir = mkdtempSync(join(tmpdir(), "upd-zip-"));
  writeFileSync(join(dir, "config.yaml"), "endpoint: https://mine.local\n");
  writeFileSync(join(dir, "package-lock.json"), '{"v":1}');
  writeFileSync(join(dir, "app.txt"), "old");
  if (withMeta !== undefined) writeFileSync(join(dir, ".update-meta.json"), JSON.stringify(withMeta));
  return dir;
}

// Fake download+extract: materialize a pretended fresh tree, then let the
// real apply logic overlay it onto cwd.
function fakeUnpack(newFiles: Record<string, string> = { "app.txt": "new" }) {
  return {
    downloadZip: vi.fn(async (_url: string, dest: string) => {
      writeFileSync(dest, "fake-zip-bytes");
    }),
    extractZip: vi.fn(async (_zip: string, dest: string) => {
      const root = join(dest, "Repo-branch");
      mkdirSync(root, { recursive: true });
      for (const [name, content] of Object.entries(newFiles)) writeFileSync(join(root, name), content);
      writeFileSync(join(root, "package-lock.json"), '{"v":1}');
    }),
  };
}

describe("fetchRemoteHead", () => {
  it("returns sha and date", async () => {
    const h = await fetchRemoteHead("o", "r", "master", fakeFetchJson());
    expect(h).toEqual({ sha: "def456", date: "2026-09-01T00:00:00Z" });
  });

  it("throws on API failure", async () => {
    await expect(fetchRemoteHead("o", "r", "master", vi.fn(async () => {
      throw new Error("403 rate limited");
    }))).rejects.toThrow(/rate limited/);
  });
});

describe("checkZipUpdate", () => {
  it("reports up to date when meta matches remote", async () => {
    const dir = zipDir({ sha: "def456", appliedAt: "x" });
    const s = await checkZipUpdate(dir, { fetchJson: fakeFetchJson() });
    expect(s).toMatchObject({ ok: true, kind: "zip", behind: false, latest: "def456" });
  });

  it("reports behind when remote moved on", async () => {
    const dir = zipDir({ sha: "abc123", appliedAt: "x" });
    const s = await checkZipUpdate(dir, { fetchJson: fakeFetchJson() });
    expect(s).toMatchObject({ ok: true, kind: "zip", behind: true, latest: "def456" });
  });

  it("reports unknown baseline with no meta file", async () => {
    const dir = zipDir();
    const s = await checkZipUpdate(dir, { fetchJson: fakeFetchJson() });
    expect(s).toMatchObject({ ok: true, kind: "zip", behind: null });
  });

  it("fails cleanly on network error", async () => {
    const dir = zipDir();
    const s = await checkZipUpdate(dir, {
      fetchJson: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    expect(s.ok).toBe(false);
  });
});

describe("performZipUpdate", () => {
  it("overlays new files but preserves local config", async () => {
    const dir = zipDir({ sha: "abc123", appliedAt: "x" });
    const runNpm = vi.fn();
    const r = await performZipUpdate(dir, { ...fakeUnpack(), fetchJson: fakeFetchJson(), runNpm });
    expect(r.updated).toBe(true);
    expect(readFileSync(join(dir, "app.txt"), "utf-8")).toBe("new");
    expect(readFileSync(join(dir, "config.yaml"), "utf-8")).toContain("mine.local");
    expect(runNpm).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(dir, ".update-meta.json"), "utf-8")).sha).toBe("def456");
  });

  it("runs npm install when the lockfile changed", async () => {
    const dir = zipDir({ sha: "abc123", appliedAt: "x" });
    const runNpm = vi.fn();
    const unpack = fakeUnpack({ "app.txt": "new2" });
    // Fresh tree ships a newer lockfile
    const origExtract = unpack.extractZip;
    unpack.extractZip = vi.fn(async (zip: string, dest: string) => {
      await (origExtract as any)(zip, dest);
      writeFileSync(join(dest, "Repo-branch", "package-lock.json"), '{"v":2}');
    });
    const r = await performZipUpdate(dir, { ...unpack, fetchJson: fakeFetchJson(), runNpm });
    expect(r.updated).toBe(true);
    expect(runNpm).toHaveBeenCalledOnce();
  });

  it("aborts on download failure without touching the tree", async () => {
    const dir = zipDir();
    const runNpm = vi.fn();
    const r = await performZipUpdate(dir, {
      fetchJson: fakeFetchJson(),
      downloadZip: vi.fn(async () => {
        throw new Error("network down");
      }),
      extractZip: vi.fn(),
      runNpm,
    });
    expect(r.updated).toBe(false);
    expect(r.message).toMatch(/download/i);
    expect(readFileSync(join(dir, "app.txt"), "utf-8")).toBe("old");
    expect(runNpm).not.toHaveBeenCalled();
  });
});
