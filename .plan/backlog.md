# Backlog

Features not under active development. `plan.md` tracks active work; `docs/meta/open-items.md` tracks bugs/debt.

## P0 — Immediate Next (v0.1 In-Progress)

Partial implementation exists in `src/`. Finishing these is current active work.

| Epic | Item                                                                               | Source  | Status         |
| ---- | ---------------------------------------------------------------------------------- | ------- | -------------- |
| 16   | Observability — telemetry, admin analytics, CI config, Playwright responsive tests | plan.md | 🟡 In progress |

### Completed (moved from P0)

| Epic | Item                                                                                   | Status      |
| ---- | -------------------------------------------------------------------------------------- | ----------- |
| 12   | Memory Foundation — keyword filtering, type enum, context compaction, A/N injection    | ✅ Complete |
| 13   | Frontend Responsive — mobile breakpoints, touch targets, keyboard shortcuts, HTMX, etc | ✅ Complete |
| 19   | Chat Notifications — cross-chat SSE, read-state schema, unread badge, toast            | ✅ Complete |

## P1 — Next Cycle (v0.1 Not Started)

Ordered by user impact × effort. Items with partial `src/` code listed first.

| Epic | Item                                                                                  | Effort | Partial Code? | plan.md ref |
| ---- | ------------------------------------------------------------------------------------- | ------ | ------------- | ----------- |
| 14   | Import/Export — file-based character import, chat export, PNG steganography, bulk     | Low    | Yes           | Epic 14     |
| 11   | Admin & Settings — admin middleware, page routes, user prefs modal, plugin management | Med    | Yes           | Epic 11     |
| 17   | Encryption Foundation — AES-256-GCM, per-user keys, browser-side key derivation       | Med    | Yes           | Epic 17     |
| 10   | Generation Foundation — tool-call loop, provider failover, SSE reconnect              | Med    | ✅ Complete   | Epic 10     |
| 15   | i18n & Accessibility — server-side i18n module, ARIA pass, keyboard nav, 10 locales   | High   | Minimal       | Epic 15     |

## P2 — Specified, Not Implemented

