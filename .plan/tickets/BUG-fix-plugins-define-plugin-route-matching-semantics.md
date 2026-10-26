<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(plugins): define plugin route matching semantics

**Status:** Done
**Status Note (2026-10-26 gate fallout):** the duplicate-registration warning is routed through `getChildLogger("plugin-registry")`, which returns null until a root logger exists — `src/plugins/loader-dispatch.test.ts` called `getLogger()` to snapshot the root before swapping in its capture stub, so under the shared coverage run (no root logger) the test threw "Logger not initialized" instead of asserting the warning. The suite now creates a root logger in `beforeAll`; the registry behaviour is unchanged.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-mechanics-governance

**Summary:**

Sources: stream-b #6. Where: src/plugins/loader.ts:dispatchPluginRoute (:331-342 exact pathname !== route.path); src/plugins/registry-store.ts:186-194 (insertion-order iteration, no duplicate detection). Gap: dispatch compares exact paths with no parameter, trailing-slash, or conflict handling: parameterized plugin routes can never match, and overlapping registrations resolve by silent registration order. Acceptance: :param segments are supported or rejected at registration with a clear error; trailing slashes normalized; duplicate method+path registrations warn/fail loudly; dispatch tests pin each behavior. Priority: medium - undefined matching semantics for all out-of-tree plugin routes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue cdc764a (registry tip: 4fa3411dc Konstantin Fedotov Close issue)
