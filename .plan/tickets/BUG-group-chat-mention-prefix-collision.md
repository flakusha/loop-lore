<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Group chat @mention parser silently picks wrong actor on prefix collision

**Status:** ✅ Resolved (verified 2026-09-07; bookkeeping)
**Priority:** high
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation, epic-chat-context-optimization, epic-group-chat
**Files:** src/group-chat/mention-parser.ts:78-93; src/group-chat/mention-parser.test.ts:71-74

## Issue

`resolveMention` first tries an exact (case-insensitive) match; if none, returns the **first** participant whose display name `startsWith` the lowercased mention string. With participants `[Luna, Lun, Lunatic]`, typing `@Lun` resolves to `Luna` (first in array). With participants `[Lun, Luna]` the same input now resolves to `Lun`. There is no disambiguation when the typed mention is itself a valid prefix of multiple participants.

The existing test (`mention-parser.test.ts:71-74`) only exercises the happy "prefix match" path; no test exercises the collision case. With a group of 4–5 characters with overlapping prefixes (`Alex`, `Alexa`, `Alexander`), the turn selector hands the AI response to whoever happens to come first in the `chat_participants` query result.

Compounded by `extractMentionedActorIds` (line 102-115) which deduplicates via `Set` — if Luna and Lun both match the prefix, only one ID surfaces, but it's whichever the database row order produced.

## Why it matters

UX. A user typing `@Lun` to nudge "Lun" gets "Luna" instead. Cascades and notifications route to the wrong actor silently. User trust in @mention is destroyed.

## Evidence

- `src/group-chat/mention-parser.ts:78-93` — `resolveMention` exact-then-prefix, no ambiguity check.
- `src/group-chat/mention-parser.test.ts:71-74` — only one prefix-match case.
- `src/generation/auto-gen/group-cascade.ts:60-67` — `resolveNextCascadeActor` consumes `extractMentionedActorIds` output to pick the next speaker.

## Concrete fix

1. In `resolveMention`: if prefix matches more than one participant, return `null` (and let the caller surface a system message: *"@X is ambiguous; specify @X# or @full-name"*).
2. Order participants stably (by `actor_id` lex) before prefix matching to make the result deterministic when no ambiguity exists.
3. Add tests:
   - `[Luna], [Lun]` + input `"Lun"` → resolves to `Lun` (exact match wins).
   - `[Luna, Lun, Lunatic]` + input `"Lun"` → returns `null` (ambiguous).
   - `[Alex, Alexa]` + input `"Alex"` → resolves to `Alex` (exact match).
   - `[Alexa, Alexander]` + input `"Alex"` → returns `null` (ambiguous prefix).
   - `[alex, Alexa]` (case insensitive) + input `"ALEX"` → resolves to whichever has the lowercased name "alex" (exact-insensitive wins).

## Tests

- `bun test src/group-chat/mention-parser.test.ts` — add the four cases above.
- `bun test src/generation/auto-gen-cascade.test.ts` — add a case where AI response mentions `@Lun` and verifies the cascade stops (ambiguous → null → no cascade).

## Related

- `BUG-group-chat-mention-regex-lastindex-stateful` (companion: same parser hardening).
- `epic-chat-lifecycle-moderation.md`.

## Resolution

Resolved in commit f1f92684 (verified on dev HEAD 2026-09-07). src/group-chat/mention-parser.ts `resolveMention` returns `null` when the typed prefix matches more than one participant (ambiguous → caller surfaces a system message). Participants are stable-sorted by actorId before the prefix scan. Empty-string mention → null. Covered by src/group-chat/mention-parser.test.ts (20 cases including exact-over-prefix, prefix ambiguity, and exact-insensitive case).

