<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Spec: Chat Lifecycle & Moderation

**Status:** Partially shipped — lifecycle/context/transitions + NSFW/moderation hardening shipped; discovery + moderation remainder open.
**Epic:** `.plan/epics/epic-chat-lifecycle-moderation.md`
**Date:** 2026-10-02
**Authoritative source:** `src/` and `AGENTS.md`

## 1. Lifecycle (message insert → branches → transitions)

Messages are rows in `messages` with `parent_id` chains. Insert paths:
`src/chat/service/message-history.ts` (normal send), `src/chat/service/party-narration.ts`
(party narration), `src/chat/service/crud/turn-skip.ts` (skip markers),
`src/chat/service/transitions.ts` (split/reunion narration system messages via
`injectNarration`).

Variants are non-destructive siblings: `regenerateMessageVariant`
(`src/chat/service/write.ts`) creates a new row sharing `parent_id` with
`swipe_index = max + 1`; the old variant is preserved. Idempotent per
`regenIdempotencyKey(parentId, style)`.

Branches are a metadata layer over `parent_id` (`src/chat/service/branches.ts`):
a `chat_branches` row points at the fork message; the chain is the parent walk
(`walkMessagePath` in `branch-helpers.ts`); `chats.active_branch_id` selects
the displayed branch.

Transitions (`src/chat/transitions.ts`, classifier in
`src/chat/transition-classifier.ts`): regex-first fast path (`REGEX_PATTERNS`),
AUX-LLM fallback (`classifyWithAuxLlm`), types `description | context_cut |
location_change`. Location change updates `chats.current_location_id`, records a
`chat_location_events` row, and connects a `chat_sections` row to the triggering
message (`handleSceneTransitions` in `src/routes/messages/`); chat migration
carries location sections via `carryLocation` (`src/chat/service/carry-location.ts`
copies `chat_sections` + re-points `messages.section_id`).

## 2. Context continuity (sliding window, memory promotion on cuts)

`computeContextWindow` (`src/chat/context-window.ts`): keeps last `minRecent`
(default 8) unconditionally, backfills older newest-first until `maxTokens`,
trims oldest-recent if still over budget. Returns `retained`,
`usagePercentage`, `willTrim` (at `thresholds.imminent`). Lightweight API
shape in `src/chat/context-stats.ts` (`computeContextStats`,
`availableTokens`); threshold widget state via `getThresholdState`.

Overflow path: `selectMessagesForPromotion` picks unretained messages above a
score threshold; `promoteMessagesToMemories` stores them as `episodic`
memories in `actor_memories` with scope from `detectScope`
(`src/chat/memory-promotion.ts`: system/assistant → `assistant`, else
world-scoped if `worldId` else `character`). Ownership guard:
`requireChatParticipant` throws `OwnershipError` for non-participants —
last defense against memory poisoning (forged `actorId/chatId` pairs).

Score-based pruning (`src/chat/pruning/prune.ts` + `score.ts`): removes
lowest `combinedScore` first, never below 80% of target, buckets high-importance
removals as promotion candidates, and returns a summary string. The auto-gen
caller (`src/generation/auto-gen/context-pruning.ts`) soft-hides pruned messages
as `visibility="auto_hidden"` and logs the summary; the memory write and note
insertion are deferred (not wired).
Related-memory/event injection helpers `injectMemories` / `injectEvents` attach
`MemoryRef[]` / `EventRef[]` to the window but have no production caller yet.
Ambient events are side-effect free (`src/chat/random-events.ts`); the auto-gen
caller persists them to `chat_random_events` (`fire-random-event.ts`) and the
events prompt section (`src/assistant/prompt/sections/events.ts`) reads that
table directly.

## 3. Reconciliation guards

- Repetition: `StreamingRepetitionDetector`
  (`src/generation/cancellation-tracker/`, `repetition-detector/`), wired in
  `src/generation/cancellation-actions/streaming.ts` — scores streamed
  chunks, cancels with `CancelSource.AutoRepetition` above threshold, captures
  partial content on cancel.
