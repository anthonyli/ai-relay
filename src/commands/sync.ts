import { isCloudSyncConfigured } from "../config.js";
import { t } from "../i18n.js";
import { info, warn } from "../output.js";
import type { CommandContext } from "./context.js";

export async function syncPlaceholderCommand(
  context: CommandContext,
  action: "push" | "pull" | "sync"
): Promise<void> {
  if (!isCloudSyncConfigured(context.config)) {
    warn(t("sync.requiresStorage", { action }));
    info(t("sync.storageHint"));
    return;
  }

  throw new Error(t("sync.notImplemented", { action }));
}
