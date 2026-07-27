# Epics Consolidation

**Last Updated:** 2026-07-26
**Source:** `.plan/epics/`, `.plan/tickets/`, `.plan/backlog.md`

> **Numbering rule:** `docs/meta/plan.md` is the canonical source for epic numbers.
> `.plan/epics/` files use **name-based filenames** (no number prefix) to avoid collisions.
> New epics get the next available number in plan.md when promoted from draft.

---

## Status Summary

### v0.1 Foundation (Complete)

| #  | Name                         | Status             | Plan Ref    | Epic File                  |
| -- | ---------------------------- | ------------------ | ----------- | -------------------------- |
| 10 | Generation Foundation        | ✅ Complete        | plan.md §10 | —                          |
| 11 | Admin & Settings             | ✅ Complete (core) | plan.md §11 | —                          |
| 12 | Memory Foundation            | ✅ Complete        | plan.md §12 | —                          |
| 13 | Frontend Responsive          | ✅ Complete        | plan.md §13 | —                          |
| 14 | Import/Export                | ✅ Complete        | plan.md §14 | `epic-import-export-io.md` |
| 18 | Local Inference Integrations | ✅ Complete        | plan.md §18 | —                          |
| 19 | Chat Notifications           | ✅ Complete        | plan.md §19 | —                          |

### v0.1 Active (In Progress / Not Started)

| #  | Name                        | Status         | Priority | Plan Ref    | Epic File                         |
| -- | --------------------------- | -------------- | -------- | ----------- | --------------------------------- |
| 15 | i18n & Accessibility        | ⬜ Not Started | High     | plan.md §15 | —                                 |
| 16 | Observability & CI          | 🟡 In Progress | High     | plan.md §16 | `epic-observability-telemetry.md` |
| 17 | Encryption Foundation       | ⬜ Not Started | High     | plan.md §17 | —                                 |
| 20 | E2E Performance Benchmarks  | ⬜ Not Started | Medium   | plan.md §20 |                                   |
| 21 | Notification Expansion      | ⬜ Not Started | Medium   | plan.md §21 |                                   |
| 22 | RPG Mechanics Core          | ⬜ Not Started | Medium   | plan.md §22 |                                   |
| 23 | Assistant Commands          | ⬜ Not Started | Medium   | plan.md §23 |                                   |
| 24 | Filtering & Pagination      | ⬜ Not Started | Medium   | plan.md §24 |                                   |
| 25 | Memory Systems              | ⬜ Not Started | Medium   | plan.md §25 |                                   |
| 26 | Avatar & Expression System  | ⬜ Not Started | Medium   | plan.md §26 |                                   |
| 27 | Testing Infrastructure      | ⬜ Not Started | High     | plan.md §27 |                                   |
| 28 | Asset Support Expansion     | ⬜ Not Started | Medium   | plan.md §28 |                                   |
| 29 | Provider & Plugin Ecosystem | ⬜ Not Started | Medium   | plan.md §29 |                                   |
| 30 | Assistant Intelligence      | ⬜ Not Started | Medium   | plan.md §30 |                                   |
| 31 | World Persistence & Sync    | ⬜ Not Started | Medium   | plan.md §31 |                                   |

**Active Infrastructure (created 2026-07-24):**

Generation hooks infrastructure (`src/generation/hooks/`) — mood, emotion, NSFW, moderation hooks wired into `auto-gen.ts` pipeline. Supports plugin system (Epic 37) and chat lifecycle (Epic 36). No independent epic number — tracked as shared infrastructure.

### New Epics (from docs reconciliation)

