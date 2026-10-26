<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Signal bridge activation trigger undefined

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** Verified 2026-10-26: FEAT-messaging-bridge-extensions.md now defines the activation mechanism (SWARM_BRIDGE_SIGNAL=0|1 flag, :41) and documents Signal as deferred/experimental (:16,33) — the trigger-or-permanent-deferral ask is satisfied at spec level.
**Priority:** low
**Effort:** Medium
**Epic:** epic-federation-swarm-sync

## Summary

FEAT-messaging-bridge-extensions defers Signal behind a feature flag but defines no go or no-go activation criterion. Gap. Fix: specify the activation trigger or permanent deferral.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 3ba1095 (registry tip: ccfbdea22 Konstantin Fedotov Close issue)
