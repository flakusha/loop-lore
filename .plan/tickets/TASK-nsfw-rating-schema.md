<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Shared NSFW Rating Schema

**Status**: done
**Priority**: high
**Labels**: schemas, nsfw, rating
**Assignee**:
**Epic**: epic-shared-schemas
**Related**: TASK-nsfw-rating-enforcement

## Summary

Unified `NSFWRatingEnforcement` / content rating TypeBox schemas shared across NSFW rating consumers.

## Status

Implemented and verified 2026-08-15. Work landed without a ticket (done during shared-schemas epic execution); ticket created retroactively for audit trail.

## Implementation

- `src/validation/schemas.ts` — `NSFWRatingEnforcement` TypeBox schema
- `src/schemas/nsfw-rating.ts` — unified NSFW rating schema module (`isRatingAllowed` + `createRatingEnforcement` canonical home)
- `src/schemas/nsfw-rating.test.ts` — unit tests (severity model, effective limit, enforcement)

## Acceptance

- [x] Unified `NSFWRatingEnforcement` defined in `src/validation/schemas.ts`
- [x] Content rating enforcement integrated — `src/schemas/nsfw-rating.ts` (canonical)

## Chat Audit 2026-08-25 — Cross-Reference

**Finding B4+B7:** Rating schema exists but chat-layer `src/chat/types/nsfw.ts` uses raw `Date` (branded/safe-type convention violation) and does not consume the `NSFWContentRating` enum — intensity is unwired end-to-end.

_Source: chat functionality audit (loop-lore), 2026-08-25. Related umbrella ticket for asset-injection feature: TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex (issue afe0589)._**B4:** Rating schema exists (`NSFWContentRating`, `src/schemas/nsfw-rating.ts`) but chat-layer `src/chat/types/nsfw.ts` + `moderation.ts` do not consume the enum — intensity is unwired end-to-end.

**B7 (reclassified 2026-08-25, NOT a defect):** original audit flagged raw `Date` in `src/chat/types/nsfw.ts` as a branded/safe-type violation. Verified: raw `Date` is idiomatic project-wide (pervasive); branded timestamps appear only at serialization boundaries (ccv3/transitions/admin-health/lora DTOs). No code change warranted — closing this sub-finding. The broader need for proper date representation (locale/region + IANA timezone, backend + frontend) is now tracked as FEAT-unified-date-representation-util-locale-region-iana-timezone (issue 7118f58, epic-i18n)._Source: chat functionality audit (loop-lore), 2026-08-25. Related umbrella ticket for asset-injection feature: TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex (issue afe0589)._
