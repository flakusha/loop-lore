<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: generation service silent catch blocks mask production errors

**Status:** Done
**Status Note:** 2026-10-26 sweep-B code verify: all three sites log: src/generation/auto-gen/resolve-known-names.ts:66-68, src/generation/auto-gen/handle-generation-error.ts:38-40,:61-63. Findings: .tmp/reviews/2026-10-26-sweep-B/BUG-generation-service-silent-catch-blocks-mask-production-error.md
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-logging

**Summary:**

Three generation-service functions swallow errors silently with bare catch blocks
and no logging, making production failures invisible.

## Evidence

1. `src/generation/auto-gen/resolve-known-names.ts:65-66`:

   ```ts
   } catch {
     return [];
   }
   ```

   Swallows all errors from the name-resolution pipeline. A persistent DB outage
   silently degrades hallucination detection with zero observability.

2. `src/generation/auto-gen/handle-generation-error.ts:38`:

   ```ts
   } catch { /* Best-effort */ }
   ```

   Swallows errors from `failGeneration()`. If the DB is down, neither the
   original error nor the secondary failure is logged.

3. `src/generation/auto-gen/handle-generation-error.ts:59`:

   ```ts
   } catch { /* best-effort */ }
   ```

   Swallows errors from `buf.signalError()`. If the stream buffer cannot be
   signaled, the UI hangs silently.

## Source

- review-chat.md findings 2, 3, 4
- review-consolidated.md nits 2, 3, 4
- File:line: `src/generation/auto-gen/resolve-known-names.ts:65`,
  `src/generation/auto-gen/handle-generation-error.ts:38`, `src/generation/auto-gen/handle-generation-error.ts:59`

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue b864f64 (registry tip: d873f619b Konstantin Fedotov Close issue)
