<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: business extensions: GPU relay, marketplace, voice packs, hosted worlds, creator subs

**Status:** Not Started
**Priority:** low
**Effort:** XL
**Epic:** epic-licensing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Product strategy from .tmp/research/external-brains/06-business.md (not legal advice). Self-hosted single-user RP posture is load-bearing: core chat, local inference, own-lore RAG always free; metering only the relay; raw prompts never leave the box (counters only); no ads/data-resale/paywalled privacy. Five extensions each with must-exist-first prereqs: (1) asset marketplace (rev-share; needs export-import round-trip + hash/provenance + NSFW gating + license field); (2) hosted worlds (Plausible-style tiers; needs multi-tenant auth + backup/restore + usage accounting); (3) metered GPU relay (OpenRouter/fal pass-through + margin, BYO-key bypass, prepaid credits; needs per-call cost accounting extending exec-log USD + per-user budgets + wired video provider); (4) voice packs (fixed-price à la itch.io; needs clone consent + attribution + pack format + per-character binding); (5) creator subs (recurring on hosted worlds; needs shareable links + versioned snapshots + player/GM roles). Cost anchors: image ~.003-0.135; TTS 5/1M chars; GPU video/3D 1-2 orders above image — never flat-rate GPU.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
