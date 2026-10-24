<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Provide SMK secret in browser-test server config so key generation e2e can run

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The two keys-tab e2e tests drive the real UI (generate modal → POST /api/v1/keys) but the endpoint answers 500 Internal Server Error in the browser-test server environment: key generation requires the SMK encryption secret, which loadTestConfig() does not provide.

EVIDENCE: Failing-run tail:
Failed to load resource: the server responded with a status of 500 (Internal Server Error) [.../api/v1/keys]
Both tests are currently test.skip with this evidence.

FIX: Add an SMK secret to the test server config in loadTestConfig() (harness change), then unskip the two keys-tab tests.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
