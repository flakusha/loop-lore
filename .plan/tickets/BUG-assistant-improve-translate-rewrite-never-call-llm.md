<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: /improve, /translate, /rewrite advertise LLM behaviour but only do local string manipulation

**Status:** Not Started
**Severity:** high
**Priority:** high
**Effort:** medium
**Type:** BUG
**Epic:** epic-assistant-gm-flows, epic-output-control-transforms
**Files:** src/assistant/commands/improve.ts:37-56; src/assistant/commands/translate.ts:99-100; src/assistant/commands/rewrite.ts:76-121

## Issue

Three slash commands advertise LLM-backed behaviour but never invoke the generation pipeline:

- **`/improve`** (`improve.ts:21`) → `improveText(text)` does only capitalization + trailing-punctuation + double-space collapse. The header doc says "rewrite text for better quality"; the JSDoc on line 30-36 admits "Current transformations... placeholder. The real implementation should call the generation pipeline with a 'rewrite' prompt."
- **`/translate`** (`translate.ts:99-100`) → returns the literal string `[Translation to ${langName}: ${text}]`. `actionPayload.needsGeneration = true` is set but no consumer acts on it. The header doc (lines 5-12) says "will route through the LLM generation pipeline."
- **`/rewrite`** (`rewrite.ts:55`) → `rewriteText(targetText, style)` does local regex (filler removal, contraction expansion, capitalization). JSDoc on line 67-70 says "to be replaced by LLM-based rewriting".

All three commands set `actionPayload` and a `systemMessage`, but the systemMessage is the local heuristic output — not an LLM rewrite. The frontend renders the systemMessage directly as the result, so users see cosmetic-only changes labeled "Improved" / "Translated" / "Rewritten".

## Why it matters

UX / trust. Users invoking `/improve` to clean up a passage before sending it as a chat message get capital-letter fixups — not actual rewriting. `/translate hello to es` returns `[Translation to Spanish: hello]` literally. `/rewrite --style formal text` returns text with contractions expanded but no actual formal-voice rewrite. Three advertised features are functionally placeholders.

## Evidence

- `src/assistant/commands/improve.ts:37-56` — local heuristics, no `deps.complete` invocation.
- `src/assistant/commands/translate.ts:99-111` — placeholder string format.
- `src/assistant/commands/rewrite.ts:55, 76-121` — local regex transforms.
- `src/assistant/commands/create.ts:62-185` — `runCreateGeneration` shows the **correct** pattern: receive `complete: (req) => Promise<{ content }>` as an injectable dependency and call it via `resolveProvider`.

## Concrete fix

1. Refactor the three commands to mirror `runCreateGeneration`'s pattern:
   - The registered command signature receives `ctx` with the LLM-completion dependency (or look up via `deps.resolveProvider`).
   - Call the LLM with an appropriate system prompt (e.g. "rewrite for clarity", "translate to ${langName}", "rewrite in ${style} style").
   - Return the LLM output as the `systemMessage`.
2. Add a `resolveProvider + complete` injection seam: expose a `commandDeps` factory in `registry.ts` that commands can pull from `ctx`.
3. Keep the local heuristics as a documented **fallback** when no provider is configured (e.g. rule-based assistant mode), but make the LLM path the default.

## Tests

- `bun test src/assistant/commands/improve.test.ts` (new or updated) — stub `complete`, assert the LLM output is what reaches the user.
- `bun test src/assistant/commands/translate.test.ts` — assert output is NOT the placeholder bracket format.
- `bun test src/assistant/commands/rewrite.test.ts` — assert each style routes to a distinct LLM call (the system prompt differs).
- Provider not configured: command returns the local fallback + a system note "LLM unavailable; using local heuristics".

## Related

- `TASK-precompiled-templates-injection` (related epic — see pre-compiled template registry).
- `epic-assistant-gm-flows.md`, `epic-output-control-transforms.md`.
