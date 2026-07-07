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
  reason: "pre-import";
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
  const id = `pre_import_${timestampForFile(new Date())}`;
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
        await fs.copy(root, path.join(stagingDir, "clients", provider.id, "root"));
      }
    }

    const manifest: RollbackManifest = {
      app: "ai-relay",
      kind: "rollback",
      version: 1,
      id,
      created_at: new Date().toISOString(),
      reason: "pre-import",
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
  const extractDir = path.join(env.homeDir, ".airelay", "tmp", `restore_${entry.id}`);
  await fs.remove(extractDir);
  await fs.ensureDir(extractDir);

  try {
    await extractZip(entry.file, extractDir);
    const manifest = parseRollbackManifest(await fs.readFile(path.join(extractDir, "rollback.json"), "utf8"));

    for (const client of manifest.clients) {
      const provider = providers.find((candidate) => candidate.id === client.type);
      if (!provider) {
        continue;
      }

      const targetRoot = provider.rootDir(env);
      await fs.remove(targetRoot);

      if (client.existed) {
        const sourceRoot = path.join(extractDir, "clients", client.type, "root");
        if (await fs.pathExists(sourceRoot)) {
          await fs.copy(sourceRoot, targetRoot, { overwrite: true, errorOnExist: false });
        }
      }
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
  const entry = entries.find((candidate) => candidate.id === fileOrId || candidate.id.includes(fileOrId));
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
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
