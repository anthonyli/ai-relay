import os from "node:os";
import type { BackupManifest, ExportedClient } from "./types.js";

export const APP_VERSION = "0.1.0";

export function createManifest(clients: ExportedClient[]): BackupManifest {
  return {
    version: 1,
    app: "ai-relay",
    app_version: APP_VERSION,
    config_version: "1.1",
    created_at: new Date().toISOString(),
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    clients
  };
}

export function parseManifest(raw: string): BackupManifest {
  const manifest = JSON.parse(raw) as BackupManifest;
  if (!isSupportedApp(manifest.app) || manifest.version !== 1 || !Array.isArray(manifest.clients)) {
    throw new Error("Invalid ai-relay backup manifest.");
  }
  return manifest;
}

function isSupportedApp(app: string): app is BackupManifest["app"] {
  return app === "ai-relay" || app === "aisession";
}
