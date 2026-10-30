<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Advanced Memory Systems Specification

> **Status:** Partially implemented (an earlier "NOT IMPLEMENTED" banner was stale). The three-tier system exists in `src/`; lifecycle/config layers remain aspirational. Authoritative source: `src/`, `AGENTS.md`.

## Implemented

- Three-tier types — `MemoryType` = episodic | semantic | procedural (`src/db/enums-story/world.ts`); `actor_memories.memory_type` + confidence/importance/keywords columns (`src/db/schema-story.ts`).
- Memory services — `src/memory/`: extraction (+ extraction-store, burst), budget, embeddings, provision, purge (+ purge-stale), shareability, history-search, audit.
- Injection pipeline — `src/memory/injection/` (select, relevance, privacy, decide).
- Memory panel UI (create/edit/pin, type picker) — `src/components/chat/memory-panel.html` + `src/frontend/alpine/memory-panel.ts`; agent tool `src/generation/tools/write-memory-note.ts`.
- Memory propagation scopes + timeline binding (epic-memory-propagation, first slice) — see "Memory isolation boundaries" below.

## Memory isolation boundaries (epic-memory-propagation)

**Scopes** (`MemoryScope`, `src/memory/types.ts`; enforcement in `checkScope`, `src/memory/provision.ts`):

| Scope | Operational rule |
|---|---|
| `character` (default) | Owner always sees it; non-owners only when `privacy: public`. |
| `assistant` | Visible in any context (per-user assistant facts). |
| `world` | Visible in every chat of the same world (`world_id` match). |
| `party` | Visible only in chats of the memory's **party lineage**: its `source_chat_id` + that chat's ancestor chain via `chats.parent_chat_id` (party-split branches inherit; branch-formed memories do not flow back up until a merge). Rejection reason `scope:party_mismatch`. |
| `timeline` | Visible only in chats of the memory's bound timeline. Rejection reason `scope:timeline_mismatch`. |

Secret memories (`privacy: secret`) evaluate shareability FIRST and skip the scope check entirely — a trusted viewer receives a secret regardless of party/timeline scope (pre-existing semantic, now covering the new scopes too).

**Timeline binding**: `actor_memories.timeline_id` (migration `084_actor_memories_timeline_id`; plain slug, no FK). NULL = timeline-AGNOSTIC — visible in every timeline. It is both the backfilled state of all pre-084 rows (existing visibility unchanged) and the explicit cross-timeline sharing exception ("GM-created lore or rare events seed knowledge across timelines"). New rows are bound at extraction: `storeMemories` copies the source chat's `chats.timeline_id` (NOT NULL DEFAULT 'prime', migration `048_chats_timeline_id`); an unresolvable chat row stores NULL.

**Injection filter**: `fetchActorMemories` (src/assistant/prompt/sections/memories-helpers.ts) applies `timeline_id IS NULL OR = :chatTimelineId` (chat's `chats.timeline_id`, 'prime' fallback) — the same convention as lore loading. The chat's timeline + party lineage are resolved by `resolveChatScopeContext` and carried on `ProvisionContext` (`timelineId`, `partyChatIds`).

**Cross-chat event propagation** (`src/story/timeline/world-timeline.ts`): `orderAcrossSessions` (deterministic occurred_at/ingest ordering), `detectEventConflicts` (same actor + same `occurred_at` + divergent descriptions = `same_moment_divergent_description`), and `mergeTimelineEvents` (re-tag one timeline's events into another, dropping exact duplicates).

## Not implemented / aspirational

- `src/generation/context-compressor/` — `strategies.ts` implements `truncateStrategy` + `slidingStrategy`; config-driven lifecycle (YAML `memory:` block) remains aspirational.
- Config-driven lifecycle (the YAML `memory:` block: maxAgeDays, confidenceThreshold, decay, consolidation) — design only.
- Forgetting curves, consolidation, interference resolution; emotional/social/creative memory types; memory replay, memory-informed fine-tuning, cross-agent sharing, visualization tools.
- Asset-backed polymorphic storage (memories as `assets` rows) — superseded by the `actor_memories` table design.

## Epics

- `.plan/epics/epic-memory-knowledge-systems.md` — authoritative feature/status table (done / partial / not-started per feature).
- `.plan/epics/epic-memory-propagation.md` — cross-timeline/cross-chat isolation rules; first slice implemented (scopes, timeline binding + injection filter, propagation helpers) — see "Memory isolation boundaries" above.
- `.plan/epics/epic-memory-isolation-design.md` — knowledge isolation + world-timeline consistency (IDEA, design only, no code).