| #  | Name                              | Status         | Priority | Plan Ref    | Epic File                                 |
| -- | --------------------------------- | -------------- | -------- | ----------- | ----------------------------------------- |
| 32 | Deployment Topologies & Packaging | 📝 Draft       | Medium   | —           | `epic-deployment-topologies.md`           |
| 33 | Multi-Instance Reconciliation     | 📝 Draft       | High     | —           | `epic-multi-instance-reconciliation.md`   |
| 34 | Data Integrity & ACID Guarantees  | 📝 Draft       | High     | —           | `epic-data-integrity-acid.md`             |
| 35 | Configuration Extensions (ECE)    | 📝 Draft       | Medium   | —           | `epic-config-extensions.md`               |
| 36 | Chat Lifecycle & Moderation       | ⬜ Not Started | High     | —           | `epic-chat-lifecycle-moderation.md`       |
| 37 | Plugin System & Extensibility     | ⬜ Not Started | High     | —           | `epic-plugin-system.md`                   |
| 38 | World & Locations                 | ⬜ Not Started | Medium   | —           | `epic-world-locations.md`                 |
| 39 | Item System Extensions            | ⬜ Not Started | High     | —           | `epic-item-system-extensions.md`          |
| 40 | Blog System                       | ⬜ Not Started | Medium   | —           | `epic-blog-system.md`                     |
| 41 | Chat Transfer & Location Change   | ⬜ Not Started | Medium   | —           | `epic-chat-transfer-location.md`          |
| 42 | Assistant Generation Extensions   | ⬜ Not Started | Medium   | —           | `epic-assistant-generation-extensions.md` |
| 43 | NSFW Game Mechanics               | 📝 Draft       | Medium   | —           | `epic-nsfw-game-mechanics.md`             |
| 44 | Worlds Extension                  | ⬜ Not Started | Medium   | —           | `epic-worlds-extension.md`                |
| 45 | Configurable Template System      | 🟢 Complete    | High     | —           | `epic-config-templates.md`                |
| 46 | Creative Studio                   | 📝 Draft       | Medium   | —           | `epic-creative-studio.md`                 |
| 47 | Character Core System             | 📝 Draft       | High     | —           | `epic-character-core-system.md`           |
| 48 | Character Spec & Unified API      | 📝 Draft       | High     | —           | `epic-character-spec.md`                  |
| 49 | Immersion & Presentation          | ⬜ Not Started | Medium   | plan.md §48 | `epic-immersion-presentation.md`          |
| 49 | Analytics & Observability         | ⬜ Not Started | Medium   | plan.md §50 | `epic-analytics-observability.md`         |
| 50 | Prompt & Output Control           | ⬜ Not Started | Medium   | plan.md §51 | `epic-output-control-transforms.md`       |

### Permanently Ongoing Epics

No number — these are continuous efforts, not scheduled features.

| Name                                 | Status     | Priority | Epic File                      |
| ------------------------------------ | ---------- | -------- | ------------------------------ |
| Code Quality & Best Practices        | 🟡 Ongoing | High     | `epic-code-quality.md`         |
| Testing & Quality Assurance          | 🟡 Ongoing | High     | `epic-testing-qa.md`           |
| Platform Research & Feature Adoption | 🟡 Ongoing | Medium   | `epic-platform-research.md`    |
| User Story & Use Case Improvements   | 🟡 Ongoing | Medium   | `epic-user-stories.md`         |
| Tooling Support & Improvement        | 🟡 Ongoing | Medium   | `epic-tooling-improvement.md`  |
| Logic Reconciliation                 | 🟡 Ongoing | High     | `epic-logic-reconciliation.md` |

### RPG Sub-Systems (grouped under Epic 22)

These extend Epic 22 (RPG Mechanics Core). No independent numbers — tracked as sub-epics.

| Name                                    | Status         | Priority | Epic File                           |
| --------------------------------------- | -------------- | -------- | ----------------------------------- |
| RPG Mechanics & Extensible Game Systems | ⬜ Not Started | Medium   | `epic-rpg-mechanics.md`             |
| Battle & Action Systems                 | ⬜ Not Started | Medium   | `epic-battle-action-systems.md`     |
| Magic & Spell Systems                   | ⬜ Not Started | Medium   | `epic-magic-spell-systems.md`       |
| Crafting & Professions                  | ⬜ Not Started | Medium   | `epic-crafting-professions.md`      |
| Companion, Pet & Mount                  | ⬜ Not Started | Medium   | `epic-companion-pet-mount.md`       |
| Housing & Base Building                 | ⬜ Not Started | Medium   | `epic-housing-base-building.md`     |
| Stealth & Crime Systems                 | ⬜ Not Started | Medium   | `epic-stealth-crime.md`             |
| Disease & Poison Systems                | ⬜ Not Started | Medium   | `epic-disease-poison.md`            |
| Social Interaction Systems              | ⬜ Not Started | Medium   | `epic-social-interaction.md`        |
| Weather & Environmental Effects         | ⬜ Not Started | Medium   | `epic-weather-environment.md`       |
| Exploration & Discovery Systems         | ⬜ Not Started | Medium   | `epic-exploration-discovery.md`     |
| Economy & Trading Systems               | ⬜ Not Started | Medium   | `epic-economy-trading.md`           |
| Player Agency — Story Points            | ⬜ Not Started | Medium   | `epic-agency-story-points.md`       |
| Emergent Narrative Design               | ⬜ Not Started | Medium   | `epic-emergent-narrative-design.md` |
| Faction & Reputation                    | ⬜ Not Started | Medium   | `epic-faction-reputation.md`        |
| Resolution System                       | ⬜ Not Started | Medium   | `epic-resolution-system.md`         |

