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

interface RestoredThread {
  id: string;
  rolloutPath: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  title: string;
  preview: string;
  firstUserMessage: string;
  cliVersion?: string;
  gitBranch?: string;
}

interface SqliteColumn {
  name: string;
  notNull: boolean;
  defaultValue: string | null;
}

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

  const hasSessions = await fs.pathExists(sessionsRoot);
  const indexedThreadNames = await readSessionIndex(path.join(codexRoot, "session_index.jsonl"));
  const restoredThreads = hasSessions ? await collectRestoredThreads(sessionsRoot, indexedThreadNames) : [];
  const projectRoots = hasSessions ? await collectSessionProjectRoots(sessionsRoot) : [];
  const sqlite = await syncLocalThreadCatalog(codexRoot, sessionsRoot, restoredThreads, executeFile);
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

async function collectRestoredThreads(sessionsRoot: string, indexedThreadNames: Map<string, string>): Promise<RestoredThread[]> {
  const threads = new Map<string, RestoredThread>();
  for (const file of await walkFiles(sessionsRoot)) {
    const thread = await readRestoredThread(file, indexedThreadNames);
    if (!thread || !path.isAbsolute(thread.cwd)) {
      continue;
    }
    const existing = threads.get(thread.id);
    if (!existing || existing.updatedAt < thread.updatedAt) {
      threads.set(thread.id, thread);
    }
  }
  return [...threads.values()];
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
  sessionsRoot: string,
  restoredThreads: RestoredThread[],
  executeFile: ExecuteFile
): Promise<CodexAppSyncResult["sqlite"]> {
  const stateDb = path.join(codexRoot, "state_5.sqlite");
  const catalogDb = path.join(codexRoot, "sqlite", "codex-dev.db");
  if (!(await fs.pathExists(stateDb)) || !(await fs.pathExists(catalogDb))) {
    return { status: "not-found" };
  }

  try {
    const stateColumns = await tableColumns(executeFile, stateDb, "threads");
    const missingSchema = [
      ...missingColumns(stateColumns, "threads", [
        "id", "title", "created_at", "updated_at", "cwd", "source", "model_provider", "git_branch", "archived", "preview"
      ]),
      ...missingColumns(await tableColumns(executeFile, catalogDb, "local_thread_catalog"), "local_thread_catalog", [
        "host_id", "thread_id", "display_title", "source_created_at", "source_updated_at", "cwd", "source_kind",
        "source_detail", "model_provider", "git_branch", "observation_sequence", "missing_candidate"
      ]),
      ...missingColumns(await tableColumns(executeFile, catalogDb, "local_thread_catalog_hosts"), "local_thread_catalog_hosts", ["host_id", "host_kind"]),
      ...missingColumns(await tableColumns(executeFile, catalogDb, "local_thread_catalog_metadata"), "local_thread_catalog_metadata", ["id", "catalog_revision"]),
      ...missingColumns(await tableColumns(executeFile, catalogDb, "local_thread_catalog_sync_state"), "local_thread_catalog_sync_state", [
        "host_id", "watermark_updated_at", "initial_build_complete", "observation_sequence"
      ])
    ];
    if (missingSchema.length > 0) {
      return {
        status: "skipped",
        message: `Codex App sqlite schema is missing: ${missingSchema.join(", ")}`
      };
    }

    const sql = `
ATTACH DATABASE '${escapeSqlString(stateDb)}' AS state;
BEGIN IMMEDIATE;
${buildLegacyImportCleanupSql(stateColumns, sessionsRoot)}
${buildThreadInsertSql(restoredThreads, stateColumns)}
DELETE FROM local_thread_catalog
WHERE host_id = 'local'
  AND thread_id NOT IN (SELECT id FROM state.threads);
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
COMMIT;
DETACH DATABASE state;
`;

    await executeFile("sqlite3", ["-bail", catalogDb, sql]);
    return { status: "synced" };
  } catch (error) {
    return { status: "failed", message: sqliteErrorMessage(error) };
  }
}

async function tableColumns(
  executeFile: ExecuteFile,
  database: string,
  table: string
): Promise<SqliteColumn[]> {
  const result = await executeFile("sqlite3", [database, `PRAGMA table_info('${escapeSqlString(table)}');`]);
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [, name, , notNull, defaultValue] = line.split("|");
      return { name: name ?? "", notNull: notNull === "1", defaultValue: defaultValue || null };
    })
    .filter((column) => Boolean(column.name));
}