| Feature                                                                 | Spec                                                                    | Notes                                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Multi-format character import (PNG/YAML/TOML/CHARX)                     | `docs/spec/character-spec.md`                                           | Only JSON import works                                                                                             |
| Impersonation (`chat.impersonate_id`)                                   | `docs/spec/character-spec.md`                                           | Not implemented                                                                                                    |
| RPG mechanics (dice, stats, combat, XP, loot)                           | `docs/spec/rpg-mechanics.md`, `docs/spec/rpg-implementation-roadmap.md` | `src/rpg/` does not exist                                                                                          |
| Three-tier memory system (episodic/semantic/procedural)                 | `docs/spec/memory-system.md`                                            | Only `actor_memories` table exists                                                                                 |
| Artifact system (code/docs/datasets as assets)                          | `docs/spec/artifacts-system.md`                                         | Not implemented                                                                                                    |
| Agentic workspace mode                                                  | `docs/spec/use-case-agentic-workspace.md`                               | Not implemented                                                                                                    |
| Client-side encryption (AES-256-GCM, key hierarchy)                     | `docs/frontend/encryption.md`, `docs/spec/encryption-workflow.md`       | Messages stored as plaintext                                                                                       |
| Frontend story mode UI (GM panel, quest log, story chat)                | `docs/frontend/chat/multi-llm-story.md`                                 | Backend `src/story/` exists; no frontend                                                                           |
| Message archiving (cascade, restore, purge)                             | `docs/frontend/chat/archiving.md`, `docs/spec/archival-workflow.md`     | Hard delete only                                                                                                   |
| Memory selection UI (mid-chat panel, pinning, auto-extract)             | `docs/frontend/chat/memories.md`                                        | Backend reads memories; no UI                                                                                      |
| Server-side i18n middleware (`req.t`)                                   | `docs/frontend/internationalization.md`                                 | Minimal client-side `__()` only                                                                                    |
| Anthropic/Ollama/Bedrock providers                                      | `docs/spec/provider-system.md`                                          | Only OpenAI-compatible exists                                                                                      |
| Plugin management API (install/list/enable/disable)                     | `docs/spec/plugin-system.md`                                            | Plugin skeleton loads files; no API                                                                                |
| Signed URLs for asset downloads                                         | `docs/spec/assets.md`, `docs/spec/access-model-clarification.md`        | Uses `raw` endpoint with Bearer auth                                                                               |
| `POST /api/auth/register`                                               | `docs/spec/auth-middleware.md`                                          | Not implemented                                                                                                    |
| `/api/sessions` routes                                                  | `docs/spec/users-sessions.md`                                           | Not implemented                                                                                                    |
| Notification system with noise filtering                                | `docs/spec/notifications-expansion.md`                                  | Basic toasts exist; full system needed                                                                             |
| Model comparison reactions                                              | `docs/spec/notifications-expansion.md`                                  | Reactions table exists; no comparison API                                                                          |
| Assistant `/commands` extension                                         | `docs/spec/assistant-commands.md`                                       | Command parser exists (`src/assistant/command-parser.ts`); no slash commands wired                                 |
| Combined filter support                                                 | `docs/spec/filtering-pagination.md`                                     | Single filter only                                                                                                 |
| Chat room search & join (find/join chats, location-aware)               | `docs/frontend/chat/search-and-filter.md`                               | `TASK-chat-room-search-join.md` — sidebar search, joinable discovery                                               |
| Chat room filters (type, world, tags, participant count)                | `docs/frontend/chat/search-and-filter.md`                               | `TASK-chat-room-filters.md` — filter chips, combined filters (Epic 24 gap)                                         |
| Chat message search & filter (FTS, assets, links, role)                 | `docs/frontend/chat/search-and-filter.md`                               | `TASK-chat-message-search.md` — FTS5 index, in-chat + cross-chat search                                            |
| Chat autorenaming (context-based auto-title)                            | `docs/frontend/chat/overview.md`                                        | `TASK-chat-autorenaming.md` — rule-based + LLM rename                                                              |
| Visual novel mode (image + text overlay, transitions)                   | `docs/frontend/chat/visual-novel-mode.md`                               | `TASK-visual-novel-mode.md` — 3 layout modes, typewriter, scene transitions                                        |
| 3D view modes (permanent/collapsible/inline panels)                     | `TASK-3d-view-modes.md`                                                 | Consolidated from 3 old tasks: VRM avatars, GLTF, Spine 2D, device tier gating                                     |
| Text effects & overlays (glow, shake, status bars, icons)               | `docs/frontend/chat/text-effects-overlays.md`                           | `TASK-text-effects-overlays.md` — CSS effects, overlay components, decoration                                      |
| Info bubbles (help tooltips in config menus, i18n)                      | `TASK-info-bubbles.md`                                                  | `epic-immersion-presentation.md` (EPIC-048) — reusable `(?)` component for Settings, Character, World, Admin menus |
| Character multi-personality (personality switching, world/chat locking) | `TASK-character-multi-personality.md`                                   | Mood system needs personality switching, world/chat config locking                                                 |
| Mood swings & happiness meter (mood impact on personality)              | `TASK-character-mood-happiness.md`                                      | Happiness level affects personality, dialogue, and behavior                                                        |
| Memory injection probability & privacy (secrets sharing)                | `TASK-character-memory-injection.md`                                    | Not all memories injected; privacy levels, comfort-based sharing                                                   |
| Chat external music linking (no server download)                        | `TASK-chat-external-music-linking.md`                                   | Browser-native embeds from Spotify/YouTube/SoundCloud; copyright-safe                                              |
| Context-based feature permissions (UI gating)                           | `TASK-chat-context-feature-permissions.md`                              | UI features gated by chat/world/location context                                                                   |
| Data migration transitivity tracking (migrated-validated states)        | `TASK-data-migration-transitivity.md`                                   | Migration states beyond data_version for rollback/safety                                                           |
| Context window monitor (token usage indicator)                          | `TASK-context-window-monitor.md`                                        | FEAT-069 — ✅ Complete: sliding window, mode features, token budget                                                |
| Smart context pruning (score-based trimming + memory promotion)         | `TASK-smart-context-pruning.md`                                         | FEAT-072 — ✅ Complete: context window, transitions, mode-aware features                                           |
| Quick-regen button (one-click response regeneration)                    | `TASK-quick-regen-button.md`                                            | FEAT-070 — ✅ Complete: response length presets, resolution, fallback chain                                        |
| Response length control (presets + custom max_tokens)                   | `TASK-response-length-control.md`                                       | FEAT-071 — ✅ Complete: Short/Medium/Long/Custom presets, per-chat override                                        |
| Wire memory provision into prompt assembly                              | `TASK-memory-provision-wiring.md`                                       | Privacy-aware, scope-aware memory injection into prompts                                                           |
| Implement memory decay logic                                            | `TASK-memory-decay-logic.md`                                            | Time-based decay using decay_rate, strength, last_accessed_at columns                                              |
| Extract chat business logic from routes                                 | `TASK-chat-route-extraction.md`                                         | Move logic from chats.ts/messages.ts into service.ts                                                               |
| Implement memory promotion pipeline                                     | `TASK-memory-promotion-pipeline.md`                                     | Wire promotedToMemory: extract → scope detect → store                                                              |

