<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Dedup route-handler boilerplate via shared route factory

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

D1 from 2026-09-03 knip/jscpd triage. ~45k dup tokens across ~200 files: auth->ownership->validate->error-map boilerplate repeats in routes/{rpg,admin,views,chats,crafting,nsfw-moderation,battle}; worst single file routes/actor-items/service.ts (5.8k tokens / 77 clones). Fix: shared route factory. BLOCKED: awaiting user confirmation that no route family is mid-wiring (repetition may be unfinished functionality). Evidence: .tmp/knip-jscpd-research/jscpd-report-post-fix.json + README.md cluster table.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
