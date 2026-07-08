import { listZipEntries, readZipText } from "../archive/zip.js";
import { t } from "../i18n.js";
import { parseManifest } from "../manifest.js";
import { createTable, printJson } from "../output.js";
import type { CommandContext } from "./context.js";

export async function inspectCommand(
  _context: CommandContext,
  backupFile: string,
  options: { json?: boolean }
): Promise<void> {
  const manifest = parseManifest(await readZipText(backupFile, "manifest.json"));
  const entries = await listZipEntries(backupFile);

  if (options.json) {
    printJson({ manifest, entries });
    return;
  }

  console.log(t("inspect.backupVersion", { version: manifest.version }));
  console.log(t("inspect.created", { created: manifest.created_at }));
  console.log(t("inspect.appVersion", { version: manifest.app_version }));
  console.log("");

  const table = createTable([
    t("inspect.client"),
    t("doctor.version"),
    t("inspect.mode"),
    t("doctor.sessions"),
    t("inspect.exported"),
    t("inspect.privacy")
  ]);
  for (const client of manifest.clients) {
    table.push([
      client.name,
      client.version,
      client.export_mode ?? "sessions",
      String(client.session_count),
      String(client.exported_session_count),
      t("inspect.excluded")
    ]);
  }
  console.log(table.toString());
  console.log(t("inspect.entries", { count: entries.length }));
}
