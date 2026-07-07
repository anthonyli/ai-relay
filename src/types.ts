export type ProviderId = "claude" | "codex";

export interface RuntimeEnv {
  homeDir: string;
  cwd: string;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  rootDir: string;
  detected: boolean;
  version: string;
  sessionCount: number;
}

export interface SessionInfo {
  provider: ProviderId;
  providerName: string;
  id: string;
  relativePath: string;
  absolutePath: string;
  project: string;
  updatedAt: Date;
  size: number;
}

export interface ExportedClient {
  type: ProviderId;
  name: string;
  version: string;
  root_dir: string;
  session_count: number;
  exported_session_count: number;
  include_secrets: boolean;
}

export interface BackupManifest {
  version: 1;
  app: "ai-relay" | "aisession";
  app_version: string;
  config_version: "1.1" | "2";
  created_at: string;
  hostname: string;
  os: string;
  clients: ExportedClient[];
}

export interface ExportOptions {
  output?: string;
  only?: ProviderId[];
  sessions?: string[];
  yes?: boolean;
  includeSecrets?: boolean;
  json?: boolean;
}

export interface ImportOptions {
  only?: ProviderId[];
  yes?: boolean;
  json?: boolean;
  mapPath?: string[];
}
