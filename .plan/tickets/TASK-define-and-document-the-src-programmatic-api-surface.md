<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Define and document the src/ programmatic API surface

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-api-library-distribution

**Summary:**

epic-api-library-distribution.md assumes src/ can be imported, but nothing states which modules are part of that surface. The generator and gap gate both discovered this by accident: the first fuzz generator walked the src/validation/schemas barrel and silently missed four sibling modules, and the first gap matcher counted incidental token matches as coverage. Both were invisible precisely because the surface was undefined.

Deliver:
- an explicit public-surface manifest (which src/ modules an external consumer may import, and which are internal)
- a gate asserting every public module is reachable from its declared entry point, so a barrel that stops re-exporting something is caught rather than discovered
- docs describing the surface for a consumer who has never read the repo

Prefer the repo's existing barrel convention (subdir + index.ts re-exporting the public names) over a new mechanism. The test-gap ratchet is a useful cross-check here: a module on the public surface with zero importers outside src/ is either dead code or a manifest that has drifted.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
