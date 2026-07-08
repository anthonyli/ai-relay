# AI Relay

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

`airelay` 用于备份、恢复、检查和迁移本地 AI Coding CLI 会话。

当前默认模式是 V1.1 本地优先：

- 检测 Claude Code 和 Codex CLI
- 本地导出、导入、备份、恢复
- 检查备份内容
- 列出本地会话
- 导出单个会话
- 导入默认不覆盖本机文件
- 每次导入前自动创建回滚快照
- 支持空配置
- V2 云同步需要显式配置存储后才会启用

## 为什么需要

AI Coding 工具会把有价值的会话历史保存在本机。换电脑、重装环境或做高风险操作前，如果手工复制 `.claude` 和 `.codex` 目录，很容易漏文件或覆盖错内容。

AI Relay 把这个流程变成可重复的 CLI 工作流：

```bash
airelay export --output backup.zip
airelay import backup.zip
airelay rollback
```

默认导出只包含 session/history 数据。`auth.json`、token、凭证、配置文件、`.env`、`.pem`、`.key`、cache、tmp、logs、plugins 等隐私敏感文件会被排除。

## 本地安装

```bash
npm install
npm run build
npm link
```

然后运行：

```bash
airelay doctor
airelay export
airelay inspect backup_2026-07-07.zip
airelay import backup_2026-07-07.zip
```

不 link 也可以运行：

```bash
node dist/index.js doctor
node dist/index.js export --yes
```

## 常用流程

创建备份：

```bash
airelay export --output backup.zip
```

只导出某一个客户端：

```bash
airelay export --only claude --output claude-backup.zip --yes
airelay export --only codex --output codex-backup.zip --yes
```

导出指定会话：

```bash
airelay export --session claude:projects/my-project/session.jsonl
```

恢复前检查备份：

```bash
airelay inspect backup.zip
```

不覆盖本机文件地恢复：

```bash
airelay import backup.zip
```

换电脑时重写项目路径：

```bash
airelay import backup.zip --map-path /Users/alice/work=/Users/bob/dev
```

回滚到导入前的快照：

```bash
airelay rollback
```

## 命令

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

别名：

```bash
airelay backup
airelay restore backup.zip
```

V2 命令会在显式配置存储后才启用：

```bash
airelay push
airelay pull
airelay sync
```

## 安全模型

`airelay` 默认采用本地优先和保守策略。

- 默认导出只包含 session/history 数据。
- `--full` 会导出更完整的非敏感客户端数据，但仍会排除隐私敏感文件。
- 导入默认保留本机已有文件，除非显式传入 `--overwrite`。
- 每次导入前，`airelay` 会在 `~/.airelay/rollbacks/` 下创建回滚快照。
- `rollback --list` 可查看可用快照，方便自动化或手动恢复。

导出更完整的非敏感数据：

```bash
airelay export --full
```

自动化场景：

```bash
airelay rollback --list
airelay rollback pre_import_20260707T150000Z --yes
```

## 配置

`airelay` 会先读取当前目录配置，再读取用户配置目录：

- `./airelay.config.yml`
- `./airelay.config.yaml`
- `./airelay.config.json`
- `~/.airelay/config.yml`
- `~/.airelay/config.yaml`
- `~/.airelay/config.json`

使用指定配置文件：

```bash
airelay --config /path/to/config.yml ...
```

配置是可选的。空配置等价于：

```yaml
version: "1.1"
storage:
  type: local
cloud_sync:
  enabled: false
```

最小 MinIO/S3 兼容配置：

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

上传已有备份：

```bash
airelay push backup_2026-07-08.zip
```

下载并恢复备份：

```bash
airelay pull backup_2026-07-08.zip
```

## 推广文案

```text
AI Relay
把 AI Coding 会话安全带到下一台电脑
本地优先 / 隐私友好 / 可回滚
```

短文案：

```text
换电脑不用再手工复制 .claude 和 .codex。AI Relay 帮你导出、检查、恢复和回滚 AI Coding 会话。
```

海报规格见 [spec.md](spec.md)。
