<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Image-gen opens dead LLM SSE

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-generation-flow-control

**Resolution:** `generation-helpers.ts` — `dispatchGenerationAction` stream is now opt-in (`opts.stream === true`); the only two callers (image, caption) don't opt in, so no LLM SSE arms on fire-and-forget POSTs. Tests assert no-SSE on 200 for both.
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

dispatchGenerationAction opens the LLM SSE after an image POST (generation-helpers.ts:57), but image gen never writes the generation buffer — stream terminates with 'No active generation' (stream.ts:60-63). Image POST should not arm the LLM stream. Evidence: .tmp/interaction-cycles.md ## Image generation. Epic: epic-interaction-surfaces-audit.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**
- [ ] Implementation complete

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
