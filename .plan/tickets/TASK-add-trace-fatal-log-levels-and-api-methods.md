# TASK: Add trace + fatal log levels and API methods

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-logging-telemetry

## Summary

Add trace (5) and fatal (50) to LogLevel enum, LogLevelNumeric, levels.ts (levelFromConfig, numericToLabel), formatters.ts (LEVEL_COLORS/LEVEL_CSS/JSONL), and Logger interface + LoggerImpl (trace(), fatal()). Update levels.test.ts + formatters.test.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
