import * as p from "@clack/prompts";
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
    warn("No rollback snapshots found.");
    return;
  }

  const interactive = isInteractive(options);
  let selectedId = rollbackId;

  if (!selectedId && interactive) {
    p.intro("AI Relay Rollback");
    const answer = await p.select({
      message: "Select a rollback snapshot",
      options: entries.map((entry) => ({
        value: entry.id,
        label: `${entry.id} (${formatDate(new Date(entry.createdAt))})`,
        hint: entry.clients.map((client) => client.type).join(", ")
      }))
    });
    if (p.isCancel(answer)) {
      p.cancel("Rollback cancelled.");
      return;
    }
    selectedId = String(answer);
  }

  if (!selectedId) {
    throw new Error("Please provide a rollback id, or run interactively.");
  }

  if (interactive && !options.yes) {
    const confirm = await p.confirm({
      message: "Rollback will replace current provider directories with the selected pre-import snapshot. Continue?",
      initialValue: false
    });
    if (p.isCancel(confirm) || !confirm) {
      p.cancel("Rollback cancelled.");
      return;
    }
  }

  const restored = await restoreRollback(context.env, providers, selectedId);

  if (options.json) {
    printJson(restored);
    return;
  }

  success(`Rolled back to ${restored.id}`);
}

function printRollbackTable(entries: Awaited<ReturnType<typeof listRollbacks>>): void {
  if (entries.length === 0) {
    warn("No rollback snapshots found.");
    return;
  }

  const table = createTable(["ID", "Created", "Clients", "Source Backup"]);
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
