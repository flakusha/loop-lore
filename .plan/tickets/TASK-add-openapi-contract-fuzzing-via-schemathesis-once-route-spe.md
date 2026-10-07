<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add OpenAPI-contract fuzzing via Schemathesis once route specs stabilize

**Status:** Not Started
**Priority:** low
**Effort:** Large
**Epic:** epic-api-library-distribution.md

**Summary:**

Deferred in docs/meta/auto-test-generation.md section 6. Schemathesis is the right tool for intersystem API testing: it reads an OpenAPI spec and probes the live server for contract violations, which nothing in the current suite does. The generated schema fuzzing shipped on feat-auto-test-generation covers schemas the server declares, but never the live wire behaviour behind them.

Deferred because it needs a Python sidecar, a running server, and a CI step — disproportionate until route annotations and the OpenAPI spec stabilize. Depends on epic-api-first-foundation.md (spec generation from Elysia routes) landing first; there is nothing to read without it.

This is the last piece for external consumers: it is what proves the published contract is the contract the server honours.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
