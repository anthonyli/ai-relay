import path from "node:path";
import fs from "fs-extra";
import { APP_NAME, APP_VERSION } from "./version.js";

const DEFAULT_REGISTRY = "https://registry.npmjs.org/";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 1000;
const CHANGELOG_URL = "https://github.com/anthonyli/ai-relay/blob/main/CHANGELOG.md";

interface UpdateCache {
  checkedAt: string;
  latestVersion: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  installCommand: string;
  changelogUrl: string;
}

export interface UpdateCheckOptions {
  homeDir: string;
  currentVersion?: string;
  packageName?: string;
  isTTY?: boolean;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  now?: Date;
  cacheTtlMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function checkForUpdate(options: UpdateCheckOptions): Promise<UpdateInfo | undefined> {
  try {
    const environment = options.env ?? process.env;
    const argv = options.argv ?? process.argv;
    if (!shouldCheckForUpdate(Boolean(options.isTTY), argv, environment)) {
      return undefined;
    }

    const currentVersion = options.currentVersion ?? APP_VERSION;
    const packageName = options.packageName ?? APP_NAME;
    const now = options.now ?? new Date();
    const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const cacheFile = path.join(options.homeDir, ".airelay", "update-check.json");
    const cached = await readFreshCache(cacheFile, now, cacheTtlMs);
    if (cached) {
      return createUpdateInfo(currentVersion, cached.latestVersion, packageName);
    }

    const registry = normalizeRegistry(environment.npm_config_registry ?? DEFAULT_REGISTRY);
    const response = await (options.fetchImpl ?? fetch)(
      `${registry}${encodeURIComponent(packageName)}/latest`,
      { signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) }
    );
    if (!response.ok) {
      return undefined;
    }

    const payload = await response.json() as { version?: unknown };
    if (typeof payload.version !== "string" || !parseStableVersion(payload.version)) {
      return undefined;
    }

    const cache: UpdateCache = {
      checkedAt: now.toISOString(),
      latestVersion: payload.version
    };
    await writeCache(cacheFile, cache);
    return createUpdateInfo(currentVersion, payload.version, packageName);
  } catch {
    return undefined;
  }
}

export function isNewerStableVersion(current: string, candidate: string): boolean {
  const currentParts = parseStableVersion(current);
  const candidateParts = parseStableVersion(candidate);
  if (!currentParts || !candidateParts) {
    return false;
  }

  for (let index = 0; index < currentParts.length; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const candidatePart = candidateParts[index] ?? 0;
    if (candidatePart !== currentPart) {
      return candidatePart > currentPart;
    }
  }
  return false;
}

function shouldCheckForUpdate(isTTY: boolean, argv: string[], environment: NodeJS.ProcessEnv): boolean {
  return Boolean(
    isTTY &&
    !argv.includes("--json") &&
    !isEnabledEnvironmentFlag(environment.CI) &&
    !isEnabledEnvironmentFlag(environment.AIRELAY_NO_UPDATE_CHECK)
  );
}

function isEnabledEnvironmentFlag(value: string | undefined): boolean {
  return Boolean(value && !["0", "false", "no", "off"].includes(value.toLowerCase()));
}

function normalizeRegistry(value: string): string {
  return `${value.replace(/\/+$/, "")}/`;
}

function parseStableVersion(value: string): [number, number, number] | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) {
    return undefined;
  }
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    return undefined;
  }
  return parts as [number, number, number];
}

function createUpdateInfo(currentVersion: string, latestVersion: string, packageName: string): UpdateInfo | undefined {
  if (!isNewerStableVersion(currentVersion, latestVersion)) {
    return undefined;
  }
  return {
    currentVersion,
    latestVersion,
    installCommand: `npm install -g ${packageName}@latest`,
    changelogUrl: CHANGELOG_URL
  };
}

async function readFreshCache(cacheFile: string, now: Date, cacheTtlMs: number): Promise<UpdateCache | undefined> {
  const value = await fs.readJson(cacheFile).catch(() => undefined) as Partial<UpdateCache> | undefined;
  if (!value || typeof value.checkedAt !== "string" || typeof value.latestVersion !== "string") {
    return undefined;
  }
  if (!parseStableVersion(value.latestVersion)) {
    return undefined;
  }

  const checkedAt = new Date(value.checkedAt).getTime();
  const age = now.getTime() - checkedAt;
  if (!Number.isFinite(checkedAt) || age < 0 || age >= cacheTtlMs) {
    return undefined;
  }
  return value as UpdateCache;
}

async function writeCache(cacheFile: string, value: UpdateCache): Promise<void> {
  await fs.ensureDir(path.dirname(cacheFile));
  const temporaryFile = path.join(
    path.dirname(cacheFile),
    `.${path.basename(cacheFile)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    await fs.writeJson(temporaryFile, value, { spaces: 2 });
    await fs.move(temporaryFile, cacheFile, { overwrite: true });
  } finally {
    await fs.remove(temporaryFile);
  }
}
