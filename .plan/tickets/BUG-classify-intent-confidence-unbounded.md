<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: classifyIntent / parseGmToolDetection accept LLM confidence without numeric bounds check

**Status:** Not Started
**Severity:** low
**Priority:** low
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation, epic-assistant-gm-flows
**Files:** src/generation/auto-gen/classify-intent.ts:49; src/assistant/gm-tool-detection.ts:84

## Issue

`classifyIntent` (`classify-intent.ts:30-55`) parses the AUX-LLM response and assigns:

```typescript
return {
  intent: parsed.intent,
  confidence: parsed.confidence ?? 0.5,
  shortReply: parsed.shortReply ?? false,
};
```

`parseGmToolDetection` does the same:

```typescript
const confidence = typeof toolCall.confidence === "number" ? toolCall.confidence : 0.5;
```

Neither clamps the confidence to `[0, 1]`. A misbehaving model (or a prompt-injection that smuggles a tool-result JSON with `"confidence": 9999`) propagates unbounded confidence into downstream heuristics (e.g. "if confidence > 0.8, skip second AUX call" in classify-intent callers). Negative numbers invert threshold checks.

## Why it matters

Correctness / robustness. The `confidence` field is documented as `0.0–1.0` in the JSDoc on both functions but never validated. Any consumer branching on confidence can be tricked.

## Evidence

- `src/generation/auto-gen/classify-intent.ts:49` — `parsed.confidence ?? 0.5` with no clamp.
- `src/assistant/gm-tool-detection.ts:84` — same pattern.
- `src/utils/math.ts` (or similar) — likely no `clamp` helper exported.

## Concrete fix

1. Add a `clamp(value: number, min: number, max: number)` helper to `src/utils/math.ts` (or extend an existing utility module).
2. In both call sites:

   ```typescript
   const rawConfidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
   const confidence = Number.isFinite(rawConfidence) ? clamp(rawConfidence, 0, 1) : 0.5;
   ```

3. Tests:
   - `classifyIntent` with `confidence: 1.5` → returns 1.0.
   - `classifyIntent` with `confidence: -0.5` → returns 0.
   - `classifyIntent` with `confidence: NaN` → returns 0.5.
   - `classifyIntent` with `confidence: "0.8"` (string) → returns 0.5 (or 0.8 if Number conversion is desired; document).

## Tests

- `bun test src/generation/auto-gen/classify-intent.test.ts` — add 4 cases.
- `bun test src/assistant/gm-tool-detection.test.ts` — add the same 4 cases for `parseGmToolDetection`.

## Related

- Low-priority defensive hardening; not urgent.
- `epic-chat-lifecycle-moderation.md`, `epic-assistant-gm-flows.md`.
