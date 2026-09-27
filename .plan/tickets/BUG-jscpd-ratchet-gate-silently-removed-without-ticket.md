<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: jscpd ratchet gate silently removed without ticket

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** jscpd ratchet gate silently removed without ticket
**Context:** Context: 82e2b0536 landed blocking jscpd ratchet (scripts/check/jscpd-ratchet.mjs + jscpd-baseline.json + package script); 81343b060 (09-26) deleted all three with no ticket, downgrading duplication checking to advisory trend note (check-parallel.mjs:1241-1303).
**Acceptance Criteria:** either re-land the ratchet as-is from 3961cbbe0 or close this ticket as the recorded removal decision.

## Summary

Context: 82e2b0536 landed blocking jscpd ratchet (scripts/check/jscpd-ratchet.mjs + jscpd-baseline.json + package script); 81343b060 (09-26) deleted all three with no ticket, downgrading duplication checking to advisory trend note (check-parallel.mjs:1241-1303). Severity: process. Ratchet LEVEL stays deferred per review contract — but the removal itself must be a recorded decision. Fix: either re-land the ratchet as-is from 3961cbbe0 or close this ticket as the recorded removal decision.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
