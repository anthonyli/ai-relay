import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { FileProvider } from "../src/providers/provider.js";

const provider = new FileProvider({
  id: "codex",
  name: "Codex CLI",
  rootName: ".codex",
  sessionRoots: ["sessions", "archived_sessions"],
  defaultExportRoots: ["sessions", "archived_sessions", "history.jsonl", "session_index.jsonl"],
  fullExcludeRoots: [".tmp", "tmp", "cache", "logs", "plugins"]
});

describe("export privacy", () => {
  it("exports only session/history allowlist by default", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-export-privacy-"));
    const home = path.join(dir, "home");
    const out = path.join(dir, "out");

    try {
      await seedProviderRoot(home);

      await provider.copyForExport({ homeDir: home, cwd: dir }, out, {});

      expect(await fs.pathExists(path.join(out, "root", "sessions", "one.jsonl"))).toBe(true);
      expect(await fs.pathExists(path.join(out, "root", "archived_sessions", "archived.jsonl"))).toBe(true);
      expect(await fs.pathExists(path.join(out, "root", "history.jsonl"))).toBe(true);
      expect(await fs.pathExists(path.join(out, "root", "session_index.jsonl"))).toBe(true);
      expect(await fs.pathExists(path.join(out, "root", "notes.md"))).toBe(false);
      expect(await fs.pathExists(path.join(out, "root", "config.toml"))).toBe(false);
      expect(await fs.pathExists(path.join(out, "root", "auth.json"))).toBe(false);
      expect(await fs.pathExists(path.join(out, "root", ".tmp", "plugin.test.ts"))).toBe(false);
    } finally {
      await fs.remove(dir);
    }
  });

  it("full export includes ordinary files but still excludes privacy-sensitive files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-export-privacy-"));
    const home = path.join(dir, "home");
    const out = path.join(dir, "out");

    try {
      await seedProviderRoot(home);

      await provider.copyForExport({ homeDir: home, cwd: dir }, out, { full: true });

      expect(await fs.pathExists(path.join(out, "root", "sessions", "one.jsonl"))).toBe(true);
      expect(await fs.pathExists(path.join(out, "root", "notes.md"))).toBe(true);
      expect(await fs.pathExists(path.join(out, "root", "config.toml"))).toBe(false);
      expect(await fs.pathExists(path.join(out, "root", "auth.json"))).toBe(false);
      expect(await fs.pathExists(path.join(out, "root", "credentials.json"))).toBe(false);
      expect(await fs.pathExists(path.join(out, "root", "cache", "blob"))).toBe(false);
      expect(await fs.pathExists(path.join(out, "root", "plugins", "plugin.js"))).toBe(false);
    } finally {
      await fs.remove(dir);
    }
  });

  it("does not exclude legitimate session files because project or file names contain privacy words", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-export-privacy-"));
    const home = path.join(dir, "home");
    const out = path.join(dir, "out");
    const claudeProvider = new FileProvider({
      id: "claude",
      name: "Claude Code",
      rootName: ".claude",
      sessionRoots: ["projects"],
      defaultExportRoots: ["projects", "history.jsonl"],
      fullExcludeRoots: [".tmp", "tmp", "cache", "logs", "plugins"]
    });

    try {
      const root = path.join(home, ".claude");
      await fs.ensureDir(path.join(root, "projects", "config"));
      await fs.ensureDir(path.join(root, "projects", "regular"));
      await fs.writeFile(path.join(root, "projects", "config", "session.jsonl"), "{}\n");
      await fs.writeFile(path.join(root, "projects", "regular", "authentication-notes.md"), "ordinary\n");
      await fs.writeFile(path.join(root, "projects", "regular", "token-usage.md"), "ordinary\n");
      await fs.writeFile(path.join(root, "history.jsonl"), "{}\n");

      await claudeProvider.copyForExport({ homeDir: home, cwd: dir }, out, {});

      expect(await fs.pathExists(path.join(out, "root", "projects", "config", "session.jsonl"))).toBe(true);
      expect(await fs.pathExists(path.join(out, "root", "projects", "regular", "authentication-notes.md"))).toBe(true);
      expect(await fs.pathExists(path.join(out, "root", "projects", "regular", "token-usage.md"))).toBe(true);
      expect(await fs.pathExists(path.join(out, "root", "history.jsonl"))).toBe(true);
    } finally {
      await fs.remove(dir);
    }
  });
});

async function seedProviderRoot(home: string): Promise<void> {
  const root = path.join(home, ".codex");
  await fs.ensureDir(path.join(root, "sessions"));
  await fs.ensureDir(path.join(root, "archived_sessions"));
  await fs.ensureDir(path.join(root, ".tmp"));
  await fs.ensureDir(path.join(root, "cache"));
  await fs.ensureDir(path.join(root, "plugins"));
  await fs.writeFile(path.join(root, "sessions", "one.jsonl"), "{}\n");
  await fs.writeFile(path.join(root, "archived_sessions", "archived.jsonl"), "{}\n");
  await fs.writeFile(path.join(root, "history.jsonl"), "{}\n");
  await fs.writeFile(path.join(root, "session_index.jsonl"), "{}\n");
  await fs.writeFile(path.join(root, "notes.md"), "ordinary\n");
  await fs.writeFile(path.join(root, "config.toml"), "api_key = \"secret\"\n");
  await fs.writeFile(path.join(root, "auth.json"), "{\"token\":\"secret\"}\n");
  await fs.writeFile(path.join(root, "credentials.json"), "{\"token\":\"secret\"}\n");
  await fs.writeFile(path.join(root, ".tmp", "plugin.test.ts"), "test\n");
  await fs.writeFile(path.join(root, "cache", "blob"), "cache\n");
  await fs.writeFile(path.join(root, "plugins", "plugin.js"), "plugin\n");
}
