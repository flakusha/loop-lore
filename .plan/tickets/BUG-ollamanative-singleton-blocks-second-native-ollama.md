<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: ollamaNative singleton blocks second native Ollama

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

GenerationProvidersConfig.ollamaNative is single object while openaiCompatible is list — two native Ollamas cannot coexist; workaround loses embed/NDJSON. Fix: widen to ollamaNative: ProviderInstanceConfig[].

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
