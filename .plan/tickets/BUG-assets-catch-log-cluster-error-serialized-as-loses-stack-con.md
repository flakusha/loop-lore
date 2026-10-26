<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: assets catch-log cluster: Error serialized as {} loses stack; controller builds child logger per statement

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-logging
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Five asset catch-log branches put the caught Error inside the log message object instead of the error field, so JSON.stringify(Error) yields {} and stack/message are lost exactly where the signal matters (decrypt 500s, malformed signed URLs, duplicate/FK share inserts, thumbnail encode). Controller variant additionally builds getLogger().child per statement, the queue-loss anti-pattern documented at src/logger/index.ts:57-66.

Evidence (minimal-b, all runtime/format-verified, scoped suites green): thumbnail-catch-log-fix thumbnail.ts warn({message,error}); shares-catch-log-fix shares.ts:73; signed-url-catch-log-fix signed-url.ts:191 via file-local getLog(); serve-raw-catch-log-fix serve-raw.ts:84 and :155 (decrypt failure in serve and download paths); controller-formdata-catch-log-fix controller.ts:514-517 plus pre-existing :90,:557.

Affected branches: thumbnail-catch-log-fix, shares-catch-log-fix, signed-url-catch-log-fix, serve-raw-catch-log-fix, controller-formdata-catch-log-fix.

Fix direction: memoised getChildLogger + Error as 2nd arg on .error/.fatal (types.ts:53-54); controller: getChildLogger(assets.controller)?.error('Failed to parse multipart form data', error instanceof Error ? error : new Error(String(error))); thumbnail/shares/serve-raw/signed-url: .error(message, error instanceof Error ? error : new Error(String(e))) with warn-vs-error levels as in reports. No behavior change beyond logging (return-null/500 contracts preserved).

Acceptance Criteria:

- [ ] corrupt-thumbnail, duplicate-share, truncated-token, corrupt-blob each produce one captured log entry with stack/message preserved
- [ ] controller multipart-garbage case returns 400 with one error entry
- [ ] no per-statement child() logger construction remains in touched files

UNVERIFIED note V1: permissions-audit-no-console (WARN) console.warn removal drops boot-time permission-denial audit entries when the logger is uninitialized; likely acceptable per repo rules. Settles by confirming no boot-order dependency on console fallback in permissions.ts:111-114, else revert/ticket.

Report: .tmp/glm-review/2026-10-21/minimal-b.md (controller/thumbnail/shares/signed-url/serve-raw sections).

Caveats: observability-only change; no authorization impact; no partial-failure surface; TOCTOU n/a; idempotency unchanged; error payloads must not include secrets.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 2e001b6 (registry tip: 1ce10a24b Konstantin Fedotov Close issue)
