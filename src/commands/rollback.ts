import * as p from "@clack/prompts";
import { t } from "../i18n.js";
import { createTable, formatDate, printJson, success, warn } from "../output.js";
import { providers } from "../providers/index.js";
import { listRollbacks, restoreRollback } from "../rollback.js";
import type { CommandContext } from "./context.js";
import { isInteractive } from "./context.js";

export async function rollbackCommand(
  context: CommandContext,
  rollbackId: string | undefined,
  options: { yes?: boolean; json?: boolean; list?: boolean }
): Promise<void> {
  const entries = await listRollbacks(context.env);

  if (options.list) {
    if (options.json) {
      printJson(entries);
      return;
    }
    printRollbackTable(entries);
    return;
  }

  if (entries.length === 0) {
    warn(t("rollback.noSnapshots"));
    return;
  }

  const interactive = isInteractive(options);
  let selectedId = rollbackId;

  if (!selectedId && interactive) {
    p.intro(t("rollback.intro"));
    const answer = await p.select({
      message: t("rollback.select"),
      options: entries.map((entry) => ({
        value: entry.id,
        label: `${entry.id} (${formatDate(new Date(entry.createdAt))})`,
        hint: entry.clients.map((client) => client.type).join(", ")
      }))
    });
    if (p.isCancel(answer)) {
      p.cancel(t("rollback.cancelled"));
      return;
    }
    selectedId = String(answer);
  }

  if (!selectedId) {
    throw new Error(t("rollback.needId"));
  }

  if (interactive && !options.yes) {
    const confirm = await p.confirm({
      message: t("rollback.confirm"),
      initialValue: false
    });
    if (p.isCancel(confirm) || !confirm) {
      p.cancel(t("rollback.cancelled"));
      return;
    }
  }

  const restored = await restoreRollback(context.env, providers, selectedId);

  if (options.json) {
    printJson(restored);
    return;
  }

  success(t("rollback.restored", { id: restored.id }));
}

function printRollbackTable(entries: Awaited<ReturnType<typeof listRollbacks>>): void {
  if (entries.length === 0) {
    warn(t("rollback.noSnapshots"));
    return;
  }

  const table = createTable([t("rollback.id"), t("rollback.created"), t("rollback.clients"), t("rollback.sourceBackup")]);
  for (const entry of entries) {
    table.push([
      entry.id,
      formatDate(new Date(entry.createdAt)),
      entry.clients.map((client) => client.type).join(", "),
      entry.sourceBackup
    ]);
  }
  console.log(table.toString());
}
