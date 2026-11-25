<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Freeze StoryEvent as versioned src type (engine SDK prerequisite)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Promote the StoryEvent fenced snippet in .plan/epics/epic-embeddable-backend.md:45-52 to a versioned src/ type (grep StoryEvent across src;packages returns 0 matches). Required before any per-engine SDK: typedoc/gdtoolkit-doctool generation, OpenAPI-drift-gate precedent (scripts/check/parallel/gate-table.mjs:129-133). Include id/type/payload/timestamp envelope + delivery semantics (WS orders, no redelivery across reconnects; lastEventId cursor). Source: .tmp/research/game-engine-integration-review.md blockers.

**Context:**

This is the shared source-identity prerequisite for every runtime/engine consumer; per-engine SDKs and runtime clients must consume this frozen contract, not an app-specific event format, Editor MCP or honkbox job protocol.

**Current state (2026-11-25):**

- Exact search over `src;packages;plugins` found no runnable `StoryEvent` (or `DevelopmentRun`/`asset_versions`). The intended shape is `.plan/epics/epic-embeddable-backend.md:45-52`; the existing extraction/application/validation pipeline is `src/story/events/index.ts:9-27`, while `src/story/story-events-types.ts:15-22` defines a distinct `WorldEvent`. Reconcile with that pipeline; do not conflate the two types or replace it. Evidence: `.tmp/research/full-cycle-app-integrations-2026-11-25/strict-review.md` C13 and `unity.md` evidence IDs L5 and L14.
- Branch identity already exists at `chat_branches.parent_message_id`, `chats.active_branch_id`, `branch_merges` and `branch_merge_sources` (`src/db/schema-core.ts:1209,1380-1423`; `src/db/migrations/005_chat.ts:390-440`); `story_turns` has no `branch_id` (`src/db/schema-story.ts:234-254`). Pair the event with a direct turn→branch link or a proven resolver of that model, never a second branch system (strict-review C10).

**Contract to freeze:** envelope carries `schema_version`, `event_id`, `branch_id`, `story_turn_id`, `type`, `payload`, `created_at`, producer identity (producer id/kind/version plus server-resolved actor) and a deterministic per-branch `sequence` with a stable tie-break. Delivery is server-authorized per branch and ordered; reconnect performs no implicit redelivery, but a bounded-retention replay from `lastEventId` is explicit, with a named gap frame and snapshot fallback. Unknown versions/fields are rejected and cross-branch replay is denied.

**Acceptance Criteria:**

- [ ] Versioned `src/` `StoryEvent` and generated wire schema reconcile the epic snippet with the existing `src/story/events/` pipeline without conflating `WorldEvent`.
- [ ] Envelope fields (`schema_version`, `event_id`, `branch_id`, `story_turn_id`, producer identity, deterministic `sequence`, `created_at`) are present and validated at the boundary; unknown version/fields are rejected.
- [ ] Each event resolves to the existing chat branch model (direct `story_turns.branch_id` or proven resolver); divergence and reconnect tests prove no cross-branch replay.
- [ ] Per-branch WS delivery is ordered with no implicit redelivery; explicit `lastEventId` replay, bounded retention, named gap frame and snapshot fallback are tested.
- [ ] Scoped auth rejects unauthorized branch subscriptions and forged producer identity; reconnect/backoff and duplicate-event handling are tested.
- [ ] Runtime SDK contract check consumes the frozen type; no Editor MCP or honkbox dependency in the runtime client.
- [ ] Tests passing and documentation updated with the contract versioning note.