### Infrastructure Epics (Not Numbered)

Deferred or long-term infrastructure work.

| Name                                  | Status         | Priority | Epic File                                 |
| ------------------------------------- | -------------- | -------- | ----------------------------------------- |
| Headless Mode & Alternative Frontends | ⬜ Not Started | Medium   | `epic-headless-alternative-frontends.md`  |
| Transport Layer Expansion             | 🟡 Partial     | Medium   | `epic-transport-expansion.md`             |
| Multi-Session Support                 | ⬜ Not Started | Medium   | `epic-multi-session.md`                   |
| Impersonation System                  | ⬜ Not Started | Medium   | `epic-impersonation.md`                   |
| Assistant/GM Flows Reconciliation     | ⬜ Not Started | Medium   | `epic-assistant-gm-flows.md`              |
| Deno Support (Possible Node)          | ⬜ Not Started | Low      | `epic-deno-support.md`                    |
| Two-Factor / Multi-Factor Auth        | ⬜ Not Started | Medium   | `epic-2fa-mfa.md`                         |
| LLM Request Throughput & Scheduling   | ⬜ Not Started | Medium   | `epic-llm-queue.md`                       |
| Platform Integrations                 | 📝 Draft       | Low      | `epic-platform-integrations.md`           |
| Testing & Benchmarking                | ⬜ Not Started | High     | `epic-testing-benchmarking.md`            |
| Embeddable Engine (Far Fetched)       | ⬜ Not Started | Low      | `epic-embeddable-engine-game-frontend.md` |
| OpenAPI-Driven API Reference          | ⬜ Not Started | High     | `epic-openapi-reference.md`               |

### Generation & Atmosphere Epics

Content generation beyond text — images, audio, video, 3D.

| Name                                | Status         | Priority | Epic File                   |
| ----------------------------------- | -------------- | -------- | --------------------------- |
| ComfyUI Plugin & Workflow Templates | ⬜ Not Started | High     | `epic-comfyui-plugin.md`    |
| Audio, Video & Sound Generation     | ⬜ Not Started | Medium   | `epic-audio-video-sound.md` |
| 3D Asset Generation (Future)        | ⬜ Not Started | Low      | `epic-3d-generation.md`     |

---

## Chat UX Tasks (New — Docs Reconciliation 2026-07-21)

Chat-specific features extracted from epic overlap and new requirements.
These are standalone tasks (not numbered epics) tracked under existing
epics where applicable.

