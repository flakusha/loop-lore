<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Two-step prompt/message injection validation

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-prompt-improvement.md
**Status:** In Progress
**Priority:** High

## Problem

No runtime injection/jailbreak validation exists in `src/` (grep-negative).
SECURITY.md links a `docs/spec/prompt-injection.md` that does not exist.
`parseIntentClassification` already hardens against injected tool-result JSON
(confidence clamp) — this ticket adds the missing inbound gate.

## Design — 2+ steps, deterministic + non-deterministic

1. **Deterministic** (`detectInjectionSignals`): weighted vector scan —
   instruction override ("ignore previous/disregard your instructions"),
   role hijack ("you are now/system prompt"), delimiter smuggling
   (`</system>`, fenced system blocks), tool/JSON exfiltration phrasing,
   unicode-homoglyph/zero-width payload markers. Pure, no I/O, cheap enough
   for the message-submit hot path.
2. **Non-deterministic** (`confirmInjectionWithLlm`): only when the signal
   score crosses the suspicion threshold — `callAux("injection-check", …)`
   JSON classifier `{ injected, confidence, category }`; timeout-bounded and
   null-safe (null ⇒ fall back to the deterministic verdict alone).
3. **Verdict** (`checkPromptInjection`): `clean | suspicious | blocked`.
   Block requires both steps to agree (strong deterministic score AND
   classifier confidence ≥ 0.8) — a heuristic alone never blocks. Otherwise
   suspicious ⇒ audit + warn (nsfw-flag precedent, warn-not-block).

## Wiring

- `POST /api/chats/:id/messages` — pre-dispatch check on user content,
  gated by the previously configured moderation opt-in
  (`hooks.enableModerationHooks`).
- `POST /api/generation/prompt` — deterministic step always on the draft;
  full two-step verdict included in the response payload.

## Follow-ups (filed separately)

- Write the missing `docs/spec/prompt-injection.md` referenced by SECURITY.md.

## Acceptance

- Deterministic vector tests; two-step test with mock provider proving
  LLM-confirm escalation, clean short-circuit (no aux call), and
  null-degradation behavior.
