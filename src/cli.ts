import { Command } from "commander";
import { loadConfig } from "./config.js";
import { createRuntimeEnv } from "./env.js";
import { APP_VERSION } from "./manifest.js";
import { error } from "./output.js";
import { doctorCommand } from "./commands/doctor.js";
import { exportCommand } from "./commands/export.js";
import { importCommand } from "./commands/import.js";
import { inspectCommand } from "./commands/inspect.js";
import { listCommand } from "./commands/list.js";
import { rollbackCommand } from "./commands/rollback.js";
import { syncPlaceholderCommand } from "./commands/sync.js";
import type { CommandContext } from "./commands/context.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("airelay")
    .description("Backup, export, import, and restore AI coding CLI sessions.")
    .version(APP_VERSION)
    .option("--config <path>", "config file path")
    .option("--home <path>", "override home directory for provider detection");

  async function context(): Promise<CommandContext> {
    const options = program.optsWithGlobals() as { config?: string; home?: string };
    const env = createRuntimeEnv({ home: options.home });
    const config = await loadConfig(env, options.config);
    return { env, config, configPath: options.config };
  }

  function run(handler: (context: CommandContext) => Promise<void>) {
    return async () => {
      try {
        await handler(await context());
      } catch (caught) {
        error(caught instanceof Error ? caught.message : String(caught));
        process.exitCode = 1;
      }
    };
  }

  program
    .command("doctor")
    .description("Detect supported AI CLI clients.")
    .option("--json", "print JSON output")
    .action((options) => run((ctx) => doctorCommand(ctx, options))());

  program
    .command("export")
    .alias("backup")
    .description("Export AI CLI sessions into a backup zip.")
    .option("-o, --output <file>", "output backup zip")
    .option("--only <client...>", "export only selected clients: claude, codex")
    .option("--session <session...>", "export selected sessions, e.g. claude:projects/foo/session.jsonl")
    .option("-y, --yes", "skip confirmations")
    .option("--include-secrets", "include auth/credential-like files")
    .option("--json", "print JSON output")
    .action((options) => run((ctx) => exportCommand(ctx, options))());

  program
    .command("import")
    .alias("restore")
    .description("Import sessions from a backup zip.")
    .argument("<backup>", "backup zip file")
    .option("--only <client...>", "restore only selected clients: claude, codex")
    .option("--map-path <old=new...>", "rewrite project paths while restoring")
    .option("--overwrite", "overwrite existing local files during restore")
    .option("-y, --yes", "skip confirmations")
    .option("--json", "print JSON output")
    .action((backup, options) => run((ctx) => importCommand(ctx, backup, options))());

  program
    .command("rollback [rollback]")
    .description("Rollback local sessions to a pre-import snapshot.")
    .option("--list", "list rollback snapshots")
    .option("-y, --yes", "skip confirmations")
    .option("--json", "print JSON output")
    .action((rollback, options) => run((ctx) => rollbackCommand(ctx, rollback, options))());

  program
    .command("inspect")
    .description("Inspect a backup zip.")
    .argument("<backup>", "backup zip file")
    .option("--json", "print JSON output")
    .action((backup, options) => run((ctx) => inspectCommand(ctx, backup, options))());

  program
    .command("ls")
    .alias("list")
    .description("List local AI CLI sessions.")
    .option("--only <client>", "list only one client: claude, codex")
    .option("--json", "print JSON output")
    .action((options) => run((ctx) => listCommand(ctx, options))());

  for (const action of ["push", "pull", "sync"] as const) {
    program
      .command(action)
      .description(`V2 cloud ${action} (requires explicit storage config).`)
      .action(() => run((ctx) => syncPlaceholderCommand(ctx, action))());
  }

  return program;
}
