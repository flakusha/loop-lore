<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add OpenAPI-contract fuzzing via Schemathesis once route specs stabilize

**Status:** Not Started
**Priority:** low
**Effort:** Large
**Epic:** epic-api-library-distribution

**Summary:**

Deferred in docs/meta/auto-test-generation.md section 6. Schemathesis is the right tool for intersystem API testing: it reads an OpenAPI spec and probes the live server for contract violations, which nothing in the current suite does. The generated schema fuzzing shipped on feat-auto-test-generation covers schemas the server declares, but never the live wire behaviour behind them.

Deferred because it needs a Python sidecar, a running server, and a CI step — disproportionate until route annotations and the OpenAPI spec stabilize. Depends on epic-api-first-foundation.md (spec generation from Elysia routes) landing first; there is nothing to read without it.

This is the last piece for external consumers: it is what proves the published contract is the contract the server honours.

**Context:**

The existing schema-fuzz generator validates that inputs conform to declared schemas (validity-only). It never proves the live server honors those contracts at runtime — a schema can be correctly defined but mis-implemented. Schemathesis probes a running server against its OpenAPI spec, catching the gap between "schema says 200" and "server actually returns 200". This is the only intersystem test that can catch that class of regression.

Constraint: requires a Python sidecar process, a running server, and a CI step — significantly heavier than the existing Bun-based suite. Also requires `epic-api-first-foundation.md` (OpenAPI spec generation from Elysia routes) to land first; without stable specs there is nothing for Schemathesis to read. Deferred accordingly.

Alternative: rely on schema-fuzz alone. Accepted while routes and OpenAPI specs are in flux. Once `epic-api-first-foundation.md` lands, this ticket is unblocked and required for external consumers to trust the published contract.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
