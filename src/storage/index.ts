import type { AppConfig } from "../config.js";
import { createS3Storage } from "./s3.js";

export interface StorageFileRequest {
  bucket: string;
  key: string;
  filePath: string;
}

export interface RemoteStorage {
  uploadFile(request: StorageFileRequest): Promise<void>;
  downloadFile(request: StorageFileRequest): Promise<void>;
}

export interface ResolvedStorage {
  bucket: string;
  prefix: string;
  storage: RemoteStorage;
}

export function createRemoteStorage(config: AppConfig): ResolvedStorage {
  if (config.storage.type !== "s3") {
    throw new Error(`Unsupported storage type "${config.storage.type}". Use "s3" for MinIO/S3-compatible storage.`);
  }

  const bucket = config.storage.bucket;
  if (!bucket) {
    throw new Error("S3 storage requires storage.bucket.");
  }

  return {
    bucket,
    prefix: normalizePrefix(config.storage.prefix ?? legacyPrefix(config.storage.key) ?? "backups"),
    storage: createS3Storage(config)
  };
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

function legacyPrefix(key: string | undefined): string | undefined {
  if (!key) {
    return undefined;
  }
  const lastSlash = key.lastIndexOf("/");
  return lastSlash === -1 ? "" : key.slice(0, lastSlash);
}
