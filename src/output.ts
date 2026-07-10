import Table from "cli-table3";
import pc from "picocolors";
import { t } from "./i18n.js";
import type { UpdateInfo } from "./update-check.js";

export function success(message: string): void {
  console.log(pc.green(`✓ ${message}`));
}

export function warn(message: string): void {
  console.log(pc.yellow(`! ${message}`));
}

export function error(message: string): void {
  console.error(pc.red(`✖ ${message}`));
}

export function info(message: string): void {
  console.log(pc.cyan(message));
}

export function printUpdateNotice(update: UpdateInfo): void {
  warn(t("update.available", { current: update.currentVersion, latest: update.latestVersion }));
  info(t("update.install", { command: update.installCommand }));
  info(t("update.changelog", { url: update.changelogUrl }));
}

export function createTable(head: string[]): Table.Table {
  return new Table({
    head: head.map((item) => pc.bold(item)),
    style: {
      head: [],
      border: ["gray"]
    },
    wordWrap: true
  });
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}
