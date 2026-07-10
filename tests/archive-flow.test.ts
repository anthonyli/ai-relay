import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { createManifest, parseManifest } from "../src/manifest.js";
import {
  createZipFromDirectory,
  extractZip,
  isSafeZipEntryName,
  readZipText,
  validateZipEntry,
  validateZipArchive
} from "../src/archive/zip.js";

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
          export_mode: "sessions",
          privacy_exclusions: ["auth", "tokens", "credentials", "config"]
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

  it("rejects archives that exceed entry and uncompressed-size limits", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-archive-limits-"));
    const source = path.join(dir, "source");
    const zip = path.join(dir, "backup.zip");

    try {
      await fs.ensureDir(source);
      await fs.writeFile(path.join(source, "data.txt"), "four");
      await createZipFromDirectory(source, zip);

      await expect(validateZipArchive(zip, {
        maxEntries: 0,
        maxEntryUncompressedBytes: 100,
        maxTotalUncompressedBytes: 100
      })).rejects.toThrow(/entry count/i);
      await expect(validateZipArchive(zip, {
        maxEntries: 10,
        maxEntryUncompressedBytes: 1,
        maxTotalUncompressedBytes: 100
      })).rejects.toThrow(/single entry/i);
      await expect(validateZipArchive(zip, {
        maxEntries: 10,
        maxEntryUncompressedBytes: 100,
        maxTotalUncompressedBytes: 1
      })).rejects.toThrow(/total uncompressed/i);
      await expect(readZipText(zip, "data.txt", 1)).rejects.toThrow(/too large/i);
    } finally {
      await fs.remove(dir);
    }
  });

  it("recognizes traversal and absolute zip entry names as unsafe", () => {
    expect(isSafeZipEntryName("clients/codex/session.jsonl")).toBe(true);
    expect(isSafeZipEntryName("../outside.txt")).toBe(false);
    expect(isSafeZipEntryName("clients/../../outside.txt")).toBe(false);
    expect(isSafeZipEntryName("/absolute.txt")).toBe(false);
    expect(isSafeZipEntryName("C:\\absolute.txt")).toBe(false);
    expect(isSafeZipEntryName("clients\\..\\outside.txt")).toBe(false);
  });

  it("applies zip limits incrementally to entries from the handle being extracted", () => {
    const limits = {
      maxEntries: 1,
      maxEntryUncompressedBytes: 4,
      maxTotalUncompressedBytes: 4
    };
    const state = { entryCount: 0, totalUncompressedBytes: 0 };

    expect(() => validateZipEntry({ fileName: "one.txt", uncompressedSize: 4 }, state, limits)).not.toThrow();
    expect(state).toEqual({ entryCount: 1, totalUncompressedBytes: 4 });
    expect(() => validateZipEntry({ fileName: "two.txt", uncompressedSize: 0 }, state, limits)).toThrow(/entry count/i);
  });
});
