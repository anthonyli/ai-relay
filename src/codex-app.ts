import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "fs-extra";
import type { RuntimeEnv } from "./types.js";

const execFileAsync = promisify(execFile);
const PERSISTED_STATE_KEY = "electron-persisted-atom-state";
const SAVED_WORKSPACE_ROOTS_KEY = "electron-saved-workspace-roots";
const PROJECT_ORDER_KEY = "project-order";
const SIDEBAR_PROJECT_KEY_PREFIX = "sidebar-project-expanded-v1-codex:";

interface ExecuteFileResult {
  stdout: string;
  stderr: string;
}

type ExecuteFile = (file: string, args: string[]) => Promise<ExecuteFileResult>;

export interface CodexAppSyncResult {
  addedProjectCount: number;
  sqlite: {
    status: "not-found" | "synced" | "skipped" | "failed";
    message?: string;
  };
}

export interface CodexAppSyncDependencies {
  executeFile?: ExecuteFile;
}

export async function syncCodexAppProjects(
  env: RuntimeEnv,
  dependencies: CodexAppSyncDependencies = {}
): Promise<CodexAppSyncResult> {
  const codexRoot = path.join(env.homeDir, ".codex");
  const sessionsRoot = path.join(codexRoot, "sessions");
  const globalStatePath = path.join(codexRoot, ".codex-global-state.json");
  const executeFile = dependencies.executeFile ?? defaultExecuteFile;

  const projectRoots = (await fs.pathExists(sessionsRoot)) ? await collectSessionProjectRoots(sessionsRoot) : [];
  const sqlite = await syncLocalThreadCatalog(codexRoot, executeFile);
  if (projectRoots.length === 0) {
    return { addedProjectCount: 0, sqlite };
  }

  const state = await readCodexGlobalState(globalStatePath);
  const persisted = ensureRecord(state[PERSISTED_STATE_KEY]);
  state[PERSISTED_STATE_KEY] = persisted;

  const existingSavedRoots = toStringArray(persisted[SAVED_WORKSPACE_ROOTS_KEY]);
  const existingProjectOrder = toStringArray(persisted[PROJECT_ORDER_KEY]);
  const nextSavedRoots = appendUnique(existingSavedRoots, projectRoots);
  const nextProjectOrder = appendUnique(existingProjectOrder, projectRoots);
  const added = nextSavedRoots.length - existingSavedRoots.length;
  let changed = added > 0 || nextProjectOrder.length !== existingProjectOrder.length;

  for (const projectRoot of projectRoots) {
    const key = `${SIDEBAR_PROJECT_KEY_PREFIX}${projectRoot}`;
    if (!(key in persisted)) {
      persisted[key] = false;
      changed = true;
    }
  }

  if (!changed) {
    return { addedProjectCount: 0, sqlite };
  }

  persisted[SAVED_WORKSPACE_ROOTS_KEY] = nextSavedRoots;
  persisted[PROJECT_ORDER_KEY] = nextProjectOrder;
  await fs.ensureDir(codexRoot);
  await fs.writeJson(globalStatePath, state);
  return { addedProjectCount: added, sqlite };
}

async function collectSessionProjectRoots(sessionsRoot: string): Promise<string[]> {
  const roots: string[] = [];
  for (const file of await walkFiles(sessionsRoot)) {
    const cwd = await readSessionCwd(file);
    if (!cwd || !path.isAbsolute(cwd) || roots.includes(cwd)) {
      continue;
    }
    roots.push(cwd);
  }
  return roots;
}