| Task                                          | Effort   | Epic(s)                  | Status         |
| --------------------------------------------- | -------- | ------------------------ | -------------- |
| Chat Room Search & Join                       | Med      | 36, 41                   | ⬜ Not Started |
| Chat Room Filters                             | Med      | 24, 36                   | ⬜ Not Started |
| Chat Message Search & Filter                  | Med–High | 24, 36                   | ⬜ Not Started |
| Chat Autorenaming                             | Low      | 36                       | ✅ Complete    |
| Visual Novel Mode                             | Med      | Immersion & Presentation | ⬜ Not Started |
| 3D View Modes (consolidated)                  | High     | 26, 28                   | ⬜ Not Started |
| Text Effects & Overlays                       | Med      | Immersion & Presentation | ⬜ Not Started |
| Info Bubbles (help tooltips in config menus)  | Low      | Immersion & Presentation | ⬜ Not Started |
| Character Multi-Personality System            | High     | 22                       | ⬜ Not Started |
| Character Mood Swings & Happiness Meter       | Med      | 22                       | ⬜ Not Started |
| Character Memory Injection & Privacy          | High     | 25                       | 🟡 In Progress |
| Chat External Music Linking                   | Low      | 36                       | ⬜ Not Started |
| Context-Based Feature Permissions (UI Gating) | Med      | 37                       | ⬜ Not Started |
| Data Migration Transitivity Tracking          | Medium   | 34                       | ⬜ Not Started |
| Context Window Monitor (FEAT-069)             | Low–Med  | 36                       | ✅ Complete    |
| Smart Context Pruning (FEAT-072)              | Med      | 36                       | ✅ Complete    |
| Quick-Regen Button (FEAT-070)                 | Low      | 51                       | ✅ Complete    |
| Response Length Control (FEAT-071)            | Low      | 51                       | ✅ Complete    |
| Wire Memory Provision into Prompt Assembly    | Med      | 36                       | ⬜ Not Started |
| Implement Memory Decay Logic                  | Med      | 36                       | ⬜ Not Started |
| Extract Chat Business Logic from Routes       | Med      | 36                       | ⬜ Not Started |
| Implement Memory Promotion Pipeline           | Med      | 36                       | ⬜ Not Started |

**Cross-references:**

- `docs/frontend/chat/search-and-filter.md` — UX spec for search + filters
- `docs/frontend/chat/visual-novel-mode.md` — UX spec for VN mode
- `docs/frontend/chat/text-effects-overlays.md` — UX spec for effects/overlays
- Epic 24 (Filtering & Pagination) — general filter infrastructure
- Epic 36 (Chat Lifecycle) — chat context, transitions
- Epic 41 (Chat Transfer) — location transfer, search for joinable chats
- `TASK-character-multi-personality.md` — personality switching, world/chat locking
- `TASK-data-migration-transitivity.md` — migration state lifecycle, validation gating
- `TASK-context-window-monitor.md` — token usage indicator, threshold colors
- `TASK-smart-context-pruning.md` — score-based pruning, memory promotion
- `TASK-quick-regen-button.md` — one-click response regeneration
- `TASK-response-length-control.md` — Short/Medium/Long/Custom presets
- `TASK-character-memory-injection.md` — injection probability, privacy levels, secrets
- `TASK-chat-external-music-linking.md` — external service embeds, no server download
- `TASK-chat-context-feature-permissions.md` — UI feature gating based on context (Epic 36)
- `TASK-info-bubbles.md` — reusable help tooltip component for config menus (i18n)
- `TASK-data-migration-transitivity.md` — migration state lifecycle, validation gating
- `TASK-character-legacy-heir.md` — generational continuity, heir system (Character Core)
- `TASK-battle-arena-spectator.md` — arena challenges, spectating, replays (Battle Systems)
- `TASK-crafting-rare-discovery.md` — rare materials, crafting competitions (Crafting)
- `TASK-social-guild-system.md` — guilds, roles, guild bank (Social Interaction)
- `TASK-world-event-system.md` — dynamic world events, timeline (World & Locations)
- `TASK-magic-spell-crafting.md` — spell creation, magical discovery (Magic Systems)
- `TASK-exploration-expedition-teams.md` — cooperative exploration teams (Exploration)
- `TASK-economy-player-shops.md` — player-run shops, economic events (Economy)
- `TASK-companion-bonding-quests.md` — companion quests, bonding, legacy (Companion)
- `TASK-housing-neighborhood.md` — neighborhoods, decoration contests (Housing)
- `TASK-nsfw-reputation-consequences.md` — NSFW social reputation (NSFW Mechanics)
- `TASK-plugin-marketplace.md` — community plugin sharing (Plugin System)
- `TASK-multi-session-continuity.md` — cross-session carryforward, replay (Multi-Session)
- `TASK-memory-distillation-dreams.md` — memory distillation, dream system (Memory)
- `TASK-world-shaping-divine.md` — world-altering actions, divine intervention (Worlds)
- `TASK-vn-branching-choices.md` — VN branching choices, relationship impact (Immersion)
- `TASK-vn-dynamic-generation.md` — dynamic image/story generation (Visual Novel Mode 51)
- `TASK-vn-qa-mode.md` — Q&A mode for VN (Visual Novel Mode 51)
- `TASK-chat-battle-mode-switch.md` — chat→battle mode switching (Battle & Action Systems)
- `TASK-travel-party-migration.md` — party migration between chats (Chat Transfer & Location)
- `TASK-random-encounters-events.md` — structured encounter tables, event chains (World Event System)
- `TASK-gm-whitenotes.md` — GM whitenote system (GM/Shadow Notes 52)
- `TASK-gm-shadow-notes.md` — Shadow notes for hidden narrative influence (GM/Shadow Notes 52)
- `TASK-enemies-monsters-systems.md` — enemy/monster system with config files (Battle & Action Systems)
- `TASK-config-gallery-attachment-idempotent.md` — gallery, file attachment, idempotent load (Config Extensions)
- `TASK-vn-template-actions.md` — pre-configured scene/dialogue templates (Visual Novel Mode 51)
- `TASK-vn-scene-template-system.md` — custom template engine with variables (Visual Novel Mode 51)
- `TASK-battle-template-actions.md` — pre-configured battle action templates (Battle & Action Systems)
- `TASK-battle-encounter-template-system.md` — battle encounter template engine (Battle & Action Systems)
- `TASK-typescript-mjs-reconciliation.md` — TypeScript/MJS pattern reconciliation (Logic Reconciliation)

