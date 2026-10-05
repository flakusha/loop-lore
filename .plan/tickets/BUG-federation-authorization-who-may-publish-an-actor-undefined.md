<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Federation authorization (who may publish an actor) undefined

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-activitypub-federation does not state who may publish a World or Channel as a fediverse actor. Security gap. Fix: add AC stating owner or admin plus a world-visibility precondition.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Definition (2026-10-04, p3-bugfix-2026-10-04)

The AC now exists in `FEAT-activitypub-federation.md` → Acceptance Criteria: publish
authorization = the actor's owner or an instance admin, with a world-visibility
precondition (private worlds not publishable). The authorization check itself is runtime
code that lands with that FEAT; this ticket recorded the missing definition and it is
now written down there.