### Creative Extension Tasks (New — 2026-07-26)

Tasks that creatively extend existing epics with new layers, mechanics, and social systems.

| Task                                               | Effort   | Epic Extended                 |
| -------------------------------------------------- | -------- | ----------------------------- |
| Character Legacy & Heir System                     | Med      | Character Core System         |
| Battle Arena & Spectator Mode                      | Med      | Battle & Action Systems       |
| Rare Material Discovery & Crafting Competitions    | Med      | Crafting & Professions        |
| Guild & Social Organization System                 | Med      | Social Interaction            |
| World Event & Timeline System                      | Med      | World & Locations             |
| Spell Crafting & Magical Discovery                 | Med      | Magic & Spell Systems         |
| Expedition Teams & Collaborative Exploration       | Med      | Exploration & Discovery       |
| Player-Run Shops & Economic Events                 | Med      | Economy & Trading             |
| Companion Bonding Quests & Legacy                  | Med      | Companion, Pet & Mount        |
| Neighborhood & Housing Customization               | Med      | Housing & Base Building       |
| NSFW Social Reputation & Consequences              | Med      | NSFW Game Mechanics           |
| Plugin Marketplace & Community Sharing             | Med      | Plugin System & Extensibility |
| Cross-Session Continuity & Session Replay          | Med      | Multi-Session Support         |
| Memory Distillation & Dream System                 | Med      | Memory Systems (3-tier)       |
| World-Shaping Player Actions & Divine Intervention | Med      | Worlds Extension              |
| VN Dynamic Image & Story Generation                | Med–High | Visual Novel Mode (51)        |
| VN Q&A (Question <-> Answer) Mode                  | Med      | Visual Novel Mode (51)        |
| Chat Switch to Battle Mode (Turn-Based)            | Med      | Battle & Action Systems       |
| Travel Mode — Party Migration Between Chats        | Med      | Chat Transfer & Location      |
| Random Encounters & Random Events Generation       | Med      | World Event System            |
| GM/Assistant Story Whitenotes                      | Med      | GM/Shadow Notes (52)          |
| GM/Assistant Shadow Notes                          | Med      | GM/Shadow Notes (52)          |
| Enemies & Monsters Systems                         | Med      | Battle & Action Systems       |
| Config: Gallery, File Attachment & Idempotent Load | Med      | Config Extensions             |

## New Epics (2026-07-26)

| #  | Name                                         | Status      | Priority | Epic File                            |
| -- | -------------------------------------------- | ----------- | -------- | ------------------------------------ |
| 51 | Visual Novel Mode (Extended)                 | 📝 Draft    | Medium   | `epic-visual-novel-mode.md`          |
| 52 | GM/Assistant Story Whitenotes & Shadow Notes | 📝 Draft    | High     | `epic-gm-shadow-notes.md`            |
| 53 | DB & Asset Snapshot Recovery                 | 🔵 Research | High     | `epic-db-asset-snapshot-recovery.md` |

## New Tasks (2026-07-26)

Tasks that extend existing systems with new mechanics and capabilities.

