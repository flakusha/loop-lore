# TASK: Logging hardening minors: injection, rotation races, sink path, stack loss

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Four minors in the logging pipeline:

1. `src/logger/formatters.ts:44-52` — console formatter interpolates msg/module/error raw; user-controlled newlines/ANSI/control chars forge log lines/spoof levels in console sink (JSONL escapes fine). Strip `[\x00-\x1f]`, collapse newlines.
2. `transports/file.ts:69-79` rotate — `maxFiles=0` → no truncation on size trigger, unbounded growth; enforce nonzero default cap.
3. `file.ts:46-58` — appendFile+rename rotation races async queue flushes, lines lost/misplaced; serialize via mutex or inode-safe reopen.
4. `config/sections/logging.ts:41` — `jsonlPath` free-form, appender can point outside `.tmp/repo`; constrain or warn.
5. `server/start.ts:206,215` — fatal handlers pass `String(err)`, losing stack; pass `Error` object for `maxStackBytes` capture.

**Fix**: address all five. Stack capture is highest-impact (loses post-mortem data today).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
