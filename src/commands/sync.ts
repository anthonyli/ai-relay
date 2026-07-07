import { isCloudSyncConfigured } from "../config.js";
import { info, warn } from "../output.js";
import type { CommandContext } from "./context.js";

export async function syncPlaceholderCommand(
  context: CommandContext,
  action: "push" | "pull" | "sync"
): Promise<void> {
  if (!isCloudSyncConfigured(context.config)) {
    warn(`airelay ${action} requires V2 Storage configuration.`);
    info("Default mode is V1.1 local-only. Use export/import for now, or configure cloud_sync.enabled=true with a non-local storage type.");
    return;
  }

  throw new Error(`V2 ${action} is configured but not implemented in this build.`);
}