| Task                                               | Effort   | Epic Extended                     |
| -------------------------------------------------- | -------- | --------------------------------- |
| VN Dynamic Image & Story Generation                | Med–High | Visual Novel Mode (51)            |
| VN Q&A (Question <-> Answer) Mode                  | Med      | Visual Novel Mode (51)            |
| Chat Switch to Battle Mode (Turn-Based)            | Med      | Battle & Action Systems           |
| Travel Mode — Party Migration Between Chats        | Med      | Chat Transfer & Location          |
| Random Encounters & Random Events Generation       | Med      | World Event System                |
| GM/Assistant Story Whitenotes                      | Med      | GM/Shadow Notes (52)              |
| GM/Assistant Shadow Notes                          | Med      | GM/Shadow Notes (52)              |
| Enemies & Monsters Systems                         | Med      | Battle & Action Systems           |
| Config: Gallery, File Attachment & Idempotent Load | Med      | Config Extensions                 |
| VN Scene & Dialogue Templates                      | Med      | Visual Novel Mode (51)            |
| VN Scene Template System                           | Med      | Visual Novel Mode (51)            |
| Battle Action Templates                            | Med      | Battle & Action Systems           |
| Battle Encounter Template System                   | Med      | Battle & Action Systems           |
| TypeScript/MJS Reconciliation                      | Med      | Logic Reconciliation              |
| SQLite Backup Mechanisms Research                  | Low      | DB & Asset Snapshot Recovery (53) |
| Asset Storage Snapshot Research                    | Low      | DB & Asset Snapshot Recovery (53) |
| Character Bundle Format Research                   | Low      | DB & Asset Snapshot Recovery (53) |
| Disaster Recovery Procedure Research               | Low      | DB & Asset Snapshot Recovery (53) |

## Generation Templates (FEAT-065 — expanded)

## Quick Wins — Low Effort, High Leverage

From `docs/meta/assessments/feature-analysis.md`. Not yet in any epic.

| #  | Feature                          | Effort | Business Value | Source               |
| -- | -------------------------------- | ------ | -------------- | -------------------- |
| Q1 | Regex output transforms          | Low    | High           | feature-analysis #6  |
| Q2 | Smart-regen transforms (polish)  | Low    | High           | feature-analysis #8  |
| Q3 | Conversation analytics dashboard | Low    | Med            | feature-analysis #27 |
| Q4 | Model-comparison dashboard       | Low    | Med            | feature-analysis #28 |
| Q5 | Bulk data export (zip-all)       | Low    | Med            | plan Epic 14         |

## P3 — Deferred Concepts (Post-MVP)

| ID  | Concept                                                                 | Source Research                                                                                                                                            |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D.1 | Tool / Function Calling — 3-layer architecture                          | `docs/research/tool-calling-architecture.md`                                                                                                               |
| D.2 | BYOK — user brings own LLM / image-gen; admin can't read keys           | `docs/research/local-remote-inference-uis.md` §10.2                                                                                                        |
| D.3 | BYOR — user donates local compute as worker node                        | `docs/research/local-remote-inference-uis.md` §10.3                                                                                                        |
| D.4 | 3D World — world map, location travel, 3D avatars (Three.js)            | `docs/research/local-remote-inference-uis.md` §10.4 — see [docs/spec-planned/ideas/worlds-3d-navigation.md](../spec-planned/ideas/worlds-3d-navigation.md) |
| D.5 | Cross-Chat Autonomous Messages — characters message when "missing" user | `docs/research/local-remote-inference-uis.md` §10.1                                                                                                        |
| D.6 | Dual Runtime (Bun + Deno) — optional future                             | `docs/research/runtime-migration-bun-deno.md`                                                                                                              |
| D.7 | LLM native providers (Anthropic, Ollama, Bedrock)                       | `docs/spec/integrations/llm-serving.md`                                                                                                                    |
| D.8 | Image/Video Generation (sd.cpp, ComfyUI, Krea, Ideogram)                | `docs/spec/integrations/image-generation.md`                                                                                                               |
| D.9 | Full i18n implementation (868-line plan)                                | `docs/spec/i18n-implementation.md`                                                                                                                         |

