import type { AppConfig } from "../config.js";
import type { RuntimeEnv } from "../types.js";

export interface CommandContext {
  env: RuntimeEnv;
  config: AppConfig;
  configPath?: string;
}

export function isInteractive(options: { yes?: boolean; json?: boolean } = {}): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !options.yes && !options.json);
}

