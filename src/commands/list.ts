import { t } from "../i18n.js";
import { createTable, formatDate, printJson, warn } from "../output.js";
import { providers } from "../providers/index.js";
import type { CommandContext } from "./context.js";

export async function listCommand(
  context: CommandContext,
  options: { only?: string; json?: boolean }
): Promise<void> {
  const selected = options.only ? providers.filter((provider) => provider.id === options.only) : providers;
  const sessions = (await Promise.all(selected.map((provider) => provider.listSessions(context.env)))).flat();

  if (options.json) {
    printJson(sessions);
    return;
  }

  if (sessions.length === 0) {
    warn(t("list.noSessions"));
    return;
  }

  const table = createTable([t("list.client"), t("list.project"), t("list.updated"), t("list.size"), t("list.session")]);
  for (const session of sessions) {
    table.push([
      session.provider,
      session.project,
      formatDate(session.updatedAt),
      `${Math.round(session.size / 1024)} KB`,
      session.id
    ]);
  }
  console.log(table.toString());
}
