import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { loadConfig, isCloudSyncConfigured } from "../src/config.js";

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
});

