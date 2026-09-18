<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Asset dedup TOCTOU creates duplicate rows and orphan files

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/assets/service/create.ts:21-60 does contentHash+owner lookup then uid+write+insert; two concurrent identical uploads both miss existing, creating two rows and two files. Dedup defeated; write happens before insert with no cleanup on insert failure (orphan file). Fix: unique constraint (content_hash, owner_id) ON CONFLICT return existing, or per-hash lock; write only after insert. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
