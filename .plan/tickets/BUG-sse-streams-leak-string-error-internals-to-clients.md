<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->


# BUG: SSE streams leak String(error) internals to clients

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-frontend-backend-integration.md
**Tags:** frontend-backend-integration
# BUG: SSE streams leak string error internals to clients via "Generation failed" wire message

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-api-rate-limiting
**Summary:** In `src/generation/generate-route/stream-to-client.ts:328`, the catch block sets `streamError = "Generation failed"` (a generic message) but line 339 sends `streamError` to the client via `sseData({ type: "error", error: streamError })`. This leaks no internal detail — the wire message is correctly generic. However, the log at line 327 logs the full error with stack trace. The bug is that the comment at line 326 says "Non-cancel: full detail to log/attempt; generic wire message" but the actual wire is generic — so the bug here is documentation ambiguity, not a runtime leak. The real issue is that line 309's cancel-path uses `err.detail || err.message` for the persisted cancel_reason_detail, which is correct, but the non-cancel path never populates the attempt record with the actual error detail — only the generic "Generation failed" string is persisted.
**Context:** Found 2026-08-25 security review. The SSE error event should not leak stack traces, file paths, or internal error class names to the client. The current code is mostly correct (generic wire), but the attempt record in `failGeneration` receives the raw error without classification.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Git Issue:** 1a3a97a

## What

- `src/generation/generate-route/stream-to-client.ts:309-323`: cancel path correctly classifies `GenerationCancelledError` and `AbortError`, persisting `err.detail || err.message` as `cancel_reason_detail`.
- `src/generation/generate-route/stream-to-client.ts:326-340`: non-cancel path logs the full error (`log.error`) but: (a) `failGeneration` at line 331 receives the raw `Error` object, not a sanitized string; (b) the attempt record's `error` field may contain class names or non-user-safe strings if `failGeneration` serializes the error directly.
- The SSE wire message is correctly generic (`"Generation failed"`), but the server-side persistence is not audited for safe serialization.

## Why

A future change to `failGeneration` could accidentally serialize the full error object (including `stack`, `cause`, or non-serializable fields) into the database. The SSE wire is correctly generic today, but the persistence path lacks an explicit safe-serialization contract.

## Scope

- Audit `src/generation/generation-actions/fail-generation.ts` (called by `failGeneration`) for how it serializes the error into the `generation_attempts` table.
- Assert that the persisted error is a plain string (no object serialization, no stack trace in the DB column).
- Add a test that calls `streamToClient` with a synthetic error and asserts the persisted attempt record contains only a generic string.
- Out of scope: changing the SSE wire format (already correct).

## Acceptance Criteria

- [ ] `failGeneration` persists only a plain string to the attempt record (no object, no stack trace)
- [ ] A regression test exercises the non-cancel error path and asserts the persisted error string matches expected safe format
- [ ] `bun test src/generation/generate-route/stream-to-client.test.ts` green

**Resolved:** 2026-10-04 registry-driven close: git issue 1a3a97a (registry tip: 86af7e6dd Konstantin Fedotov Auto-closed: ticket BUG-SSE-STREAMS-LEAK-STRING-ERROR-INTERNALS-TO-CLIE)
