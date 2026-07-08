import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import * as p from "@clack/prompts";
import { createZipFromDirectory } from "../archive/zip.js";
import { t } from "../i18n.js";
import { createManifest } from "../manifest.js";
import { printJson, success, warn } from "../output.js";
import { providers } from "../providers/index.js";
import { parseProviderId, PRIVACY_EXCLUSIONS } from "../providers/provider.js";
import type { BackupManifest, ExportedClient, ProviderId } from "../types.js";
import type { CommandContext } from "./context.js";
import { isInteractive } from "./context.js";

export async function exportCommand(
  context: CommandContext,
  options: {
    output?: string;
    only?: string[];
    session?: string[];
    yes?: boolean;
    full?: boolean;
    json?: boolean;
  }
): Promise<void> {
  const sessionProviderIds = inferSessionProviderIds(options.session);
  const selectedIds = options.only?.map(parseProviderId) ?? sessionProviderIds;
  const detected = [];
  for (const provider of providers) {
    if (selectedIds?.length && !selectedIds.includes(provider.id)) {
      continue;
    }
    if (await provider.detect(context.env)) {
      detected.push(provider);
    }
  }

  if (detected.length === 0) {
    throw new Error(t("export.noClients"));
  }

  const interactive = isInteractive(options);
  let selected = detected;
  let output = path.resolve(options.output ?? defaultBackupName());

  if (interactive && !selectedIds?.length && !options.session?.length) {
    p.intro(t("export.intro"));
    const answer = await p.multiselect({
      message: t("export.selectClients"),
      options: detected.map((provider) => ({
        value: provider.id,
        label: provider.name,
        hint: provider.rootDir(context.env)
      })),
      initialValues: detected.map((provider) => provider.id),
      required: true
    });
    if (p.isCancel(answer)) {
      p.cancel(t("export.cancelled"));
      return;
    }
    const ids = answer as ProviderId[];
    selected = detected.filter((provider) => ids.includes(provider.id));

    const outputAnswer = await p.text({
      message: t("export.outputFile"),
      placeholder: path.basename(output),
      defaultValue: output
    });
    if (p.isCancel(outputAnswer)) {
      p.cancel(t("export.cancelled"));
      return;
    }
    output = path.resolve(String(outputAnswer || output));
  }

  if ((await fs.pathExists(output)) && !options.yes) {
    if (interactive) {
      const overwrite = await p.confirm({
        message: t("export.overwrite", { output }),
        initialValue: false
      });
      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel(t("export.cancelled"));
        return;
      }
    } else {
      throw new Error(t("export.overwriteNonInteractive", { output }));
    }
  }

  const spinner = interactive ? p.spinner() : undefined;
  spinner?.start(t("export.scanning"));

  const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-export-"));
  const clients: ExportedClient[] = [];

  try {
    for (const provider of selected) {
      const clientDir = path.join(stagingDir, "clients", provider.id);
      await fs.ensureDir(clientDir);
      const exportedSessionCount = await provider.copyForExport(context.env, clientDir, {
        sessionIds: options.session,
        full: Boolean(options.full)
      });
      const status = await provider.status(context.env);
      clients.push({
        type: provider.id,
        name: provider.name,
        version: status.version,
        root_dir: status.rootDir,
        session_count: status.sessionCount,
        exported_session_count: exportedSessionCount,
        export_mode: options.full ? "full" : "sessions",
        privacy_exclusions: PRIVACY_EXCLUSIONS
      });
    }

    const manifest = createManifest(clients);
    await fs.writeJson(path.join(stagingDir, "manifest.json"), manifest, { spaces: 2 });
    await fs.ensureDir(path.join(stagingDir, "metadata"));
    await fs.writeJson(path.join(stagingDir, "metadata", "machine.json"), {
      hostname: manifest.hostname,
      os: manifest.os,
      home_dir: context.env.homeDir
    }, { spaces: 2 });
    await fs.writeJson(path.join(stagingDir, "metadata", "versions.json"), {
      app_version: manifest.app_version,
      clients: manifest.clients
    }, { spaces: 2 });
    await fs.writeJson(path.join(stagingDir, "metadata", "created.json"), {
      created_at: manifest.created_at
    }, { spaces: 2 });

    await createZipFromDirectory(stagingDir, output);
    spinner?.stop(t("export.created", { output }));

    if (options.json) {
      printJson({ output, manifest });
      return;
    }

    success(t("export.created", { output }));
    warn(t("export.privacy"));
    if (!options.full) {
      warn(t("export.defaultMode"));
    }
  } finally {
    await fs.remove(stagingDir);
  }
}

function defaultBackupName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `backup_${date}.zip`;
}

function inferSessionProviderIds(sessions: string[] | undefined): ProviderId[] | undefined {
  if (!sessions?.length) {
    return undefined;
  }

  const prefixed = sessions.filter((session) => session.includes(":"));
  if (prefixed.length !== sessions.length) {
    return undefined;
  }

  return [...new Set(prefixed.map((session) => parseProviderId(session.split(":")[0] ?? "")))];
}
