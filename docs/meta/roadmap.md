# Roadmap

Current status of feature areas. Checkmarks = code exists in `src/`.

> **Tracked as git issues.** Roadmap epics/features are mirrored as git-native-issues (e.g. `EPIC-2025-22`, `FEAT-2025-006`). See the [Issue Tracker](/meta/issues). A cross-reference table is at the bottom of this page.

## ✅ Core Infrastructure (Built)

| Feature                                      | Implementation                                                        |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Database schema (19 tables)                  | `src/db/schema-*.ts`, `migrations/001_init.ts`                        |
| Enums (30+ const+type pairs)                 | `src/db/enums-*.ts`                                                   |
| Kysely init + WAL + FK                       | `src/db/index.ts`                                                     |
| DB migrate runner                            | `src/db/migrate.ts`                                                   |
| Config loader (YAML/TOML/env)                | `src/config/load.ts`                                                  |
| TLS cert auto-generation                     | `src/config/cert.ts`                                                  |
| Auth middleware (Bearer+SHA256)              | `src/middleware/auth.ts`                                              |
| Middleware pipeline (compose, errorBoundary) | `src/middleware/pipeline.ts`                                          |
| Structured logger (levels, rotate, censor)   | `src/logger/*.ts`                                                     |
| Content encoding (gzip/zstd/brotli)          | `src/content/encode.ts`, `compress.ts`                                |
| Content minification                         | `src/content/minify.ts`                                               |
| Transport layer (H1/H2/WS/negotiation)       | `src/transport/*.ts`                                                  |
| HTTP/HTTPS server                            | `src/server.ts`                                                       |
| Stats/age-gate generation controllers        | `src/age-gate/controller.ts`, `src/generation/controller.ts`          |
| CSS themes (12) + app CSS                    | `src/public/css/*.css`                                                |
| Frontend browser lib (crypto/compress)       | `src/frontend/browser.ts`                                             |
| Web UI view templates                        | `src/views/chat.html`, `gallery.html`, `layout.html`, `settings.html` |
| HTTP utils                                   | `src/routes/http-utils.ts`                                            |

## 🏗 v0.1 MVP — Active Development

**In Progress (P0):**

| Epic | Feature                                                                            | Status         |
| ---- | ---------------------------------------------------------------------------------- | -------------- |
| 16   | Observability — telemetry, admin analytics, CI config, Playwright responsive tests | 🟡 In progress |

**Not Started — High Priority (P1):**

| Epic | Feature                                                                  | Effort      | Why Prioritize                                     |
| ---- | ------------------------------------------------------------------------ | ----------- | -------------------------------------------------- |
| 14   | Import/Export — character card PNG/YAML/TOML import, chat export, bulk   | Low         | SillyTavern compatibility; partial code exists     |
| 11   | Admin & Settings — admin UI, per-user prefs, plugin management           | Med         | Blocks multi-user deployment                       |
| 23   | Assistant Commands — /improve, /image, /quest, autocomplete              | Low         | Instant chat value; command parser partially built |
| 24   | Filtering & Pagination — combined filters, cursor pagination             | Low         | Lists unusable past ~50 items                      |
| 17   | Encryption Foundation — at-rest AES-256-GCM, per-user keys               | Med         | Privacy; crypto module fully scaffolded            |
| 10   | Generation Foundation — tool-call loop, provider failover, SSE reconnect | ✅ Complete | Already done per plan.md Epic 10                   |
| 15   | i18n & Accessibility — server-side i18n, ARIA, keyboard nav, 10 locales  | High        | Important but heavy lift                           |

**Not Started — Medium Priority (P2):**

| Epic | Feature                                                      | Effort |
| ---- | ------------------------------------------------------------ | ------ |
| 22   | RPG Mechanics Core — dice, stats, combat                     | Med    |
| 21   | Notification Expansion — noise presets, per-event thresholds | Med    |

**Quick Wins (Low Effort, High Leverage):**

