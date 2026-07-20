# Backlog

Features not under active development. `plan.md` tracks active work; `open-items.md` tracks bugs/debt.

**Epic status:** See [`.plan/epics.md`](epics.md) for consolidated view. Numbering in `plan.md`.

## P0 — Immediate Next (v0.1 In-Progress)

Partial implementation exists in `src/`. Finishing these is current active work.

| # | Item | Status |
|---|------|--------|
| 16 | Observability — telemetry, admin analytics, CI config, Playwright responsive tests | 🟡 In progress |

### Completed (moved from P0/P1)

| # | Item | Status |
|---|------|--------|
| 10 | Generation Foundation — tool-call loop, provider failover, SSE reconnect | ✅ Complete |
| 11 | Admin & Settings — admin middleware, page routes, user prefs modal | ✅ Complete (core) |
| 12 | Memory Foundation — keyword filtering, type enum, context compaction, A/N injection | ✅ Complete |
| 13 | Frontend Responsive — mobile breakpoints, touch targets, keyboard shortcuts, HTMX | ✅ Complete |
| 14 | Import/Export — character card import, chat export, PNG steganography, bulk | ✅ Complete |
| 19 | Chat Notifications — cross-chat SSE, read-state schema, unread badge, toast | ✅ Complete |

## P1 — Next Cycle (v0.1 Not Started)

Ordered by user impact × effort. Items with partial `src/` code listed first.

| # | Item | Effort | Partial Code? |
|---|------|--------|---------------|
| 17 | Encryption Foundation — e2e AES-256-GCM, symmetric/asymmetric, asset enc, key rotation | High | Crypto built |
| 15 | i18n & Accessibility — server-side i18n module, ARIA pass, keyboard nav, 10 locales | High | Minimal |
| 27 | Testing Infrastructure — E2E stabilization, browser auth, benchmarks | High | Some E2E exists |
| 33 | Multi-Instance Reconciliation — migration leadership, drift guards | Med | Migrator exists |
| 34 | Data Integrity & ACID — backend guards, optimistic concurrency | Med | `data_version` cols exist |
| 36 | Chat Lifecycle & Moderation — context window, transitions, NSFW | High | Repetition detection exists |
| 37 | Plugin System & Extensibility — API, management, hooks | High | Skeleton exists |

## P2 — Specified, Not Implemented

| # | Feature | Spec | Notes |
|---|---------|------|-------|
| 20 | E2E Performance Benchmarks | `docs/spec/e2e-benchmarks.md` | Not implemented |
| 21 | Notification Expansion — noise presets, thresholds | `docs/spec/notifications-expansion.md` | Basic toasts exist |
| 22 | RPG Mechanics Core — dice, stats, combat (+ 15 sub-systems) | `docs/spec/rpg-mechanics.md` | Dice plugin exists; `src/rpg/` does not |
| 23 | Assistant Commands — /improve, /image, /quest | `docs/spec/assistant-commands.md` | Command parser exists; no slash commands wired |
| 24 | Filtering & Pagination — combined filters, cursor pagination | `docs/spec/filtering-pagination.md` | Single filter only |
| 25 | Memory Systems — three-tier, semantic extraction | `docs/spec/memory-system.md` | Only `actor_memories` table exists |
| 26 | Avatar & Expression System — 3D avatars, emotion detection | plan.md §26 | Not implemented |
| 28 | Asset Support Expansion — tokens, 3D, versioning | plan.md §28 | Not implemented |
| 29 | Provider & Plugin Ecosystem — Anthropic/Ollama, plugin API | plan.md §29 | Only OpenAI-compatible exists |
| 30 | Assistant Intelligence — regex transforms, lore checker | plan.md §30 | Not implemented |
| 31 | World Persistence & Sync — cross-device, impersonation | plan.md §31 | Not implemented |
| 32 | Deployment Topologies — Docker hardening, K8s packaging | `.plan/epics/epic-deployment-topologies.md` | Draft |
| 35 | Configuration Extensions (ECE) | `.plan/epics/epic-config-extensions.md` | Draft |
| 38 | World & Locations — encounters, monsters, diplomacy | `.plan/epics/epic-world-locations.md` | Not implemented |
| 39 | Item System Extensions | `.plan/epics/epic-item-system-extensions.md` | Not implemented |
| 40 | Blog System — LLM-authored posts, social layer | `.plan/epics/epic-blog-system.md` | Not implemented |
| 41 | Chat Transfer & Location Change | `.plan/epics/epic-chat-transfer-location.md` | Not implemented |
| 42 | Assistant Generation Extensions — SD, intent, scenario source | `.plan/epics/epic-assistant-generation-extensions.md` | Not implemented |
| 43 | NSFW Game Mechanics | `.plan/epics/epic-nsfw-game-mechanics.md` | Draft |
| 44 | Worlds Extension — shareability, epochs, maps | `.plan/epics/epic-worlds-extension.md` | Not implemented |

