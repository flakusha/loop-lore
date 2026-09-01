# TASK: Stop and respond interrupt semantics

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** low
**Epic:** epic-generation-flow-control

## Summary

Source: second emergent sweep, DreamRunner.ai stop-and-respond (candidate #30, gap G46).

Always-available Stop during streaming: story truncates at the last line the user actually saw; input frees immediately; queued side-effect jobs (TTS, images) cancel end-to-end; billing/quota never charges undelivered output. Builds on the remaining known gap TASK-generation-error-handling-gaps-detector-abort-void-promises (BUG-auto-gen-streaming-path-unhandled-rejection-abort-never-wire resolved on dev da05302e — detector hygiene, cancel-vs-failover, and the SSE tracker-signal link are wired).

## Acceptance

- [ ] Abort wired through generation streaming path (fixes never-wired BUG)
- [ ] Truncate-to-last-rendered-chunk semantics; user input free immediately
- [ ] Queued TTS/image jobs cancelled cleanly
- [ ] Usage/billing hooks respect delivery
- [ ] Tests: mid-stream stop + no-bill assertion

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
