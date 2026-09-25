<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: assets e2e upload returns null data — 7 of 8 tests fail in tests/e2e/flows/assets.test.ts

**Status:** ✅ Done (resolved in fix-assets-v1-upload-route branch — `POST /api/v1/assets` registered alongside legacy `/api/assets` so the v1 path is no longer caught by the wildcard fallback)
**Priority:** high
**Effort:** Medium
**Tags:** assets, e2e, coverage-gate

**Summary:** All 8 e2e tests in `tests/e2e/flows/assets.test.ts` fail with `TypeError: null is not an object (evaluating '(await api.upload("/api/v1/assets", formData)).data.id')`. The `POST /api/v1/assets` upload endpoint returns a non-2xx response, so `res.ok === false` and `res.data === null`. 1 of 8 tests passes (the GET list when empty).

**Repro:** `E2E_SAFEGUARD=1 bun test tests/e2e/flows/assets.test.ts` → 1 pass / 7 fail in 467ms. Pre-existing on dev (1b36a9388). Reproduces identically on `interaction-agency-quality` worktree.

**Context:**

**Failures (all cascade from the same upload failure):**
* `POST /api/v1/assets uploads a file` — `expect(res.ok).toBe(true)` received `false`
* `GET /api/v1/assets returns uploaded asset` — `uploadRes.data!.id` → null
* `POST /api/v1/assets/:id/links links asset to chat` — same
* `POST/DELETE share and DELETE link accept a JSON body` — same
* `DELETE /api/v1/assets/:id/links/:linkId returns 409 when entity_id is ambiguous across entity_types` — same
* `DELETE /api/v1/assets/:id deletes asset` — same
* `signed URL roundtrip: mint with session, serve session-less` — same

**Why:** The first test asserts `res.ok` is false (not a 2xx). The asset upload route is returning an error. Likely culprits (untriaged): Elysia multipart/form-data parser config, missing session cookie on the upload, content-type negotiation, or a recent asset middleware refactor. Not investigated — out of scope for the giwt in-repo bump that exposed it.

**Impact:** blocks `bun run check`'s `coverage - per-module line %` gate (gate exits non-zero on test failure, not coverage gap; `scripts/check/coverage.mjs --floor=80` standalone returns `fail: 0`). Pre-existing — same failures reproduce on `interaction-agency-quality` worktree HEAD. No ticket was previously filed.

**Where:** `tests/e2e/flows/assets.test.ts:47-50` (first failure). Likely route: `src/assets/*` (the assets controller / serve handlers). Recent touched files include `BUG-assets-delete-fk-constraint-fails.md` (related domain) — may share a root cause.

**Acceptance Criteria:**
* `E2E_SAFEGUARD=1 bun test tests/e2e/flows/assets.test.ts` → all 8 pass.
* `bun run check` `coverage - per-module line %` gate green.
* Root cause documented in commit message (multipart parser? session? middleware?).
* No regression in the 1 currently-passing test.

**Reproducer (full):**

```bash
cd /home/flak/git-ai/loop-lore
E2E_SAFEGUARD=1 bun test tests/e2e/flows/assets.test.ts
# 1 pass, 7 fail, 3 expect() calls, 467ms
```

## Acceptance Criteria

* [ ] Implementation complete
* [ ] Tests passing
* [ ] Documentation updated