---

## Creative Extension Tasks

Tasks that creatively extend existing epics — adding new layers, mechanics, and social systems on top of established foundations.

| Task                                               | Effort | Epic(s)                       | Status         |
| -------------------------------------------------- | ------ | ----------------------------- | -------------- |
| Character Legacy & Heir System                     | Med    | Character Core (47)           | ⬜ Not Started |
| Battle Arena & Spectator Mode                      | Med    | Battle & Action Systems       | ⬜ Not Started |
| Rare Material Discovery & Crafting Competitions    | Med    | Crafting & Professions        | ⬜ Not Started |
| Guild & Social Organization System                 | Med    | Social Interaction            | ⬜ Not Started |
| World Event & Timeline System                      | Med    | World & Locations             | ⬜ Not Started |
| Spell Crafting & Magical Discovery                 | Med    | Magic & Spell Systems         | ⬜ Not Started |
| Expedition Teams & Collaborative Exploration       | Med    | Exploration & Discovery       | ⬜ Not Started |
| Player-Run Shops & Economic Events                 | Med    | Economy & Trading             | ⬜ Not Started |
| Companion Bonding Quests & Legacy                  | Med    | Companion, Pet & Mount        | ⬜ Not Started |
| Neighborhood & Housing Customization               | Med    | Housing & Base Building       | ⬜ Not Started |
| NSFW Social Reputation & Consequences              | Med    | NSFW Game Mechanics           | ⬜ Not Started |
| Plugin Marketplace & Community Sharing             | Med    | Plugin System & Extensibility | ⬜ Not Started |
| Cross-Session Continuity & Session Replay          | Med    | Multi-Session Support         | ⬜ Not Started |
| Memory Distillation & Dream System                 | Med    | Memory Systems (3-tier)       | ⬜ Not Started |
| World-Shaping Player Actions & Divine Intervention | Med    | Worlds Extension              | ⬜ Not Started |
| VN Branching Choices & Relationship Impact         | Med    | Immersion & Presentation      | ⬜ Not Started |

---

## New Epics (2026-07-26)

| #  | Name                                         | Status      | Priority | Epic File                            |
| -- | -------------------------------------------- | ----------- | -------- | ------------------------------------ |
| 51 | Visual Novel Mode (Extended)                 | 📝 Draft    | Medium   | `epic-visual-novel-mode.md`          |
| 52 | GM/Assistant Story Whitenotes & Shadow Notes | 📝 Draft    | High     | `epic-gm-shadow-notes.md`            |
| 53 | DB & Asset Snapshot Recovery                 | 🔵 Research | High     | `epic-db-asset-snapshot-recovery.md` |

