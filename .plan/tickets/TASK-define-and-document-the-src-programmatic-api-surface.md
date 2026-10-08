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

`epic-api-library-distribution.md` declares `src/` as importable but never defined the public surface. The consequences were discovered by accident: the first schema-fuzz generator walked the `src/validation/schemas` barrel and missed 4 sibling modules not re-exported in `index.ts`; the first test-gap matcher counted incidental token matches as coverage. Both were silent because there was no contract to fail against.

Constraint: the surface must stay in sync as the codebase evolves. A manifest that drifts from reality is worse than no manifest (it gives false confidence). A gate is needed to catch drift — a module on the public surface with zero outside importers is either dead code or a manifest that stopped listing it.

Alternative: leave the surface undefined. Not acceptable given the two accidents already caused by undefined boundaries. The existing barrel convention (subdir index.ts re-exporting public names) is already in place; this ticket formalizes it.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
