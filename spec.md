# AI Relay Promotion Poster Spec

## Product

AI Relay is a local-first CLI tool for backing up, inspecting, restoring, rolling back, and migrating AI coding sessions.

Current command name:

```bash
airelay
```

Supported providers in the current project:

- Claude Code
- Codex CLI

Current default mode:

- V1.1 local backup and restore
- V2 cloud sync is gated until storage is explicitly configured

## Poster Goal

Create a promotional poster that makes developers understand the value in under 5 seconds:

```text
AI Relay safely moves AI coding sessions between machines.
```

The poster should feel like a developer tool, not a generic cloud backup ad. It should show command-line confidence, local-first safety, and cross-device migration.

## Audience

Primary audience:

- Developers using Claude Code or Codex CLI
- AI coding power users switching machines or rebuilding environments
- Engineers who care about session history, privacy, rollback, and repeatable workflows

Secondary audience:

- Tool builders
- DevOps/platform engineers
- Teams experimenting with AI coding workflows

## Core Value Proposition

AI Relay turns fragile manual copying of `.claude` and `.codex` folders into a repeatable CLI workflow:

```bash
airelay export --output backup.zip
airelay inspect backup.zip
airelay import backup.zip
airelay rollback
```

Key promise:

- Backup AI coding sessions
- Restore them on another machine
- Keep secrets out of backups
- Roll back safely if import goes wrong

## Feature Messages

Use these as short poster badges or secondary blocks:

- Claude Code + Codex CLI
- Local-first backup
- Session/history export
- Privacy-sensitive files excluded
- Non-destructive import
- Automatic rollback snapshots
- Cross-device path mapping
- S3/MinIO-ready V2 config

## Visual Direction

Style:

- Modern developer utility
- Clean terminal-inspired composition
- High contrast
- Sharp typography
- Minimal decorative elements
- No cartoon mascot
- No vague cloud-only imagery

Suggested visual metaphor:

```text
Laptop A -> backup.zip -> Laptop B
```

Recommended hero visual:

- A central terminal panel showing `airelay export` and `airelay import`
- A small `backup.zip` object moving between two developer machines
- Subtle provider labels: Claude Code, Codex CLI
- Safety layer labels: Secrets excluded, Rollback ready

Avoid:

- Overly glossy SaaS dashboard mockups
- Generic cloud upload icons as the main idea
- Crowded code screenshots
- Text-heavy paragraphs
- Claims that runtime Japanese/Korean CLI localization is implemented unless code is updated separately

## Layout

Recommended format:

- 1080 x 1350 for social poster
- 1920 x 1080 for launch banner
- 1200 x 628 for link preview

Hierarchy:

1. Product name: `AI Relay`
2. Headline: short outcome-focused line
3. Terminal command block
4. 3 to 5 feature badges
5. CTA: `npm install && airelay export`

Primary poster structure:

```text
[AI Relay]

[Headline]

┌────────────────────────────────────┐
│ $ airelay export --output backup.zip│
│ ✓ Claude Code                       │
│ ✓ Codex CLI                         │
│ ✓ Secrets excluded                  │
│ ✓ Rollback snapshot ready           │
└────────────────────────────────────┘

[Claude Code] [Codex CLI] [Local-first] [Rollback-ready]

[CTA]
```

## Color And Typography

Suggested color palette:

- Background: near black or deep neutral, not pure blue-purple
- Primary accent: clean cyan or green for terminal success states
- Secondary accent: warm amber for `backup.zip`
- Text: white and soft gray
- Danger/safety note: muted red only for excluded secrets or overwrite warnings

Typography:

- Title: bold geometric sans
- Body: readable sans
- Command block: monospace

Keep all command text exact and easy to read.

## Chinese Poster Copy

Hero option 1:

```text
AI Relay
把 AI Coding 会话安全带到下一台电脑
```

Hero option 2:

```text
AI Relay
一条命令备份 Claude Code 与 Codex CLI 会话
```

Subtitle:

```text
本地优先，默认排除敏感文件，导入前自动创建回滚快照。
```

Feature badges:

```text
Claude Code
Codex CLI
本地备份
隐私友好
可回滚
跨设备迁移
```

CTA:

```text
npm install
airelay export
```

Short social caption:

```text
换电脑不用再手工复制 .claude 和 .codex。AI Relay 帮你导出、检查、恢复和回滚 AI Coding 会话。
```

## Japanese Poster Copy

Hero option 1:

```text
AI Relay
AI Coding セッションを、次の環境へ安全に
```

