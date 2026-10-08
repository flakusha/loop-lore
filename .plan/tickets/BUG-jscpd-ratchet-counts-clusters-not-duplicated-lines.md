<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: jscpd-ratchet-counts-clusters-not-duplicated-lines

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

The ratchet baseline tracks a raw cluster COUNT, which swings on re-pairing rather than on real duplication growth, producing false growth signals.

Measured trajectory on dev between 2026-07 and 2026-10:
  3084 -> 3084 -> 3088 -> 3154 -> 3087 -> 3090

The 3154 -> 3087 drop (-67) happened across adjacent commits with no deduplication work — clusters dissolved and re-formed against different neighbours, changing the count without any change in duplicated lines.

A baseline bump was required for net-zero real duplication change, because the metric does not distinguish more duplicated code from the same duplicated code paired differently.

Fix direction: record duplicated-LINES percentage rather than raw cluster count. A percentage does not swing on re-pairing. Most baseline churn would then never be needed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