async function syncLocalThreadCatalog(
  codexRoot: string,
  executeFile: ExecuteFile
): Promise<CodexAppSyncResult["sqlite"]> {
  const stateDb = path.join(codexRoot, "state_5.sqlite");
  const catalogDb = path.join(codexRoot, "sqlite", "codex-dev.db");
  if (!(await fs.pathExists(stateDb)) || !(await fs.pathExists(catalogDb))) {
    return { status: "not-found" };
  }

  try {
    const missingSchema = [
      ...(await missingColumns(executeFile, stateDb, "threads", [
        "id", "title", "created_at", "updated_at", "cwd", "source", "model_provider", "git_branch", "archived", "preview"
      ])),
      ...(await missingColumns(executeFile, catalogDb, "local_thread_catalog", [
        "host_id", "thread_id", "display_title", "source_created_at", "source_updated_at", "cwd", "source_kind",
        "source_detail", "model_provider", "git_branch", "observation_sequence", "missing_candidate"
      ])),
      ...(await missingColumns(executeFile, catalogDb, "local_thread_catalog_hosts", ["host_id", "host_kind"])),
      ...(await missingColumns(executeFile, catalogDb, "local_thread_catalog_metadata", ["id", "catalog_revision"])),
      ...(await missingColumns(executeFile, catalogDb, "local_thread_catalog_sync_state", [
        "host_id", "watermark_updated_at", "initial_build_complete", "observation_sequence"
      ]))
    ];
    if (missingSchema.length > 0) {
      return {
        status: "skipped",
        message: `Codex App sqlite schema is missing: ${missingSchema.join(", ")}`
      };
    }

    const sql = `
ATTACH DATABASE '${escapeSqlString(stateDb)}' AS state;
WITH source_threads AS (
  SELECT
    id,
    title,
    created_at,
    updated_at,
    cwd,
    source,
    model_provider,
    git_branch,
    ROW_NUMBER() OVER (ORDER BY updated_at, id) AS row_num
  FROM state.threads
  WHERE archived = 0
    AND preview <> ''
), base AS (
  SELECT COALESCE(MAX(observation_sequence), 0) AS max_seq FROM local_thread_catalog
)
INSERT OR REPLACE INTO local_thread_catalog (
  host_id,
  thread_id,
  display_title,
  source_created_at,
  source_updated_at,
  cwd,
  source_kind,
  source_detail,
  model_provider,
  git_branch,
  observation_sequence,
  missing_candidate
)
SELECT
  'local',
  source_threads.id,
  source_threads.title,
  source_threads.created_at,
  source_threads.updated_at,
  source_threads.cwd,
  source_threads.source,
  NULL,
  source_threads.model_provider,
  source_threads.git_branch,
  base.max_seq + source_threads.row_num,
  0
FROM source_threads, base;
INSERT OR IGNORE INTO local_thread_catalog_hosts(host_id, host_kind) VALUES ('local', 'local');
INSERT INTO local_thread_catalog_metadata(id, catalog_revision) VALUES (1, 1)
ON CONFLICT(id) DO UPDATE SET catalog_revision = catalog_revision + 1;
INSERT INTO local_thread_catalog_sync_state(host_id, watermark_updated_at, initial_build_complete, observation_sequence) VALUES (
  'local',
  (SELECT MAX(updated_at) FROM state.threads),
  1,
  (SELECT COALESCE(MAX(observation_sequence), 0) FROM local_thread_catalog)
)
ON CONFLICT(host_id) DO UPDATE SET
  watermark_updated_at = excluded.watermark_updated_at,
  initial_build_complete = 1,
  observation_sequence = excluded.observation_sequence;
DETACH DATABASE state;
`;

    await executeFile("sqlite3", [catalogDb, sql]);
    return { status: "synced" };
  } catch (error) {
    return { status: "failed", message: sqliteErrorMessage(error) };
  }
}

async function missingColumns(
  executeFile: ExecuteFile,
  database: string,
  table: string,
  requiredColumns: string[]
): Promise<string[]> {
  const result = await executeFile("sqlite3", [database, `PRAGMA table_info('${escapeSqlString(table)}');`]);
  const actualColumns = new Set(
    result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split("|")[1])
      .filter((column): column is string => Boolean(column))
  );
  if (actualColumns.size === 0) {
    return [`${table} table`];
  }
  return requiredColumns.filter((column) => !actualColumns.has(column)).map((column) => `${table}.${column}`);
}

async function defaultExecuteFile(file: string, args: string[]): Promise<ExecuteFileResult> {
  const result = await execFileAsync(file, args);
  return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
}

function sqliteErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return "sqlite3 command is not available";
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\r?\n/)[0]?.slice(0, 240) || "sqlite synchronization failed";
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

async function readSessionCwd(file: string): Promise<string | undefined> {
  const content = await fs.readFile(file, "utf8");
  for (const line of content.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const parsed = parseJsonLine(line);
    const cwd = findCwd(parsed);
    if (cwd) {
      return cwd;
    }
  }
  return undefined;
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function findCwd(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.cwd === "string") {
    return value.cwd;
  }
  if (isRecord(value.payload) && typeof value.payload.cwd === "string") {
    return value.payload.cwd;
  }
  if (isRecord(value.item) && isRecord(value.item.payload) && typeof value.item.payload.cwd === "string") {
    return value.item.payload.cwd;
  }
  return undefined;
}

async function readCodexGlobalState(globalStatePath: string): Promise<Record<string, unknown>> {
  if (!(await fs.pathExists(globalStatePath))) {
    return {};
  }
  const parsed = await fs.readJson(globalStatePath).catch(() => undefined);
  return ensureRecord(parsed);
}

function ensureRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function appendUnique(existing: string[], additions: string[]): string[] {
  const result = [...existing];
  for (const addition of additions) {
    if (!result.includes(addition)) {
      result.push(addition);
    }
  }
  return result;
}

async function walkFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(absolute)));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".jsonl") {
      result.push(absolute);
    }
  }
  return result;
}
