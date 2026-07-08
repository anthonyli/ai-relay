# AI Relay

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

![AI Relay poster](img-en.png)

`airelay` backs up, restores, inspects, and migrates local AI coding CLI sessions.

Current default mode is V1.1 local-first:

- Claude Code and Codex CLI provider detection
- Local export/import/backup/restore
- Backup inspection
- Session listing
- Single-session export
- Non-destructive import by default
- Automatic rollback snapshot before import
- Empty config support
- V2 cloud sync gated until storage is explicitly configured

## Why

AI coding tools keep valuable session history on your machine. When you switch computers, rebuild an environment, or want a clean backup before risky changes, manually copying `.claude` and `.codex` directories is fragile.

AI Relay turns that workflow into one repeatable CLI flow:

```bash
airelay export --output backup.zip
airelay import backup.zip
airelay rollback
```

By default, exports include session and history data only. Privacy-sensitive files such as `auth.json`, tokens, credentials, config files, `.env`, `.pem`, `.key`, cache, tmp, logs, and plugins are excluded.

## Install from npm

Install the published package:

```bash
npm install -g ai-relay-cli
```

Then:

```bash
airelay doctor
airelay export
airelay inspect backup_2026-07-07.zip
airelay import backup_2026-07-07.zip
```

## Build locally

For local development:

```bash
npm install
npm run build
npm link
```

Then run the linked binary:

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

## Common workflows

Create a backup:

```bash
airelay export --output backup.zip
```

Export only one provider:

```bash
airelay export --only claude --output claude-backup.zip --yes
airelay export --only codex --output codex-backup.zip --yes
```

Export selected sessions:

```bash
airelay export --session claude:projects/my-project/session.jsonl
```

Inspect a backup before restoring:

```bash
airelay inspect backup.zip
```

Restore without overwriting existing files:

```bash
airelay import backup.zip
```

Restore and rewrite project paths for a new machine:

```bash
airelay import backup.zip --map-path /Users/alice/work=/Users/bob/dev
```

Rollback to the snapshot created before import:

```bash
airelay rollback
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

V2 commands are intentionally gated until storage is configured:

```bash
airelay push
airelay pull
airelay sync
```

## Safety model

`airelay` is local-first and conservative by default.

- Default export includes session/history data only.
- `--full` exports broader non-secret provider data, but still excludes privacy-sensitive files.
- Import keeps existing local files unless `--overwrite` is passed.
- Before every import, `airelay` creates a rollback snapshot under `~/.airelay/rollbacks/`.
- `rollback --list` shows available snapshots for automation or manual recovery.

Use `--full` only when you want a broader provider backup:

```bash
airelay export --full
```

For automation:

```bash
airelay rollback --list
airelay rollback pre_import_20260707T150000Z --yes
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

## International documentation

This repository includes documentation files for Chinese, Japanese, and Korean readers. These files describe the product and promotion copy only; they do not imply runtime CLI localization.

- [简体中文 README](README.zh-CN.md)
- [日本語 README](README.ja.md)
- [한국어 README](README.ko.md)

## Poster brief

Use `spec.md` as the source brief for promotional poster generation. It includes product positioning, layout guidance, feature badges, and Chinese/Japanese/Korean poster copy.
