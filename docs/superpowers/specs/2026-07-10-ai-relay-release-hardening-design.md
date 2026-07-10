# AI Relay 发布可靠性加固设计

日期：2026-07-10

## 目标

本轮工作分两个连续阶段完成，不在第一阶段结束后缩小范围。

阶段一修复直接影响发布体验和备份完整性的项目：

- 以 `package.json` 作为 CLI、备份 manifest 和更新检查的唯一版本来源。
- 为交互式 CLI 增加低干扰的 npm 新版本检查与升级提示。
- 覆盖 Claude Code 和 Codex 真实目录中的历史、归档会话及会话索引。
- 保留现有海报内容和使用场景，只修复 `img.png`、`img-en.png` 的生成错误。

阶段二继续处理审查中确认的剩余问题：

- 消除 `sync` 参数同时代表远程对象和本地文件的歧义。
- 在产生回滚或写入本机前严格验证备份 manifest。
- 为 ZIP 读取和解压增加条目数、单文件大小和总解压大小限制。
- 不再静默吞掉 Codex App SQLite 索引同步失败，并给出可操作诊断。

## 当前证据

- `package.json` 和 npm Registry 当前版本均为 `0.1.1`，但 `src/manifest.ts` 仍硬编码 `0.1.0`。
- 本机真实目录包含 `~/.claude/history.jsonl`、`~/.codex/history.jsonl`、`~/.codex/archived_sessions` 和 `~/.codex/session_index.jsonl`，现有默认导出没有覆盖这些路径。
- `img-en.png` 存在画面错层、遮挡、残留中文、文字越界和底部裁切；两张海报的文案与信息结构必须保持不变。
- `sync` 先把参数作为远程 key 拉取，随后又把同一个参数作为本地路径上传，因此常见调用会在第二阶段找不到本地文件。
- `parseManifest` 只检查少量顶层字段；解压过程只防止路径穿越，没有资源上限。
- Codex SQLite 同步通过 `.catch(() => undefined)` 吞掉所有错误，CLI 无法区分未尝试、成功和失败。

## 阶段一设计

### 版本单一来源

构建和测试均直接从根目录 `package.json` 读取版本，导出为统一的 `APP_VERSION`。Commander 的 `--version`、备份 manifest 的 `app_version` 和更新检查都使用该值。以后发布只需要修改 `package.json`，不再同步维护第二份常量。

### 更新检查

新增独立的更新检查模块，职责仅包括读取缓存、查询 npm Registry、比较版本和返回结构化结果；它不直接打印输出。

执行规则：

- 仅在实际子命令执行时启动检查；`--help` 和 `--version` 不触发。
- 仅面向 TTY 用户提示；`--json`、CI、非 TTY 和 `AIRELAY_NO_UPDATE_CHECK=1` 跳过。
- 使用 `npm_config_registry` 指定的 Registry，未配置时使用 `https://registry.npmjs.org/`。
- 查询包的 `latest` 元数据，并以约 1 秒超时限制网络等待。
- 在 `~/.airelay/update-check.json` 缓存检查时间和最新版本，缓存有效期 24 小时。
- 命令执行与更新查询并行；只在命令成功后展示结果，避免掩盖业务错误。
- 网络、权限、缓存损坏或 Registry 响应异常全部静默降级，不改变命令退出码。
- 发现更新时显示当前版本、最新版本、`npm install -g ai-relay-cli@latest` 和 changelog 链接。

版本比较只接受合法稳定 SemVer；无法解析的远端版本视为无结果，避免错误提示降级或预发布版本。

### 默认备份覆盖范围

Provider 定义把用于会话发现/计数的 `sessionRoots` 与用于默认备份复制的 `defaultExportRoots` 分开，并让两者都支持目录根和单文件根。默认模式覆盖：

- Claude Code：`projects`、`sessions`、`conversations`、`history.jsonl`。
- Codex：`sessions`、`archived_sessions`、`history.jsonl`、`session_index.jsonl`。

`walkFiles` 在输入为文件时直接返回该文件，在输入为目录时递归遍历。会话发现仍只遍历真正的会话目录；默认复制额外包含历史和索引文件。隐私排除规则继续生效，默认模式仍不会包含认证、配置、插件、缓存或密钥材料。

