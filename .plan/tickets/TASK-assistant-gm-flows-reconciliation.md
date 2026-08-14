# TASK: Assistant/GM Flows Reconciliation

**Status:** 🟡 In Progress — story backend wired; multi-LLM story frontend + GM-guided UX pending (2026-08-01)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

## Summary

Assistant/GM flows reconciliation: multi-LLM story mode backend (`src/story/`) implemented + wired (`GameMasterService` in auto-gen story path, `TASK-wire-gm-service-story-mode.md` ✅); GM panel frontend done; remaining work is story-mode frontend (multi-LLM story UI) and GM-guided story creation UX. The GmConfig shape gap is CLOSED — UI now authors `GameMasterConfig.type`/`humanGM`/`escalationThreshold` via chat settings, persisted to `gm_config`, and consumed by `story-mode.ts` (`TASK-gm-config-ui-authoring`).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
