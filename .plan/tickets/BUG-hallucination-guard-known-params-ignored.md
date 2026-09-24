<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: hallucination-guard accepts knownActorIds/knownLocationIds params but isKnownEntity ignores them — uses global 500-row load instead

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** done
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation
**Files:** src/chat/hallucination-guard/known.ts; src/chat/hallucination-guard/detect.ts; src/chat/hallucination-guard/types.ts

## Issue

`detectHallucinations` accepts `knownActorIds` and `knownLocationIds` as parameters (per `story-mode.ts:114-118` invocation):

```typescript
const hallucinationAnalysis = await detectHallucinations({
  db: database,
  text: turnResult.prompt,
  worldId: worldId ?? undefined,
},);
```

But `loadKnownEntities` (`known.ts`) loads 500 actors globally — no world filter, no actor-id scoping, no location-id scoping. The `knownActorIds` / `knownLocationIds` parameters passed in are **silently ignored** by `isKnownEntity`. A story-mode call in a private world that passes the world's actual actor IDs still gets hallucination checks against the global actor pool — including NPCs from other worlds.

## Why it matters

Correctness. The hallucination guard either misses world-specific NPCs (false negatives) or flags legitimate cross-world references as hallucinations (false positives). Both erode trust in the guard's signal.

## Evidence

- `src/chat/hallucination-guard/known.ts` — `loadKnownEntities` loads 500 globally (per scout).
- `src/chat/hallucination-guard/detect.ts` — accepts `knownActorIds` / `knownLocationIds` per scout but doesn't pass them through to `isKnownEntity`.

## Concrete fix

1. Use the `knownActorIds` / `knownLocationIds` parameters as the authoritative source when provided: build the Set from the param, not from a global SELECT.
2. Only fall back to `loadKnownEntities` when the params are undefined.
3. If a `worldId` is provided but no `knownActorIds`, scope the global load by `worldId`:

   ```sql
   SELECT id, display_name FROM actors WHERE world_id = ? OR world_id IS NULL LIMIT 500
   ```

4. Document the precedence: explicit param > world-scoped load > global load.

## Resolution

Implemented via the `knownEntityNames` pathway on `HallucinationCheckOpts` (`src/chat/hallucination-guard/types.ts:52`):

- `src/generation/auto-gen/resolve-known-names.ts` — `resolveChatKnownEntityNames(database, chatId)` resolves the chat-scoped set of participant display names + current chat location name.
- `src/generation/auto-gen/post-store.ts:118-125` and `src/generation/auto-gen/story-mode.ts:131-139` — call the helper and pass `knownEntityNames` into `detectHallucinations`.
- `src/chat/hallucination-guard/known.ts` — `isKnownEntity` keeps the underscore-prefixed `_knownActorIds` / `_knownLocationIds` stubs for signature compatibility (these remain intentionally unused); the working pathway is the `knownEntityNames` Set passed through `allowedNames`.

Trade-off: per-chat scoping is solved by deriving names from the chat's actual participants at call time, which is more correct than threading actor/location IDs through a global-actor-pool cache. The original `loadKnownEntities` is preserved for the no-known-names fallback.

**Duplicates** closed together: `BUG-hallucination-guard-isknownentity-stubs-unused-falls-through-to-name-match.md`. Issue 103e372 closes here.

## Tests

- `bun test src/chat/hallucination-guard/detect.test.ts` — pass `knownActorIds: ["alice-id"]`; verify only Alice is checked as "known".
- `worldId` provided: load is scoped to that world; NPCs from other worlds are NOT considered known.
- No `worldId`, no params: falls back to global load (current behavior).

## Related

- `epic-chat-lifecycle-moderation.md`.
- `BUG-chat-transitions-memory-poisoning` (same data-integrity theme).

## Chat Audit 2026-08-25 — Cross-Reference

**Finding B2:** Hallucination guard validates entities against a static DB snapshot; no handling for transient/dynamic world objects → false positives on legitimately-generated entities.

_Source: chat functionality audit (loop-lore), 2026-08-25. Related umbrella ticket for asset-injection feature: TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex (issue afe0589)._
