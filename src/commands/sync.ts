import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import fs from "fs-extra";
import { isCloudSyncConfigured } from "../config.js";
import { t } from "../i18n.js";
import { info, success, warn } from "../output.js";
import { createRemoteStorage, type RemoteStorage } from "../storage/index.js";
import type { CommandContext } from "./context.js";
import { exportCommand } from "./export.js";
import { importCommand } from "./import.js";

export async function syncCommand(
  context: CommandContext,
  action: "push" | "pull" | "sync",
  options: { storage?: RemoteStorage; backup?: string } = {}
): Promise<void> {
  if (!isCloudSyncConfigured(context.config)) {
    warn(t("sync.requiresStorage", { action }));
    info(t("sync.storageHint"));
    return;
  }

  const resolved = createRemoteStorage(context.config);
  const storage = options.storage ?? resolved.storage;

  if (action === "pull" || action === "sync") {
    if (!options.backup) {
      throw new Error("Remote backup file is required. Example: airelay pull backup_2026-07-08.zip");
    }
    await pullBackup(context, storage, resolved.bucket, remoteKey(resolved.prefix, options.backup));
  }

  if (action === "push" || action === "sync") {
    await pushBackup(context, storage, resolved.bucket, resolved.prefix, options.backup);
  }
}

async function pushBackup(
  context: CommandContext,
  storage: RemoteStorage,
  bucket: string,
  prefix: string,
  backupFile?: string
): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-push-"));
  try {
    const isProvidedBackup = Boolean(backupFile);
    const backup = backupFile ? path.resolve(backupFile) : path.join(dir, uniqueBackupName());
    if (isProvidedBackup) {
      if (!(await fs.pathExists(backup))) {
        throw new Error(`Backup file not found: ${backup}`);
      }
    } else {
      await exportCommand(context, { output: backup, yes: true });
    }
    const key = remoteKey(prefix, path.basename(backup));
    await storage.uploadFile({ bucket, key, filePath: backup });
    success(t("sync.pushed", { target: `${bucket}/${key}` }));
  } finally {
    await fs.remove(dir);
  }
}

async function pullBackup(context: CommandContext, storage: RemoteStorage, bucket: string, key: string): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-pull-"));
  const backup = path.join(dir, "backup.zip");
  try {
    await storage.downloadFile({ bucket, key, filePath: backup });
    await importCommand(context, backup, { yes: true });
    success(t("sync.pulled", { source: `${bucket}/${key}` }));
  } finally {
    await fs.remove(dir);
  }
}

function remoteKey(prefix: string, backup: string): string {
  const normalized = backup.replace(/^\/+/, "");
  if (normalized.includes("/")) {
    return normalized;
  }
  return prefix ? `${prefix}/${normalized}` : normalized;
}

function uniqueBackupName(sourceName = "backup.zip", date = new Date()): string {
  const parsed = path.parse(sourceName);
  const base = parsed.name || "backup";
  const ext = parsed.ext || ".zip";
  const stamp = date.toISOString().replace(/[-:]/g, "").replace("T", "T").replace(/\.\d{3}Z$/, "");
  const millis = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${base}_${stamp}_${millis}_${crypto.randomBytes(4).toString("hex")}${ext}`;
}
