# TASK: Unified hold semantics — per-chat pause gates primary generate route

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** generation, pause, hold, ux, flow-control
**Epic:** epic-generation-flow-control.md
**Related:** TASK-global-generation-pause-kill-switch.md, TASK-generation-rate-limiting-and-concurrency-limits.md

## Summary

story_state.isPaused currently gates only auto-cascade and group-turn selection (auto-gen/group-cascade.ts:110, group-chat/turn-selector.ts:56); POST /api/generation/generate ignores it. Make per-chat pause a real HOLD: generate-route handler pre-check returns structured 409 hold response when paused; define UX contract (hold vs cancel: in-flight generation runs to completion on pause, UI shows paused state, resume re-enables). Keep cancel orthogonal (pause never aborts streams). Cover aux-pipeline triggers and step-pipeline entry points. Epic: epic-generation-flow-control

## Acceptance Criteria
+- [ ] generate-route handler pre-check rejects with structured 409 when chat.story_state.isPaused (hold response shape shared with global-pause ticket)
+- [ ] In-flight generation on pause runs to completion — pause never aborts streams; cancel remains orthogonal
+- [ ] Aux-pipeline and step-pipeline entry points honor the same hold check
+- [ ] UI: paused chat shows paused state, generate controls disabled, resume re-enables (chat-generations.ts / chat-group.ts)
+- [ ] Tests: paused generate returns 409; unpaused normal; in-flight completes after pause toggle
