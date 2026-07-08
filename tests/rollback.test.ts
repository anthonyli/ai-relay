import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import net from "node:net";
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
      expect((await listRollbacks(env)).some((entry) => entry.id === snapshot.id)).toBe(true);
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

  it("creates unique rollback ids for snapshots created in the same second", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-rollback-"));
    const env = { homeDir: path.join(dir, "home"), cwd: dir };

    try {
      const first = await createPreImportRollback(env, [], path.join(dir, "backup.zip"));
      const second = await createPreImportRollback(env, [], path.join(dir, "backup.zip"));

      expect(second.id).not.toBe(first.id);
      expect(second.file).not.toBe(first.file);
      expect(await fs.pathExists(first.file)).toBe(true);
      expect(await fs.pathExists(second.file)).toBe(true);
    } finally {
      await fs.remove(dir);
    }
  });

  it("creates a safety snapshot before replacing directories during rollback", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-rollback-"));
    const env = { homeDir: path.join(dir, "home"), cwd: dir };
    const session = path.join(env.homeDir, ".codex", "sessions", "same.jsonl");

    try {
      await fs.ensureDir(path.dirname(session));
      await fs.writeFile(session, "before\n");
      const snapshot = await createPreImportRollback(env, [provider], path.join(dir, "backup.zip"));
      await fs.writeFile(session, "after\n");

      await restoreRollback(env, [provider], snapshot.id);

      const entries = await listRollbacks(env);
      expect(entries.some((entry) => entry.id.startsWith("pre_rollback_"))).toBe(true);
    } finally {
      await fs.remove(dir);
    }
  });

  it("skips socket files when creating rollback snapshots", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-rollback-"));
    const env = { homeDir: path.join(dir, "home"), cwd: dir };
    const socketPath = path.join(env.homeDir, ".codex", "vendor_imports", "skills", ".git", "fsmonitor--daemon.ipc");
    const server = net.createServer();

    try {
      await fs.ensureDir(path.dirname(socketPath));
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });

      const snapshot = await createPreImportRollback(env, [provider], path.join(dir, "backup.zip"));

      expect(await fs.pathExists(snapshot.file)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.remove(dir);
    }
  });
});
