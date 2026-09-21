<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Shared Schemas — Reputation, Consent, NSFW Content Rating

> **Status:** Complete (implementation + tests verified per epic, 2026-08-15). The epic is canonical; this spec is a pointer.

## Implemented

- `ReputationScore` — −100…+100, tiers hostile → devoted, modifiers, decay — `src/schemas/reputation.ts`.
- `ConsentState` — consent_given/aware/scope + audit trail — `src/schemas/consent.ts` (this spec's old "aspirational" gap note is stale — the file exists).
- `NSFWContentRating` — 5-tier enum + enforcement contract (effective limit = min of character/user/chat; generation/render/storage checkpoints) — `src/schemas/nsfw-rating.ts`.
- Consumers: NSFW gating `src/nsfw/`, generation boundary `src/generation/auto-gen.ts`, age-gate weakest-link `src/middleware/nsfw-gate/consent.ts`, consent ledger `nsfw_consent_state` (migration 069).

## Epics

- `.plan/epics/epic-shared-schemas.md` — full schema definitions, integration/migration plans, cross-system events.
- Related: `.plan/epics/epic-nsfw-capabilities.md`, `.plan/epics/epic-faction-reputation.md` (faction standing; the all-TBD faction stub folded into this spec was dropped — it contained only placeholders).
