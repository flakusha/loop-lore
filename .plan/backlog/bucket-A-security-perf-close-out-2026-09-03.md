<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Bucket A Close-out — Security / Perf / Top Security Orphans (2026-09-03)

> Captures the bucket-A work that landed on `dev` between 2026-08-28 and
> 2026-09-03, plus the residual follow-up tickets surfaced by the strict
> audit re-review (see `docs/meta/code-practices-improvements/audit-batch-A-message-seen-gen-2026-09-03.md`).

## Scope (committed to `dev`)

### Security cluster

| Commit | Title | Cluster |
|---|---|---|
| `c9ca8edd` | fix(auth): add user-status gate in resolveUserIdFromRequest | auth / session |
| `d789df42` | fix(headers): add HSTS config + emit on HTTPS only | transport |
| `c1cd4d8b` | fix(security): scope idempotency cache key by userId | middleware |
| `be9fcfc5` | fix(message-seen): scope DELETE by userId — BUG-bug-message-seen-delete-handler-trusts-client-actorid-idor | chat/id-or |
| `70176a12` | fix(message-seen): enforce state enum, atomic upsert, IDOR-safe POST + DELETE | chat/id-or |
| `1601fac1` | fix(message-seen): preserve first-seen timestamp on re-mark | chat |
| `97cc60d3` | fix(async): scope complete/fail/progress writes by user_id | async / middleware |
| `7e0687f4` | fix(crafting): scope station instances by world_id — BUG-crafting-station-instances-scoped-across-worlds-cross-world | rpg / id-or |
| `c093f56d` | fix(async): guard complete/fail/progress writes by userId — BUG-table-backend-request-id-collision-overwrites-foreign-row | async / id-or |
| `a738bc81` | fix(idempotency): default backend to 'table' so asyncStore.track() runs by default | middleware |
| `5dd6ff40` | fix(character): XSS hardening batch (IDOR + 2 XSS + prompt injection + federation consent + 2 UX) | character / xss |
| `154a25ab` | fix(chat): wrap batchDeleteChats in a single transaction | chat |
| `5116ed24` | fix(crypto): tighten isEncryptedPayload shape validation against forgery | crypto |
| `ad8e01ea` | fix(crypto): re-seed chainKey in dhRatchetDecrypt DH-step branch | crypto |
| `72469bfd` | feat(security): adopt Bun.CSRF double-submit protection | csrf (multi-commit) |
| `ccac5b9d` | fix(csrf): require both halves of double-submit, gate logout, NODE_ENV-aware Secure flag | csrf |
| `b085c0ec` | fix(csrf): inject X-CSRF-Token in htmx configRequest | csrf / frontend |
| `5c56b529` | fix(e2e): CSRF double-submit dance in shared API client | csrf / tests |
| `9b39670d` | fix(nsfw): align resolveFlagBody status enum with service type | nsfw |
| `f4e49335` | fix(nsfw): export resolveReporterHashSecret + add production-gate tests | nsfw |

### Perf cluster

| Commit | Title | Cluster |
|---|---|---|
| `f2deabc5` | perf(check): cap parallel runner at 4 jobs to keep peak RSS bounded across worktrees | tooling |
| `11a6c0dd` | perf(crypto): adopt Bun.CryptoHasher for sha256 hashing | crypto |
| `59a0753e` | perf(transport): adopt Bun.gzipSync/gunzipSync | transport |
| `c77aa744` | fix(config-schema): emit portable ${DATA_DIR} placeholders instead of resolved absolute paths | config |
| `2f5c5f17` | fix(config-schema): add missing top-level sections to JSON schema emitter | config |
| `3f640da9` | fix(tooling): repair knip/jscpd scripts and prune stale dead-code config | tooling |

### Tooling cluster

| Commit | Title | Cluster |
|---|---|---|
| `8b3656db` | fix(worktree): assertGpgUnlocked on every signing path; pre-flight in check runner | tooling |
| `e0121860` | fix(worktree): parse AGENT_GPG_KEY_ID from .credentials.env in GPG precheck | tooling |
| `d13f6078` | fix(worktree): guard finalize against concurrent-merge race | tooling |
| `7aa33f8b` | fix(worktree): propagate reap success so finalize lock acquisition does not deadlock | tooling |
| `3d1737c0` | fix(worktree-cli): emit SPDX headers in generated ticket files | tooling |
| `d5e3a72e` | fix(gen): wrap detectHallucinations in try/catch so DB error does not strand stored message | generation |

## Audit findings (residual follow-ups)

The strict re-review (`docs/meta/code-practices-improvements/audit-batch-A-message-seen-gen-2026-09-03.md`) surfaced follow-up tickets now filed as TASK-audit-follow-up-* in `.plan/tickets/`. These are NOT bucket-A failures — they are residual defects that the bucket landed while not yet addressing. The audit found no BLOCKING issues. Listed in priority order:

1. `TASK-audit-follow-up-check-report-name-field-dropped` (issue `864a2bc`) — check report `name` field dropped; need to verify report contents after the ratchet-perf changes.
2. `TASK-audit-follow-up-maxratio-silently-raised-10x-without-regress` (issue `0391ad6`) — `safeDecompress` `maxRatio` silently raised 10× without a regression test. NIT-1 from Batch C audit, same theme.
3. `TASK-audit-follow-up-resolveuseridfromrequest-authconfig-di-path-` (issue `0735878`) — DI fast path (4-arg call) untested; callers silently fall back to per-request `loadConfig()`.
4. `TASK-audit-follow-up-templates-ts-at-190l-convention-ceiling` (issue `4636043`) — `templates.ts` at 190L convention ceiling.
5. `TASK-audit-follow-up-triggerautogeneration-catch-path-untested` (issue `1448001`) — `.catch()` path of `triggerAutoGeneration` not isolated. NIT-2 from Batch C audit, same theme.
6. `TASK-audit-follow-up-secondary-chat-ownership-check-in-reunitecha` (issue `6caa51a`) — secondary chat-ownership check in `reuniteChats` untested.
7. `TASK-audit-follow-up-worktree-finalize-reapstale-void-dead-code` (issue `06d25f6`) — proposed removal of `reapStale(): boolean` as dead-code pattern (in favor of inline lock acquisition). Low priority.
8. `TASK-audit-follow-up-chat-swipe-index-race-test-uses-promise-all-` (issue `3afdeb2`) — chat-swipe-index-race test uses `Promise.all` which runs on JS thread serially — no real concurrency tested.

## Status

Bucket A: ✅ **Done** (committed to `dev`). 33 commits landed (20 security + 6 perf + 7 tooling). 8 audit follow-ups filed as TASK tickets (TASK-audit-follow-up-*) for the next bucket.

## Related

- `docs/meta/code-practices-improvements/audit-batch-A-message-seen-gen-2026-09-03.md` — full audit findings
- `docs/meta/code-practices-improvements/audit-batch-C-rbac-refactor-2026-09-03.md` — sibling Bucket C audit (contains the BLOCKING failGeneration regression finding from commit `b997e8bd`)
- `docs/meta/code-practices-improvements/audit-batch-B-config-size-2026-09-03.md` — sibling Bucket B audit
- `.plan/backlog/open-debt.md` — captures the 5 refactor tickets surfaced by these audits
