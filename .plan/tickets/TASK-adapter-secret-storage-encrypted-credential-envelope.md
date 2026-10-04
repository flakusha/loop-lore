<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Adapter secret storage: encrypted credential envelope

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-integrations-core

**Summary:**

Adopted component: ground-up (storage) over src/crypto/ envelope primitives. Seam: src/integrations/secrets.ts (new) + src/config/sections/<family>.ts sensitive fields. Every adapter credential (SMTP/IMAP passwords, Matrix access token, XMPP password, Telegram/Discord bot tokens, Nostr private key, ActivityPub actor key) is stored encrypted at rest, resolved by reference (never raw in plugin config), and never logged. Precedent: federation.peers[].trust.ca sensitive marking in docs/spec/federation-trust-mechanism.md §2. AC: credentials encrypted at rest; config redaction in audit logs; rotation re-wraps without downtime; unit tests for envelope seal/open + redaction. Epic: epic-integrations-core.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-04 registry-driven close: git issue 0b3db58 (registry tip: d2f498694 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-ADAPTER-SECRET-STORAGE-ENCR)
