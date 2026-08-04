import { describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createZipFromDirectory } from "../src/archive/zip.js";
import { syncCodexAppProjects } from "../src/codex-app.js";
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

      const output: string[] = [];
      const outputSpy = vi.spyOn(console, "log").mockImplementation((value) => output.push(String(value)));
      await importCommand(
        { env: { homeDir: home, cwd: dir }, config: { version: "1.1", storage: { type: "local" }, cloud_sync: { enabled: false } } },
        backup,
        { only: ["codex"], yes: true, json: true }
      );
      outputSpy.mockRestore();

      const importResult = JSON.parse(output.at(-1) ?? "{}") as {
        codexAppProjectCount?: number;
        codexAppSync?: { addedProjectCount: number };
      };
      expect(importResult.codexAppProjectCount).toBe(2);
      expect(importResult.codexAppSync?.addedProjectCount).toBe(2);

      const state = await fs.readJson(globalState);
      const persisted = state["electron-persisted-atom-state"];
      expect(persisted["electron-saved-workspace-roots"]).toEqual(
        expect.arrayContaining([existingProject, restoredProject, missingProject])
      );
      const localProjects = state["local-projects"] as Record<string, { id: string; rootPaths: string[] }>;
      const projectRoots = Object.values(localProjects).flatMap((project) => project.rootPaths);
      expect(projectRoots).toEqual(expect.arrayContaining([restoredProject, missingProject]));
      expect(state["project-order"]).toEqual(expect.arrayContaining(Object.keys(localProjects)));
      expect(persisted["project-order"]).toEqual(state["project-order"]);
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

      const result = await syncCodexAppProjects({ homeDir: home, cwd: dir });

      const row = execFileSync("sqlite3", [
        catalogDb,
        "SELECT thread_id, display_title, cwd FROM local_thread_catalog WHERE thread_id = 'thread-one';"
      ]).toString().trim();
      expect(row).toBe(`thread-one|Imported project|${project}`);
      expect(result.sqlite.status).toBe("synced");
    } finally {
      await fs.remove(dir);
    }
  });

  it("rebuilds Codex App threads and catalog entries from restored session JSONL files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-codex-session-rebuild-"));
    const home = path.join(dir, "home");
    const codexRoot = path.join(home, ".codex");
    const stateDb = path.join(codexRoot, "state_5.sqlite");
    const catalogDb = path.join(codexRoot, "sqlite", "codex-dev.db");
    const sessionIndexPath = path.join(codexRoot, "session_index.jsonl");
    const sessionPath = path.join(codexRoot, "sessions", "2026", "07", "08", "restored.jsonl");
    const unindexedSessionPath = path.join(codexRoot, "sessions", "2026", "07", "08", "unindexed.jsonl");
    const project = path.join(dir, "project");

    try {
      await fs.ensureDir(path.dirname(catalogDb));
      await fs.ensureDir(path.dirname(sessionPath));
      await fs.writeFile(
        sessionPath,
        [
          JSON.stringify({
            type: "session_meta",
            timestamp: "2026-07-08T09:00:00.000Z",
            payload: {
              id: "thread-from-session",
              cwd: project,
              timestamp: "2026-07-08T09:00:00.000Z",
              cli_version: "1.0.0",
              git: { branch: "main" }
            }
          }),
          JSON.stringify({
            type: "response_item",
            timestamp: "2026-07-08T09:01:00.000Z",
            payload: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "<recommended_plugins> not a task title" }]
            }
          })
        ].join("\n") + "\n"
      );
      await fs.writeFile(
        unindexedSessionPath,
        JSON.stringify({
          type: "session_meta",
          timestamp: "2026-07-08T09:02:00.000Z",
          payload: { id: "not-in-index", cwd: project, timestamp: "2026-07-08T09:02:00.000Z" }
        }) + "\n"
      );
      await fs.writeFile(
        sessionIndexPath,
        JSON.stringify({ id: "thread-from-session", thread_name: "Saved session title", updated_at: 1 }) + "\n"
      );
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
          preview TEXT NOT NULL DEFAULT '',
          thread_source TEXT
        );
        INSERT INTO threads (id, rollout_path, created_at, updated_at, source, model_provider, cwd, title, archived, preview, thread_source)
        VALUES ('legacy-bad-import', '${unindexedSessionPath}', 1, 1, 'cli', 'openai', '${project}', '<recommended_plugins> not a task title', 0, '<recommended_plugins> not a task title', 'user');`
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

      const result = await syncCodexAppProjects({ homeDir: home, cwd: dir });

      const stateRow = execFileSync("sqlite3", [
        stateDb,
<<<<<<< Updated upstream
        "SELECT title, cwd, preview FROM threads WHERE id = 'thread-from-session';"
=======
        "SELECT title, cwd, preview, source, thread_source FROM threads WHERE id = 'thread-from-session';"
>>>>>>> Stashed changes
      ]).toString().trim();
      const stateCount = execFileSync("sqlite3", [stateDb, "SELECT COUNT(*) FROM threads;"]).toString().trim();
      const catalogRow = execFileSync("sqlite3", [
        catalogDb,
<<<<<<< Updated upstream
        "SELECT display_title, cwd FROM local_thread_catalog WHERE thread_id = 'thread-from-session';"
      ]).toString().trim();
      const state = await fs.readJson(path.join(codexRoot, ".codex-global-state.json"));
      const persisted = state["electron-persisted-atom-state"] as Record<string, unknown>;

      expect(stateRow).toBe(`Saved session title|${project}|Saved session title`);
      expect(stateCount).toBe("1");
      expect(catalogRow).toBe(`Saved session title|${project}`);
      expect(persisted["electron-saved-workspace-roots"]).toEqual([project]);
=======
        "SELECT display_title, cwd, source_kind FROM local_thread_catalog WHERE thread_id = 'thread-from-session';"
      ]).toString().trim();
      const state = await fs.readJson(path.join(codexRoot, ".codex-global-state.json"));
      const persisted = state["electron-persisted-atom-state"] as Record<string, unknown>;
      const localProjects = state["local-projects"] as Record<string, { id: string; rootPaths: string[] }>;
      const importedProject = Object.values(localProjects).find((value) => value.rootPaths.includes(project));
      const assignments = state["thread-project-assignments"] as Record<string, { projectId: string; projectKind: string }>;

      expect(stateRow).toBe(`Saved session title|${project}|Saved session title|cli|ai-relay-import`);
      expect(stateCount).toBe("1");
      expect(catalogRow).toBe(`Saved session title|${project}|cli`);
      expect(persisted["electron-saved-workspace-roots"]).toEqual([project]);
      expect(importedProject).toBeDefined();
      expect(assignments["thread-from-session"]).toMatchObject({ projectKind: "local", projectId: importedProject?.id });
      expect(state["project-order"]).toContain(importedProject?.id);
>>>>>>> Stashed changes
      expect(result).toMatchObject({ addedProjectCount: 1, sqlite: { status: "synced" } });
    } finally {
      await fs.remove(dir);
    }
  });

  it("reports when Codex App sqlite databases are not present", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-codex-catalog-missing-"));
    try {
      const result = await syncCodexAppProjects({ homeDir: path.join(dir, "home"), cwd: dir });
      expect(result).toEqual({
        addedProjectCount: 0,
        sqlite: { status: "not-found" }
      });
    } finally {
      await fs.remove(dir);
    }
  });

  it("reports an incompatible Codex App sqlite schema without failing session restore", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-codex-catalog-schema-"));
    const home = path.join(dir, "home");
    const stateDb = path.join(home, ".codex", "state_5.sqlite");
    const catalogDb = path.join(home, ".codex", "sqlite", "codex-dev.db");
    try {
      await fs.ensureDir(path.dirname(stateDb));
      await fs.ensureDir(path.dirname(catalogDb));
      execFileSync("sqlite3", [stateDb, "VACUUM;"]);
      execFileSync("sqlite3", [catalogDb, "VACUUM;"]);

      const result = await syncCodexAppProjects({ homeDir: home, cwd: dir });

      expect(result.addedProjectCount).toBe(0);
      expect(result.sqlite.status).toBe("skipped");
      expect(result.sqlite.message).toMatch(/schema/i);
    } finally {
      await fs.remove(dir);
    }
  });

  it("reports sqlite command failures instead of swallowing them", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-codex-catalog-failed-"));
    const home = path.join(dir, "home");
    const stateDb = path.join(home, ".codex", "state_5.sqlite");
    const catalogDb = path.join(home, ".codex", "sqlite", "codex-dev.db");
    try {
      await fs.ensureDir(path.dirname(stateDb));
      await fs.ensureDir(path.dirname(catalogDb));
      await fs.writeFile(stateDb, "placeholder");
      await fs.writeFile(catalogDb, "placeholder");

      const result = await syncCodexAppProjects(
        { homeDir: home, cwd: dir },
        { executeFile: async () => { throw new Error("sqlite unavailable"); } }
      );

      expect(result.addedProjectCount).toBe(0);
      expect(result.sqlite).toEqual({ status: "failed", message: "sqlite unavailable" });
    } finally {
      await fs.remove(dir);
    }
  });

  it("runs the catalog mutation as a fail-fast sqlite transaction", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-codex-catalog-transaction-"));
    const home = path.join(dir, "home");
    const stateDb = path.join(home, ".codex", "state_5.sqlite");
    const catalogDb = path.join(home, ".codex", "sqlite", "codex-dev.db");
    let mutationArgs: string[] | undefined;
    const columns: Record<string, string[]> = {
      threads: ["id", "title", "created_at", "updated_at", "cwd", "source", "model_provider", "git_branch", "archived", "preview"],
      local_thread_catalog: ["host_id", "thread_id", "display_title", "source_created_at", "source_updated_at", "cwd", "source_kind", "source_detail", "model_provider", "git_branch", "observation_sequence", "missing_candidate"],
      local_thread_catalog_hosts: ["host_id", "host_kind"],
      local_thread_catalog_metadata: ["id", "catalog_revision"],
      local_thread_catalog_sync_state: ["host_id", "watermark_updated_at", "initial_build_complete", "observation_sequence"]
    };

    try {
      await fs.ensureDir(path.dirname(stateDb));
      await fs.ensureDir(path.dirname(catalogDb));
      await fs.writeFile(stateDb, "placeholder");
      await fs.writeFile(catalogDb, "placeholder");

      const result = await syncCodexAppProjects({ homeDir: home, cwd: dir }, {
        executeFile: async (_file, args) => {
          const sql = args.at(-1) ?? "";
          const table = /table_info\('([^']+)'\)/.exec(sql)?.[1];
          if (table) {
            return {
              stdout: (columns[table] ?? []).map((column, index) => `${index}|${column}|TEXT|0||0`).join("\n"),
              stderr: ""
            };
          }
          mutationArgs = args;
          return { stdout: "", stderr: "" };
        }
      });

      expect(result.sqlite.status).toBe("synced");
      expect(mutationArgs?.[0]).toBe("-bail");
      const mutationSql = mutationArgs?.at(-1) ?? "";
      expect(mutationSql).toMatch(/BEGIN IMMEDIATE;/);
      expect(mutationSql).toMatch(/COMMIT;/);
      expect(mutationSql.indexOf("BEGIN IMMEDIATE;")).toBeLessThan(mutationSql.indexOf("INSERT OR REPLACE"));
    } finally {
      await fs.remove(dir);
    }
  });
});
