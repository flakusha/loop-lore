<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin system-config: generation tunables (context window, guards, aux, model roles)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

Expose hardcoded generation tunables via system_config KV + /admin/system tab. Sources: src/generation/context-window-config.ts DEFAULT_CONTEXT_WINDOW (32k/8/sliding/0.75/1) duplicated in auto-gen/context-pruning.ts MAX_TOKENS + targetTokens 20k; gen-types-options.ts DEFAULT_REPETITION_DETECTION (200/0.85/100/3), DEFAULT_POLICY_DETECTION (0.7), DEFAULT_RESPONSE_LIMIT (1/turn); aux-pipeline/runner.ts TIMEOUT 2000/TEMP 0/MAX_TOKENS 100; schema/generation.ts modelRoles/regexTransforms/emotionAvatar/localModels/chatDefaults/defaultStream lacking UI. Acceptance: seedDefaults covers new keys; admin UI edits persist; per-chat overrides still win.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
