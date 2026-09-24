<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Generation error-handling gaps (detector, abort, void promises)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** done
**Priority:** medium
**Effort:** Medium

## Summary

Non-stream path in src/generation/auto-gen/call-llm.ts:108-150 skips repetition/policy detector; abort ineffective (only throws if already aborted); void extractAndStoreMemories/record have no .catch (unhandled rejections); src/story/gm/decisions/llm.ts:78 silently returns hardcoded fallback; empty response.content accepted as final; tool output re-injected untrusted. Fix: run detector on both paths, effective abort, attach .catch, surface fallback, validate non-empty, treat tool output as data. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
