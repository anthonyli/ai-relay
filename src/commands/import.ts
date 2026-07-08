import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import * as p from "@clack/prompts";
import { extractZip, readZipText } from "../archive/zip.js";
import { syncCodexAppProjects } from "../codex-app.js";
import { t } from "../i18n.js";
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
    throw new Error(t("import.noMatchingClients"));
  }

  const interactive = isInteractive(options);
  let finalProviders = selectedProviders;
  let overwrite = Boolean(options.overwrite);
  let mapPaths = parsePathMappings(options.mapPath);

  if (interactive && !selectedIds?.length) {
    p.intro(t("import.intro"));
    const answer = await p.multiselect({
      message: t("import.selectClients"),
      options: selectedProviders.map((provider) => ({
        value: provider.id,
        label: provider.name,
        hint: provider.rootDir(context.env)
      })),
      initialValues: selectedProviders.map((provider) => provider.id),
      required: true
    });
    if (p.isCancel(answer)) {
      p.cancel(t("import.cancelled"));
      return;
    }
    const selected = answer as ProviderId[];
    finalProviders = selectedProviders.filter((provider) => selected.includes(provider.id));
  }

  if (interactive && options.overwrite === undefined) {
    const overwriteAnswer = await p.confirm({
      message: t("import.overwrite"),
      initialValue: false
    });
    if (p.isCancel(overwriteAnswer)) {
      p.cancel(t("import.cancelled"));
      return;
    }
    overwrite = Boolean(overwriteAnswer);
  }

  if (interactive && !options.mapPath?.length) {
    const shouldMap = await p.confirm({
      message: t("import.mapQuestion"),
      initialValue: false
    });
    if (p.isCancel(shouldMap)) {
      p.cancel(t("import.cancelled"));
      return;
    }

    if (shouldMap) {
      const mapping = await p.text({
        message: t("import.pathMapping"),
        placeholder: "/Users/alice/work=/Users/bob/dev"
      });
      if (p.isCancel(mapping)) {
        p.cancel(t("import.cancelled"));
        return;
      }
      mapPaths = parsePathMappings([String(mapping)]);
    }
  }

  if (interactive && !options.yes) {
    const confirm = await p.confirm({
      message: overwrite ? t("import.confirmOverwrite") : t("import.confirm"),
      initialValue: false
    });
    if (p.isCancel(confirm) || !confirm) {
      p.cancel(t("import.cancelled"));
      return;
    }
  }

  if (!interactive && !options.yes) {
    throw new Error(t("import.nonInteractiveYes"));
  }

  const spinner = interactive ? p.spinner() : undefined;
  spinner?.start(t("import.creatingRollback"));
  const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-import-"));

  try {
    const rollback = await createPreImportRollback(context.env, finalProviders, backupFile);
    spinner?.message(t("import.readingBackup"));
    await extractZip(backupFile, extractDir);
    spinner?.message(t("import.restoringClients"));
    const restored: string[] = [];
    let codexAppProjectCount = 0;

    for (const provider of finalProviders) {
      const sourceRoot = path.join(extractDir, "clients", provider.id);
      if (!(await fs.pathExists(sourceRoot))) {
        warn(t("import.clientMissing", { client: provider.name }));
        continue;
      }
      await provider.restoreFromBackup(context.env, sourceRoot, {
        mapPaths,
        overwrite
      });
      if (provider.id === "codex") {
        codexAppProjectCount = await syncCodexAppProjects(context.env);
      }
      restored.push(provider.id);
    }

    spinner?.stop(t("import.restoreComplete"));

    if (options.json) {
      printJson({ restored, manifest, rollback, codexAppProjectCount });
      return;
    }

    success(t("import.restored", { clients: restored.join(", ") }));
    if (codexAppProjectCount > 0) {
      success(t("import.codexAppProjects", { count: String(codexAppProjectCount) }));
      warn(t("import.codexAppRestart"));
    }
    success(t("import.rollbackSnapshot", { id: rollback.id }));
    if (!overwrite) {
      warn(t("import.keepExisting"));
    }
    if (mapPaths.length === 0) {
      warn(t("import.mapHint"));
    }
  } finally {
    await fs.remove(extractDir);
  }
}
