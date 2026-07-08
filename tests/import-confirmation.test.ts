import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { createZipFromDirectory } from "../src/archive/zip.js";
import { createManifest } from "../src/manifest.js";
import { importCommand } from "../src/commands/import.js";

describe("import confirmation", () => {
  it("requires --yes for non-interactive imports", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-import-confirmation-"));
    const home = path.join(dir, "home");
    const source = path.join(dir, "source");
    const backup = path.join(dir, "backup.zip");

    try {
      await fs.ensureDir(path.join(source, "clients", "codex", "root", "sessions"));
      await fs.writeJson(
        path.join(source, "manifest.json"),
        createManifest([
          {
            type: "codex",
            name: "Codex CLI",
            version: "test",
            root_dir: path.join(home, ".codex"),
            session_count: 1,
            exported_session_count: 1,
            export_mode: "sessions",
            privacy_exclusions: []
          }
        ])
      );
      await fs.writeFile(path.join(source, "clients", "codex", "root", "sessions", "one.jsonl"), "{}\n");
      await createZipFromDirectory(source, backup);

      await expect(
        importCommand({ env: { homeDir: home, cwd: dir }, config: { version: "1.1", storage: { type: "local" }, cloud_sync: { enabled: false } } }, backup, {})
      ).rejects.toThrow(/--yes/);
      expect(await fs.pathExists(path.join(home, ".codex", "sessions", "one.jsonl"))).toBe(false);
    } finally {
      await fs.remove(dir);
    }
  });
});