- Hallucination: `detectHallucinations` (`src/chat/hallucination-guard/detect.ts`)
  extracts proper nouns, checks against known actors/locations/items
  (`loadKnownEntities`), allows session-transient names
  (`knownEntityNames`), flags at confidence ≥ 0.5.
- Moderator grants: `reconcileModeratorGrants`
  (`src/chat/service/access-moderation.ts`) demotes stale `gm` rows on
  ownership transfer; best-effort (caller swallows errors so transfer succeeds).
- Chat-mode reconciliation (epic §Chat Mode Reconciliation): **OPEN**.
  `src/chat/service/crud/create.ts` still defaults `mode` to `"direct"`; the
  three-axis split (ChatType / ChatMode / ResponseStyle) is not applied.

## 4. Moderation surface

| Capability | Status | Location |
|---|---|---|
| NSFW prefs (per-user toggles) | shipped | `src/nsfw/moderation-service/preferences.ts` (`get` read-only, `getOrCreateOwn` lazy-create) |
| NSFW access gate (age/config/rating) | shipped | `src/middleware/nsfw-gate/access.ts` (`canAccessNsfw`), `base-eval.ts`, `consent.ts`, `logging.ts` |
| NSFW output hook (keyword + LLM, pre-LLM gate + post-LLM defense) | shipped | `src/generation/hooks/nsfw-hook.ts`, `nsfw-classifier.ts`, `nsfw-hook-log.ts` |
| Moderation hook (tokenized word-boundary, severity, audit, non-destructive) | shipped | `src/generation/hooks/moderation-hook.ts`, `moderation-classifier.ts` (SEVERE/MODERATE tables, `detectModerationWithLlm` via AUX) |
| Content flags + review queue | shipped | `src/nsfw/moderation-service/flags.ts` (`flagContent`), `flags-views.ts`, `appeals.ts` |
| Chat ban/kick/mute/flag primitives + audit pair | shipped | `src/chat/moderation.ts` (`applyBan/applyKick/applyMute/applyFlag`, `writeAuditPair` → `moderation_actions` + `log_entries`) |
| Pure permission/state helpers (block/ban/shadow/collapse checks) | shipped | `src/chat/moderation.ts` (`checkModerationPermission`, `isBlocked`, `isBanned`, `getShadowState`, `isMuted`, `isParticipantBanned`) |
| Message visibility (hide/flag) | shipped | `src/chat/service/visibility.ts` (`updateMessageVisibility`) |
| `ModelRole.Moderation` wired to hook | open | Exists in `src/db/enums-core/flags.ts` but excluded from `VALID_ROLES` (`src/admin/model-roles.ts`) — unresolvable; hook uses AUX directly |
| DB-backed block / shadow apply (chat) | open | No `applyBlock`/`applyShadow` in `src/chat/moderation.ts`; NSFW block/shadow ship separately (`src/nsfw/moderation-service/mod-actions.ts`) |
| `/api/moderation/report` endpoint, auto-mod rules, mod dashboard | open | Per epic gap-audit E12 |

Discrepancy notes (spec follows `src/`, not epic aspirations): the epic's
§Moderation Wiring review (2026-08-01) predates the hardening — substring
matching, destructive suppression, and missing audit are FIXED in the current
`moderation-hook.ts`; `caption-route.ts` now resolves the `captioning` role
with main-fallback (epic claimed it resolved MAIN). Only the
`ModelRole.Moderation` wiring and telemetry-via-`recordAction`-for-flags
nuances remain.

## 5. Non-goals

Per epic §Overview: group-chat turn orchestration (see social-interaction /
group-chat specs) and location generation mechanics (see world-locations epic)
are out of scope. Chat discovery remainder (room filters server API, music
linking) is tracked in the epic, not here.
