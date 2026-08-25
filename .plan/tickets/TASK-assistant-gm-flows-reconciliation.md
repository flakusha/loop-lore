<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant/GM Flows Reconciliation

**Status:** ✅ Done (2026-08-14) — GM-config authoring, story-mode frontend, GM-guided creation, per-actor multi-LLM (model + provider) shipped; full aspirational story chat view delegated to a separate agent (cross-review)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

## Summary

Assistant/GM flows reconciliation: multi-LLM story mode backend (`src/story/`) implemented + wired (`GameMasterService` in auto-gen story path, `TASK-wire-gm-service-story-mode.md` ✅); GM panel frontend done. The GmConfig shape gap is CLOSED (`TASK-gm-config-ui-authoring`) and story-mode frontend + GM-guided creation are DONE (`TASK-story-mode-frontend`): chat settings now author GM model/provider/temperature/maxTokens (→ `gm_config.llmConfig` → `llmDecision`), and the new-chat flow has a "Game Master guided story" toggle that pre-sets the GM role and auto-opens settings. Per-actor multi-LLM assignment is DONE (`TASK-per-actor-llm` + per-actor provider re-resolution, commit `022f9a82`): `GameMasterConfig.actorModels` + `gm_config.actorModels` drive `llmDecision` to use each actor's model/provider (falling back to the GM `llmConfig`), and `story-mode.ts` now resolves the per-actor provider per generation call so cross-provider multi-LLM actually takes effect. The chat-settings modal lists a per-actor model/provider input for each story participant. Delegated to a separate agent (cross-review topic): the full aspirational story chat view (narration blocks, quest log, GM control panel per `docs/frontend/chat/multi-llm-story.md`).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated


git issue: b035376
