import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { ensureUserConfigDir, loadConfig, isCloudSyncConfigured } from "../src/config.js";

describe("config", () => {
  it("defaults empty config to local V1.1", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-config-"));
    try {
      const config = await loadConfig({ homeDir: dir, cwd: dir });
      expect(config).toEqual({
        version: "1.1",
        storage: { type: "local" },
        cloud_sync: { enabled: false }
      });
      expect(isCloudSyncConfigured(config)).toBe(false);
    } finally {
      await fs.remove(dir);
    }
  });

  it("treats default user config as local-only storage", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-home-"));
    await fs.ensureDir(path.join(home, ".airelay"));
    await fs.writeFile(
      path.join(home, ".airelay", "config.yml"),
      ['version: "1.1"', "storage:", "  type: local", "cloud_sync:", "  enabled: false", ""].join("\n")
    );

    try {
      const config = await loadConfig({ homeDir: home, cwd: home });
      expect(config).toEqual({
        version: "1.1",
        storage: { type: "local" },
        cloud_sync: { enabled: false }
      });
      expect(isCloudSyncConfigured(config)).toBe(false);
    } finally {
      await fs.remove(home);
    }
  });

  it("requires non-local storage for cloud sync to be configured", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-config-"));
    const configPath = path.join(dir, "airelay.config.yml");
    await fs.writeFile(configPath, "version: \"2\"\nstorage:\n  type: s3\ncloud_sync:\n  enabled: true\n");
    try {
      const config = await loadConfig({ homeDir: dir, cwd: dir });
      expect(isCloudSyncConfigured(config)).toBe(true);
    } finally {
      await fs.remove(dir);
    }
  });

  it("loads minio-compatible s3 storage settings", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-config-"));
    const configPath = path.join(dir, "airelay.config.yml");
    await fs.writeFile(
      configPath,
      [
        'version: "2"',
        "storage:",
        "  type: s3",
        "  bucket: airelay",
        "  region: us-east-1",
        "  endpoint: http://127.0.0.1:9000",
        "  prefix: snapshots",
        "  access_key_id: minioadmin",
        "  secret_access_key: minioadmin",
        "  force_path_style: true",
        "cloud_sync:",
        "  enabled: true",
        ""
      ].join("\n")
    );

    try {
      const config = await loadConfig({ homeDir: dir, cwd: dir });
      expect(config.storage).toEqual({
        type: "s3",
        bucket: "airelay",
        region: "us-east-1",
        endpoint: "http://127.0.0.1:9000",
        prefix: "snapshots",
        access_key_id: "minioadmin",
        secret_access_key: "minioadmin",
        force_path_style: true
      });
    } finally {
      await fs.remove(dir);
    }
  });

  it("prefers current directory airelay config over user directory config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-config-"));
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-home-"));
    await fs.ensureDir(path.join(home, ".airelay"));
    await fs.writeFile(path.join(home, ".airelay", "config.yml"), "version: \"1.1\"\nstorage:\n  type: local\n");
    await fs.writeFile(path.join(dir, "airelay.config.yml"), "version: \"2\"\nstorage:\n  type: s3\ncloud_sync:\n  enabled: true\n");

    try {
      const config = await loadConfig({ homeDir: home, cwd: dir });
      expect(config.version).toBe("2");
      expect(config.storage.type).toBe("s3");
    } finally {
      await fs.remove(dir);
      await fs.remove(home);
    }
  });

  it("ignores legacy aisession config files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-config-"));
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-home-"));
    await fs.ensureDir(path.join(home, ".aisession"));
    await fs.writeFile(path.join(dir, "aisession.config.yml"), "version: \"2\"\nstorage:\n  type: s3\ncloud_sync:\n  enabled: true\n");
    await fs.writeFile(path.join(home, ".aisession", "config.yml"), "version: \"2\"\nstorage:\n  type: s3\ncloud_sync:\n  enabled: true\n");

    try {
      const config = await loadConfig({ homeDir: home, cwd: dir });
      expect(config).toEqual({
        version: "1.1",
        storage: { type: "local" },
        cloud_sync: { enabled: false }
      });
    } finally {
      await fs.remove(dir);
      await fs.remove(home);
    }
  });

  it("creates the user airelay config directory", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-home-"));
    try {
      await ensureUserConfigDir({ homeDir: home, cwd: home });
      expect(await fs.pathExists(path.join(home, ".airelay"))).toBe(true);
    } finally {
      await fs.remove(home);
    }
  });

  it("reports unsupported config versions with a friendly error", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-config-"));
    const configPath = path.join(dir, "airelay.config.yml");
    await fs.writeFile(configPath, "version: \"3\"\n");

    try {
      await expect(loadConfig({ homeDir: dir, cwd: dir })).rejects.toThrow('Unsupported config version "3". Use "1.1" or "2".');
    } finally {
      await fs.remove(dir);
    }
  });
});
