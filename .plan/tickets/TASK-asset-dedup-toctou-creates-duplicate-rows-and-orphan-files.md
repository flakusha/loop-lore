<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Asset dedup TOCTOU creates duplicate rows and orphan files

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-multimodal-asset-reuse

## Summary

src/assets/service/create.ts:21-60 does contentHash+owner lookup then uid+write+insert; two concurrent identical uploads both miss existing, creating two rows and two files. Dedup defeated; write happens before insert with no cleanup on insert failure (orphan file). Fix: unique constraint (content_hash, owner_id) ON CONFLICT return existing, or per-hash lock; write only after insert. Tracked in .plan/backlog-archive.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## 2026-11-25 reconciliation

Fully shipped: the INSERT is the arbiter — conflict-targeted `ON CONFLICT` on
the owner/hash/tier(/key) partial-index key plus a same-key winner re-read and
orphan-file cleanup at `packages/assets/src/assets/service/create.ts:167-278`;
the unique indexes live at `src/db/migrations/007_generation_assets.ts:403-412`.
Concurrency tests (8 identical uploads yield one row/file, owner/tier scoping,
`dedupe:false`) are at
`packages/assets/src/assets/service/create-dedup-race.test.ts:49-367`.
