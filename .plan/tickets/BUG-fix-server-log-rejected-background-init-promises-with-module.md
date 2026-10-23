<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(server): log rejected background-init promises with module + error

**Status:** Done
**Status Note:** fixed on this branch — the background init jobs are tracked by name and every rejected promise is logged with the job name and the error (`src/server/init-background-services.ts:37-168`). Regression test in src/server/init-background-services.test.ts ("logs a rejected background-init promise with the job name and the error").
**Priority:** medium
**Effort:** Medium
**Epic:** epic-server-lifecycle-hardening

**Summary:**

Sources: stream-a #6. Where: src/server/init-background-services.ts:31-48, :71-97, :147-148 (await Promise.allSettled(initPromises) result discarded). Gap: inner init IIFEs have no try/catch and the allSettled results are ignored, so a throw (failed import, seeding crash, startLlamaCpp rejection) vanishes with no log. Startup looks healthy while providers/templates are missing; the failure surfaces later as no provider far from the cause. Acceptance: each rejected init promise produces a log line naming the module/job plus the error (inspect allSettled results or add per-job try/catch). A failed auto-start is identifiable in boot logs without reproducing the later no provider symptom. Priority: medium - silent degradation of AI providers at boot; debuggability, not data loss.

**Context:**

The inner init IIFEs had no try/catch and `await Promise.allSettled(initPromises)` discarded its result, so a failed character-template seed or a failed llama.cpp auto-start vanished: startup looked healthy while the provider or the templates were missing, and the failure only surfaced later as "no provider". The fix inspects the settled results and logs each rejection with the job name and the error, which is what the boot log needs to identify the failure. The init jobs are collected as `{ name, promise }` entries so the log can name the module. Alternatives considered: a per-job try/catch inside each IIFE (repeats the logging four times) and letting the rejection propagate (would abort the whole boot for a non-fatal provider). Logging keeps the boot resilient while making the failure visible.

**Acceptance Criteria:**

- [x] Every rejected background-init promise produces an error log naming the job and the error
- [x] A failed auto-start is identifiable in the boot log without reproducing the later "no provider" symptom
- [x] The other init jobs still run and the boot still completes
- [x] Regression test asserts the log line (fails before the fix, passes after)
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Root cause: `await Promise.allSettled(initPromises)` dropped the settled results, so a rejected init promise was silently swallowed.
- Changed `src/server/init-background-services.ts:37` (named init jobs), `:41`/`:78`/`:115`/`:131` (job registration), `:159-168` (inspect the settled results and log each rejection with the job name and the error).
- Regression test: `src/server/init-background-services.test.ts` — "logs a rejected background-init promise with the job name and the error" (15 pass / 2 fail before the fix, 17 pass / 0 fail after).
