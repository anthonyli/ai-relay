# AI Relay 代码审查报告

审查日期：2026-07-08

以下是按严重程度整理的缺陷清单。

## 严重缺陷（功能性 / 数据安全）

### 1. `--map-path` 只改文件内容，不改目录/文件名 —— 跨机迁移核心场景失效
`src/providers/provider.ts` 的 `rewritePathsInTree` 只对文本文件内容做替换。但 Claude Code 的会话按"编码后的项目路径"命名目录（如 `-Users-alice-work-project`）。导入到新机器后目录名仍是旧路径，Claude 无法按新项目路径找到会话。这是工具主打的"换机恢复"场景，目前实际不可用。

### 2. 隐私过滤器误杀合法会话，且静默丢数据
`src/providers/provider.ts` 的 `isPrivacyExcludedPath` 匹配过于宽松：
- `parts.includes("config")` → 项目名恰好叫 `config` 的所有会话被丢弃
- `base.includes("auth")` / `token` / `secret` / `oauth` → 名为 `authentication-notes.md`、`token-usage.md` 的正常会话被排除
- 排除时没有任何日志/提示，用户不知道备份缺了东西 → **静默数据丢失**，比误备份敏感文件更危险。

### 3. 回滚快照 ID 只有秒级精度，会互相覆盖
`src/rollback.ts` 的 `timestampForFile` 去掉了毫秒。同一秒内两次 import 生成相同 `pre_import_...Z` id，第二次的快照 zip 直接覆盖第一次 → 丢失回滚点。

### 4. 回滚过程非原子且不可逆
`src/rollback.ts` 的 `restoreRollback` 先 `fs.remove(targetRoot)` 再 copy。进程在两步之间崩溃就丢失整个 `.claude`/`.codex`。而且回滚前不做安全快照，回滚本身无法再回滚——若误操作，import 后新产生的会话全部丢失。

### 5. 会话匹配用 `includes` 模糊匹配，可能选错
`src/providers/provider.ts` 的 `matchSessions` 用 `session.relativePath.includes(normalized)` 且取第一个命中，歧义不报错。`--session foo` 可能匹配到 `foobar` 的会话。

## 中等缺陷（资源 / 健壮性）

### 6. `readZipText` 文件描述符泄漏
`src/archive/zip.ts` 中 `readZipText` 找到目标 entry 后 resolve，但不再消费剩余 entry，yauzl 的 `autoClose` 不触发 → zip 句柄不关闭。inspect/import/rollback 反复调用会累积 fd。应显式 `zip.close()`。

### 7. 路径重写用全文 `split/join`，未排序且可能破坏 JSON
`src/providers/provider.ts` 的 `rewritePathsInTree` 多个映射未按 `from` 长度排序，前缀重叠会被二次替换；对任意子串替换也可能改坏 JSON 里不相关的字符串。

### 8. export 非原子写入 + TOCTOU
`src/commands/export.ts` 的 `createZipFromDirectory` 直接写目标文件，中途失败会留下损坏的 zip；覆盖检查（pathExists 后再写）也存在 TOCTOU。建议先写临时文件再 rename。

### 9. `walkFiles` 静默忽略符号链接
`src/providers/provider.ts` 的 `walkFiles` 只处理 `isDirectory()`/`isFile()`，symlink 两者都为 false → 软链的会话文件被无声跳过。

### 10. 未处理 archiver 的 `warning` 事件
`src/archive/zip.ts` 的 `createZipFromDirectory` 只监听 `error`，打包过程中文件被删/权限问题会走 `warning` 事件而被忽略，导致备份缺文件但仍报成功。

## 轻微缺陷（设计 / 体验）

### 11. 非交互环境跳过所有确认直接执行
`src/commands/context.ts` 的 `isInteractive` 在非 TTY 时为 false，import 的确认块被整体跳过直接执行。在 CI/管道里没有 `--yes` 也会直接跑，语义不够显式。

### 12. `privacy_exclusions` 清单硬编码，与实际过滤逻辑分离
`src/commands/export.ts` 的 manifest 里写死的排除列表和 `isPrivacyExcludedPath` 的真实规则是两套，容易漂移、误导用户。

### 13. `cleanProjectName` 把所有 `-` 换成 `/`
`src/providers/provider.ts` 中含真实连字符的项目名显示会错乱（仅影响展示）。

### 14. config 版本校验错误信息不友好
`src/config.ts` 只接受 `"1.1"`/`"2"`，其它值直接抛 zod 原始错误。

### 15. 回滚恢复对未知 client 静默 `continue`
`src/rollback.ts` 中备份里有但当前不支持的 provider 被无声跳过。

## 值得肯定的地方
- `safeJoin` 对 zip-slip 的防护正确
- 导入默认非破坏性 + 自动回滚快照的设计思路好
- 隐私排除的初衷合理

## 优先修复建议
优先修复 **#1、#2、#3、#4、#6** —— 它们直接影响数据正确性和工具可用性。
