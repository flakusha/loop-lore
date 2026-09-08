<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GM: shadow-note steering into workflow dispatch prompts

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

GameMasterService shadow notes should steer assistant workflow generation without forking backends. Reuse assemblePrompt + dispatch payloadTemplate from src/assistant/workflow-runner.ts: caller appends GM shadow-note context to the assembled prompt (or a hidden payload field) before POSTing the dispatch envelope. Scope: define the merge point (runner stays pure - steering lives in the GM caller), per-chat consent/visibility rules for shadow content, NSFW prefilter ordering vs steering injection. Acceptance: story-mode generation with shadow notes flows through confirmAndDispatch envelope; no duplicate prompt-assembly code in GM service.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
