# AI Relay Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI Relay report available npm updates, back up the real Claude/Codex session layout, repair both posters without changing their content, and finish the remaining sync, archive, manifest, and Codex-index reliability fixes.

**Architecture:** Keep version/update logic in focused modules, separate provider session discovery from default export roots, validate backup structure before any mutation, and return structured diagnostics from optional Codex App synchronization. Remote commands retain separate push/pull responsibilities while `sync` becomes an explicit pull-merge-export-upload transaction.

**Tech Stack:** TypeScript ESM, Node.js 20+, Commander, Zod, fs-extra, yauzl/archiver, Vitest, AWS SDK S3, image generation/editing.

---

## File map

- Create `src/version.ts`: load package metadata as the single runtime version source.
- Create `src/update-check.ts`: eligibility, cache, registry lookup, SemVer comparison, and structured update result.
- Modify `src/manifest.ts`, `src/cli.ts`, `src/i18n.ts`, `src/output.ts`: consume version/update services and print notices safely.
- Modify `src/providers/provider.ts`, `src/providers/index.ts`: distinguish session discovery roots from default export roots.
- Modify `src/archive/zip.ts`, `src/manifest.ts`, `src/commands/import.ts`, `src/commands/inspect.ts`, `src/rollback.ts`: validate manifests and ZIP resource limits before mutation.
- Modify `src/commands/sync.ts`, `src/cli.ts`, `src/i18n.ts`: make sync transactional and require explicit overwrite confirmation.
- Modify `src/codex-app.ts`, `src/commands/import.ts`, `src/i18n.ts`: return and display SQLite synchronization diagnostics.
- Modify `README*.md`, create `CHANGELOG.md`: document update checks, export coverage, and sync semantics.
- Replace `img.png`, `img-en.png`: visual repair only, no content changes.
- Create/modify focused tests under `tests/` for every behavioral change.

### Task 1: Package version is the only version source

**Files:**
- Create: `src/version.ts`
- Modify: `src/manifest.ts`
- Test: `tests/version.test.ts`

- [x] **Step 1: Write the failing version test**

```ts
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { APP_NAME, APP_VERSION } from "../src/version.js";
import { createManifest } from "../src/manifest.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { name: string; version: string };

describe("package version", () => {
  it("drives the CLI and backup manifest from package.json", () => {
    expect(APP_NAME).toBe(packageJson.name);
    expect(APP_VERSION).toBe(packageJson.version);
    expect(createManifest([]).app_version).toBe(packageJson.version);
  });
});
```

- [x] **Step 2: Run `npx vitest run tests/version.test.ts` and verify it fails because `src/version.ts` does not exist**

- [x] **Step 3: Implement package metadata loading**

```ts
// src/version.ts
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
};

export const APP_NAME = packageJson.name;
export const APP_VERSION = packageJson.version;
```

Change `src/manifest.ts` to import and re-export `APP_VERSION` from `src/version.ts` instead of declaring a literal.

- [x] **Step 4: Run `npx vitest run tests/version.test.ts && npm run check && npm run build`; expect all commands to exit 0**

### Task 2: Cached, non-disruptive npm update notices

**Files:**
- Create: `src/update-check.ts`
- Create: `tests/update-check.test.ts`
- Modify: `src/cli.ts`
- Modify: `src/output.ts`
- Modify: `src/i18n.ts`

- [x] **Step 1: Write failing unit tests** for stable SemVer ordering, cache hits, registry results, timeout/error fallback, corrupt cache, `CI`, `--json`, non-TTY, and `AIRELAY_NO_UPDATE_CHECK=1`. Use an injected `fetchImpl`, `now`, and temporary home directory. The central assertion is:

```ts
const result = await checkForUpdate({
  homeDir,
  currentVersion: "0.1.1",
  packageName: "ai-relay-cli",
  isTTY: true,
  argv: ["node", "airelay", "doctor"],
  env: {},
  fetchImpl: async () => new Response(JSON.stringify({ version: "0.2.0" }), { status: 200 })
});
expect(result).toMatchObject({ currentVersion: "0.1.1", latestVersion: "0.2.0" });
```

- [x] **Step 2: Run `npx vitest run tests/update-check.test.ts`; expect missing-module failure**

- [x] **Step 3: Implement `checkForUpdate`** with these exported contracts:

```ts
export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  installCommand: string;
  changelogUrl: string;
}

export interface UpdateCheckOptions {
  homeDir: string;
  currentVersion?: string;
  packageName?: string;
  isTTY?: boolean;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  now?: Date;
  cacheTtlMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function checkForUpdate(options: UpdateCheckOptions): Promise<UpdateInfo | undefined>;
export function isNewerStableVersion(current: string, candidate: string): boolean;
```

