# TASK: Assistant/GM Flows Reconciliation

**Status:** 🟡 In Progress — story backend wired; multi-LLM story frontend + GM-guided UX pending (2026-08-01)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

## Summary

Assistant/GM flows reconciliation: multi-LLM story mode backend (`src/story/`) implemented + wired (`GameMasterService` in auto-gen story path, `TASK-wire-gm-service-story-mode.md` ✅); GM panel frontend done. The GmConfig shape gap is CLOSED (`TASK-gm-config-ui-authoring`) and story-mode frontend + GM-guided creation are DONE (`TASK-story-mode-frontend`): chat settings now author GM model/provider/temperature/maxTokens (→ `gm_config.llmConfig` → `llmDecision`), and the new-chat flow has a "Game Master guided story" toggle that pre-sets the GM role and auto-opens settings. Remaining: per-actor multi-LLM assignment (backend still unwired — `llmDecision` only uses the GM `llmConfig`) and the full aspirational story chat view (narration blocks, quest log, GM control panel per `docs/frontend/chat/multi-llm-story.md`).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
