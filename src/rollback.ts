import path from "node:path";
import fs from "fs-extra";
import { createZipFromDirectory, extractZip, readZipText } from "./archive/zip.js";
import type { Provider } from "./providers/provider.js";
import type { ProviderId, RuntimeEnv } from "./types.js";

export interface RollbackClient {
  type: ProviderId;
  name: string;
  root_dir: string;
  existed: boolean;
}

export interface RollbackManifest {
  app: "ai-relay" | "aisession";
  kind: "rollback";
  version: 1;
  id: string;
  created_at: string;
  reason: "pre-import" | "pre-rollback";
  source_backup: string;
  clients: RollbackClient[];
}

export interface RollbackEntry {
  id: string;
  file: string;
  createdAt: string;
  sourceBackup: string;
  clients: RollbackClient[];
}

export function rollbackDir(env: RuntimeEnv): string {
  return path.join(env.homeDir, ".airelay", "rollbacks");
}

export async function createPreImportRollback(
  env: RuntimeEnv,
  providers: Provider[],
  sourceBackup: string
): Promise<RollbackEntry> {
  return createRollbackSnapshot(env, providers, sourceBackup, "pre_import", "pre-import");
}

async function createPreRollbackRollback(
  env: RuntimeEnv,
  providers: Provider[],
  sourceBackup: string
): Promise<RollbackEntry> {
  return createRollbackSnapshot(env, providers, sourceBackup, "pre_rollback", "pre-rollback");
}

async function createRollbackSnapshot(
  env: RuntimeEnv,
  providers: Provider[],
  sourceBackup: string,
  prefix: "pre_import" | "pre_rollback",
  reason: RollbackManifest["reason"]
): Promise<RollbackEntry> {
  const id = await nextRollbackId(env, prefix);
  const stagingDir = path.join(env.homeDir, ".airelay", "tmp", id);
  const outputFile = path.join(rollbackDir(env), `${id}.zip`);
  const clients: RollbackClient[] = [];

  await fs.remove(stagingDir);
  await fs.ensureDir(stagingDir);

  try {
    for (const provider of providers) {
      const root = provider.rootDir(env);
      const existed = await fs.pathExists(root);
      clients.push({
        type: provider.id,
        name: provider.name,
        root_dir: root,
        existed
      });

      if (existed) {
        await fs.copy(root, path.join(stagingDir, "clients", provider.id, "root"), {
          filter: isRollbackCopyablePath
        });
      }
    }

    const manifest: RollbackManifest = {
      app: "ai-relay",
      kind: "rollback",
      version: 1,
      id,
      created_at: new Date().toISOString(),
      reason,
      source_backup: path.resolve(sourceBackup),
      clients
    };

    await fs.writeJson(path.join(stagingDir, "rollback.json"), manifest, { spaces: 2 });
    await createZipFromDirectory(stagingDir, outputFile);

    return {
      id,
      file: outputFile,
      createdAt: manifest.created_at,
      sourceBackup: manifest.source_backup,
      clients
    };
  } finally {
    await fs.remove(stagingDir);
  }
}

