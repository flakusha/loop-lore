<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: hallucination-guard accepts knownActorIds/knownLocationIds params but isKnownEntity ignores them — uses global 500-row load instead

**Status:** Not Started
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

## Tests

- `bun test src/chat/hallucination-guard/detect.test.ts` — pass `knownActorIds: ["alice-id"]`; verify only Alice is checked as "known".
- `worldId` provided: load is scoped to that world; NPCs from other worlds are NOT considered known.
- No `worldId`, no params: falls back to global load (current behavior).

## Related

- `epic-chat-lifecycle-moderation.md`.
- `BUG-chat-transitions-memory-poisoning` (same data-integrity theme).