## P4 — Long-term Vision

See `roadmap.md` P1/P2/P3 sections:

- Federated Identity, P2P modes, Marketplace, Analytics Suite
- DAO Governance, AI-Generated Content, XR/VR Integration
- Real-time Collaboration, Simulation Sandboxes, Edge Computing
- Quantum-Resistant Cryptography, Neuro-Symbolic AI

## Resolution Log

Items completed and merged to master:

- **Epic 12 (Memory Foundation)**: ✅ Complete — keyword filtering, type enum, context compaction, A/N injection implemented — merged to master
- **Epic 13 (Frontend Responsive)**: ✅ Complete — mobile breakpoints, touch targets, keyboard shortcuts, HTMX implemented — merged to master
- **Epic 19 (Chat Notifications)**: ✅ Complete — cross-chat SSE, read-state schema, unread badge, toast implemented — merged to master
- **Epic 10 (Generation Foundation)**: ✅ Complete — tool-call loop, provider failover, SSE reconnect implemented — merged to master


---

## Deduplication & Gap Analysis (2026-07-28)

See docs/meta/analysis-dedup-tasks.md for the high-level dedup matrix.
This section contains the actionable task proposals derived from that analysis.

### Actionable Task Proposals

#### Priority 1 - Close Critical Spec Gaps
| Task | Spec File | Status |
| --- | --- | --- |
| Finalize social-interaction spec | docs/spec/social-interaction.md | ✅ Done
| Finalize chat-privacy spec | docs/spec/chat-privacy.md | ✅ Done
| Finalize worlds spec | docs/spec/worlds.md | ✅ Done
| Finalize items/inventory specs | docs/spec/items.md, docs/spec/inventory.md | ✅ Done
| Create attachment-moderation spec | docs/spec/attachment-moderation.md | ✅ Done
| Create character-migration spec | docs/spec/character-migration.md | ✅ Done
| Create licensing spec | docs/spec/licensing.md | ✅ Done

#### Priority 2 - Cross-Mechanics Gap Tickets (from integration matrix)

| Gap ID | Systems | Proposed Ticket |
| --- | --- | --- |
| G1 | Battle + Items | TASK-battle-item-integration |
| G2 | Battle + Social | TASK-battle-social-chests |
| G3 | Battle + NPC/Actor | TASK-battle-npc-ai |
| G4 | Battle + Weather | TASK-battle-environment |
| G5 | Resolution + all combat/social/magic | TASK-resolution-integration |
| G6 | NSFW + Housing | TASK-nsfw-housing |
| G7 | NSFW + Weather | TASK-nsfw-weather |
| G8 | NSFW + Social | TASK-nsfw-social |
| G9 | NSFW + Disease | TASK-nsfw-disease |
| G10 | Housing + Companion | TASK-housing-companion |
| G11 | Crafting + Magic | TASK-crafting-enchanting |

#### Phase Execution Order

1. Phase 1 (Cleanup) - Done
2. Phase 2 (Spec Gaps) - Done
3. Phase 3 (Cross-Mechanics G1-G11) - Done
4. Phase 4 (Split oversized epics, create missing epics)
5. Phase 5 (Verification: bun run check, bun test, docs:gen)

### Phase 4 Details — Split oversized epics

Completed sub-epic files (from epic-world-locations.md split):
- `.plan/epics/epic-world-travel-time.md` — conditions, weather, travel, random generation
- `.plan/epics/epic-world-npcs.md` — NPC placement, migration, inventories
- `.plan/epics/epic-world-encounters.md` — anomalies, resources, items, unique places
- `.plan/epics/epic-world-diplomacy-karma.md` — factions, reputation, karma, lore

epic-world-locations.md still needs split into its remaining sub-epics:
- `.plan/epics/epic-world-diplomacy-karma.md` (Diplomacy & Karma — not yet created)
- `.plan/epics/epic-world-encounters.md` (Encounters & Resources — not yet created)

### Phase 5 — Verification

- `bun run check` (pre-existing TS errors in `src/routes/export.test.ts` and `src/routes/import.ts` unrelated)
- `bun test src/`
- `bun run docs:gen` (no such script — epics.md is canonical auto-generated index)
