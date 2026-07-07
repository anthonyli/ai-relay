import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "fs-extra";
import type { ProviderId, ProviderStatus, RuntimeEnv, SessionInfo } from "../types.js";

const execFileAsync = promisify(execFile);

export interface Provider {
  id: ProviderId;
  name: string;
  rootDir(env: RuntimeEnv): string;
  detect(env: RuntimeEnv): Promise<boolean>;
  version(env: RuntimeEnv): Promise<string>;
  status(env: RuntimeEnv): Promise<ProviderStatus>;
  listSessions(env: RuntimeEnv): Promise<SessionInfo[]>;
  copyForExport(env: RuntimeEnv, destinationRoot: string, options: ProviderCopyOptions): Promise<number>;
  restoreFromBackup(env: RuntimeEnv, sourceRoot: string, options: RestoreOptions): Promise<void>;
}

export interface ProviderCopyOptions {
  includeSecrets: boolean;
  sessionIds?: string[];
}

export interface RestoreOptions {
  mapPaths?: Array<{ from: string; to: string }>;
  overwrite?: boolean;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  rootName: string;
  versionCommand?: string;
  versionArgs?: string[];
  sessionRoots: string[];
  configFiles: string[];
}

export class FileProvider implements Provider {
  public id: ProviderId;
  public name: string;
  private definition: ProviderDefinition;

  constructor(definition: ProviderDefinition) {
    this.definition = definition;
    this.id = definition.id;
    this.name = definition.name;
  }

  rootDir(env: RuntimeEnv): string {
    return path.join(env.homeDir, this.definition.rootName);
  }

  async detect(env: RuntimeEnv): Promise<boolean> {
    return fs.pathExists(this.rootDir(env));
  }

  async version(_env?: RuntimeEnv): Promise<string> {
    if (!this.definition.versionCommand) {
      return "unknown";
    }

    try {
      const result = await execFileAsync(this.definition.versionCommand, this.definition.versionArgs ?? ["--version"], {
        timeout: 1500
      });
      return `${result.stdout || result.stderr}`.trim().split("\n")[0] || "unknown";
    } catch {
      return "unknown";
    }
  }

  async status(env: RuntimeEnv): Promise<ProviderStatus> {
    const detected = await this.detect(env);
    const sessions = detected ? await this.listSessions(env) : [];
    return {
      id: this.id,
      name: this.name,
      rootDir: this.rootDir(env),
      detected,
      version: detected ? await this.version(env) : "-",
      sessionCount: sessions.length
    };
  }

