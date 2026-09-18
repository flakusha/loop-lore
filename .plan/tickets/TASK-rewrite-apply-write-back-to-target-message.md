<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: /rewrite --apply write-back to target message

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-output-control-transforms

## Summary

Add --apply to /rewrite so the LLM rewrite replaces the target message content via an ownership-checked route instead of only returning a systemMessage. Step toward epic smart-regen. Tests for forbidden/cross-chat cases.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Implemented in tree/prompt-power-batch: `applyRewriteToMessage` in `src/chat/service/rewrite-apply.ts` (same-chat scope, author-or-admin ownership, route-mirrored encryption handling) exported from the service barrel; `runRewrite` gained `--apply` with an injectable `apply` dep and not_found/forbidden/cross_chat messaging; production handler binds it via `buildApply`. 4 service + 6 command tests green.
