import { execFileSync } from "node:child_process";

export type Language = "en" | "zh";

const translations = {
  en: {
    "doctor.client": "Client",
    "doctor.status": "Status",
    "doctor.version": "Version",
    "doctor.sessions": "Sessions",
    "doctor.path": "Path",
    "doctor.detected": "Detected",
    "doctor.notFound": "Not found",
    "doctor.storageConfigured": "V2 Storage configured: {storage}",
    "doctor.storageNotConfigured": "V2 Storage: Not configured. Default mode is local V1.1.",

    "export.intro": "AI Relay Export",
    "export.selectClients": "Select clients to export",
    "export.cancelled": "Export cancelled.",
    "export.outputFile": "Output file",
    "export.overwrite": "{output} already exists. Overwrite?",
    "export.overwriteNonInteractive": "{output} already exists. Use --yes to overwrite it.",
    "export.scanning": "Scanning and creating backup...",
    "export.created": "Backup created: {output}",
    "export.privacy": "Privacy-sensitive files are always excluded from backups.",
    "export.defaultMode": "Default export includes session/history data only. Use --full for a broader non-secret provider backup.",
    "export.noClients": "No supported AI CLI sessions found. Run `airelay doctor` for details.",

    "import.intro": "AI Relay Import",
    "import.selectClients": "Select clients to restore",
    "import.cancelled": "Import cancelled.",
    "import.overwrite": "Overwrite files that already exist on this machine?",
    "import.mapQuestion": "Do you need to rewrite project paths for this machine?",
    "import.pathMapping": "Path mapping",
    "import.confirm": "Confirm import? Existing files will be kept by default.",
    "import.confirmOverwrite": "Confirm import? Existing files may be overwritten.",
    "import.nonInteractiveYes": "Non-interactive import requires --yes.",
    "import.creatingRollback": "Creating rollback snapshot...",
    "import.readingBackup": "Reading backup...",
    "import.restoringClients": "Restoring clients...",
    "import.restoreComplete": "Restore complete.",
    "import.restored": "Restored: {clients}",
    "import.rollbackSnapshot": "Rollback snapshot: {id}",
    "import.keepExisting": "Existing files were kept. Use --overwrite only when you intentionally want backup files to replace local files.",
    "import.mapHint": "If project paths changed between machines, re-run import with --map-path old=new.",
    "import.noMatchingClients": "No matching supported clients found in backup.",
    "import.clientMissing": "{client} not found in backup. Skipping.",

    "inspect.backupVersion": "Backup Version: {version}",
    "inspect.created": "Created: {created}",
    "inspect.appVersion": "App Version: {version}",
    "inspect.client": "Client",
    "inspect.mode": "Mode",
    "inspect.exported": "Exported",
    "inspect.privacy": "Privacy",
    "inspect.excluded": "excluded",
    "inspect.entries": "Entries: {count}",

    "list.noSessions": "No sessions found. Run `airelay doctor` to check provider detection.",
    "list.client": "Client",
    "list.project": "Project",
    "list.updated": "Updated",
    "list.size": "Size",
    "list.session": "Session",

    "rollback.noSnapshots": "No rollback snapshots found.",
    "rollback.intro": "AI Relay Rollback",
    "rollback.select": "Select a rollback snapshot",
    "rollback.cancelled": "Rollback cancelled.",
    "rollback.needId": "Please provide a rollback id, or run interactively.",
    "rollback.confirm": "Rollback will replace current provider directories with the selected snapshot. Continue?",
    "rollback.restored": "Rolled back to {id}",
    "rollback.id": "ID",
    "rollback.created": "Created",
    "rollback.clients": "Clients",
    "rollback.sourceBackup": "Source Backup",

    "sync.requiresStorage": "airelay {action} requires V2 Storage configuration.",
    "sync.storageHint": "Default mode is V1.1 local-only. Use export/import for now, or configure cloud_sync.enabled=true with a non-local storage type.",
    "sync.notImplemented": "V2 {action} is configured but not implemented in this build."
  },
  zh: {
    "doctor.client": "客户端",
    "doctor.status": "状态",
    "doctor.version": "版本",
    "doctor.sessions": "会话数",
    "doctor.path": "路径",
    "doctor.detected": "已检测到",
    "doctor.notFound": "未找到",
    "doctor.storageConfigured": "V2 存储已配置：{storage}",
    "doctor.storageNotConfigured": "V2 存储：未配置。当前默认使用本地 V1.1 模式。",

    "export.intro": "AI Relay 导出",
    "export.selectClients": "选择要导出的客户端",
    "export.cancelled": "导出已取消。",
    "export.outputFile": "输出文件",
    "export.overwrite": "{output} 已存在。是否覆盖？",
    "export.overwriteNonInteractive": "{output} 已存在。使用 --yes 才能覆盖。",
    "export.scanning": "正在扫描并创建备份...",
    "export.created": "备份已创建：{output}",
    "export.privacy": "隐私敏感文件始终会从备份中排除。",
    "export.defaultMode": "默认导出仅包含会话/历史数据。需要更完整的非敏感客户端备份时使用 --full。",
    "export.noClients": "未找到支持的 AI CLI 会话。运行 `airelay doctor` 查看详情。",

    "import.intro": "AI Relay 导入",
    "import.selectClients": "选择要恢复的客户端",
    "import.cancelled": "导入已取消。",
    "import.overwrite": "是否覆盖本机已存在的文件？",
    "import.mapQuestion": "是否需要为这台机器重写项目路径？",
    "import.pathMapping": "路径映射",
    "import.confirm": "确认开始导入？现有文件默认保留。",
    "import.confirmOverwrite": "确认开始导入？现有文件可能会被覆盖。",
    "import.nonInteractiveYes": "非交互导入需要显式传入 --yes。",
    "import.creatingRollback": "正在创建回滚快照...",
    "import.readingBackup": "正在读取备份...",
    "import.restoringClients": "正在恢复客户端...",
    "import.restoreComplete": "恢复完成。",
    "import.restored": "已恢复：{clients}",
    "import.rollbackSnapshot": "回滚快照：{id}",
    "import.keepExisting": "已保留现有文件。只有明确希望备份文件替换本地同路径文件时才使用 --overwrite。",
    "import.mapHint": "如果两台机器的项目路径不同，请使用 --map-path old=new 重新执行导入。",
    "import.noMatchingClients": "备份中没有匹配的受支持客户端。",
    "import.clientMissing": "备份中未找到 {client}，已跳过。",

    "inspect.backupVersion": "备份版本：{version}",
    "inspect.created": "创建时间：{created}",
    "inspect.appVersion": "应用版本：{version}",
    "inspect.client": "客户端",
    "inspect.mode": "模式",
    "inspect.exported": "已导出",
    "inspect.privacy": "隐私",
    "inspect.excluded": "已排除",
    "inspect.entries": "条目数：{count}",

    "list.noSessions": "未找到会话。运行 `airelay doctor` 检查客户端检测结果。",
    "list.client": "客户端",
    "list.project": "项目",
    "list.updated": "更新时间",
    "list.size": "大小",
    "list.session": "会话",

    "rollback.noSnapshots": "未找到回滚快照。",
    "rollback.intro": "AI Relay 回滚",
    "rollback.select": "选择回滚快照",
    "rollback.cancelled": "回滚已取消。",
    "rollback.needId": "请提供回滚 ID，或在交互模式下运行。",
    "rollback.confirm": "回滚会用选中的快照替换当前客户端目录。是否继续？",
    "rollback.restored": "已回滚到 {id}",
    "rollback.id": "ID",
    "rollback.created": "创建时间",
    "rollback.clients": "客户端",
    "rollback.sourceBackup": "来源备份",

    "sync.requiresStorage": "airelay {action} 需要 V2 存储配置。",
    "sync.storageHint": "当前默认使用本地 V1.1 模式。现在可使用 export/import，或配置 cloud_sync.enabled=true 和非本地存储类型。",
    "sync.notImplemented": "V2 {action} 已配置，但当前构建尚未实现。"
  }
} as const;

