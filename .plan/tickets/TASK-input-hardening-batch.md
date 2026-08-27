# TASK: Input-handling hardening batch (2026-08-25 security wave)

**Status:** open
**Priority:** medium-high (HIGH-adjacent ReDoS in `b465b08`)
**Effort:** Medium
**Type:** Bug-fix batch
**Tags:** security, hardening, input-validation, logger, telemetry, regex

## Summary

Eight open git issues from the 2026-08-25 security review wave form a coherent
input-handling correctness batch. Each is a small, isolated fix; the value is in
flushing them together to reduce the input-trust surface.

| Git issue | Topic | Suggested home | Sev |
| --------- | ----- | -------------- | --- |
| `02a9092` BUG-raw-buffer-from-alloc-inconsistent-with-safe-buffer-65-sites | Raw `Buffer.from(...alloc)` bypasses `safeBuffer` (65 sites) | `src/utils/safe-buffer/` — replace each | MED |
| `2984874` BUG-raw-json-parse-outside-safe-json-3-sites | Raw `JSON.parse` bypasses `safeJsonParse` (3 sites) | `src/utils/safe-json.ts` already provides safe variant; replace each call site | MED |
| `5842782` TASK-logging-hardening-minors-injection-rotation-races-sink-path | Logger injection / rotation races / sink-path | `src/logger/` | MED |
| `b23b7fb` BUG-logger-censor-depth-cutoff-returns-subtree-untouched-nested | Censor depth cutoff bug — nested subtree passes through | `src/logger/censors.ts` | MED |
| `a06b99e` BUG-telemetry-stores-raw-client-body-real-user-chat-session-ids | Telemetry PII — raw bodies + session IDs | `src/telemetry/` (re-emit `chatId` from `?chatid=`; redact bodies) | MED |
| `b465b08` BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san | ReDoS in HTML sanitizer — chunk-boundary hazard | sanitizer hardening; HIGH-adjacent | HIGH-adj |
| `eafe79f` TASK-regex-pipeline-hardening-sweep-input-caps-lastindex-hazards | Regex pipeline lastIndex / caps hazards | `src/regex/transforms.ts` quick-wins #4 | MED |
| `1a3a97a` BUG-sse-streams-leak-string-error-internals-to-clients | SSE error leaks internals | chat pipeline hardening; overlaps `d14fd85` per security doc dedup notes | MED |

## Existing utilities (reuse, don't reinvent)

- `src/utils/safe-json.ts` — `safeJsonParse`, `jsonParseOr`, `safeJsonStringify` (full suite at `safe-json.test.ts`)
- `src/utils/safe-buffer/compression.ts` — `safeDecompress`, allocation caps
- `src/nsfw/pii-redaction.ts` — already used by moderation audit; reuse for telemetry redaction
- `src/middleware/auth/token.ts` — already verifies session IDs from signed JWT, not headers

## Acceptance Criteria

- [ ] Each listed git issue either fixed or explicitly closed as wontfix with reason
- [ ] Each fix has a regression test that fails on the unfixed code
- [ ] `bun run check` 22/22 green (target); `bun test src/` passes for affected modules
- [ ] `bun run plan:sync` reports the issues removed from `open-untriaged.md`
- [ ] Each commit references the git issue hash in the subject (`fix(<scope>): ... (#<issue>)`)