import { syncCodexAppProjects } from "../codex-app.js";
import { t } from "../i18n.js";
import { printJson, success, warn } from "../output.js";
import type { CommandContext } from "./context.js";

export async function repairCommand(context: CommandContext, options: { json?: boolean }): Promise<void> {
  const result = await syncCodexAppProjects(context.env);

  if (options.json) {
    printJson({ codexAppSync: result });
    return;
  }

  success(t("repair.codexAppSynced", { count: String(result.addedProjectCount) }));
  if (result.sqlite.status === "skipped" || result.sqlite.status === "failed") {
    warn(t("import.codexAppSqliteWarning", { reason: result.sqlite.message ?? result.sqlite.status }));
  }
  warn(t("import.codexAppRestart"));
}
