# TASK: AUX LLM Fallback for Transition Intent Detection

**Status:** ✅ Done — implemented in `src/chat/transition-classifier.ts` (2026-08-01)
**Priority:** P2-B
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline
**Tags:** transition, detection, aux-llm, classification, intent

## Summary

AUX LLM fallback for transition detection when regex patterns miss.
Regex covers explicit movement ("I walk to..."), AUX catches implicit or
narrative transitions ("The rain forces us to seek shelter").

## Problem

Regex patterns in `src/regex/transitions.ts`:

| Pattern               | Catches                     | Misses                        |
| --------------------- | --------------------------- | ----------------------------- |
| `MOVEMENT_VERBS`      | "I walk to X", "We go to X" | "We're forced inside"         |
| `SCENE_CHANGE`        | "The scene shifts"          | "The world changes around us" |
| `TRANSITION_PHRASES`  | "Let's go to X"             | "We should probably head out" |
| `TEMPORAL_TRANSITION` | "After a while..."          | "Hours pass as we travel"     |
| `CONTEXT_CUT`         | "Context cut"               | "Skip to the next morning"    |

## What Was Built

- `src/chat/transition-classifier.ts` — regex-first, AUX-LLM-fallback classifier.
  Constraints: temp 0.0, maxTokens 100, **2s timeout**, graceful degradation on
  any failure (no transition).
- Wired into message POST flow at `routes/messages.ts:851`
  (`classifyTransitionMessage` → `classifyTransition`).
- Tests: `src/chat/transition-classifier.test.ts` (regex cases, AUX fallback,
  timeout/error graceful degradation, no-AUX skip).

## Follow-up Items (2026-08-01 review)

1. **Migrate to shared AUX runner** (epic M1): move to
   `src/aux-pipeline/tasks/transition.ts` using the shared `callAux()` helper
   (single timeout/temperature/token policy across all AUX tasks).
2. **apiKey resolution**: `classifyWithAuxLlm` passes no `apiKey` and bypasses
   `resolveProvider` — BYO-key users' AUX calls fall back to the provider
   instance key or fail silently. Resolve via `resolveProvider` in the runner.
3. **Latency**: the call is awaited in the POST path (worst case +2s per
   message when regex misses). Keep 2s cap; consider fire-and-forget with
   post-response side effects once the orchestrator lands.
4. **Telemetry**: transition classification not recorded (no tokens/latency).

## Acceptance Criteria (original — all met)

- [x] Regex detection still works for all existing patterns
- [x] AUX LLM triggers when regex misses
- [x] AUX LLM timeout returns no transition
- [x] AUX LLM error returns no transition
- [x] No AUX model configured → graceful skip
- [x] Location hint extraction works
- [x] Total latency < 3s (regex + AUX)

## Verification

```bash
bun run check
bun test src/chat/transition-classifier.test.ts
```
