import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { exportCommand } from "../src/commands/export.js";
import { syncCommand } from "../src/commands/sync.js";
import { listZipEntries, readZipText } from "../src/archive/zip.js";
import { parseManifest } from "../src/manifest.js";
import type { AppConfig } from "../src/config.js";
import type { RemoteStorage } from "../src/storage/index.js";

const s3Config: AppConfig = {
  version: "2",
  storage: {
    type: "s3",
    bucket: "airelay",
    endpoint: "http://127.0.0.1:9000",
    prefix: "snapshots",
    force_path_style: true
  },
  cloud_sync: { enabled: true }
};

describe("s3 sync", () => {
  it("push uploads a provided backup archive using its original file name", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-sync-"));
    const uploaded = path.join(dir, "uploaded.zip");
    const backup = path.join(dir, "backup_2026-07-08.zip");
    await fs.writeFile(backup, "zip-bytes");

    const storage: RemoteStorage = {
      async uploadFile(request) {
        expect(request.bucket).toBe("airelay");
        expect(request.key).toBe("snapshots/backup_2026-07-08.zip");
        await fs.copy(request.filePath, uploaded);
      },
      async downloadFile() {
        throw new Error("download should not be called");
      }
    };

    try {
      await syncCommand({ env: { homeDir: path.join(dir, "home"), cwd: dir }, config: s3Config }, "push", { storage, backup });
      expect(await fs.readFile(uploaded, "utf8")).toBe("zip-bytes");
    } finally {
      await fs.remove(dir);
    }
  });

  it("push generates a unique backup file name when no file is provided", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-sync-"));
    const home = path.join(dir, "home");
    const uploaded = path.join(dir, "uploaded.zip");
    await fs.ensureDir(path.join(home, ".codex", "sessions"));
    await fs.writeFile(path.join(home, ".codex", "sessions", "one.jsonl"), "{}\n");

    const storage: RemoteStorage = {
      async uploadFile(request) {
        expect(request.bucket).toBe("airelay");
        expect(request.key).toMatch(/^snapshots\/backup_\d{8}T\d{6}_\d{3}_[a-f0-9]{8}\.zip$/);
        expect(path.basename(request.filePath)).toBe(path.basename(request.key));
        await fs.copy(request.filePath, uploaded);
      },
      async downloadFile() {
        throw new Error("download should not be called");
      }
    };

    try {
      await syncCommand({ env: { homeDir: home, cwd: dir }, config: s3Config }, "push", { storage });
      const manifest = parseManifest(await readZipText(uploaded, "manifest.json"));
      expect(manifest.clients.map((client) => client.type)).toEqual(["codex"]);
    } finally {
      await fs.remove(dir);
    }
  });

  it("pull downloads the requested backup key and restores it locally", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-sync-"));
    const sourceHome = path.join(dir, "source-home");
    const targetHome = path.join(dir, "target-home");
    const backup = path.join(dir, "remote.zip");
    await fs.ensureDir(path.join(sourceHome, ".codex", "sessions"));
    await fs.writeFile(path.join(sourceHome, ".codex", "sessions", "one.jsonl"), "{}\n");
    await exportCommand({ env: { homeDir: sourceHome, cwd: dir }, config: s3Config }, { output: backup, yes: true });

    const storage: RemoteStorage = {
      async uploadFile() {
        throw new Error("upload should not be called");
      },
      async downloadFile(request) {
        expect(request.bucket).toBe("airelay");
        expect(request.key).toBe("snapshots/backup_2026-07-08.zip");
        await fs.copy(backup, request.filePath);
      }
    };

    try {
      await syncCommand({ env: { homeDir: targetHome, cwd: dir }, config: s3Config }, "pull", {
        storage,
        backup: "backup_2026-07-08.zip"
      });
      expect(await fs.readFile(path.join(targetHome, ".codex", "sessions", "one.jsonl"), "utf8")).toBe("{}\n");
    } finally {
      await fs.remove(dir);
    }
  });

  it("requires explicit confirmation before sync overwrites a remote key", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-sync-"));
    let called = false;
    const storage: RemoteStorage = {
      async uploadFile() {
        called = true;
      },
      async downloadFile() {
        called = true;
      }
    };

    try {
      await expect(syncCommand(
        { env: { homeDir: path.join(dir, "home"), cwd: dir }, config: s3Config },
        "sync",
        { storage, backup: "shared.zip" }
      )).rejects.toThrow(/--yes/);
      expect(called).toBe(false);
    } finally {
      await fs.remove(dir);
    }
  });

  it("sync pulls, merges, exports, then uploads to the same remote key", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-sync-"));
    const sourceHome = path.join(dir, "source-home");
    const targetHome = path.join(dir, "target-home");
    const remoteBackup = path.join(dir, "remote.zip");
    const uploaded = path.join(dir, "uploaded.zip");
    const calls: string[] = [];
    await fs.ensureDir(path.join(sourceHome, ".codex", "sessions"));
    await fs.ensureDir(path.join(targetHome, ".codex", "sessions"));
    await fs.writeFile(path.join(sourceHome, ".codex", "sessions", "remote.jsonl"), "remote\n");
    await fs.writeFile(path.join(targetHome, ".codex", "sessions", "local.jsonl"), "local\n");
    await exportCommand({ env: { homeDir: sourceHome, cwd: dir }, config: s3Config }, {
      output: remoteBackup,
      yes: true
    });

    const storage: RemoteStorage = {
      async downloadFile(request) {
        calls.push(`download:${request.key}`);
        await fs.copy(remoteBackup, request.filePath);
      },
      async uploadFile(request) {
        calls.push(`upload:${request.key}`);
        await fs.copy(request.filePath, uploaded);
      }
    };

    try {
      await syncCommand({ env: { homeDir: targetHome, cwd: dir }, config: s3Config }, "sync", {
        storage,
        backup: "shared.zip",
        yes: true
      });

      expect(calls).toEqual(["download:snapshots/shared.zip", "upload:snapshots/shared.zip"]);
      const entries = await listZipEntries(uploaded);
      expect(entries).toContain("clients/codex/root/sessions/local.jsonl");
      expect(entries).toContain("clients/codex/root/sessions/remote.jsonl");
    } finally {
      await fs.remove(dir);
    }
  });

  it("does not upload when sync download fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-sync-"));
    let uploaded = false;
    const storage: RemoteStorage = {
      async downloadFile() {
        throw new Error("download failed");
      },
      async uploadFile() {
        uploaded = true;
      }
    };

    try {
      await expect(syncCommand(
        { env: { homeDir: path.join(dir, "home"), cwd: dir }, config: s3Config },
        "sync",
        { storage, backup: "shared.zip", yes: true }
      )).rejects.toThrow("download failed");
      expect(uploaded).toBe(false);
    } finally {
      await fs.remove(dir);
    }
  });
});
