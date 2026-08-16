<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Architecture Overview

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Architecture Epic
**Tags:** architecture, system-design, deployment, infrastructure

## Summary

loop-lore is a lightweight roleplay/chat application reimagining SillyTavern with modern tooling. The architecture prioritizes minimal local setup, easy distributed deployment, and data integrity.

## Scope

_TBD — expand with implementation tasks derived from the spec._

## Related Epics

- `docs/spec/architecture.md`

## Tickets

_TBD — create implementation tickets._

---

## Merged from `.plan/epics/epic-architecture.md`

# Roadmap

Current status of feature areas. Checkmarks = code exists in `src/`.

> **Task tracking lives in `.plan/`** — `backlog/` (priority/high-value/active/open), `epics/`, and `tickets/` are the source of truth.
> This file is the high-level vision and status overview. For detailed task queues, see `.plan/backlog/`.

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

> **Detailed task breakdown:** `.plan/implementation-plan.md` (completed epics) and `.plan/backlog/` (active queue).

| Epic | Feature                                                       | Status             |
| ---- | ------------------------------------------------------------- | ------------------ |
| 16   | Observability — telemetry, admin analytics, CI config         | 🟡 In progress     |
| 14   | Import/Export — character card PNG/YAML/TOML import           | ✅ Complete        |
| 11   | Admin & Settings — admin UI, per-user prefs                   | ✅ Complete (core) |
| 23   | Assistant Commands — /improve, /image, /quest                 | ⬜ P1              |
| 24   | Filtering & Pagination — combined filters, cursor pagination  | ⬜ P1              |
| 17   | Encryption Foundation — e2e AES-256-GCM, symmetric/asymmetric | ⬜ P1              |
| 10   | Generation Foundation — tool-call loop, provider failover     | ✅ Complete        |
| 15   | i18n & Accessibility — server-side i18n, ARIA, keyboard nav   | ⬜ P1              |
| 22   | RPG Mechanics Core — dice, stats, combat                      | ⬜ P2              |
| 21   | Notification Expansion — noise presets, per-event thresholds  | ⬜ P2              |

### Quick Wins

See `.plan/backlog/` § Quick Wins for the full queue (Q1–Q5).

## 🎯 Planned Features

> **Detailed specs:** Individual docs in `docs/spec/` and `docs/frontend/`.
> **Task queue:** `.plan/backlog/` (P1–P3).

### User-Facing Features

| Feature                          | Status       | Spec                              |
| -------------------------------- | ------------ | --------------------------------- |
| Advanced Memory Systems          | 🟡 Partial   | `docs/spec/memory-system.md`      |
| Lorebook/World Info              | 🟡 Partial   | `docs/spec/actors.md`             |
| Character Cards (V2/V3 PNG/JSON) | 🟡 Partial   | `docs/spec/character-spec.md`     |
| Streaming Responses              | ✅ Built     | `src/generation/stream-buffer.ts` |
| Multi-modal Support              | 🟡 Partial   | Image gen built; audio/video not  |
| Plugin System                    | 🟡 Partial   | `src/plugins/` skeleton; no API   |
| Client Extensions                | ⬜ Not built | —                                 |
| Conversation Branching           | ⬜ Not built | `parent_id` in schema             |
| Character Relationships          | ⬜ Not built | —                                 |
| Co-editing                       | ⬜ Not built | —                                 |
| Prompt Library                   | ⬜ Not built | —                                 |

### Infrastructure

- Asset system service, Age gate enforcement, Profanity filter — see `docs/spec/assets.md`, `docs/spec/architecture.md`
- Event Bus, Provider Registry, Agentic Workspace — see `.plan/backlog/` P2

### Advanced AI

Tool Use, RAG, Model Comparison, Multi-Agent, Structured Output, Prompt Chaining — see `.plan/backlog/` P2.

### Browser Hardening (Response Headers)

Policy engine built (`src/middleware/response-headers.ts`). Post-MVP: self-host htmx/Alpine, COEP, Early Hints, CSP rollout. See `docs/frontend/headers-management.md`.

### Administrative

Admin Dashboard, User Management, Backup, Audit Logging, Rate Limiting, API Versioning, Health Checks — see `.plan/backlog/` P2.

### P3: Enterprise & Scale

Database peripherals, storage abstraction, observability, horizontal scaling, build system, migration tools, webhooks, OAuth/LDAP, vector DB, plugin marketplace — see `.plan/backlog/` P3.

## Deferred Concepts

Tracked in `.plan/backlog/` P3 section. Includes: Tool/Function Calling, BYOK, BYOR, 3D World, Cross-Chat Autonomous Messages, Dual Runtime, LLM native providers, Image/Video Generation, Full i18n.

## Dual-Use Architecture

1. **RPG Mode** (default) — Roleplay chat with characters, worlds, story features
2. **Agentic Workspace Mode** — AI-assisted workspaces (agents solve problems, execute code, conduct research)

See `docs/spec/use-case-agentic-workspace.md` for RPG→agentic mapping.

## Long-term Vision

Federated Identity (Web3/DID), P2P modes (offline-first), Marketplace, Analytics Suite, Research tools, Decentralized Storage (IPFS/Filecoin), DAO Governance, AI-Generated Content, XR/VR Integration, Real-time Collaboration, Simulation Sandboxes, Edge Computing, Quantum-Resistant Cryptography, Neuro-Symbolic AI.

## Creative Ideas (Research)

Research-driven feature proposals, separated by theme and linked from a hub. Derived from analysis of community projects (SillyTavern, RisuAI, Agnai) plus community requests. Proposals only — not yet scheduled.

- Hub: [docs/ideas/index.md](/docs/ideas/index.md)
- Themes: Immersion & Presentation, Prompt & Output Control, Memory/Continuity, Authoring, Social/Multiplayer, Platform & Reach, Analytics & Meta, 3D Worlds & Navigation — each linked from the hub.

## Timeline

See `.plan/implementation-plan.md` for completed epics, `.plan/backlog/` for active queue, `.plan/epics/` for detailed plans.

<!-- ISSUE-MAP-START -->

## Tracked as Git Issues

> **Full issue list:** `.plan/tickets/` and `.plan/epics/`. Issues are created via `./scripts/worktree.sh ticket`.

| Issue                                        | Title                   | Priority | Source           |
| -------------------------------------------- | ----------------------- | -------- | ---------------- |
| [EPIC-2026-21](/meta/issues/#epic-2026-21)   | Notification Expansion  | medium   | `.plan/backlog/` |
| [EPIC-2026-22](/meta/issues/#epic-2026-22)   | RPG Mechanics Core      | medium   | `.plan/backlog/` |
| [EPIC-2026-23](/meta/issues/#epic-2026-23)   | Assistant Commands      | low      | `.plan/backlog/` |
| [EPIC-2026-24](/meta/issues/#epic-2026-24)   | Filtering & Pagination  | low      | `.plan/backlog/` |
| [FEAT-2026-013](/meta/issues/#feat-2026-013) | Regex output transforms | low      | `.plan/backlog/` |
| [FEAT-2026-014](/meta/issues/#feat-2026-014) | Smart-regen transforms  | low      | `.plan/backlog/` |

<!-- ISSUE-MAP-END -->
