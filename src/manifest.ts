import os from "node:os";
import { z } from "zod";
import type { BackupManifest, ExportedClient } from "./types.js";
export { APP_VERSION } from "./version.js";
import { APP_VERSION } from "./version.js";

const ExportedClientSchema = z.object({
  type: z.enum(["claude", "codex"]),
  name: z.string().min(1).max(120),
  version: z.string().min(1).max(120),
  root_dir: z.string().min(1).max(4096),
  session_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  exported_session_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  export_mode: z.enum(["sessions", "full"]),
  privacy_exclusions: z.array(z.string().min(1).max(160)).max(128)
}).strict();

const BackupManifestSchema = z.object({
  version: z.literal(1),
  app: z.enum(["ai-relay", "aisession"]),
  app_version: z.string().min(1).max(64),
  config_version: z.enum(["1.1", "2"]),
  created_at: z.string().datetime({ offset: true }),
  hostname: z.string().min(1).max(255),
  os: z.string().min(1).max(255),
  clients: z.array(ExportedClientSchema).min(1).max(2)
}).strict().superRefine((manifest, context) => {
  const clientTypes = new Set<string>();
  for (const client of manifest.clients) {
    if (clientTypes.has(client.type)) {
      context.addIssue({
        code: "custom",
        path: ["clients"],
        message: "contains duplicate client types"
      });
      return;
    }
    clientTypes.add(client.type);
  }
});

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
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Invalid ai-relay backup manifest: invalid JSON");
  }

  const result = BackupManifestSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.length ? issue.path.join(".") : "root";
    throw new Error(`Invalid ai-relay backup manifest: ${field} ${issue?.message ?? "is invalid"}`);
  }
  return result.data;
}