Use `~/.airelay/update-check.json`, a 24-hour TTL, `npm_config_registry`, `AbortSignal.timeout`, atomic temporary-file move, and silent `undefined` fallback for every update-check failure.

- [x] **Step 4: Run update-check tests; expect all cases to pass**

- [x] **Step 5: Add CLI integration** by starting `checkForUpdate` before each command handler, awaiting it only after a successful handler, and printing through a focused `printUpdateNotice` function. Never print when the result is undefined.

- [x] **Step 6: Add localized messages** containing current/latest version, `npm install -g ai-relay-cli@latest`, and `https://github.com/anthonyli/ai-relay/blob/main/CHANGELOG.md`.

- [x] **Step 7: Run `npx vitest run tests/update-check.test.ts tests/i18n.test.ts && npm run check`; expect exit 0**

### Task 3: Real Claude and Codex default export coverage

**Files:**
- Modify: `src/providers/provider.ts`
- Modify: `src/providers/index.ts`
- Modify: `tests/export-privacy.test.ts`
- Modify: `tests/archive-flow.test.ts`

- [x] **Step 1: Add failing tests** that seed root-level `history.jsonl`, Codex `archived_sessions/...jsonl`, and `session_index.jsonl`, then assert default export copies them but still excludes `auth.json` and `config.toml`.

- [x] **Step 2: Run `npx vitest run tests/export-privacy.test.ts`; verify the new assertions fail because the files are absent**

- [x] **Step 3: Extend `ProviderDefinition`**:

```ts
export interface ProviderDefinition {
  // existing fields
  sessionRoots: string[];
  defaultExportRoots?: string[];
}
```

Make `copyForExport` use `defaultExportRoots ?? sessionRoots`, while `listSessions` continues using only `sessionRoots`. Make `walkFiles` return `[root]` when `root` is a regular file.

- [x] **Step 4: Configure real roots**:

```ts
// Claude
sessionRoots: ["projects", "sessions", "conversations"],
defaultExportRoots: ["projects", "sessions", "conversations", "history.jsonl"]

// Codex
sessionRoots: ["sessions", "archived_sessions"],
defaultExportRoots: ["sessions", "archived_sessions", "history.jsonl", "session_index.jsonl"]
```

- [x] **Step 5: Run provider/archive tests; expect pass and unchanged privacy exclusions**

### Task 4: Strict backup manifest validation

**Files:**
- Modify: `src/manifest.ts`
- Create: `tests/manifest-validation.test.ts`

- [x] **Step 1: Write failing tests** for missing clients, duplicate client types, negative counts, invalid timestamps, invalid export modes, invalid client types, and compatibility with `app: "aisession"`.

- [x] **Step 2: Run `npx vitest run tests/manifest-validation.test.ts`; verify malformed manifests are incorrectly accepted**

- [x] **Step 3: Define Zod schemas** for `ExportedClient` and `BackupManifest`, including bounded strings/arrays, stable enum values, non-negative integer counts, ISO datetime, and a `superRefine` duplicate-client check. Return typed parsed data from `parseManifest`.

- [x] **Step 4: Format errors as `Invalid ai-relay backup manifest: <field> <reason>` without echoing input values**

- [x] **Step 5: Run manifest and archive-flow tests; expect all to pass**

### Task 5: ZIP resource-limit validation

**Files:**
- Modify: `src/archive/zip.ts`
- Modify: `src/commands/import.ts`
- Modify: `src/commands/inspect.ts`
- Modify: `src/rollback.ts`
- Modify: `tests/archive-flow.test.ts`

- [x] **Step 1: Add failing tests** using a normal small archive with injected limits: `maxEntries: 0`, `maxEntryUncompressedBytes: 1`, and `maxTotalUncompressedBytes: 1`. Keep a path-traversal regression case.

- [x] **Step 2: Run `npx vitest run tests/archive-flow.test.ts`; expect missing validation API failure**

- [x] **Step 3: Add contracts and defaults**:

```ts
export interface ZipLimits {
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 100_000,
  maxEntryUncompressedBytes: 5 * 1024 ** 3,
  maxTotalUncompressedBytes: 20 * 1024 ** 3
};

export async function validateZipArchive(zipFile: string, limits?: ZipLimits): Promise<void>;
```

Iterate the central directory with yauzl, validate each name and `uncompressedSize`, close on every completion/error path, and reject on the first exceeded limit.

- [x] **Step 4: Call validation before extract/import/inspect/rollback mutation** and cap `readZipText` manifest accumulation to a small bounded size.

- [x] **Step 5: Run archive/import/rollback tests; expect all to pass**

### Task 6: Transactional and unambiguous `sync`

