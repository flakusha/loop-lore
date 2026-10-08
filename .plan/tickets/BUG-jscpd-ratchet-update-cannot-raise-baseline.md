<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: jscpd-ratchet-update-cannot-raise-baseline

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

bun run jscpd:ratchet --update cannot perform a baseline raise, so the documented recovery for a growth failure is unreachable.

- scripts/check/jscpd-ratchet.mjs:68 refuses any update where clones >= baseline (update only lowers)
- scripts/check/jscpd-ratchet.mjs:83 fails when clones > baseline

Net effect: the gate can lower its baseline but never raise it. When clone count legitimately exceeds the baseline, the only sanctioned command is refused and the operator must hand-edit scripts/check/jscpd-baseline.json.

Observed 2026-10-08: baseline 3084 vs 3090 clones. The sanctioned --update exited 1; the bump was applied by hand and recorded as such in commit 438da958a.

Fix direction: add a guarded --raise (explicit, audited, distinct from --update), or correct the AGENTS.md guidance so it does not prescribe --update for a growth condition.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
