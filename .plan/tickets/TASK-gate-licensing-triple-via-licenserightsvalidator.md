<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gate licensing triple via licenseRightsValidator

**Status:** Not Started
**Priority:** low
**Effort:** Small (validator map + unit test)
**Summary:** `character_licensing` `allow_derivatives`/`allow_commercial`/`share_alike` (migration `001:1291-1293`) are a cache of `license_type`. Add `licenseRightsValidator` mapping `LicenseType` to the allowed triple, next to `licensing.test.ts`, with a unit test. No column changes.
**Context:** DB schema-gate audit (2026-09-25, db-migration-fixes session). The cached triple can drift from `license_type` without a single source of truth; the validator centralizes the mapping.

**Acceptance Criteria:**
- [ ] `licenseRightsValidator` maps every `LicenseType` to its deriv/commercial/share-alike triple.
- [ ] Wired wherever the triple is written from `license_type` (no drift path).
- [ ] Unit test covers every LicenseType variant.
- [ ] `bun run check` green.

**Tags:** db, licensing, validator
**Related:** src/db migration 001, licensing.test.ts


git issue: 0d1de6e