**Files:**
- Modify: `src/commands/sync.ts`
- Modify: `src/cli.ts`
- Modify: `src/i18n.ts`
- Modify: `tests/sync-s3.test.ts`

- [x] **Step 1: Add failing tests** proving `sync` treats its argument only as the remote key, requires `yes`, downloads/imports before uploading, uploads a newly exported merged backup to the same key, and never uploads after download/import failure.

- [x] **Step 2: Run `npx vitest run tests/sync-s3.test.ts`; verify current implementation fails by treating the key as a local path**

- [x] **Step 3: Add `yes?: boolean` to sync options and Commander `-y, --yes`**. For `sync`, reject non-interactive execution without `--yes`; in interactive execution use one final confirmation before remote overwrite.

- [x] **Step 4: Implement sync transaction**:

```ts
const key = remoteKey(prefix, options.backup);
await pullBackup(context, storage, bucket, key);
await exportAndUploadBackup(context, storage, bucket, key);
```

`exportAndUploadBackup` must always export to a temporary file and upload that file under the provided remote key. It must not resolve the remote key as a local filesystem path.

- [x] **Step 5: Run sync tests; expect pass with call-order assertions**

### Task 7: Codex App SQLite diagnostics

**Files:**
- Modify: `src/codex-app.ts`
- Modify: `src/commands/import.ts`
- Modify: `src/i18n.ts`
- Modify: `tests/codex-app-project-sync.test.ts`

- [x] **Step 1: Add failing tests** for `synced`, `not-found`, schema-incompatible `skipped`, and command/SQL `failed` outcomes.

- [x] **Step 2: Run `npx vitest run tests/codex-app-project-sync.test.ts`; verify the numeric return value cannot express diagnostics**

- [x] **Step 3: Return structured results**:

```ts
export interface CodexAppSyncResult {
  addedProjectCount: number;
  sqlite: {
    status: "not-found" | "synced" | "skipped" | "failed";
    message?: string;
  };
}
```

Check required tables and columns before mutation. Catch errors into a short message instead of swallowing them. Do not throw after session files have already restored.

- [x] **Step 4: Update import text and JSON output** to expose `codexAppSync`; warn only for `skipped` and `failed`.

- [x] **Step 5: Run Codex/import tests; expect all diagnostics and existing project sync behavior to pass**

### Task 8: Documentation and changelog

**Files:**
- Create: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ja.md`
- Modify: `README.ko.md`
- Modify: `package.json`

- [x] **Step 1: Add an Unreleased changelog** describing update notifications, expanded session coverage, archive validation, sync safety, and SQLite diagnostics.

- [x] **Step 2: Document** automatic 24-hour update checking, `AIRELAY_NO_UPDATE_CHECK=1`, exact default export roots, and `airelay sync <remote-key> --yes` semantics in all README variants.

- [x] **Step 3: Include `CHANGELOG.md` in the published package files** so installed users and the linked GitHub page share the same change record.

- [x] **Step 4: Run `npm pack --dry-run`; expect README variants and `CHANGELOG.md` in tarball output**

### Task 9: Repair the two poster assets without changing content

**Files:**
- Modify: `img.png`
- Modify: `img-en.png`

- [x] **Step 1: Load the image-generation skill and inspect both originals at full resolution**

- [x] **Step 2: Edit `img-en.png` using both originals as references**, preserving every existing English phrase and panel while removing overlays, residual Chinese, clipping, misalignment, and opaque blocks.

- [x] **Step 3: Edit `img.png` only where a visible generation/layout defect exists**, preserving every Chinese phrase and panel.

- [x] **Step 4: Inspect both outputs at original resolution** and verify title, transfer flow, value panel, three scenario panels, capability badges, command block, install block, and QR region are present and legible.

- [x] **Step 5: Run `file` and `sips` checks; expect valid 1920×1080 PNG files**

### Task 10: Full verification and completion audit

**Files:**
- Modify only files needed to fix failures found by verification.

- [x] **Step 1: Run `npm test`; expect every test file and test case to pass with zero failures**

- [x] **Step 2: Run `npm run check && npm run build && npm pack --dry-run`; expect exit 0 and the expected package contents**

- [x] **Step 3: Use a temporary HOME to run** `doctor`, `export`, `inspect`, `import`, `rollback --list`, and update-check simulations. Verify exit codes, restored files, manifest version, JSON purity, and update notice output.

- [x] **Step 4: Re-read the design requirement by requirement** and map every requirement to test output, CLI output, source diff, or rendered-image evidence. Continue fixing anything with missing or indirect evidence.

- [x] **Step 5: Run `git diff --check` and inspect `git status --short`** to ensure no generated archives, caches, or unrelated user files are included.
