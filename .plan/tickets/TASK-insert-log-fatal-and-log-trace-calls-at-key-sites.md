# TASK: Insert log.fatal and log.trace calls at key sites

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-logging-telemetry

## Summary

Convert crash-and-exit paths (log.error + process.exit(1) in src/build/compress.ts, src/config/generate-*.ts, uncaughtException/unhandledRejection handlers) to log.fatal. Add log.trace to high-frequency/low-noise code paths (request/parse/regex/debug internals) so info output stays meaningful.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
