import os from "node:os";
import path from "node:path";
import type { RuntimeEnv } from "./types.js";

export function createRuntimeEnv(options: { home?: string } = {}): RuntimeEnv {
  return {
    homeDir: path.resolve(options.home ?? process.env.AIRELAY_HOME ?? os.homedir()),
    cwd: process.cwd()
  };
}
