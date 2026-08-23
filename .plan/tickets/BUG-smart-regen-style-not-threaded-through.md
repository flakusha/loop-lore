<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: smart-regen validates style then drops it — the style parameter never reaches the LLM call

**Status:** Not Started
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-output-control-transforms
**Files:** src/generation/generation-routes/regenerate.ts; src/chat/service/write.ts (regenerateMessageVariant); src/chat/service/types.ts (RegenerateVariantParams)

## Issue

The smart-regen pipeline is split across two layers:

1. `src/generation/generation-routes/regenerate.ts` validates the `style` parameter (`VALID_REGEN_STYLES` from `smart-regen.ts`).
2. `src/chat/service/write.ts` `regenerateMessageVariant` actually creates the new variant row.

The schema (`RegenerateVariantParams` in `src/chat/service/types.ts`) does **not** carry the `style` field. The style is validated at the route layer, then silently dropped before reaching the variant-write code path. `RegenerateVariantParams` is described as "immutable schema" but it's missing a field that the route layer actively validates.

Net effect: users picking "funnier" or "darker" from the regenerate dropdown get plain regenerated responses with no style adjustment. The `buildStylePrompt(style)` helper in `smart-regen.ts:39-54` is unused at runtime.

## Why it matters

UX. Smart-regen is a primary UX surface for users who want a quick style override on a botched response. Currently every regen button is equivalent.

## Evidence

- `src/generation/generation-routes/regenerate.ts` — `validateAndNormalizeStyle` (per scout).
- `src/chat/service/write.ts` — `regenerateMessageVariant({ ... })` — params don't include `style`.
- `src/chat/service/types.ts` — `RegenerateVariantParams` lacks `style`.
- `src/generation/smart-regen.ts:39-54` — `buildStylePrompt` defined but unused.

## Concrete fix

1. Extend `RegenerateVariantParams` with `style?: RegenStyle`.
2. Extend `regenerateMessageVariant` to accept and forward `style`.
3. In the regenerate flow: after fetching the new variant's content, append `buildStylePrompt(style)` to the system prompt (or invoke the LLM with `systemPromptOverride = buildStylePrompt(style)` if the provider supports it).
4. Add tests:
   - Regenerate with `style = "funnier"` → LLM call receives `buildStylePrompt("funnier")` in the system prompt.
   - Regenerate without style → no prompt override.
   - `validateAndNormalizeStyle("unknown")` → 400 with usage.

## Tests

- `bun test src/generation/generation-routes/regenerate.test.ts` — style propagates.
- `bun test src/chat/service/write.test.ts` — `RegenerateVariantParams.style` round-trips.

## Related

- `epic-output-control-transforms.md` (parent epic).
- `smart-regen.ts` (existing infrastructure waiting for this fix).
