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

By default, export includes only session/history data. Privacy-sensitive files such as `auth.json`, tokens, credentials, config files, `.env`, `.pem`, `.key`, cache, tmp, logs, and plugins are always excluded.

Use `--full` only when you want a broader provider backup. Even in full mode, privacy-sensitive files are still excluded:

```bash
airelay export --full
```

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

`airelay` loads config from the current directory first, then from the user config directory:

- `./airelay.config.yml`
- `./airelay.config.yaml`
- `./airelay.config.json`
- `~/.airelay/config.yml`
- `~/.airelay/config.yaml`
- `~/.airelay/config.json`

Use `airelay --config /path/to/config.yml ...` to load a specific config file.

Config is optional. Empty config is equivalent to:

```yaml
version: "1.1"
storage:
  type: local
cloud_sync:
  enabled: false
```

Minimal MinIO/S3-compatible config:

```yaml
version: "2"
storage:
  type: s3
  bucket: airelay
  region: us-east-1
  endpoint: http://127.0.0.1:9000
  prefix: backups
  access_key_id: minioadmin
  secret_access_key: minioadmin
  force_path_style: true
cloud_sync:
  enabled: true
```

Upload an existing backup zip:

```bash
airelay push backup_2026-07-08.zip
```

Download and restore that backup:

```bash
airelay pull backup_2026-07-08.zip
```
