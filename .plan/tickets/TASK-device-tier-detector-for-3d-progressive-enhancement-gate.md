<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Device-tier detector for 3D progressive enhancement gate

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Build the device-tier detector that TASK-3d-frontend-viewer-lazy-mount, TASK-3d-view-modes-ui and epic-3d-generation all assume but that does not exist (src/frontend/alpine/device-tier.ts absent; nearest real code is src/frontend/a11y/responsive.ts hoverCapable/reducedMotion). Research: .tmp/research/2d-canvas-3d-world/README.md section 1.2. Acceptance: tier detector (GPU/WebGL capability + memory + reduced-motion) exposed to Alpine/htmx with deterministic output for tests; 2D-poster fallback + default-off wiring points documented for the three consumer tickets. Caveats: capability probing read-only and non-fingerprinting (no persistent identifiers); tier result cached per session, never sent to server; SSR/no-JS path renders the poster tier by default.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
