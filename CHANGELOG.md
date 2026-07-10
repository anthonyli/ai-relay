# Changelog

## Unreleased

- Use `package.json` as the single source for CLI and backup-manifest versions.
- Check npm for a newer stable release at most once every 24 hours and show a non-blocking upgrade notice to interactive users.
- Include root-level Claude Code and Codex history, Codex archived sessions, and the Codex session index in default backups.
- Validate backup manifests and enforce ZIP entry-count and uncompressed-size limits before restore operations.
- Make `sync` a confirmed pull-merge-export-upload transaction that treats its argument only as a remote object key.
- Report Codex App SQLite index synchronization results instead of silently discarding errors.
- Repair the Chinese and English poster assets without changing their product scenarios or copy.

## 0.1.1

- Synchronize imported Codex projects with the Codex App project list and local thread catalog.

## 0.1.0

- Initial npm release with local export, import, inspect, session listing, rollback snapshots, path mapping, and opt-in S3-compatible storage.
