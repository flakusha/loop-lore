<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Advanced Memory Systems Specification

> **Status:** Partially implemented (an earlier "NOT IMPLEMENTED" banner was stale). The three-tier system exists in `src/`; lifecycle/config layers remain aspirational. Authoritative source: `src/`, `AGENTS.md`.

## Implemented

- Three-tier types — `MemoryType` = episodic | semantic | procedural (`src/db/enums-story/world.ts`); `actor_memories.memory_type` + confidence/importance/keywords columns (`src/db/schema-story.ts`).
- Memory services — `src/memory/`: extraction (+ extraction-store, burst), budget, embeddings, provision, purge (+ purge-stale), shareability, history-search, audit.
- Injection pipeline — `src/memory/injection/` (select, relevance, privacy, decide).
- Memory panel UI (create/edit/pin, type picker) — `src/components/chat/memory-panel.html` + `src/frontend/alpine/memory-panel.ts`; agent tool `src/generation/tools/write-memory-note.ts`.

## Not implemented / aspirational

- `src/generation/context-compressor.ts` — still absent.
- Config-driven lifecycle (the YAML `memory:` block: maxAgeDays, confidenceThreshold, decay, consolidation) — design only.
- Forgetting curves, consolidation, interference resolution; emotional/social/creative memory types; memory replay, memory-informed fine-tuning, cross-agent sharing, visualization tools.
- Asset-backed polymorphic storage (memories as `assets` rows) — superseded by the `actor_memories` table design.

## Epics

- `.plan/epics/epic-memory-knowledge-systems.md` — authoritative feature/status table (done / partial / not-started per feature).
- `.plan/epics/epic-memory-isolation-design.md` — knowledge isolation + world-timeline consistency (IDEA, design only, no code).