manifest 中的 `exported_session_count` 表示识别到的会话文件数量；索引文件可以随备份复制，但不重复计为独立会话。测试使用与真实客户端一致的根目录布局，验证导出、检查和恢复闭环。

### 海报修复

海报内容、使用场景、功能文案、配色和 1920×1080 尺寸保持不变。以现有 `img.png` 作为中文布局参考，以现有 `img-en.png` 作为英文文案参考，修复：

- 错层和不透明遮挡块。
- 残留中文或混合语言。
- 文本越界、重叠、底部裁切。
- 不一致的边框、对齐和间距。

不借海报修复删除、增加或重新解释现有文案。生成后逐张以原始分辨率检查，至少验证标题、三个主场景区、能力标签、命令区和二维码区域。

## 阶段二设计

### `sync` 明确语义

三个远程命令保持清晰边界：

- `push [local-backup]`：有参数时上传指定本地文件；无参数时先生成新备份再上传。
- `pull <remote-key>`：下载指定远程备份并按安全导入流程恢复。
- `sync <remote-key>`：将参数只解释为远程 key；先拉取并非覆盖式合并到本机，再导出合并后的当前会话集合，最后上传回同一 key。

`sync` 覆盖远程对象前必须显式传入 `--yes`；交互模式给出最终确认，非交互模式缺少 `--yes` 直接失败。拉取、导入或导出任一步失败都不会执行后续上传。

### Manifest 严格校验

使用现有 Zod 依赖定义完整 schema，验证：

- 固定的 app、manifest version、config version。
- ISO 时间、客户端类型、导出模式和非负计数。
- 客户端不重复，且至少包含一个受支持客户端。
- 字符串字段和数组字段的类型及合理长度。

校验发生在创建回滚和完整解压之前。错误信息说明具体字段，但不回显可能包含隐私的任意 manifest 内容。继续兼容历史 app 名 `aisession`。

### ZIP 资源限制

在读取 manifest 和解压前遍历中央目录，拒绝：

- 超过 100,000 个条目。
- 单个未压缩文件超过 5 GiB。
- 总未压缩大小超过 20 GiB。
- 非有限、不安全或路径穿越条目。

这些上限集中定义并可在测试中注入较小值。解压仍写入临时目录，失败时清理临时文件，不触碰 provider 目标目录。

### Codex SQLite 同步诊断

`syncCodexAppProjects` 返回结构化结果，分别报告：

- 新增的项目数。
- SQLite 索引是否未发现、成功、跳过或失败。
- 失败时的简短原因，例如缺少 `sqlite3`、schema 不兼容或 SQL 执行失败。

Codex 会话文件恢复成功不因可选索引同步失败而回滚，但普通输出显示警告，JSON 输出包含诊断对象。执行 SQL 前先检查目标表和必要字段，避免把版本差异误报为成功。

## 错误处理和兼容性

- 更新检查永远不改变主命令结果。
- 默认导出新增的历史文件属于向后兼容扩展；旧备份仍可导入。
- 新 manifest 校验接受当前和既有合法备份，但拒绝畸形、重复或不受支持的客户端描述。
- `sync` 的安全确认是有意的行为收紧，README 和帮助文本同步更新。
- SQLite 索引属于附加体验；会话文件恢复仍是主成功条件。

## 测试与验收

实施严格采用红—绿—重构循环，至少覆盖：

- package 版本与 CLI/manifest 版本一致。
- 更新可用、无更新、缓存命中、超时、损坏缓存、禁用和 JSON/CI 静默。
- Claude/Codex 根级 `history.jsonl`、Codex 归档会话和索引文件的导出恢复。
- `sync` 成功闭环、缺少 `--yes`、拉取失败后不上传、合并导出后上传同一 key。
- manifest 缺字段、错误类型、重复客户端和历史兼容。
- ZIP 条目、单文件、总大小和路径穿越限制。
- SQLite 成功、缺命令、schema 不兼容和 SQL 失败的诊断输出。
- 两张图片尺寸、可打开性和逐区视觉检查。

最终执行 `npm test`、`npm run check`、`npm run build`、`npm pack --dry-run`，再用临时 HOME 完成 CLI 的 doctor、export、inspect、import、rollback 和更新提示端到端验证。