| #  | Feature                                                     | Source               |
| -- | ----------------------------------------------------------- | -------------------- |
| Q1 | Regex output transforms — parse agent/tool output at render | feature-analysis #6  |
| Q2 | Smart-regen transforms — one-click draft polish             | feature-analysis #8  |
| Q3 | Conversation analytics — per-chat cost + quality dashboard  | feature-analysis #27 |
| Q4 | Model-comparison dashboard — A/B agent/model quality        | feature-analysis #28 |
| Q5 | Bulk data export — zip-all endpoint                         | plan Epic 14         |

See `.plan/backlog.md` for full queue, `plan.md` for epic detail.

## 🎯 Planned Features

### P1: User-Facing Features

| Feature                                        | Status       | Notes                                                                                                |
| ---------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| Advanced Memory Systems                        | 🟡 Partial   | `actor_memories` table + keyword filtering done; three-tier (episodic/semantic/procedural) not built |
| Lorebook/World Info                            | 🟡 Partial   | CRUD exists; sticky entries, cooldowns, activation conditions not implemented                        |
| Character Cards (V2/V3 PNG/JSON import/export) | 🟡 Partial   | JSON import works; PNG steganography + YAML/TOML not built                                           |
| Streaming Responses                            | ✅ Built     | `src/generation/stream-buffer.ts`, SSE via generation routes                                         |
| Multi-modal Support                            | 🟡 Partial   | Image gen (sd.cpp, ComfyUI) built; audio/video not built                                             |
| Plugin System                                  | 🟡 Partial   | Skeleton loads files (`src/plugins/`); no management API                                             |
| Client Extensions                              | ⬜ Not built | No WebUI/TUI plugin architecture                                                                     |
| Conversation Branching                         | ⬜ Not built | `parent_id` in schema; tree nav not implemented                                                      |
| Character Relationships                        | ⬜ Not built | Relationship graph and stat tracking                                                                 |
| Co-editing                                     | ⬜ Not built | Real-time collaborative chat editing                                                                 |
| Prompt Library                                 | ⬜ Not built | Tagged prompt snippets and templates                                                                 |

### P1: Infrastructure

- Asset system service — upload, polymorphic linking, CRUD (`src/assets/`)
- Age gate enforcement — config-driven NSFW prohibition, birth year checks
- Profanity filter — hardcoded list + `filter()` function
- Event Bus: robust pub/sub for loose coupling
- Provider Registry: clean LLM backend abstraction layer
- Agentic Workspace: Worlds→Epics, Locations→Tasks, Characters→Agents

### P2: Advanced AI

- Tool Use Framework, Function Calling, RAG, Model Comparison, Workflow Automation
- Agent Systems, Multi-Agent Collaboration, Structured Output, Prompt Chaining
- Tool Chaining, AutoGPT-like Agents, Conversation Analytics, Content Discovery, Memory Visualizer

### P2: User Experience

- Theming System (structure exists, needs UI), Session Management, Role-Based Access
- Export/Import, Search & Filter, Notifications, i18n, Accessibility, PWA

### P2: Browser Hardening (Response Headers)

Policy engine built and wired (`src/middleware/response-headers.ts`, `ResponseHeaderPolicy`).
Config: `headers` block in `src/config/schema.ts` + `schema-class.ts`. Post-MVP follow-ups:

- Self-host htmx + Alpine (drop CDN hosts from CSP)
- Flip COEP on (`require-corp`) after self-hosting unlocks SharedArrayBuffer etc.
- Early Hints (103) — spike; Bun's fetch has no 103 API
- CSP Report-Only rollout → enforce after clean window
- Confirm `x-on:click="window.fn($el)"` fires in headless browser

### P2: Administrative

- Admin Dashboard, User Management, Backup & Recovery, Audit Logging
- Rate Limiting & Quotas, API Versioning, Health Checks, Billing & Usage Tracking

### P3: Enterprise & Scale

