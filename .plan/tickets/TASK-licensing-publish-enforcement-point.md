<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publish Enforcement Point + License Gate Middleware

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `epic-licensing.md`
**Related:** `TASK-licensing-asset-license-columns-migration.md`, `TASK-licensing-publish-authorization-predicate.md`, `TASK-fanout-chatid-default-deny.md`, `epic-narrative-publishing-workflows.md`, `src/federation/clearance.ts`, `src/nsfw/capability-gate.ts`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Add `"publish"` to `EnforcementPoint` and create the missing
`src/middleware/license-gate.ts` + `src/config/license.ts`. This is the
enforcement boundary that `epic-narrative-publishing-workflows.md`'s
publishing non-goal is waiting on: without a publish-time gate there is
nothing that stops an artifact whose license flag is off — or whose NSFW
rating exceeds the viewer's limit — from becoming visible beyond its owner.

## Context

**The non-goal this lifts.** `epic-narrative-publishing-workflows.md:177-178`
bans "public publishing, share links to the public internet, upload to any
distribution platform". That ban is a substitute for enforcement that does not
exist yet. The gate built here is the substitute's replacement.

**Verified ground state:**

- `EnforcementPoint = "generation" | "render" | "storage"`
  (`src/schemas/nsfw-rating.ts:46`) — there is **no `"publish"` point in the
  type system**. Enforcement stops at storage today. The union is a plain data
  field (`NSFWRatingEnforcement.enforcement_point`, `:62`); widening it is
  non-breaking for the literal-passing consumers (`"generation"` at
  `src/middleware/nsfw-gate/consent.ts:90`, `"render"` in
  `src/schemas/nsfw-rating.test.ts:119`).
- `src/middleware/license-gate.ts` **does not exist** — zero `license*.ts`
  files anywhere under `src/`. This is the unchecked AC at
  `epic-licensing.md:54`.
- `src/config/license.ts` — the feature-flag source the epic's enforcement
  design names at `epic-licensing.md:37` — **does not exist either**. Both
  files land in this ticket.
- `src/assets/service/validate.ts` is only `validateFileSize` +
  `validateMimeType` (audio allowed at `:19-26`). Input-shape validation is not
  license policy; nothing there grows a gate.

**COPY these patterns (verified sound):**

- Branded verdict: unexported `unique symbol` + `readonly` fields + no exported
  constructor, so the only way to obtain a verdict is through the gate
  (`src/federation/clearance.ts:29`, design note at `:20-22`). The publish
  verdict is branded the same way and the consumer that acts on it takes it as
  a **required** typed parameter (`src/federation/dek-rewrap.ts:77`).
- Throwing default-deny: any missing piece (flag off, flag unknown, resource
  missing, rating over limit) throws a typed denial
  (`clearance.ts:63-66` — the `ChatClearanceError` reason enum).
- The throwing predicate shape of `assertNsfwCapability`
  (`src/nsfw/capability-gate.ts:96`) — deny with a reason, return the verdicts
  so callers don't re-query. Rating half reuses `NSFWContentRating` /
  `isRatingAllowed` (`src/schemas/nsfw-rating.ts:14-20,102-107`).
- Row-level access precedent for the ownership half:
  `src/routes/worlds/access.ts:12-15` (owner | admin | member | (public AND
  authenticated)).

**AVOID this pattern:**

- The optional-field guard at `src/federation/fan-out.ts:168`.
  `FanOutContent.chatId` is **OPTIONAL** (`:49`) and the call site is
  `if (content.chatId !== undefined)` — an absent chatId skips
  `authorizeChatExport` entirely. The invariant lives only in a doc comment
  (`:47` — "Chat content must always set this"), and `clearance.test.ts:172-184`
  positively exercises the no-chatId path as expected behavior. The publish
  gate must not inherit this shape: no optional input may be able to skip it.

**Do NOT present as precedent:**

- `authorizeChatExport(database, { chatId, peerOrigin })`
  (`clearance.ts:74-80`) has **no caller-identity parameter** — it is an
  outbound **consent** boundary (may this chat be replicated to that peer;
  opt-in recorded at `:17-18`), not an access-control boundary (may this caller
  publish this resource). A publish gate needs both dimensions; the missing
  dimension is `TASK-licensing-publish-authorization-predicate.md`.

The publish gate is also where the documented race
(`epic-licensing.md:63-64` — a flag or license read at route entry can go stale
before use) must be answered by re-checking at publish time, not by trusting
the route-entry evaluation.

## Acceptance Criteria

- [ ] `EnforcementPoint` gains `"publish"` (`src/schemas/nsfw-rating.ts:46`);
      literal-passing consumers still typecheck, and the new point is covered
      by a test
- [ ] `src/middleware/license-gate.ts` exists and is default-deny: an unknown
      or absent license flag denies (reason enum, never a message match)
- [ ] `src/config/license.ts` exists as the feature-flag source the gate reads
- [ ] The gate verdict is branded (unconstructable outside the gate —
      `clearance.ts:29` shape) and the publish consumer requires it as a typed
      parameter (`dek-rewrap.ts:77` shape)
- [ ] Publishing an `nsfw-gated` artifact re-checks the rating at publish time
      via `isRatingAllowed` — the route-entry flag evaluation is not trusted
      (`epic-licensing.md:63`)
- [ ] No optional input can skip the gate (contrast `fan-out.ts:168`); a test
      proves the unskippable shape
- [ ] One test per license gate + one per denial reason; brand
      unconstructability covered
- [ ] No public internet route, share link, or distribution-platform upload is
      added by this ticket — the gate is the precondition, not the lift
