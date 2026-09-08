<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GM/chat: assistant-GM handoff via intent-to-workflow routing

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

Chat and group-chat need one routing rule: user message -> classifyIntent/INTENT_PATTERNS -> workflow trigger vs GM service vs plain command. Reuses TASK-assistant-command-execution-intent-detection (fix classifyIntent timeout/apiKey) + workflow triggers declared per-template (AssistantWorkflowConfig.triggers, shipped in defaults.yaml). Scope: match message against loaded workflow triggers; on match start WorkflowRunner preview, else fall through to GameMasterService (story mode) or slash-command dispatch (messages.ts:543); group-chat: per-actor routing + talkativity interplay; tool-call display already partially wired. Acceptance: intent->workflow vs GM vs command precedence tested; no silent fallthrough (BUG-story-mode-chat-without-gm-config-silently-skips-generation stays fixed).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
