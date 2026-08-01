# TASK: Assistant/GM Flows Reconciliation

**Status:** 🟡 In Progress — story backend wired; multi-LLM story frontend + GM-guided UX pending (2026-08-01)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

## Summary

Assistant/GM flows reconciliation: multi-LLM story mode backend (`src/story/`) implemented + wired (`GameMasterService` in auto-gen story path, `TASK-wire-gm-service-story-mode.md` ✅); GM panel frontend done; remaining work is story-mode frontend (multi-LLM story UI), GM-guided story creation UX, and closing the GmConfig shape gap (UI writes `{assistantRole, visualNovel}`; story expects `GameMasterConfig.type` — human/hybrid GM unreachable from UI).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
