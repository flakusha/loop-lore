<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: feat(plugins): plugin health inspector

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Derived-feature proposal F07 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-plugin-extension-points.md` (Not Started) + `epic-frontend-admin.md` (Done) + T14 (manifest + onLoad append) + T15 (route-matching semantics) + T16 (discovery-failure visibility).

Derivation: T14-T16 together define the plugin contract precisely (what registers, how routes match, what gets logged when loading fails). An inspector that validates a plugin directory against that contract — manifest/routes/params/duplicates — is a direct projection of the fixed semantics, and the admin panel already exists to host it.

Draft epic sketch / acceptance:

- `plugin:inspect DIR` (or admin UI equivalent; DIR is the plugin directory) reports manifest + onLoad route sets, param-segment support, duplicate method+path conflicts, and load warnings.
- Registration-time rejections (T15 param/duplicate rules) share one validator with the inspector (no drift).
- Boot warnings from T16 link to the inspector output for the named plugin.
- Admin panel shows per-plugin route/tool inventory from `RegistryStore` (read-only projection).
- A test loads a fixture plugin with manifest + onLoad routes and asserts the inspector lists both (extends T14's test).

Priority: med — multiplies the value of the plugin fixes by making the contract self-service for third-party authors.

Blocked-by: T14/T15/T16.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). Medium-priority composition group F06-F09.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
