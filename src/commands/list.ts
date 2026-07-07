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
    warn("No sessions found. Run `airelay doctor` to check provider detection.");
    return;
  }

  const table = createTable(["Client", "Project", "Updated", "Size", "Session"]);
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
