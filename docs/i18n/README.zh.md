<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

[![EN](https://img.shields.io/badge/EN-blue)](../../README.md)
[![中文](https://img.shields.io/badge/中文-blue)](README.zh.md)
[![Español](https://img.shields.io/badge/Español-blue)](README.es.md)
[![日本語](https://img.shields.io/badge/日本語-blue)](README.ja.md)
[![한국어](https://img.shields.io/badge/한국어-blue)](README.ko.md)
[![Русский](https://img.shields.io/badge/Русский-blue)](README.ru.md)
[![Français](https://img.shields.io/badge/Français-blue)](README.fr.md)

# loop-lore

**LLM RPG 聊天及其他。**

灵感来源：

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus)
- [Open WebUI](https://github.com/open-webui/open-webui)

loop-lore 重建核心功能 — 角色、聊天、世界书、多后端 LLM — 基于合理的基础：

- **TypeScript + Bun** — 无需编译步骤，快速运行时
- **数据库驱动** — `bun:sqlite` 本地，PostgreSQL 远程（Kysely 查询构建器）
- **TUI 模式** — 基于 blessed 的终端界面（无需浏览器）
- **Web UI** — htmx + Alpine.js（轻量级，无构建步骤）
- **资源管理** — 图片/音频/视频多态链接到任意实体
- **助手** — 面向用户的帮助（创意、建议、故障排除）
- **整洁代码** — 小文件，严格类型，无万行巨型模块

系统分层、设计原则与关键决策请参阅 [`docs/spec/architecture.md`](../../docs/spec/architecture.md)。项目结构以 `src/` 和 [`AGENTS.md`](../../AGENTS.md) 为准 — 本 README 的目录列表很快就会过时。

功能状态见 [`.plan/epics-index.md`](../../.plan/epics-index.md)，活跃工作见
[`.plan/backlog/open.md`](../../.plan/backlog/open.md) — 状态此处不再重复。

---

## 快速开始

```bash
# 前置条件：Bun（https://bun.sh）
bun install
bun run db:migrate

# 启动 Web 服务器
bun run dev

# 启动 TUI（单独终端）
bun run tui

# 运行所有检查（typecheck + lint + format）
bun run check

# 运行测试
bun test src/
```

完整指南：[`docs/guide/getting-started.md`](../../docs/guide/getting-started.md)。

---

## 文档

- [`docs/README.md`](../../docs/README.md) — 文档中心（理念、RPG 状态、
  完整索引）
- [`docs/spec/`](../../docs/spec/) — 核心规范（架构、角色、聊天、RPG、加密、遥测…）
- [`docs/frontend/`](../../docs/frontend/) — UX 规范（组件、聊天、画廊、角色…）
- [`docs/guide/`](../../docs/guide/) — 用户指南（安装、首次聊天、画廊、角色、世界、人设、设置）
- [`docs/reference/`](../../docs/reference/) — 参考文档（API 表面）
- [`docs/ideas/`](../../docs/ideas/) — 设计想法与提案
- [`docs/meta/`](../../docs/meta/) — 研究、评估、复盘、工作流
- [`docs/i18n/`](../i18n/) — 本地化 README 翻译
- [`.plan/`](../../.plan/) — 任务追踪（活跃工作的唯一来源）
- [`.agents/references/`](../../.agents/references/) — 编码规范（禁用模式、推荐做法）
- [`AGENTS.md`](../../AGENTS.md) — 代理指令与项目概览

---

## 许可证

LGPL-3.0-or-later（核心代码），MIT（文档），Apache-2.0 OR MIT（插件）\
详见 [LICENSE](../../LICENSE) 和 [LICENSES/](../../LICENSES/)。
