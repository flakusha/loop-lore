<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# NSFW Content & Mechanics Specification

> **Status:** Partially implemented — capability/gating layer shipped (epic In Review); game-mechanics coupling and the safety-research notes are design-only. Authoritative source: `src/`.

## Implemented

- 5-tier content rating + enforcement contract — `src/schemas/nsfw-rating.ts` (supersedes this spec's older 3-level safe/mature/adult model).
- Consent tracking — `src/schemas/consent.ts`; consent ledger `nsfw_consent_state` (migration 069); per-chat/user/world overrides — `src/nsfw/moderation-service/` + `src/routes/nsfw-moderation/`; age-gate weakest-link across participants — `src/middleware/nsfw-gate/consent.ts`; generation-boundary gating — `src/generation/auto-gen.ts`.
- Capability gate, PII redaction, runtime config, seduction prerequisites, social integration, telemetry id-hashing — `src/nsfw/` (+ `injection/`).

## Not implemented / aspirational

- Per-mechanic opt-in/out matrix (intimacy, seduction, body, pregnancy, fantasy = opt-out; combat, reputation = opt-in) with per-chat overrides and a user `nsfwLevel` ceiling.
- Relationship-graph coupling (intimacy gating, NSFW events as relationship deltas) — depends on the unimplemented relationships design.
- NSFW ↔ combat / social / faction / quest interactions (reputation consequences, faction taboos, gated quests and rewards).
- §5 research notes (future-facing, not behavior): verification escalation, consent lifecycle states, filter levels + hard/soft limits, emergency stop, memory redaction + TTL hygiene, metadata-only moderation, watermarked auto-expiring exports.

## Epics

- `.plan/epics/epic-nsfw-capabilities.md` — capability layer (ratings, consent, gating).
- `.plan/epics/epic-nsfw-moderation-priority.md` — post-generation enforcement/audit; `.plan/epics/epic-nsfw-game-mechanics.md` — mechanics coupling; `docs/frontend/age-gate.md` — age-gate UI.
