import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { FileProvider } from "../src/providers/provider.js";
import { createPreImportRollback, listRollbacks, restoreRollback } from "../src/rollback.js";

const provider = new FileProvider({
  id: "codex",
  name: "Codex CLI",
  rootName: ".codex",
  sessionRoots: ["sessions"]
});

describe("rollback snapshots", () => {
  it("restores a provider directory to its pre-import state", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-rollback-"));
    const env = { homeDir: path.join(dir, "home"), cwd: dir };
    const session = path.join(env.homeDir, ".codex", "sessions", "same.jsonl");

    try {
      await fs.ensureDir(path.dirname(session));
      await fs.writeFile(session, "before\n");

      const snapshot = await createPreImportRollback(env, [provider], path.join(dir, "backup.zip"));
      await fs.writeFile(session, "after\n");
      await fs.writeFile(path.join(env.homeDir, ".codex", "sessions", "new.jsonl"), "new\n");

      await restoreRollback(env, [provider], snapshot.id);

      expect(await fs.readFile(session, "utf8")).toBe("before\n");
      expect(await fs.pathExists(path.join(env.homeDir, ".codex", "sessions", "new.jsonl"))).toBe(false);
      expect((await listRollbacks(env))[0]?.id).toBe(snapshot.id);
    } finally {
      await fs.remove(dir);
    }
  });

  it("removes a provider directory that did not exist before import", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-rollback-"));
    const env = { homeDir: path.join(dir, "home"), cwd: dir };

    try {
      const snapshot = await createPreImportRollback(env, [provider], path.join(dir, "backup.zip"));
      await fs.ensureDir(path.join(env.homeDir, ".codex", "sessions"));
      await fs.writeFile(path.join(env.homeDir, ".codex", "sessions", "new.jsonl"), "new\n");

      await restoreRollback(env, [provider], snapshot.id);

      expect(await fs.pathExists(path.join(env.homeDir, ".codex"))).toBe(false);
    } finally {
      await fs.remove(dir);
    }
  });
});
