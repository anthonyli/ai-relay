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

describe("session selection", () => {
  it("rejects ambiguous partial session matches", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-session-selection-"));
    const home = path.join(dir, "home");
    const out = path.join(dir, "out");

    try {
      await fs.ensureDir(path.join(home, ".codex", "sessions"));
      await fs.writeFile(path.join(home, ".codex", "sessions", "foo.jsonl"), "{}\n");
      await fs.writeFile(path.join(home, ".codex", "sessions", "foobar.jsonl"), "{}\n");

      await expect(provider.copyForExport({ homeDir: home, cwd: dir }, out, { sessionIds: ["foo"] })).rejects.toThrow(
        /Ambiguous session/
      );
    } finally {
      await fs.remove(dir);
    }
  });
});