- Database Peripherals (pooling, caching, replicas), Storage Abstraction (local/S3/GCS)
- Observability (OpenTelemetry), Horizontal Scaling (Redis, WebSocket)
- Build System (Bun build, Docker, K8s), Migration Tools (SillyTavern import)
- Webhook System, API-First Design, OAuth/LDAP/SAML/OIDC/SCIM Auth
- Vector DB Options (Chroma, PGVector, Qdrant, Milvus), Model Hub Integration
- Cross-Platform Clients, File System Integrations (Drive, OneDrive, Dropbox)
- Communication Integrations (Slack, Discord, Telegram), CDN, Edge Functions
- Multi-Region Deployments, Prompt Optimization, Fine-tuning Interface
- Synthetic Data Generation, Plugin Marketplace, Template Marketplace, Community Moderation

## Deferred Concepts

Tracked in `.plan/backlog.md` (P3 section). Post-MVP: Tool/Function Calling, BYOK, BYOR, 3D World, Cross-Chat Autonomous Messages, Dual Runtime, LLM native providers, Image/Video Generation, Full i18n.

## Dual-Use Architecture

1. **RPG Mode** (default) — Roleplay chat with characters, worlds, story features
2. **Agentic Workspace Mode** — AI-assisted workspaces (agents solve problems, execute code, conduct research)

See `docs/spec/use-case-agentic-workspace.md` for RPG→agentic mapping.

## Long-term Vision

Federated Identity (Web3/DID), P2P modes (offline-first), Marketplace, Analytics Suite, Research tools, Decentralized Storage (IPFS/Filecoin), DAO Governance, AI-Generated Content, XR/VR Integration, Real-time Collaboration, Simulation Sandboxes, Edge Computing, Quantum-Resistant Cryptography, Neuro-Symbolic AI.

## Creative Ideas (Research)

Research-driven feature proposals, separated by theme and linked from a hub. Derived from competitor analysis (SillyTavern, RisuAI, Agnai) plus community requests. Proposals only — not yet scheduled.

- Hub: [docs/ideas/index.md](../ideas/index.md)
- Themes: Immersion & Presentation, Prompt & Output Control, Memory/Continuity, Authoring, Social/Multiplayer, Platform & Reach, Analytics & Meta, 3D Worlds & Navigation — each linked from the hub.

## Timeline

See `plan.md` for v0.1 checklist, `.plan/backlog.md` for future queue, git issue tracker for technical debt, `CONTRIBUTING.md` for contribution guidelines.

<!-- ISSUE-MAP-START -->

## Tracked as Git Issues

> These tasks are tracked as git-native-issues. See the [Issue Tracker](/meta/issues) for live state.

| Issue                                        | Title                                                           | Priority | Source                        |
| -------------------------------------------- | --------------------------------------------------------------- | -------- | ----------------------------- |
| [EPIC-2025-21](/meta/issues/#epic-2025-21)   | Notification Expansion                                          | medium   | [meta/roadmap](/meta/roadmap) |
| [EPIC-2025-22](/meta/issues/#epic-2025-22)   | RPG Mechanics Core                                              | medium   | [meta/roadmap](/meta/roadmap) |
| [EPIC-2025-23](/meta/issues/#epic-2025-23)   | Assistant Commands                                              | low      | [meta/roadmap](/meta/roadmap) |
| [EPIC-2025-24](/meta/issues/#epic-2025-24)   | Filtering & Pagination                                          | low      | [meta/roadmap](/meta/roadmap) |
| [FEAT-2025-013](/meta/issues/#feat-2025-013) | Regex output transforms (render-time agent/tool output parsing) | low      | [meta/roadmap](/meta/roadmap) |
| [FEAT-2025-014](/meta/issues/#feat-2025-014) | Smart-regen transforms (one-click draft polish)                 | low      | [meta/roadmap](/meta/roadmap) |

<!-- ISSUE-MAP-END -->