  async listSessions(env: RuntimeEnv): Promise<SessionInfo[]> {
    const root = this.rootDir(env);
    if (!(await fs.pathExists(root))) {
      return [];
    }

    const files = new Set<string>();
    for (const sessionRoot of this.definition.sessionRoots) {
      const absoluteRoot = path.join(root, sessionRoot);
      if (await fs.pathExists(absoluteRoot)) {
        for (const file of await walkFiles(absoluteRoot)) {
          if (isSessionFile(file)) {
            files.add(file);
          }
        }
      }
    }

    if (files.size === 0) {
      for (const file of await walkFiles(root)) {
        const relative = path.relative(root, file);
        if (isSessionFile(file) && !isConfigLike(relative) && !isSecretPath(relative)) {
          files.add(file);
        }
      }
    }

    const sessions: SessionInfo[] = [];
    for (const file of files) {
      const stat = await fs.stat(file);
      const relativePath = toPosix(path.relative(root, file));
      sessions.push({
        provider: this.id,
        providerName: this.name,
        id: `${this.id}:${relativePath}`,
        relativePath,
        absolutePath: file,
        project: inferProject(relativePath),
        updatedAt: stat.mtime,
        size: stat.size
      });
    }

    return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async copyForExport(env: RuntimeEnv, destinationRoot: string, options: ProviderCopyOptions): Promise<number> {
    const sourceRoot = this.rootDir(env);
    const rootTarget = path.join(destinationRoot, "root");
    await fs.ensureDir(rootTarget);

    if (!options.sessionIds?.length) {
      await fs.copy(sourceRoot, rootTarget, {
        filter: (source) => {
          const relative = toPosix(path.relative(sourceRoot, source));
          return relative === "" || options.includeSecrets || !isSecretPath(relative);
        }
      });
      return (await this.listSessions(env)).length;
    }

    const sessions = await this.listSessions(env);
    const selected = matchSessions(this.id, sessions, options.sessionIds);

    for (const configFile of this.definition.configFiles) {
      const source = path.join(sourceRoot, configFile);
      if (await fs.pathExists(source)) {
        await fs.copy(source, path.join(rootTarget, configFile));
      }
    }

    for (const session of selected) {
      await fs.copy(session.absolutePath, path.join(rootTarget, session.relativePath));
    }

    return selected.length;
  }

  async restoreFromBackup(env: RuntimeEnv, sourceRoot: string, options: RestoreOptions): Promise<void> {
    const targetRoot = this.rootDir(env);
    await fs.ensureDir(targetRoot);
    const backupRoot = path.join(sourceRoot, "root");
    if (!(await fs.pathExists(backupRoot))) {
      return;
    }

    if (options.mapPaths?.length) {
      await rewritePathsInTree(backupRoot, options.mapPaths);
    }

    await fs.copy(backupRoot, targetRoot, {
      overwrite: Boolean(options.overwrite),
      errorOnExist: false
    });
  }
}

export function parseProviderId(value: string): ProviderId {
  if (value !== "claude" && value !== "codex") {
    throw new Error(`Unsupported provider "${value}". Use "claude" or "codex".`);
  }
  return value;
}

export function parsePathMappings(values: string[] | undefined): Array<{ from: string; to: string }> {
  return (values ?? []).map((value) => {
    const separator = value.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Invalid path mapping "${value}". Expected old=new.`);
    }
    return {
      from: value.slice(0, separator),
      to: value.slice(separator + 1)
    };
  });
}

function matchSessions(providerId: ProviderId, sessions: SessionInfo[], requested: string[]): SessionInfo[] {
  const providerRequests = requested
    .map((request) => request.trim())
    .filter(Boolean)
    .filter((request) => request.startsWith(`${providerId}:`) || !request.includes(":"));

  if (providerRequests.length === 0) {
    return [];
  }

  const selected = new Map<string, SessionInfo>();
  for (const request of providerRequests) {
    const normalized = request.startsWith(`${providerId}:`) ? request.slice(providerId.length + 1) : request;
    const match = sessions.find((session) => {
      return session.id === request || session.relativePath === normalized || session.relativePath.includes(normalized);
    });
    if (!match) {
      throw new Error(`Session not found for ${providerId}: ${request}`);
    }
    selected.set(match.relativePath, match);
  }
  return [...selected.values()];
}

async function walkFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  if (!(await fs.pathExists(root))) {
    return result;
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(absolute)));
    } else if (entry.isFile()) {
      result.push(absolute);
    }
  }
  return result;
}

function isSessionFile(file: string): boolean {
  return [".jsonl", ".json", ".md"].includes(path.extname(file).toLowerCase());
}

function isConfigLike(relativePath: string): boolean {
  const parts = relativePath.split("/");
  return parts.length <= 1 || parts.includes("config");
}

function isSecretPath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  const base = path.basename(lower);
  return (
    base === ".env" ||
    base === "auth.json" ||
    base.includes("credential") ||
    base.includes("secret") ||
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    base.endsWith(".p12") ||
    base.endsWith(".pfx")
  );
}

function inferProject(relativePath: string): string {
  const parts = relativePath.split("/");
  if (parts[0] === "projects" && parts[1]) {
    return cleanProjectName(parts[1]);
  }
  if (parts.length > 1) {
    return cleanProjectName(parts[parts.length - 2]);
  }
  return "-";
}

function cleanProjectName(value: string): string {
  return value.replace(/^-/, "").replace(/-/g, "/").slice(0, 80) || "-";
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

async function rewritePathsInTree(root: string, mappings: Array<{ from: string; to: string }>): Promise<void> {
  const files = await walkFiles(root);
  for (const file of files) {
    if (!isTextLike(file)) {
      continue;
    }
    const original = await fs.readFile(file, "utf8");
    let next = original;
    for (const mapping of mappings) {
      next = next.split(mapping.from).join(mapping.to);
    }
    if (next !== original) {
      await fs.writeFile(file, next, "utf8");
    }
  }
}

function isTextLike(file: string): boolean {
  return [".json", ".jsonl", ".toml", ".yaml", ".yml", ".md", ".txt"].includes(path.extname(file).toLowerCase());
}
