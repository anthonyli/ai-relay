import { isCloudSyncConfigured } from "../config.js";
import { createTable, printJson, success, warn } from "../output.js";
import { providers } from "../providers/index.js";
import type { CommandContext } from "./context.js";

export async function doctorCommand(context: CommandContext, options: { json?: boolean }): Promise<void> {
  const statuses = await Promise.all(providers.map((provider) => provider.status(context.env)));

  if (options.json) {
    printJson({
      providers: statuses,
      cloud_sync: {
        enabled: context.config.cloud_sync.enabled,
        configured: isCloudSyncConfigured(context.config),
        storage: context.config.storage.type
      }
    });
    return;
  }

  const table = createTable(["Client", "Status", "Version", "Sessions", "Path"]);
  for (const status of statuses) {
    table.push([
      status.name,
      status.detected ? "Detected" : "Not found",
      status.version,
      String(status.sessionCount),
      status.rootDir
    ]);
  }

  console.log(table.toString());

  if (isCloudSyncConfigured(context.config)) {
    success(`V2 Storage configured: ${context.config.storage.type}`);
  } else {
    warn("V2 Storage: Not configured. Default mode is local V1.1.");
  }
}

