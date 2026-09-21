<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Lore Specification

> **Status:** Mostly implemented — lorebook model, audience scoping, per-viewer injection, event→lore promotion, and timeline steering/convergence services exist in `src/`; timeline branching UI and foreshadowing injection remain open. (The earlier banner calling promotion/timeline "aspirational" was stale relative to this doc's own implementation-status table.) Authoritative source is `src/` and AGENTS.md.

## Implemented

- Tables: `world_lore_entries`, `actor_lore_entries` — lorebook rows with keys/selective/constant/position/activation_chance; CRUD via `src/routes/world-lore-entries.ts` (+ actor entries via the generic entity routes).
- Injection: `loreSection` (`src/assistant/prompt/sections/lore.ts`) — keyword/constant/cooldown with audience pre-filter; lore and memory are the two knowledge paths into a prompt, injected per-viewer (owner vs viewer, shared budget).
- Audience scoping: `src/assistant/lore/audience.ts` — subject kinds world / location / profession / race; unknown subjects hidden by default.
- Event → lore promotion: `src/story/events/promote-lore.ts` (additive; opt-out via `promoteToLore === false`).
- Timeline: `src/story/timeline/event-steering.ts` (create/roll/resolve steerings, red-herring guard) and `src/story/timeline/world-timeline.ts` (shared per-world event timeline; convergence queries exclude the caller's own story).

## Not implemented / open

- Branching UI; `loreSection` injection of steerings (foreshadowing) and cross-story convergence events.

## Unique content (compressed)

- Lore = shared/structural world knowledge; memory = personally accumulated experience. Both paths must be audience-filtered or knowledge leaks.
- Resolution rules: no `audience_scope` or world subject → visible to everyone; race/profession/location subjects matched against the speaking actor's identity; unknown → hidden.

## Epics

- `.plan/epics/epic-lore-knowledge.md` (Draft)
- `.plan/epics/epic-timeline-system.md` (Draft)
- `.plan/epics/epic-memory-knowledge-systems.md`