---

## New Tasks (2026-07-26)

Tasks that extend existing systems with new mechanics and capabilities.

| Task                                               | Effort   | Epic(s)                  | Status         |
| -------------------------------------------------- | -------- | ------------------------ | -------------- |
| VN Dynamic Image & Story Generation                | Med–High | Visual Novel Mode (51)   | ⬜ Not Started |
| VN Q&A (Question <-> Answer) Mode                  | Med      | Visual Novel Mode (51)   | ⬜ Not Started |
| Chat Switch to Battle Mode (Turn-Based)            | Med      | Battle & Action Systems  | ⬜ Not Started |
| Travel Mode — Party Migration Between Chats        | Med      | Chat Transfer & Location | ⬜ Not Started |
| Random Encounters & Random Events Generation       | Med      | World Event System       | ⬜ Not Started |
| GM/Assistant Story Whitenotes                      | Med      | GM/Shadow Notes (52)     | ⬜ Not Started |
| GM/Assistant Shadow Notes                          | Med      | GM/Shadow Notes (52)     | ⬜ Not Started |
| Enemies & Monsters Systems                         | Med      | Battle & Action Systems  | ⬜ Not Started |
| Config: Gallery, File Attachment & Idempotent Load | Med      | Config Extensions        | ⬜ Not Started |
| VN Scene & Dialogue Templates                      | Med      | Visual Novel Mode (51)   | ⬜ Not Started |
| VN Scene Template System                           | Med      | Visual Novel Mode (51)   | ⬜ Not Started |
| Battle Action Templates                            | Med      | Battle & Action Systems  | ⬜ Not Started |
| Battle Encounter Template System                   | Med      | Battle & Action Systems  | ⬜ Not Started |
| TypeScript/MJS Reconciliation                      | Med      | Logic Reconciliation     | ⬜ Not Started |

---

## Standalone Tickets (No Epic)

| Task                           | Priority | Status         |
| ------------------------------ | -------- | -------------- |
| Conversation Branching         | Medium   | ⬜ Not Started |
| Character Relationships        | Medium   | ⬜ Not Started |
| Prompt Library                 | Low      | ⬜ Not Started |
| Regex Extraction Tests         | Medium   | ⬜ Not Started |
| Thinking Tag Context Prune     | Medium   | ⬜ Not Started |
| Test Performance Shared State  | Medium   | ⬜ Not Started |
| Agents Scripts Worktree Docs   | Low      | ⬜ Not Started |
| GitHub Pages VitePress         | Low      | ⬜ Not Started |
| Frontend E2E Improvements      | High     | ⬜ Not Started |
| Branch Workflow dev→stg→master | Low      | ⬜ Post-0.1.0  |

### Creative Extensions (New — 2026-07-26)

Tasks that extend existing epics with creative new mechanics and social systems.

| Task                                               | Priority | Status         |
| -------------------------------------------------- | -------- | -------------- |
| Character Legacy & Heir System                     | Medium   | ⬜ Not Started |
| Battle Arena & Spectator Mode                      | Medium   | ⬜ Not Started |
| Rare Material Discovery & Crafting Competitions    | Medium   | ⬜ Not Started |
| Guild & Social Organization System                 | Medium   | ⬜ Not Started |
| World Event & Timeline System                      | Medium   | ⬜ Not Started |
| Spell Crafting & Magical Discovery                 | Medium   | ⬜ Not Started |
| Expedition Teams & Collaborative Exploration       | Medium   | ⬜ Not Started |
| Player-Run Shops & Economic Events                 | Medium   | ⬜ Not Started |
| Companion Bonding Quests & Legacy                  | Medium   | ⬜ Not Started |
| Neighborhood & Housing Customization               | Medium   | ⬜ Not Started |
| NSFW Social Reputation & Consequences              | Medium   | ⬜ Not Started |
| Plugin Marketplace & Community Sharing             | Medium   | ⬜ Not Started |
| Cross-Session Continuity & Session Replay          | Medium   | ⬜ Not Started |
| Memory Distillation & Dream System                 | Medium   | ⬜ Not Started |
| World-Shaping Player Actions & Divine Intervention | Medium   | ⬜ Not Started |
| VN Branching Choices & Relationship Impact         | Medium   | ⬜ Not Started |

