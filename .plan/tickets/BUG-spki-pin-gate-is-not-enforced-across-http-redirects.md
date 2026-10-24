<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: SPKI pin gate is not enforced across HTTP redirects

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-federation-offload-quotas
**Tags:** security, federation

**Summary:**

fetchPeerAdvertisement (src/federation/peer-fetch.ts:45-50) passes only timeout/parseJson/handle401/tls to safeFetch; src/utils/safe-fetch/fetch.ts defines no redirect option anywhere, so the runtime default (follow) applies. The SPKI pin pre-flight covers only the original origin, so a pinned peer answering 3xx sends the fetch to a host whose pin was never verified, and the ingested advertisement comes from an unpinned origin while the operator believes the peer is pinned. Fix: pass redirect:'error' (or manual with per-hop re-verify) in fetchPeerAdvertisement/postPeerJson. Executed evidence (2026-10-04): a local Bun probe (302 -> /target) confirmed the runtime default follows redirects (status 200, body TARGET, finalUrl .../target).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-24 registry-driven close: git issue bc4950c (registry tip: 7c68e4049 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-SPKI-PIN-GATE-IS-NOT-ENFORCE)
