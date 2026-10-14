<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Character import SSRF guard matches hostname strings instead of resolved addresses

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

The private-range guard tests the URL hostname with startsWith, so it both misses and over-blocks.

Evidence read on dev:

- src/routes/character-io/import.ts:113-127 — hostname.startsWith('10.'), '172.', '192.168.', '169.254.' with no dns.lookup and no IPv6 handling.

Misses: a public hostname whose DNS record resolves to 10.x passes the guard and the fetch reaches the private address.
False positives: new URL('http://10x.example.com/').hostname === '10x.example.com' starts with '10.' and is blocked despite being a public domain.
Missing entirely: fc00::/7 and fe80::/10.

The repo already has src/utils/url-validation.ts doing CIDR-based SSRF protection (listed as a positive control in .tmp/longcat/review-assets-db-frontend.md); use it, and resolve DNS before deciding.

Source: .tmp/longcat/review-characters.md C3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
