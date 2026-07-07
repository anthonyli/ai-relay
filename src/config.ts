import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { z } from "zod";
import type { RuntimeEnv } from "./types.js";

const ConfigSchema = z
  .object({
    version: z.union([z.literal("1.1"), z.literal("2")]).default("1.1"),
    storage: z
      .object({
        type: z.string().default("local"),
        bucket: z.string().optional(),
        region: z.string().optional(),
        endpoint: z.string().optional()
      })
      .default({ type: "local" }),
    cloud_sync: z
      .object({
        enabled: z.boolean().default(false)
      })
      .default({ enabled: false })
  })
  .default({
    version: "1.1",
    storage: { type: "local" },
    cloud_sync: { enabled: false }
  });

export type AppConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(env: RuntimeEnv, explicitPath?: string): Promise<AppConfig> {
  const configPath = explicitPath ? path.resolve(explicitPath) : await findConfig(env);
  if (!configPath) {
    return ConfigSchema.parse({});
  }

  const raw = await fs.readFile(configPath, "utf8");
  if (!raw.trim()) {
    return ConfigSchema.parse({});
  }

  const parsed = configPath.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  return ConfigSchema.parse(parsed ?? {});
}

async function findConfig(env: RuntimeEnv): Promise<string | undefined> {
  const candidates = [
    path.join(env.cwd, "airelay.config.yml"),
    path.join(env.cwd, "airelay.config.yaml"),
    path.join(env.cwd, "airelay.config.json"),
    path.join(env.cwd, "aisession.config.yml"),
    path.join(env.cwd, "aisession.config.yaml"),
    path.join(env.cwd, "aisession.config.json"),
    path.join(env.homeDir, ".airelay", "config.yml"),
    path.join(env.homeDir, ".airelay", "config.yaml"),
    path.join(env.homeDir, ".airelay", "config.json"),
    path.join(env.homeDir, ".aisession", "config.yml"),
    path.join(env.homeDir, ".aisession", "config.yaml"),
    path.join(env.homeDir, ".aisession", "config.json")
  ];

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function isCloudSyncConfigured(config: AppConfig): boolean {
  return Boolean(config.cloud_sync.enabled && config.storage.type && config.storage.type !== "local");
}
