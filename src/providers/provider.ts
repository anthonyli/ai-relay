import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "fs-extra";
import type { ProviderId, ProviderStatus, RuntimeEnv, SessionInfo } from "../types.js";

const execFileAsync = promisify(execFile);

export const PRIVACY_EXCLUSIONS = [
  "auth files",
  "tokens",
  "credentials",
  "secrets",
  "config files",
  "settings",
  "cache",
  "tmp",
  "logs",
  "plugins",
  "key material"
];

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
  sessionIds?: string[];
  full?: boolean;
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
  defaultExportRoots?: string[];
  fullExcludeRoots?: string[];
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
        if (isSessionFile(file) && !isConfigLike(relative) && !isPrivacyExcludedPath(relative)) {
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
      if (options.full) {
        await copyFullProviderRoot(sourceRoot, rootTarget, this.definition.fullExcludeRoots ?? []);
      } else {
        await copySessionRoots(
          sourceRoot,
          rootTarget,
          this.definition.defaultExportRoots ?? this.definition.sessionRoots
        );
      }
      return (await this.listSessions(env)).length;
    }

    const sessions = await this.listSessions(env);
    const selected = matchSessions(this.id, sessions, options.sessionIds);

    for (const session of selected) {
      if (!isPrivacyExcludedPath(session.relativePath, this.definition.fullExcludeRoots ?? [])) {
        await fs.copy(session.absolutePath, path.join(rootTarget, session.relativePath));
      }
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
    const exactMatches = sessions.filter((session) => session.id === request || session.relativePath === normalized);
    const matches = exactMatches.length ? exactMatches : sessions.filter((session) => session.relativePath.includes(normalized));

    if (matches.length === 0) {
      throw new Error(`Session not found for ${providerId}: ${request}`);
    }
    if (matches.length > 1) {
      throw new Error(`Ambiguous session "${request}" for ${providerId}. Use the full session id.`);
    }
    const match = matches[0];
    selected.set(match.relativePath, match);
  }
  return [...selected.values()];
}

async function walkFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  if (!(await fs.pathExists(root))) {
    return result;
  }

  const rootStat = await fs.stat(root).catch(() => undefined);
  if (rootStat?.isFile()) {
    return [root];
  }
  if (!rootStat?.isDirectory()) {
    return result;
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(absolute)));
    } else if (entry.isFile()) {
      result.push(absolute);
    } else if (entry.isSymbolicLink()) {
      const stat = await fs.stat(absolute).catch(() => undefined);
      if (stat?.isFile()) {
        result.push(absolute);
      }
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

function isPrivacyExcludedPath(relativePath: string, extraRootExcludes: string[] = []): boolean {
  const lower = relativePath.toLowerCase();
  const base = path.basename(lower);
  const parts = lower.split("/");
  const firstPart = parts[0] ?? "";
  const rootExcludes = new Set([...extraRootExcludes, ".tmp", "tmp", "cache", "logs", "plugins"].map((item) => item.toLowerCase()));
  const sensitiveBaseNames = new Set([
    "config.toml",
    "config.json",
    "config.yaml",
    "config.yml",
    "settings.json",
    "settings.local.json",
    ".env",
    "auth.json",
    "credentials.json",
    "credentials",
    "token.json",
    "tokens.json",
    "secret.json",
    "secrets.json",
    "oauth.json",
    "session_key"
  ]);

  return (
    relativePath === "" ||
    rootExcludes.has(firstPart) ||
    parts.includes(".git") ||
    parts.includes("node_modules") ||
    sensitiveBaseNames.has(base) ||
    base.startsWith(".env.") ||
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    base.endsWith(".p12") ||
    base.endsWith(".pfx")
  );
}

async function copySessionRoots(sourceRoot: string, rootTarget: string, sessionRoots: string[]): Promise<void> {
  for (const sessionRoot of sessionRoots) {
    const source = path.join(sourceRoot, sessionRoot);
    if (!(await fs.pathExists(source))) {
      continue;
    }
    await fs.copy(source, path.join(rootTarget, sessionRoot), {
      filter: (candidate) => {
        const relative = toPosix(path.relative(sourceRoot, candidate));
        return relative === "" || !isPrivacyExcludedPath(relative);
      }
    });
  }
}

async function copyFullProviderRoot(sourceRoot: string, rootTarget: string, extraRootExcludes: string[]): Promise<void> {
  await fs.copy(sourceRoot, rootTarget, {
    filter: (candidate) => {
      const relative = toPosix(path.relative(sourceRoot, candidate));
      return relative === "" || !isPrivacyExcludedPath(relative, extraRootExcludes);
    }
  });
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
  const orderedMappings = mappings
    .filter((mapping) => mapping.from.length > 0)
    .sort((a, b) => b.from.length - a.from.length);
  if (orderedMappings.length === 0) {
    return;
  }

  const files = await walkFiles(root);
  for (const file of files) {
    if (!isTextLike(file)) {
      continue;
    }
    const original = await fs.readFile(file, "utf8");
    const next = rewriteTextContent(original, file, orderedMappings);
    if (next !== original) {
      await fs.writeFile(file, next, "utf8");
    }
  }

  await rewritePathNames(root, orderedMappings);
}

function isTextLike(file: string): boolean {
  return [".json", ".jsonl", ".toml", ".yaml", ".yml", ".md", ".txt"].includes(path.extname(file).toLowerCase());
}

function rewriteTextContent(original: string, file: string, mappings: Array<{ from: string; to: string }>): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".json") {
    return rewriteJsonText(original, mappings);
  }
  if (extension === ".jsonl") {
    return rewriteJsonLines(original, mappings);
  }
  return applyPathMappings(original, mappings);
}

