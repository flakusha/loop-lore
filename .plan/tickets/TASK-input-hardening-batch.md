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
| `02a9092` BUG-raw-buffer-from-alloc-inconsistent-with-safe-buffer-65-sites | Raw `Buffer.from(...alloc)` bypasses format-specific safe helpers (issue title cites 65 sites — count not verified; sweep repo before fix) | `src/utils/safe-buffer/` has per-format helpers (`safeDecompress`, `safeFromBase64`, `safeFromString`, `safeFromUint8Array`) — no general `safeBuffer.from()` wrapper exists; the fix likely requires either auditing each call site for caps or adding a new `safeBuffer` helper | MED |
| `2984874` BUG-raw-json-parse-outside-safe-json-3-sites | Raw `JSON.parse` bypasses `safeJsonParse` (3 sites) | `src/utils/safe-json.ts` already provides safe variant; replace each call site | MED |
| `5842782` TASK-logging-hardening-minors-injection-rotation-races-sink-path | Logger injection / rotation races / sink-path | `src/logger/` | MED |
| `b23b7fb` BUG-logger-censor-depth-cutoff-returns-subtree-untouched-nested | Censor depth cutoff bug — nested subtree passes through | `src/logger/censors.ts` | MED |
| `a06b99e` BUG-telemetry-stores-raw-client-body-real-user-chat-session-ids | Telemetry PII — raw bodies + session IDs | `src/telemetry/` (re-emit `chatId` from `?chatid=`; redact bodies) | MED |
| `b465b08` BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san | ReDoS in HTML sanitizer — chunk-boundary hazard | sanitizer hardening; HIGH-adjacent | HIGH-adj |
| `eafe79f` TASK-regex-pipeline-hardening-sweep-input-caps-lastindex-hazards | Regex pipeline lastIndex / caps hazards | `src/regex/transforms.ts` quick-wins #4 | MED |
| `1a3a97a` BUG-sse-streams-leak-string-error-internals-to-clients | SSE error leaks internals | chat pipeline hardening; overlaps `d14fd85` per security doc dedup notes | MED |

## Existing utilities (reuse, don't reinvent)

- `src/utils/safe-buffer/` — per-format helpers (`safe-buffer/index.ts:10-12` re-exports): `safeCompress` + `safeDecompress` (compression.ts, ratio caps), `safeFromBase64` + `safeToBase64` (base64.ts, maxSize caps), `safeFromString` + `safeFromUint8Array` (string.ts) — **not** a general `safeBuffer.from()` allocation wrapper

- `src/nsfw/pii-redaction.ts` — already used by moderation audit; reuse for telemetry redaction
- `src/middleware/auth/token.ts` — already verifies session IDs from signed JWT, not headers

## Pre-work (verify before fixing)

1. **Count actual `Buffer.from(...)` / `Buffer.alloc(...)` sites** (the issue title's "65-sites" is unverified). Use `rg "Buffer\\.(from|alloc)\\(" src/ | wc -l` from repo root. If the count differs materially from 65, the ticket scope needs review.
2. **Count raw `JSON.parse(` sites** (issue title says 3) — `rg -F 'JSON.parse(' src/`.
3. **For each cluster (logger, telemetry, regex, SSE, HTML sanitizer)**, confirm the git-issue title's diagnosis still matches current `src/` (issues may be stale — verify before fixing).

## Acceptance Criteria

- [ ] Each listed git issue either fixed or explicitly closed as wontfix with reason
- [ ] Each fix has a regression test that fails on the unfixed code
- [ ] `bun run check` 22/22 green (target); `bun test src/` passes for affected modules
- [ ] `bun run plan:sync` reports the issues removed from `open-untriaged.md`
- [ ] Each commit references the git issue hash in the subject (`fix(<scope>): ... (#<issue>)`)