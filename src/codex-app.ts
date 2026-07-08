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

export async function syncCodexAppProjects(env: RuntimeEnv): Promise<number> {
  const codexRoot = path.join(env.homeDir, ".codex");
  const sessionsRoot = path.join(codexRoot, "sessions");
  const globalStatePath = path.join(codexRoot, ".codex-global-state.json");
  if (!(await fs.pathExists(sessionsRoot))) {
    return 0;
  }

  const projectRoots = await collectSessionProjectRoots(sessionsRoot);
  await syncLocalThreadCatalog(codexRoot);
  if (projectRoots.length === 0) {
    return 0;
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
    return 0;
  }

  persisted[SAVED_WORKSPACE_ROOTS_KEY] = nextSavedRoots;
  persisted[PROJECT_ORDER_KEY] = nextProjectOrder;
  await fs.ensureDir(codexRoot);
  await fs.writeJson(globalStatePath, state);
  return added;
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

async function syncLocalThreadCatalog(codexRoot: string): Promise<void> {
  const stateDb = path.join(codexRoot, "state_5.sqlite");
  const catalogDb = path.join(codexRoot, "sqlite", "codex-dev.db");
  if (!(await fs.pathExists(stateDb)) || !(await fs.pathExists(catalogDb))) {
    return;
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

  await execFileAsync("sqlite3", [catalogDb, sql]).catch(() => undefined);
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