Hero option 2:

```text
AI Relay
Claude Code と Codex CLI のセッションをワンコマンドでバックアップ
```

Subtitle:

```text
Local-first。機密ファイルを除外し、インポート前にロールバックスナップショットを作成します。
```

Feature badges:

```text
Claude Code
Codex CLI
Local-first
Secrets excluded
Rollback-ready
Cross-device migration
```

CTA:

```text
npm install
airelay export
```

Short social caption:

```text
.claude と .codex を手作業でコピーする必要はありません。AI Relay で AI Coding セッションをバックアップ、確認、復元、ロールバックできます。
```

## Korean Poster Copy

Hero option 1:

```text
AI Relay
AI Coding 세션을 다음 환경으로 안전하게 이동
```

Hero option 2:

```text
AI Relay
Claude Code와 Codex CLI 세션을 한 번에 백업
```

Subtitle:

```text
로컬 우선 방식으로 동작하며, 민감한 파일은 제외하고 가져오기 전에 롤백 스냅샷을 만듭니다.
```

Feature badges:

```text
Claude Code
Codex CLI
Local-first
Secrets excluded
Rollback-ready
Cross-device migration
```

CTA:

```text
npm install
airelay export
```

Short social caption:

```text
.claude와 .codex 폴더를 직접 복사하지 않아도 됩니다. AI Relay로 AI Coding 세션을 백업, 확인, 복원, 롤백하세요.
```

## English Poster Copy

Hero option 1:

```text
AI Relay
Carry your AI coding sessions safely to the next machine
```

Hero option 2:

```text
AI Relay
One-command backup for Claude Code and Codex CLI sessions
```

Subtitle:

```text
Local-first backups, secrets excluded, rollback snapshots before every import.
```

Feature badges:

```text
Claude Code
Codex CLI
Local-first
Secrets excluded
Rollback-ready
Cross-device migration
```

CTA:

```text
npm install
airelay export
```

Short social caption:

```text
Stop manually copying .claude and .codex. AI Relay backs up, inspects, restores, and rolls back AI coding sessions.
```

## Poster Generation Prompt

Use this prompt for an image generation tool or hand it to a designer:

```text
Create a modern promotional poster for a developer CLI tool named "AI Relay".

The poster should show a local-first workflow for backing up and restoring AI coding sessions between two developer machines. Use a clean terminal-inspired visual system. Place a central terminal panel with these exact lines:

$ airelay export --output backup.zip
✓ Claude Code
✓ Codex CLI
✓ Secrets excluded
✓ Rollback snapshot ready

Show a small backup.zip object moving from Laptop A to Laptop B. Add compact feature badges: Claude Code, Codex CLI, Local-first, Rollback-ready. The design should feel precise, trustworthy, and technical. Use high-contrast typography, a dark neutral background, cyan/green terminal accents, and a warm amber accent for backup.zip. Avoid mascots, generic cloud graphics, and crowded code screenshots.

Headline:
AI Relay
Carry your AI coding sessions safely to the next machine

CTA:
npm install
airelay export
```

## Chinese Poster Generation Prompt

```text
为开发者 CLI 工具 "AI Relay" 生成一张现代推广海报。

主题是把 Claude Code 和 Codex CLI 的 AI Coding 会话从一台电脑安全迁移到另一台电脑。画面使用终端风格、深色高对比背景、清晰的等宽字体和简洁的开发者工具视觉。中心放置一个终端面板，必须包含以下命令和状态：

$ airelay export --output backup.zip
✓ Claude Code
✓ Codex CLI
✓ Secrets excluded
✓ Rollback snapshot ready

画面中表现 Laptop A -> backup.zip -> Laptop B 的迁移关系。加入功能标签：Claude Code、Codex CLI、本地备份、隐私友好、可回滚。整体感觉要专业、可信、克制，不要卡通角色，不要泛泛的云图标，不要拥挤代码截图。

主标题：
AI Relay
把 AI Coding 会话安全带到下一台电脑

副标题：
本地优先，默认排除敏感文件，导入前自动创建回滚快照。

CTA：
npm install
airelay export
```

## Accuracy Notes

Do not overclaim:

- The current project supports Claude Code and Codex CLI as providers.
- Default backup mode is local V1.1.
- V2 cloud commands exist, but cloud sync requires explicit storage configuration.
- Runtime Japanese/Korean CLI localization should not be claimed as implemented unless the code is updated separately.
- The poster can use Chinese, Japanese, and Korean marketing copy from this spec.