Also not implemented (no dedicated epic yet):
- Impersonation (`chat.impersonate_id`) — `docs/spec/character-setup.md`
- Artifact system (code/docs/datasets) — `docs/spec/artifacts-system.md`
- Agentic workspace mode — `docs/spec/use-case-agentic-workspace.md`
- Frontend story mode UI (GM panel, quest log) — `docs/frontend/chat/multi-llm-story.md`
- Message archiving (cascade, restore, purge) — `docs/frontend/chat/archiving.md`
- Memory selection UI — `docs/frontend/chat/memories.md`
- `POST /api/auth/register` — `docs/spec/auth-middleware.md`
- `/api/sessions` routes — `docs/spec/users-sessions.md`
- Signed URLs for asset downloads — `docs/spec/assets.md`
- Combined filter support — `docs/spec/filtering-pagination.md`

## Quick Wins — Low Effort, High Leverage

| #  | Feature                          | Effort | Business Value | Epic | Source               |
| -- | -------------------------------- | ------ | -------------- | ---- | -------------------- |
| Q1 | Regex output transforms          | Low    | High           | 30   | ideas #6             |
| Q2 | Smart-regen transforms (polish)  | Low    | High           | 30   | ideas #8             |
| Q3 | Conversation analytics dashboard | Low    | Med            | —    | ideas #27            |
| Q4 | Model-comparison dashboard       | Low    | Med            | 21   | ideas #28            |

## P3 — Deferred Concepts (Post-MVP)

| ID  | Concept                                                                 | Source |
| --- | ----------------------------------------------------------------------- | ------ |
| D.1 | Tool / Function Calling — 3-layer architecture                          | `docs/research/tool-calling-architecture.md` |
| D.2 | BYOK — user brings own LLM / image-gen; admin can't read keys           | `docs/research/local-remote-inference-uis.md` §10.2 |
| D.3 | BYOR — user donates local compute as worker node                        | `docs/research/local-remote-inference-uis.md` §10.3 |
| D.4 | 3D World — world map, location travel, 3D avatars (Three.js)            | `docs/ideas/worlds-3d-navigation.md` |
| D.5 | Cross-Chat Autonomous Messages — characters message when "missing" user | `docs/research/local-remote-inference-uis.md` §10.1 |
| D.6 | Dual Runtime (Bun + Deno) — optional future                             | `docs/research/runtime-migration-bun-deno.md` |
| D.7 | LLM native providers (Anthropic, Ollama, Bedrock)                       | `docs/spec/integrations/llm-serving.md` |
| D.8 | Image/Video Generation (sd.cpp, ComfyUI, Krea, Ideogram)                | `docs/spec/integrations/image-generation.md` |
| D.9 | Full i18n implementation (868-line plan)                                | `docs/spec/i18n-implementation.md` |

## P4 — Long-term Vision

See `roadmap.md` Long-term Vision section:
Federated Identity, P2P modes, Marketplace, Analytics Suite, DAO Governance,
AI-Generated Content, XR/VR Integration, Real-time Collaboration,
Simulation Sandboxes, Edge Computing, Quantum-Resistant Cryptography.

## Resolution Log

Items completed and merged to master:

- **Epic 10 (Generation Foundation)**: ✅ Complete — tool-call loop, provider failover, SSE reconnect
- **Epic 12 (Memory Foundation)**: ✅ Complete — keyword filtering, type enum, context compaction, A/N injection
- **Epic 13 (Frontend Responsive)**: ✅ Complete — mobile breakpoints, touch targets, keyboard shortcuts, HTMX
- **Epic 14 (Import/Export)**: ✅ Complete — character card multi-format import, chat export, bulk export
- **Epic 19 (Chat Notifications)**: ✅ Complete — cross-chat SSE, read-state schema, unread badge, toast