---

## Priority Tiers

### P0 — Immediate (In Progress)

- **Epic 16:** Observability & CI 🟡
- **Generation Hooks Infrastructure** — mood, emotion, NSFW, moderation hooks (created 2026-07-24)

### P1 — Next Cycle (Not Started)

- **Epic 15:** i18n & Accessibility ⬜
- **Epic 17:** Encryption Foundation ⬜
- **Epic 27:** Testing Infrastructure ⬜
- **Epic 33:** Multi-Instance Reconciliation 📝
- **Epic 34:** Data Integrity & ACID 📝
- **Epic 36:** Chat Lifecycle & Moderation ⬜
- **Epic 37:** Plugin System & Extensibility ⬜
- **Epic 47:** Character Core System 📝

### P2 — Specified, Not Implemented

- **Epic 20:** E2E Performance Benchmarks ⬜
- **Epic 21:** Notification Expansion ⬜
- **Epic 22:** RPG Mechanics Core ⬜ (+ 15 sub-systems)
- **Epic 23:** Assistant Commands ⬜
- **Epic 24:** Filtering & Pagination ⬜
- **Epic 25:** Memory Systems ⬜
- **Epic 26:** Avatar & Expression System ⬜
- **Epic 28:** Asset Support Expansion ⬜
- **Epic 29:** Provider & Plugin Ecosystem ⬜
- **Epic 30:** Assistant Intelligence ⬜
- **Epic 31:** World Persistence & Sync ⬜
- **Epic 32:** Deployment Topologies 📝
- **Epic 35:** Configuration Extensions (ECE) 📝
- **Epic 38:** World & Locations ⬜
- **Epic 39:** Item System Extensions ⬜
- **Epic 40:** Blog System ⬜
- **Epic 43:** NSFW Game Mechanics 📝
- **Epic 44:** Worlds Extension ⬜
- **Epic 46:** Creative Studio 📝
- **Epic 48:** Immersion & Presentation ⬜
- **Epic 49:** Analytics & Observability ⬜
- **Epic 50:** Prompt & Output Control ⬜

### P3 — Deferred (Post-MVP)

- Infrastructure epics (Headless, Transport, Multi-Session, etc.)
- Embeddable Engine (Far Fetched)
- Vision epics from `docs/ideas/`

---

## Epic Dependency Graph

```
Epic 33 (Multi-Instance) ──→ Epic 32 (Deployment Topologies)
                          ──→ Epic 34 (Data Integrity)

Epic 34 (Data Integrity) ──→ Epic 32 (Deployment Topologies)

Epic 22 (RPG Core) ──→ 15 sub-systems (Battle, Magic, Crafting, etc.)

Epic 37 (Plugin System) ──→ Epic 29 (Provider & Plugin Ecosystem)
                          ──→ Generation Hooks Infrastructure

Epic 35 (ECE) ──→ Epic 26 (Avatar & Expression, via emotions)
               ──→ Epic 22 (RPG, via status effects)
               ──→ Epic 37 (Plugin, via extension store)

Epic 47 (Character Core) ──→ Epic 22 (RPG, via traits/combat stats)
                         ──→ Epic 48 (Immersion, via portraits/mood)
```

---

## Idea → Epic Pipeline

Ideas in `docs/ideas/` become epics when they get a detailed plan in `.plan/epics/`.
Top recommendations from the ideas hub:

| #  | Idea                        | Effort | Status                       |
| -- | --------------------------- | ------ | ---------------------------- |
| 6  | Regex output transforms     | Low    | Quick Win Q1                 |
| 1  | Emotion-reactive portraits  | Med    | Covered by Epic 26 + Epic 35 |
| 7  | Auto-translation layer      | Med    | Covered by Epic 15           |
| 10 | Lore-consistency checker    | High   | Covered by Epic 25           |
| 14 | World continues without you | High   | Covered by Epic 31           |

**Dynamic re-addition:** To promote an idea to an epic:

1. Create `.plan/epics/epic-<name>.md` with implementation plan
2. Add numbered row to this file and `plan.md`
3. Add to `roadmap.md` if user-facing
