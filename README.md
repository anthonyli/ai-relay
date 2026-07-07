# AI Relay

`airelay` backs up and restores local AI coding CLI sessions.

Current default mode is V1.1:

- Claude Code and Codex CLI provider detection
- Local export/import/backup/restore
- Backup inspection
- Session listing
- Single-session export
- Empty config support
- V2 cloud sync disabled until explicitly configured

## Install locally

```bash
npm install
npm run build
npm link
```

Then:

```bash
airelay doctor
airelay export
airelay inspect backup_2026-07-07.zip
airelay import backup_2026-07-07.zip
```

You can also run without linking:

```bash
node dist/index.js doctor
node dist/index.js export --yes
```

## Non-interactive examples

```bash
airelay export --only claude --output backup.zip --yes
airelay import backup.zip --yes
airelay ls
```

## Commands

```bash
airelay doctor
airelay ls
airelay export
airelay export --session claude:projects/my-project/session.jsonl
airelay inspect backup.zip
airelay import backup.zip
airelay import backup.zip --map-path /Users/alice/work=/Users/bob/dev
airelay import backup.zip --overwrite
airelay rollback
airelay rollback --list
```

Aliases:

```bash
airelay backup
airelay restore backup.zip
```

By default, obvious secret files such as `auth.json`, credentials, `.env`, `.pem`, and `.key` are excluded. Use `--include-secrets` only for private backups you fully control.

Import is non-destructive by default: existing files in `.claude` or `.codex` are kept. Use `--overwrite` only when you intentionally want the backup to replace local files with the same path.

Interactive import asks for client selection, overwrite behavior, path mapping, and final confirmation. You do not need to remember the advanced flags for daily use.

Before every import, `airelay` automatically creates a rollback snapshot under `~/.airelay/rollbacks/`. To return to the state before an import:

```bash
airelay rollback
```

For automation:

```bash
airelay rollback --list
airelay rollback pre_import_20260707T150000Z --yes
```

V2 commands are intentionally gated until storage is configured:

```bash
airelay push
airelay pull
airelay sync
```

## Config

Config is optional. Empty config is equivalent to:

```yaml
version: "1.1"
storage:
  type: local
cloud_sync:
  enabled: false
```
