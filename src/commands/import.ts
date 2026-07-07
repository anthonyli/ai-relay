import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import * as p from "@clack/prompts";
import { extractZip, readZipText } from "../archive/zip.js";
import { parseManifest } from "../manifest.js";
import { printJson, success, warn } from "../output.js";
import { providers } from "../providers/index.js";
import { parsePathMappings, parseProviderId } from "../providers/provider.js";
import { createPreImportRollback } from "../rollback.js";
import type { ProviderId } from "../types.js";
import type { CommandContext } from "./context.js";
import { isInteractive } from "./context.js";

export async function importCommand(
  context: CommandContext,
  backupFile: string,
  options: {
    only?: string[];
    yes?: boolean;
    json?: boolean;
    mapPath?: string[];
    overwrite?: boolean;
  }
): Promise<void> {
  const selectedIds = options.only?.map(parseProviderId);
  const manifest = parseManifest(await readZipText(backupFile, "manifest.json"));
  const backupClientIds = manifest.clients.map((client) => client.type);
  const idsToRestore = selectedIds?.length ? selectedIds : backupClientIds;
  const selectedProviders = providers.filter((provider) => idsToRestore.includes(provider.id));

  if (selectedProviders.length === 0) {
    throw new Error("No matching supported clients found in backup.");
  }

  const interactive = isInteractive(options);
  let finalProviders = selectedProviders;
  let overwrite = Boolean(options.overwrite);
  let mapPaths = parsePathMappings(options.mapPath);

  if (interactive && !selectedIds?.length) {
    p.intro("AI Relay Import");
    const answer = await p.multiselect({
      message: "Select clients to restore",
      options: selectedProviders.map((provider) => ({
        value: provider.id,
        label: provider.name,
        hint: provider.rootDir(context.env)
      })),
      initialValues: selectedProviders.map((provider) => provider.id),
      required: true
    });
    if (p.isCancel(answer)) {
      p.cancel("Import cancelled.");
      return;
    }
    const selected = answer as ProviderId[];
    finalProviders = selectedProviders.filter((provider) => selected.includes(provider.id));
  }

  if (interactive && options.overwrite === undefined) {
    const overwriteAnswer = await p.confirm({
      message: "Overwrite files that already exist on this machine?",
      initialValue: false
    });
    if (p.isCancel(overwriteAnswer)) {
      p.cancel("Import cancelled.");
      return;
    }
    overwrite = Boolean(overwriteAnswer);
  }

  if (interactive && !options.mapPath?.length) {
    const shouldMap = await p.confirm({
      message: "Do you need to rewrite project paths for this machine?",
      initialValue: false
    });
    if (p.isCancel(shouldMap)) {
      p.cancel("Import cancelled.");
      return;
    }

    if (shouldMap) {
      const mapping = await p.text({
        message: "Path mapping",
        placeholder: "/Users/alice/work=/Users/bob/dev"
      });
      if (p.isCancel(mapping)) {
        p.cancel("Import cancelled.");
        return;
      }
      mapPaths = parsePathMappings([String(mapping)]);
    }
  }

  if (interactive && !options.yes) {
    const confirm = await p.confirm({
      message: overwrite
        ? "Restore sessions/config into local provider directories? Existing files may be overwritten."
        : "Restore sessions/config into local provider directories? Existing files will be kept by default.",
      initialValue: false
    });
    if (p.isCancel(confirm) || !confirm) {
      p.cancel("Import cancelled.");
      return;
    }
  }

  const spinner = interactive ? p.spinner() : undefined;
  spinner?.start("Creating rollback snapshot...");
  const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-import-"));

  try {
    const rollback = await createPreImportRollback(context.env, finalProviders, backupFile);
    spinner?.message("Reading backup...");
    await extractZip(backupFile, extractDir);
    spinner?.message("Restoring clients...");
    const restored: string[] = [];

    for (const provider of finalProviders) {
      const sourceRoot = path.join(extractDir, "clients", provider.id);
      if (!(await fs.pathExists(sourceRoot))) {
        warn(`${provider.name} not found in backup. Skipping.`);
        continue;
      }
      await provider.restoreFromBackup(context.env, sourceRoot, {
        mapPaths,
        overwrite
      });
      restored.push(provider.id);
    }

    spinner?.stop("Restore complete.");

    if (options.json) {
      printJson({ restored, manifest, rollback });
      return;
    }

    success(`Restored: ${restored.join(", ")}`);
    success(`Rollback snapshot: ${rollback.id}`);
    if (!overwrite) {
      warn("Existing files were kept. Use --overwrite only when you intentionally want backup files to replace local files.");
    }
    if (mapPaths.length === 0) {
      warn("If project paths changed between machines, re-run import with --map-path old=new.");
    }
  } finally {
    await fs.remove(extractDir);
  }
}
