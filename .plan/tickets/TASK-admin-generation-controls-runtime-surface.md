# TASK: Admin generation controls runtime surface

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Task
**Tags:** admin, generation, runtime-config, ui
**Epic:** epic-generation-flow-control.md
**Related:** TASK-global-generation-pause-kill-switch.md, TASK-generation-rate-limiting-and-concurrency-limits.md

## Summary

Admin has no runtime pause/limit hooks. Extend admin surface: global pause toggle, per-chat pause overview, limit adjustment persisted to system_config KV (seeded defaults), cancel-all button backing GET /api/generation/active with a DELETE counterpart using cancellation-tracker registry. Admin UI section reflecting state. Epic: epic-generation-flow-control

## Acceptance Criteria

+- [ ] Admin endpoints: global pause toggle, limit adjustment persisted to system_config KV with seeded defaults
+- [ ] Per-chat pause overview for admins
+- [ ] Cancel-all action backing the active-generations listing
+- [ ] Admin UI section reflecting live state (paused? limits? active count)
+- [ ] Tests: permission gating (admin.system), persistence, UI state reflects backend
