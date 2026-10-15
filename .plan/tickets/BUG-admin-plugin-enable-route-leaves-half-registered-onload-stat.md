<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Admin plugin enable route leaves half-registered onLoad state that the loader's own rollback removes

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Location: src/routes/plugins/index.ts:129-135 (enable-route catch) vs src/plugins/loader.ts:184-192 (loader rollback).

Evidence: the loader's failure path unregisters on a throwing onLoad (initializedPlugins.delete(name); registry.unregister(name); - with a comment documenting that unregistering drops everything onLoad registered), but the enable route's catch only calls registry.setEnabled(name, false). Anything onLoad registered before throwing stays in the registry while initializedPlugins was never set (loader.ts:233 runs only on success), so a retry re-runs onLoad against leftover state; the partial tools/routes/events are live during the onLoad execution window itself (the route sets enabled=true at :123 before initializing).

Verification: CODE-READ - trace: routes/plugins/index.ts:123 (setEnabled true) -> :129-135 (catch sets enabled false only; no registry.unregister / initializedPlugins.delete) vs loader.ts:189-192 (rollback does both) + loader.ts:216 guard and :233 add-on-success. Executing needs a live server plus a plugin whose onLoad throws mid-registration; infeasible read-only.

Impact: a broken plugin's partial registrations linger; the loader treats the same situation as must-unregister while the route does not - the divergence is the defect.

Fix: mirror the loader in the enable-route catch - unregister (and initializedPlugins.delete) or track and remove partial additions.

Source: .tmp/glm-review/deep-plugins-1015.md F-3 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
