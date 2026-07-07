import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { createManifest, parseManifest } from "../src/manifest.js";
import { createZipFromDirectory, extractZip, readZipText } from "../src/archive/zip.js";

describe("archive flow", () => {
  it("creates, reads, and extracts an airelay backup zip", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-archive-"));
    const source = path.join(dir, "source");
    const target = path.join(dir, "target");
    const zip = path.join(dir, "backup.zip");

    try {
      await fs.ensureDir(path.join(source, "clients", "codex", "root", "sessions"));
      const manifest = createManifest([
        {
          type: "codex",
          name: "Codex CLI",
          version: "test",
          root_dir: "/tmp/.codex",
          session_count: 1,
          exported_session_count: 1,
          include_secrets: false
        }
      ]);
      await fs.writeJson(path.join(source, "manifest.json"), manifest);
      await fs.writeFile(path.join(source, "clients", "codex", "root", "sessions", "one.jsonl"), "{}\n");

      await createZipFromDirectory(source, zip);
      expect(parseManifest(await readZipText(zip, "manifest.json")).clients[0]?.type).toBe("codex");

      await extractZip(zip, target);
      expect(await fs.readFile(path.join(target, "clients", "codex", "root", "sessions", "one.jsonl"), "utf8")).toBe("{}\n");
    } finally {
      await fs.remove(dir);
    }
  });
});

