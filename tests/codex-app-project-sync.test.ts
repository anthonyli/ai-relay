import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createZipFromDirectory } from "../src/archive/zip.js";
import { importCommand } from "../src/commands/import.js";
import { createManifest } from "../src/manifest.js";

describe("Codex App project sync", () => {
  it("adds restored Codex session cwd values to the Codex App project list", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-codex-app-sync-"));
    const home = path.join(dir, "home");
    const source = path.join(dir, "source");
    const backup = path.join(dir, "backup.zip");
    const existingProject = path.join(dir, "existing-project");
    const restoredProject = path.join(dir, "restored-project");
    const missingProject = path.join(dir, "missing-project");
    const globalState = path.join(home, ".codex", ".codex-global-state.json");

    try {
      await fs.ensureDir(existingProject);
      await fs.ensureDir(restoredProject);
      await fs.ensureDir(path.join(source, "clients", "codex", "root", "sessions", "2026", "07", "08"));
      await fs.ensureDir(path.dirname(globalState));
      await fs.writeJson(globalState, {
        "electron-persisted-atom-state": {
          "electron-saved-workspace-roots": [existingProject],
          "project-order": [existingProject]
        }
      });
      await fs.writeJson(
        path.join(source, "manifest.json"),
        createManifest([
          {
            type: "codex",
            name: "Codex CLI",
            version: "test",
            root_dir: path.join(home, ".codex"),
            session_count: 2,
            exported_session_count: 2,
            export_mode: "sessions",
            privacy_exclusions: []
          }
        ])
      );
      await fs.writeFile(
        path.join(source, "clients", "codex", "root", "sessions", "2026", "07", "08", "restored.jsonl"),
        JSON.stringify({
          type: "session_meta",
          payload: {
            cwd: restoredProject
          }
        }) + "\n"
      );
      await fs.writeFile(
        path.join(source, "clients", "codex", "root", "sessions", "2026", "07", "08", "missing.jsonl"),
        JSON.stringify({
          type: "session_meta",
          payload: {
            cwd: missingProject
          }
        }) + "\n"
      );
      await createZipFromDirectory(source, backup);

      await importCommand(
        { env: { homeDir: home, cwd: dir }, config: { version: "1.1", storage: { type: "local" }, cloud_sync: { enabled: false } } },
        backup,
        { only: ["codex"], yes: true }
      );

      const state = await fs.readJson(globalState);
      const persisted = state["electron-persisted-atom-state"];
      expect(persisted["electron-saved-workspace-roots"]).toEqual(
        expect.arrayContaining([existingProject, restoredProject, missingProject])
      );
      expect(persisted["project-order"]).toEqual(expect.arrayContaining([existingProject, restoredProject, missingProject]));
      expect(persisted[`sidebar-project-expanded-v1-codex:${existingProject}`]).toBeUndefined();
      expect(persisted[`sidebar-project-expanded-v1-codex:${restoredProject}`]).toBe(false);
      expect(persisted[`sidebar-project-expanded-v1-codex:${missingProject}`]).toBe(false);
    } finally {
      await fs.remove(dir);
    }
  });

  it("backfills the Codex local thread catalog from restored thread index rows", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-codex-catalog-sync-"));
    const home = path.join(dir, "home");
    const codexRoot = path.join(home, ".codex");
    const stateDb = path.join(codexRoot, "state_5.sqlite");
    const catalogDb = path.join(codexRoot, "sqlite", "codex-dev.db");
    const sessionPath = path.join(codexRoot, "sessions", "2026", "07", "08", "rollout-test.jsonl");
    const project = path.join(dir, "project");

    try {
      await fs.ensureDir(path.dirname(stateDb));
      await fs.ensureDir(path.dirname(catalogDb));
      await fs.ensureDir(path.dirname(sessionPath));
      await fs.writeFile(sessionPath, "{}\n");
      execFileSync("sqlite3", [
        stateDb,
        `CREATE TABLE threads (
          id TEXT PRIMARY KEY,
          rollout_path TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          source TEXT NOT NULL,
          model_provider TEXT NOT NULL,
          cwd TEXT NOT NULL,
          title TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0,
          git_branch TEXT,
          preview TEXT NOT NULL DEFAULT ''
        );
        INSERT INTO threads(id, rollout_path, created_at, updated_at, source, model_provider, cwd, title, archived, git_branch, preview)
        VALUES ('thread-one', '${sessionPath}', 10, 20, 'vscode', 'openai', '${project}', 'Imported project', 0, 'main', 'Imported project');`
      ]);
      execFileSync("sqlite3", [
        catalogDb,
        `CREATE TABLE local_thread_catalog (
          host_id TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          display_title TEXT NOT NULL,
          source_created_at REAL NOT NULL,
          source_updated_at REAL NOT NULL,
          cwd TEXT NOT NULL,
          source_kind TEXT NOT NULL,
          source_detail TEXT,
          model_provider TEXT NOT NULL,
          git_branch TEXT,
          observation_sequence INTEGER NOT NULL,
          missing_candidate INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(host_id, thread_id)
        );
        CREATE TABLE local_thread_catalog_hosts (
          host_id TEXT PRIMARY KEY,
          host_kind TEXT NOT NULL
        );
        CREATE TABLE local_thread_catalog_metadata (
          id INTEGER PRIMARY KEY,
          catalog_revision INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE local_thread_catalog_sync_state (
          host_id TEXT PRIMARY KEY,
          watermark_updated_at REAL,
          initial_build_complete INTEGER NOT NULL DEFAULT 0,
          observation_sequence INTEGER NOT NULL DEFAULT 0
        );`
      ]);

      await import("../src/codex-app.js").then(({ syncCodexAppProjects }) =>
        syncCodexAppProjects({ homeDir: home, cwd: dir })
      );

      const row = execFileSync("sqlite3", [
        catalogDb,
        "SELECT thread_id, display_title, cwd FROM local_thread_catalog WHERE thread_id = 'thread-one';"
      ]).toString().trim();
      expect(row).toBe(`thread-one|Imported project|${project}`);
    } finally {
      await fs.remove(dir);
    }
  });
});
