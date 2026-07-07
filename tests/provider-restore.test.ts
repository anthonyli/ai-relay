import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { FileProvider } from "../src/providers/provider.js";

const provider = new FileProvider({
  id: "codex",
  name: "Codex CLI",
  rootName: ".codex",
  sessionRoots: ["sessions"]
});

describe("provider restore", () => {
  it("keeps existing files by default", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-restore-"));
    const home = path.join(dir, "home");
    const backup = path.join(dir, "backup-client");
    const session = path.join(".codex", "sessions", "same.jsonl");

    try {
      await fs.ensureDir(path.join(home, ".codex", "sessions"));
      await fs.ensureDir(path.join(backup, "root", "sessions"));
      await fs.writeFile(path.join(home, session), "local\n");
      await fs.writeFile(path.join(backup, "root", "sessions", "same.jsonl"), "backup\n");

      await provider.restoreFromBackup({ homeDir: home, cwd: dir }, backup, {});

      expect(await fs.readFile(path.join(home, session), "utf8")).toBe("local\n");
    } finally {
      await fs.remove(dir);
    }
  });

  it("overwrites existing files only when requested", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-restore-"));
    const home = path.join(dir, "home");
    const backup = path.join(dir, "backup-client");
    const session = path.join(".codex", "sessions", "same.jsonl");

    try {
      await fs.ensureDir(path.join(home, ".codex", "sessions"));
      await fs.ensureDir(path.join(backup, "root", "sessions"));
      await fs.writeFile(path.join(home, session), "local\n");
      await fs.writeFile(path.join(backup, "root", "sessions", "same.jsonl"), "backup\n");

      await provider.restoreFromBackup({ homeDir: home, cwd: dir }, backup, { overwrite: true });

      expect(await fs.readFile(path.join(home, session), "utf8")).toBe("backup\n");
    } finally {
      await fs.remove(dir);
    }
  });
});
