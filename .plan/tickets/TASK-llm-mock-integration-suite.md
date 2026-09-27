<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: LLM-mock integration test suite for generation surfaces

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-testing-qa.md (see also epic-prompt-improvement.md)
**Status:** Not Started
**Priority:** High

## Problem

`MockLLMProvider` (stream-mockable: `stream` emits `ChunkEvent`s;
`failOnCall`/`streamError` toggles) covers the generation route suite, but
several behaviors are unconfirmed under a functional mock, per the 2026-09
scope review:

- Frontend + backend LLM streaming/messaging round-trip (SSE path A frames +
  HTMX reconnect path B `stream-done`/`stream-error`/replay) — partially
  covered (`generate-route.test.ts`, `stream.test.ts`); reconnect-path error
  replay lacks a mock-driven case.
- Prompt enhancement / analysis — newly added surfaces (epic-prompt-improvement).
- Previously configured opt-in message moderation — `flagNsfwUserMessage`
  and `ModerationHook` keyword paths are tested; the dormant
  `useLlmClassifier` LLM path has no test because it has no consumer.
- Rate limiting / server-side prompt queue / frontend generation pause —
  rate limiting is auth-only; no generation queue exists. Covered by
  `FEAT-generation-rate-limiting-and-concurrency-limits.md`,
  `FEAT-global-generation-pause-kill-switch.md`, and `epic-llm-queue.md`
  once implemented — each needs mock-driven tests as part of its landing.
- Local image generation queue/pause/rate limit — `POST /api/generation/image`
  is fully synchronous; queueing must come with its own mock tests
  (`TASK-local-image-generation-queue.md`).
- Async/parallel invariants — `Promise.allSettled` patterns
  (`dispatchCommand`, auth/session refresh) get concurrency tests
  (parallel calls → consistent outcome; no unhandled rejection).

## Scope

- One suite driving end-to-end mock flows: message submit → moderation →
  generation stream → SSE consume → pause mid-stream → cancel.
- Fill the reconnect-path error-replay gap with `streamError` + buffer
  replay assertions.
- Concurrency tests for the `Promise.allSettled` auth/access seams.

## Acceptance

- Suite green under `bun test`; no fixed sleeps — poll/SSE assertions only.
- No leftover registered providers (`unregisterProvider` in teardown).