function rewriteJsonText(original: string, mappings: Array<{ from: string; to: string }>): string {
  try {
    const rewritten = rewriteJsonValue(JSON.parse(original), mappings);
    return `${JSON.stringify(rewritten, null, 2)}${original.endsWith("\n") ? "\n" : ""}`;
  } catch {
    return applyPathMappings(original, mappings);
  }
}

function rewriteJsonLines(original: string, mappings: Array<{ from: string; to: string }>): string {
  const hasTrailingNewline = original.endsWith("\n");
  const lines = original.split(/\r?\n/);
  if (hasTrailingNewline) {
    lines.pop();
  }

  const rewritten = lines.map((line) => {
    if (!line.trim()) {
      return line;
    }
    try {
      return JSON.stringify(rewriteJsonValue(JSON.parse(line), mappings));
    } catch {
      return applyPathMappings(line, mappings);
    }
  });

  return `${rewritten.join("\n")}${hasTrailingNewline ? "\n" : ""}`;
}

function rewriteJsonValue(value: unknown, mappings: Array<{ from: string; to: string }>): unknown {
  if (typeof value === "string") {
    return applyPathMappings(value, mappings);
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteJsonValue(item, mappings));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteJsonValue(item, mappings)]));
  }
  return value;
}

function applyPathMappings(value: string, mappings: Array<{ from: string; to: string }>): string {
  let next = value;
  for (const mapping of mappings) {
    next = next.split(mapping.from).join(mapping.to);
  }
  return next;
}

async function rewritePathNames(root: string, mappings: Array<{ from: string; to: string }>): Promise<void> {
  const entries = await collectPathEntries(root);
  entries.sort((a, b) => a.relative.split(path.sep).length - b.relative.split(path.sep).length);

  for (const entry of entries) {
    const currentPath = path.join(root, entry.relative);
    if (!(await fs.pathExists(currentPath))) {
      continue;
    }

    const nextRelative = entry.relative
      .split(path.sep)
      .map((part) => rewritePathPart(part, mappings))
      .join(path.sep);
    if (nextRelative === entry.relative) {
      continue;
    }

    const targetPath = path.join(root, nextRelative);
    await fs.ensureDir(path.dirname(targetPath));
    await fs.move(currentPath, targetPath, { overwrite: false });
  }
}

async function collectPathEntries(root: string): Promise<Array<{ relative: string }>> {
  const entries: Array<{ relative: string }> = [];
  async function visit(current: string): Promise<void> {
    const children = await fs.readdir(current, { withFileTypes: true });
    for (const child of children) {
      const absolute = path.join(current, child.name);
      const relative = path.relative(root, absolute);
      entries.push({ relative });
      if (child.isDirectory()) {
        await visit(absolute);
      }
    }
  }
  await visit(root);
  return entries;
}

function rewritePathPart(part: string, mappings: Array<{ from: string; to: string }>): string {
  let next = part;
  for (const mapping of mappings) {
    next = next.split(encodePathForProvider(mapping.from)).join(encodePathForProvider(mapping.to));
  }
  return next;
}

function encodePathForProvider(value: string): string {
  return value.replace(/[\\/]+/g, "-").replace(/-+$/, "");
}