function missingColumns(columns: SqliteColumn[], table: string, requiredColumns: string[]): string[] {
  if (columns.length === 0) {
    return [`${table} table`];
  }
  const actualColumns = new Set(columns.map((column) => column.name));
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

async function readRestoredThread(file: string, indexedThreadNames: Map<string, string>): Promise<RestoredThread | undefined> {
  const content = await fs.readFile(file, "utf8");
  const stat = await fs.stat(file);
  let id: string | undefined;
  let cwd: string | undefined;
  let createdAt: number | undefined;
  let updatedAt: number | undefined;
  let cliVersion: string | undefined;
  let gitBranch: string | undefined;
  let firstUserMessage: string | undefined;

  for (const line of content.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const parsed = parseJsonLine(line);
    const timestamp = timestampSeconds(isRecord(parsed) ? parsed.timestamp : undefined);
    if (timestamp) {
      createdAt = Math.min(createdAt ?? timestamp, timestamp);
      updatedAt = Math.max(updatedAt ?? timestamp, timestamp);
    }
    if (!isRecord(parsed)) {
      continue;
    }
    if (parsed.type === "session_meta" && isRecord(parsed.payload)) {
      const payload = parsed.payload;
      if (typeof payload.id === "string") {
        id = payload.id;
      }
      if (typeof payload.cwd === "string") {
        cwd = payload.cwd;
      }
      if (typeof payload.cli_version === "string") {
        cliVersion = payload.cli_version;
      }
      if (isRecord(payload.git) && typeof payload.git.branch === "string") {
        gitBranch = payload.git.branch;
      }
      const payloadTimestamp = timestampSeconds(payload.timestamp);
      if (payloadTimestamp) {
        createdAt = Math.min(createdAt ?? payloadTimestamp, payloadTimestamp);
        updatedAt = Math.max(updatedAt ?? payloadTimestamp, payloadTimestamp);
      }
    }
    if (!firstUserMessage) {
      firstUserMessage = findUserMessage(parsed);
    }
  }

  if (!id || !cwd) {
    return undefined;
  }
  const indexedTitle = indexedThreadNames.get(id);
  if (indexedThreadNames.size > 0 && !indexedTitle) {
    return undefined;
  }
  const fallback = Math.max(1, Math.floor(stat.mtimeMs / 1000));
  const title = titleFromMessage(indexedTitle ?? firstUserMessage);
  return {
    id,
    rolloutPath: file,
    createdAt: createdAt ?? fallback,
    updatedAt: updatedAt ?? fallback,
    cwd,
    title,
    preview: title,
    firstUserMessage: firstUserMessage ?? "",
    cliVersion,
    gitBranch
  };
}

async function readSessionCwd(file: string): Promise<string | undefined> {
  const content = await fs.readFile(file, "utf8");
  for (const line of content.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const cwd = findCwd(parseJsonLine(line));
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

function findUserMessage(value: Record<string, unknown>): string | undefined {
  if (value.type !== "response_item" || !isRecord(value.payload) || value.payload.role !== "user") {
    return undefined;
  }
  const content = value.payload.content;
  if (typeof content === "string") {
    return isInjectedMessage(content) ? undefined : content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const item of content) {
    if (isRecord(item) && typeof item.text === "string") {
      return isInjectedMessage(item.text) ? undefined : item.text;
    }
  }
  return undefined;
}

function isInjectedMessage(value: string): boolean {
  return /^\s*<(recommended_plugins|environment_context|permissions instructions|app-context)>/i.test(value);
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

function timestampSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value > 10_000_000_000 ? value / 1000 : value));
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed / 1000));
    }
  }
  return undefined;
}

function titleFromMessage(message: string | undefined): string {
  const normalized = (message ?? "").replace(/\s+/g, " ").trim();
  return normalized.slice(0, 120) || "Imported Codex session";
}

async function readSessionIndex(file: string): Promise<Map<string, string>> {
  if (!(await fs.pathExists(file))) {
    return new Map();
  }
  const entries = new Map<string, string>();
  const content = await fs.readFile(file, "utf8");
  for (const line of content.split("\n")) {
    const parsed = parseJsonLine(line);
    if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.thread_name !== "string") {
      continue;
    }
    const title = parsed.thread_name.trim();
    if (title) {
      entries.set(parsed.id, title);
    }
  }
  return entries;
}

function buildLegacyImportCleanupSql(columns: SqliteColumn[], sessionsRoot: string): string {
  const statements = ["DELETE FROM state.threads WHERE source = 'ai-relay';"];
  if (columns.some((column) => column.name === "thread_source")) {
    statements.push(
      `DELETE FROM state.threads WHERE source = 'cli' AND thread_source = 'user' AND rollout_path LIKE '${escapeSqlString(`${sessionsRoot}/%`)}';`
    );
  }
  return statements.join("\n");
}

function buildThreadInsertSql(threads: RestoredThread[], columns: SqliteColumn[]): string {
  if (threads.length === 0) {
    return "";
  }
  const valuesByColumn: Record<string, (thread: RestoredThread) => string | number | null> = {
    id: (thread) => thread.id,
    rollout_path: (thread) => thread.rolloutPath,
    created_at: (thread) => thread.createdAt,
    updated_at: (thread) => thread.updatedAt,
    source: () => "ai-relay",
    model_provider: () => "openai",
    cwd: (thread) => thread.cwd,
    title: (thread) => thread.title,
    sandbox_policy: () => "{}",
    approval_mode: () => "on-request",
    has_user_event: () => 1,
    archived: () => 0,
    git_branch: (thread) => thread.gitBranch ?? null,
    preview: (thread) => thread.preview,
    cli_version: (thread) => thread.cliVersion ?? "",
    first_user_message: (thread) => thread.firstUserMessage,
    memory_mode: () => "enabled",
    thread_source: () => "ai-relay-import",
    recency_at: (thread) => thread.updatedAt,
    recency_at_ms: (thread) => thread.updatedAt * 1000,
    history_mode: () => "legacy",
    name: (thread) => thread.title,
    is_pinned: () => 0
  };
  const missingRequired = columns.filter((column) => column.notNull && column.defaultValue === null && !(column.name in valuesByColumn));
  if (missingRequired.length > 0) {
    throw new Error(`Codex App threads schema has unsupported required columns: ${missingRequired.map((column) => column.name).join(", ")}`);
  }
  const insertColumns = columns.map((column) => column.name).filter((column) => column in valuesByColumn);
  const rows = threads.map((thread) => `(${insertColumns.map((column) => sqlValue(valuesByColumn[column]!(thread))).join(", ")})`);
  return `INSERT OR IGNORE INTO state.threads (${insertColumns.join(", ")}) VALUES\n${rows.join(",\n")};`;
}

function sqlValue(value: string | number | null): string {
  if (value === null) {
    return "NULL";
  }
  return typeof value === "number" ? String(value) : `'${escapeSqlString(value)}'`;
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
