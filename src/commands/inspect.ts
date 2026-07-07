import { listZipEntries, readZipText } from "../archive/zip.js";
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

  console.log(`Backup Version: ${manifest.version}`);
  console.log(`Created: ${manifest.created_at}`);
  console.log(`App Version: ${manifest.app_version}`);
  console.log("");

  const table = createTable(["Client", "Version", "Mode", "Sessions", "Exported", "Privacy"]);
  for (const client of manifest.clients) {
    table.push([
      client.name,
      client.version,
      client.export_mode ?? "sessions",
      String(client.session_count),
      String(client.exported_session_count),
      "excluded"
    ]);
  }
  console.log(table.toString());
  console.log(`Entries: ${entries.length}`);
}
