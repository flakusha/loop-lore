<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: NSFW Capabilities — Ratings, Consent & Gating

**Status:** ✅ In Review (Gating & Preferences + Consent cluster landed on dev via commit `49731047`)
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** nsfw, capabilities, rating, consent, age-gate, gating
**Epic:** epic-chat-lifecycle-moderation

## Summary

Defines what NSFW content the system can produce and allow: content ratings (`NSFWContentRating`), consent state, age gate, generation-boundary gating, and user preferences/allow-lists. This is the **capability layer** — it declares and wires what is permitted before/during generation. Enforcement, auditing, and moderation after or around generation live in the sibling epic `epic-nsfw-moderation-priority.md`.

Split from `epic-nsfw-moderation-priority.md` (which was triple-duplicated and overloaded across two domains) to separate NSFW capabilities from NSFW moderation.

## Linked Epics

- `epic-nsfw-moderation-priority.md` (moderation/enforcement — sibling epic)
- `epic-character-core-system.md` (NSFW content rating)
- `epic-chat-lifecycle-moderation.md` (safety infrastructure)
- `epic-frontend-age-gate.md` (age gate UI)

## Tasks

### Content Ratings & Consent

- [x] NSFW content rating enforcement (5-tier from Character Core) — `ContentRating` enum + TypeBox schema
- [x] Consent state tracking (from TASK-shared-schemas) — `ConsentState` TypeBox schema
- [x] Integration with generation boundary (LLM request filtering) — wired at `src/generation/auto-gen.ts:412`

### Gating & Preferences
- [x] NSFW enable/disable at per-chat, per-user, per-world level — `setChatNsfwOverride` / `setWorldNsfwOverride` in `src/nsfw/moderation-service/overrides.ts`; routes in `src/routes/nsfw-moderation/overrides.ts` (commit `49731047`, git issue `94f9a36`)
- [x] Age gate enforcement for NSFW content access — weakest-link intersect across participants in `src/middleware/nsfw-gate/consent.ts`; regression test `consent.test.ts` "weakest link: participant without age gate blocks chat access" (commit `49731047`, git issue `f89168b`)
- [x] User preferences / allow-lists for permitted NSFW intensity — `getEffectiveNsfw` walks shadow_ban → chat override → world override → user pref (fail-closed, git issue `da08f1b`); persisted consent ledger in `nsfw_consent_state` (migration 069, `consent-ledger.ts`, git issue `4f8aeb2`)

## Open Items

- **B4 (Chat Audit 2026-08-25):** 5-tier `NSFWContentRating` (`src/schemas/nsfw-rating.ts`) not referenced by `src/chat/types/nsfw.ts`/`src/chat/types/moderation.ts`; intensity unwired to enforcement. See TASK-nsfw-rating-enforcement, TASK-nsfw-rating-schema.

## Cross-System Events

| Event         | Direction | Purpose                                 |
| ------------- | --------- | --------------------------------------- |
| `nsfw.toggle` | emits     | Enable/disable NSFW for chat/user/world |

## Bridge points

- Capability state (rating tier, consent state, per-chat/user/world toggles, prefs/allow-lists) feeds gate decisions consumed by `epic-nsfw-moderation-priority.md`.
- Gate decisions made here are audited and enforced post-generation by the moderation epic (audit log, flagging, block/ban).
