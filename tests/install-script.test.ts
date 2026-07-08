import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("install script", () => {
  it("creates a default local config in the user home", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-install-home-"));
    try {
      await execFileAsync(process.execPath, ["scripts/ensure-user-config-dir.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, HOME: home, USERPROFILE: home }
      });
      expect(await fs.pathExists(path.join(home, ".airelay"))).toBe(true);
      expect(await fs.readFile(path.join(home, ".airelay", "config.yml"), "utf8")).toBe(
        ['version: "1.1"', "storage:", "  type: local", "cloud_sync:", "  enabled: false", ""].join("\n")
      );
    } finally {
      await fs.remove(home);
    }
  });

  it("does not overwrite an existing user config", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-install-home-"));
    const config = path.join(home, ".airelay", "config.yml");
    await fs.ensureDir(path.dirname(config));
    await fs.writeFile(config, 'version: "2"\nstorage:\n  type: s3\n');

    try {
      await execFileAsync(process.execPath, ["scripts/ensure-user-config-dir.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, HOME: home, USERPROFILE: home }
      });
      expect(await fs.readFile(config, "utf8")).toBe('version: "2"\nstorage:\n  type: s3\n');
    } finally {
      await fs.remove(home);
    }
  });
});
