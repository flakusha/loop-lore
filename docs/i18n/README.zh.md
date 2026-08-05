# loop-lore

[![EN](https://img.shields.io/badge/EN-blue)](../../README.md)
[![中文](https://img.shields.io/badge/中文-blue)](README.zh.md)
[![Español](https://img.shields.io/badge/Español-blue)](README.es.md)

**LLM RPG 聊天及其他。**

灵感来源：

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus)
- [Open WebUI](https://github.com/open-webui/open-webui)

loop-lore 旨在重建核心功能 — 角色、聊天、世界书、多后端 LLM — 基于合理的架构：

- **TypeScript + Bun** — 无需编译步骤，快速运行时
- **数据库驱动** — `bun:sqlite` 本地，PostgreSQL 远程（Kysely 查询构建器）
- **TUI 模式** — 基于 blessed 的终端界面（无需浏览器）
- **Web UI** — htmx + Alpine.js（轻量级，无构建步骤）
- **资源管理** — 图片/音频/视频多态链接到任意实体
- **助手** — 面向用户的帮助（创意、建议、故障排除）
- **整洁代码** — 小文件，严格类型，无万行巨型模块

---

## 功能

| 功能              | 状态   | 备注                                        |
| ----------------- | ------ | ------------------------------------------- |
| 角色管理          | 计划中 | PNG 卡片导入/导出（V2/V3），JSON            |
| 聊天引擎          | 开发中 | 多后端 LLM，流式传输，滑动切换              |
| TUI 聊天界面      | 开发中 | 基于 blessed，键盘驱动                      |
| 数据库层          | 开发中 | bun:sqlite + Kysely（类型安全，可切换方言） |
| 资源（媒体）      | 计划中 | 图片/音频/视频，多态链接                    |
| 助手聊天          | MVP    | 基于规则，上下文感知建议                    |
| 世界书 / 世界信息 | 计划中 | 固定/冷却/延迟条目                          |
| Web UI            | 计划中 | htmx + Alpine.js                            |
| 插件系统          | 计划中 | 服务器插件 + 客户端扩展                     |

---

## 架构

```
src/
├── server.ts          Bun HTTP 入口
├── db/                Kysely 初始化 + schema 类型
│   ├── schema.ts      表类型定义
│   ├── migrations/    Kysely 迁移文件
│   └── index.ts       Kysely 初始化 + 导出（bun:sqlite / postgres 方言）
├── routes/            REST API 端点
├── assets/            资源服务 + 控制器（替代画廊）
├── assistant/         助手服务 + 控制器
├── tui/               终端 UI（blessed）
└── ...
```

**关键决策：**

- Kysely 查询构建器 — 类型安全，可切换方言（bun:sqlite ↔ postgres），无 ORM 开销
- 无上帝对象模块 — 每个文件优选 <200 行
- 事件总线用于跨模块通信（借鉴 SillyTavern 的事件系统）
- LLM 后端的提供者注册表

---

## 技术栈

| 层         | 选择                                           |
| ---------- | ---------------------------------------------- |
| 运行时     | Bun（快速 TS/JS，无构建步骤）                  |
| 语言       | TypeScript 5.4+（严格模式）                    |
| 数据库     | `bun:sqlite` → 通过 Kysely 方言切换到 Postgres |
| 查询构建器 | Kysely（类型安全，无 ORM 开销）                |
| TUI        | blessed + blessed-contrib                      |
| Web UI     | htmx + Alpine.js                               |

---

## 快速开始

```bash
# 前置条件：Bun（https://bun.sh）
bun install
cp .env.example .env
bun run db:migrate

# 启动 Web 服务器
bun run dev

# 启动 TUI（单独终端）
bun run tui
```

---

## 文档

- `docs/implementation.md` — 完整技术细节，API 参考，环境变量
- `docs/schema.md` — 数据库 schema 和迁移
- `docs/assets.md` — 资源系统（替代画廊）
- `docs/tui.md` — TUI 架构和快捷键
- `docs/architecture.md` — 系统层和请求流程
- `docs/frontend.md` — htmx + Alpine.js 前端
- `docs/users-sessions.md` — 用户角色和会话管理
- `docs/messages.md` — 消息系统和详情级别
- `docs/build-deploy.md` — 构建和部署
- `.plan/implementation-plan.md` — 未来功能和改进

---

## 许可证

LGPL-3.0-or-later（核心代码），MIT（文档），Apache-2.0 OR MIT（插件）\
详见 [LICENSE](../../LICENSE) 和 [LICENSES/](../../LICENSES/)。
