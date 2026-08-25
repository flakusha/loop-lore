# TASK: Global generation pause kill switch

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** generation, pause, admin, kill-switch, flow-control
**Epic:** epic-generation-flow-control.md
**Related:** TASK-unified-hold-semantics-per-chat-pause-gates-primary-generate.md, TASK-admin-generation-controls-runtime-surface.md

## Summary

No global pause exists. Add system_config key (e.g. generation_paused) checked in generate-route/handler.ts pre-check plus every auto-generation scheduler (group cascade, game-master, aux pipeline). Admin toggle route under admin.system permission. Semantics = HOLD not kill: refuse new starts with structured 409; optionally offer cancel-all for in-flight attempts via existing cancellation-tracker registry (listActiveGenerations + cancelGeneration). Survives restart via KV persistence. Epic: epic-generation-flow-control

## Acceptance Criteria
+- [ ] system_config key generation_paused seeded via admin/config.ts seedDefaults; persists across restart
+- [ ] generate-route handler pre-check + all auto-generation schedulers (group cascade, game-master, aux pipeline) gate on it with the shared hold-response shape
+- [ ] Admin route (admin.system permission) toggles it at runtime
+- [ ] Optional cancel-all: DELETE counterpart to GET /api/generation/active using cancellation-tracker registry
+- [ ] Tests: global pause blocks primary + auto-gen paths; resume restores; toggle survives restart
