# Audit: batch-A — message-seen, generation, admin, auth, async, idempotency
# Working dir: /home/flak/git-ai/loop-lore  |  branch: dev
# Auditor: audit-batch-A (subagent)
# Strict mode: all claims verified against actual behavior

---

CLEAN: commit d5e3a72e (source fix only — see FINDING 2)

---
FINDING 1: resolveUserIdFromRequest callers omit optional authConfig DI parameter
Commit: c9ca8edd
Severity: medium
Type: missed-test
Detail: After refactor, resolveUserIdFromRequest accepts an optional 4th parameter authConfig for dependency-injected pre-loaded config (avoids per-request loadConfig()). Both callers in src/routes/export.ts:39 and src/routes/export-sse/start.ts:21 pass only 3 args, falling back to loadConfig() each time. No test exercises the fast DI path (4-arg call with pre-loaded config). While not correctness-breaking, this silently degrades to the old per-request loadConfig() behavior, defeating the DI optimization the refactor introduced.
Suggested action: Add test for 4-arg resolveUserIdFromRequest with pre-loaded authConfig; consider marking the 3-arg overload @deprecated so callers migrate.
Related tickets: .plan/tickets/BUG-resolveuseridfromrequest-missing-user-status-check.md (status unrecorded in index.json — needs sync)

---

FINDING 2: post-store.test.ts regression tests SKIP in CI pipeline
Commit: d5e3a72e
Severity: blocking
Type: missed-test
Detail: src/generation/auto-gen/post-store.test.ts uses describeOrSkip which gates on process.env.npm_lifecycle_event (set by `bun run`, not `bun test`). CI at .github/workflows/ci.yml:75 runs `bun test src/ --isolate --coverage` directly, so npm_lifecycle_event is unset, ISOLATED=false, and describeOrSkip resolves to describe.skip — the 2 hallucination-guard regression tests SKIP in CI. Verified: `npm_lifecycle_event=test bun test ...` passes; plain `bun test ...` skips. The source fix (try/catch in post-store.ts) is correct, but its regression tests do not run in the default test pipeline.
Suggested action: Change ci.yml:75 to `bun run test:unit -- --coverage`, or change the ISOLATED gate to use Bun's native --isolate flag presence rather than npm_lifecycle_event.
Related tickets: BUG-bug-hallucination-guard-runs-outside-try-catch-after-message (ticket marked done in index.json; regression tests effectively absent from CI)

---

CLEAN: commit 1601fac1

---

CLEAN: commit aa9b1f6d

---

CLEAN: commit 97cc60d3

---

CLEAN: commit a738bc81

---

CLEAN: commit 6c168610

---