export async function listRollbacks(env: RuntimeEnv): Promise<RollbackEntry[]> {
  const dir = rollbackDir(env);
  if (!(await fs.pathExists(dir))) {
    return [];
  }

  const files = (await fs.readdir(dir))
    .filter((file) => file.endsWith(".zip"))
    .map((file) => path.join(dir, file));
  const entries: RollbackEntry[] = [];

  for (const file of files) {
    try {
      const manifest = parseRollbackManifest(await readZipText(file, "rollback.json"));
      entries.push({
        id: manifest.id,
        file,
        createdAt: manifest.created_at,
        sourceBackup: manifest.source_backup,
        clients: manifest.clients
      });
    } catch {
      // Ignore unrelated or corrupted zip files in the rollback directory.
    }
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreRollback(env: RuntimeEnv, providers: Provider[], rollbackFileOrId: string): Promise<RollbackEntry> {
  const entry = await resolveRollback(env, rollbackFileOrId);
  await createPreRollbackRollback(env, providers, entry.file);
  const extractDir = path.join(env.homeDir, ".airelay", "tmp", `restore_${entry.id}`);
  await fs.remove(extractDir);
  await fs.ensureDir(extractDir);

  try {
    await extractZip(entry.file, extractDir);
    const manifest = parseRollbackManifest(await fs.readFile(path.join(extractDir, "rollback.json"), "utf8"));

    for (const client of manifest.clients) {
      const provider = providers.find((candidate) => candidate.id === client.type);
      if (!provider) {
        throw new Error(`Unsupported provider in rollback snapshot: ${client.type}`);
      }

      const targetRoot = provider.rootDir(env);
      const sourceRoot = path.join(extractDir, "clients", client.type, "root");
      await replaceProviderRoot(targetRoot, client.existed ? sourceRoot : undefined);
    }

    return entry;
  } finally {
    await fs.remove(extractDir);
  }
}

async function resolveRollback(env: RuntimeEnv, fileOrId: string): Promise<RollbackEntry> {
  const directPath = path.resolve(fileOrId);
  if (await fs.pathExists(directPath)) {
    const manifest = parseRollbackManifest(await readZipText(directPath, "rollback.json"));
    return {
      id: manifest.id,
      file: directPath,
      createdAt: manifest.created_at,
      sourceBackup: manifest.source_backup,
      clients: manifest.clients
    };
  }

  const entries = await listRollbacks(env);
  const matches = entries.filter((candidate) => candidate.id === fileOrId || candidate.id.includes(fileOrId));
  if (matches.length > 1) {
    throw new Error(`Rollback "${fileOrId}" is ambiguous. Use the full rollback id.`);
  }
  const entry = matches[0];
  if (!entry) {
    throw new Error(`Rollback "${fileOrId}" not found.`);
  }
  return entry;
}

function parseRollbackManifest(raw: string): RollbackManifest {
  const manifest = JSON.parse(raw) as RollbackManifest;
  if (!isSupportedApp(manifest.app) || manifest.kind !== "rollback" || manifest.version !== 1) {
    throw new Error("Invalid ai-relay rollback manifest.");
  }
  return manifest;
}

function isSupportedApp(app: string): app is RollbackManifest["app"] {
  return app === "ai-relay" || app === "aisession";
}

function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(".", "");
}

async function nextRollbackId(env: RuntimeEnv, prefix: "pre_import" | "pre_rollback"): Promise<string> {
  const base = `${prefix}_${timestampForFile(new Date())}`;
  let id = base;
  let attempt = 1;
  while (await fs.pathExists(path.join(rollbackDir(env), `${id}.zip`))) {
    id = `${base}_${attempt}`;
    attempt += 1;
  }
  return id;
}

async function replaceProviderRoot(targetRoot: string, sourceRoot: string | undefined): Promise<void> {
  const parent = path.dirname(targetRoot);
  const base = path.basename(targetRoot);
  const token = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const nextRoot = path.join(parent, `.${base}.next_${token}`);
  const oldRoot = path.join(parent, `.${base}.old_${token}`);

  await fs.ensureDir(parent);
  if (sourceRoot && (await fs.pathExists(sourceRoot))) {
    await fs.copy(sourceRoot, nextRoot, { overwrite: true, errorOnExist: false });
  }

  try {
    if (await fs.pathExists(targetRoot)) {
      await fs.move(targetRoot, oldRoot, { overwrite: false });
    }
    if (await fs.pathExists(nextRoot)) {
      await fs.move(nextRoot, targetRoot, { overwrite: false });
    }
    await fs.remove(oldRoot);
  } catch (error) {
    if (!(await fs.pathExists(targetRoot)) && (await fs.pathExists(oldRoot))) {
      await fs.move(oldRoot, targetRoot, { overwrite: false });
    }
    await fs.remove(nextRoot);
    throw error;
  }
}

async function isRollbackCopyablePath(source: string): Promise<boolean> {
  const stat = await fs.lstat(source);
  return stat.isDirectory() || stat.isFile() || stat.isSymbolicLink();
}
