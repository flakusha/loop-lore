<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Bridge rawtherapee/darktable photographic ingestion

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-creative-tool-bridge
**Tags:** bridge, ingestion, subprocess
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

rawtherapee-cli (GPL-3) AND darktable-cli (GPL-3) as supported co-tier subprocess tiers behind one capability-probed wrapper (decision 2026-10-29: both, not a fallback ladder): photographic reference to 16-bit TIFF ingestion for the reference lanes. darktable instances need configdir juggling for multi-instance; rawtherapee uses flat pp3 sidecars. Capability-probed, timeout-bounded, provenance-stamped. AC: a RAW ingest via either CLI produces a 16-bit TIFF asset with provenance; whichever CLI is absent is reported exactly, and ingestion proceeds with the other when configured.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