export type TranslationKey = keyof typeof translations.en;

export function detectLanguage(
  environment: Record<string, string | undefined> = process.env,
  appleLanguages: string[] = readAppleLanguages()
): Language {
  const explicit = normalizeLanguage(environment.AIRELAY_LANG);
  if (explicit) {
    return explicit;
  }

  const locale = [environment.LC_ALL, environment.LC_MESSAGES, environment.LANG]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const posixLanguage = normalizeLanguage(locale);
  if (posixLanguage) {
    return posixLanguage;
  }

  const systemLanguage = appleLanguages.map((item) => normalizeLanguage(item)).find(Boolean);
  if (systemLanguage) {
    return systemLanguage;
  }

  return "zh";
}

export function t(
  key: TranslationKey,
  options: { language?: Language } & Record<string, string | number | undefined> = {}
): string {
  const language = options.language ?? detectLanguage();
  const template = translations[language][key] ?? translations.en[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(options[name] ?? ""));
}

function normalizeLanguage(locale: string | undefined): Language | undefined {
  if (!locale) {
    return undefined;
  }
  const normalized = locale.toLowerCase();
  if (/^zh($|[_.\-\s])|[_.\-\s]zh($|[_.\-\s])/.test(normalized)) {
    return "zh";
  }
  if (/^en($|[_.\-\s])|[_.\-\s]en($|[_.\-\s])/.test(normalized)) {
    return "en";
  }
  return undefined;
}

function readAppleLanguages(): string[] {
  if (process.platform !== "darwin") {
    return [];
  }

  try {
    const output = execFileSync("defaults", ["read", "-g", "AppleLanguages"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^"|"$/g, "").replace(/,$/, ""))
      .filter((line) => /^[A-Za-z]{2,3}[-_]/.test(line) || /^[A-Za-z]{2,3}$/.test(line));
  } catch {
    return [];
  }
}
