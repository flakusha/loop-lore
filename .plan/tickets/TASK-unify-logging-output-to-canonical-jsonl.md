# TASK: Unify logging output to canonical JSONL

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-logging-telemetry

## Summary

Add a FileTransport writing one JSON object per line to a configured path; make formatJSONL the canonical machine output (non-TTY/file default), keep formatConsole only for human TTY. Ensure DBTransport + JSONL serialize the same unified LogEntry schema. Reuse formatJSONL in an actual transport instead of only the queue.ts stderr fallback.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
