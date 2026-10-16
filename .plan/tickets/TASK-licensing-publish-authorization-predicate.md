<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publish Authorization Predicate (Per-Caller Identity + Per-Resource Ownership)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `epic-licensing.md`
**Related:** `TASK-licensing-publish-enforcement-point.md`, `TASK-licensing-asset-license-columns-migration.md`, `src/federation/clearance.ts`, `src/routes/federation-mesh-retract.ts`, `src/routes/worlds/access.ts`, `src/nsfw/capability-gate.ts`, `epic-narrative-publishing-workflows.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The access-control half of the publish gate: a predicate answering "may THIS
caller publish THIS resource" — per-caller identity plus per-resource
ownership. Together with
`TASK-licensing-publish-enforcement-point.md` this is what actually lifts
`epic-narrative-publishing-workflows.md:177-178`; without it, "publish" is
either banned outright or checked against nobody.

## Context

**What the existing precedent lacks.**
`authorizeChatExport(database, { chatId, peerOrigin })`
(`src/federation/clearance.ts:74-80`) has **no caller-identity parameter** —
it is an outbound **consent** boundary (explicit per-chat opt-in to
replication, `:17-18`), not an access-control boundary. It is not an
unbypassable precedent for publish authorization and must not be presented as
one; a publish gate needs the caller dimension it does not have.

**COPY these patterns (verified sound):**

- IDOR-scoped write: scope the mutation to the row that was just authorized —
  filter on the STORED value, so a concurrent read-then-write rebind makes the
  predicate miss and surface as 403 rather than a silent bypass
  (`src/routes/federation-mesh-retract.ts:63-67`, with the reasoning in the
  comment at `:57-62`). The regression test that locks it in is at
  `federation-mesh.test.ts:72-76` (rebind-on-delete must surface as 403).
- Row-level access model: owner | admin | member | (public AND authenticated)
  (`src/routes/worlds/access.ts:12-15`) as the ownership-predicate shape.
- Throwing predicate that returns its verdicts so callers don't re-query:
  `assertNsfwCapability` (`src/nsfw/capability-gate.ts:96`); rating check via
  `isRatingAllowed` (`src/schemas/nsfw-rating.ts:102-107`).
- Branded verdict + required typed parameter:
  `src/federation/clearance.ts:29` + `src/federation/dek-rewrap.ts:77` — the
  publish verdict is unconstructable outside the predicate.

**AVOID:** the optional-field guard at `src/federation/fan-out.ts:168`
(`FanOutContent.chatId` optional at `:49`; an absent chatId skips clearance
entirely — `TASK-fanout-chatid-default-deny.md` tracks the fix). Caller
identity and resource id are REQUIRED parameters of this predicate; neither
may be omit-to-skip.

**Rating interaction:** an `nsfw-gated` resource must not publish above the
caller's effective limit (`isRatingAllowed`, `src/schemas/nsfw-rating.ts:102-107`)
— the flag check from `TASK-licensing-publish-enforcement-point.md` composes
with this predicate, it does not replace it.

## Acceptance Criteria

- [ ] Predicate signature carries caller identity + resource id as REQUIRED
      parameters; a missing/anonymous identity denies by default (typed reason,
      not a message match)
- [ ] Ownership checked per resource; the verdict is branded
      (`clearance.ts:29` shape) and the publishing consumer requires it as a
      typed parameter (`dek-rewrap.ts:77` shape)
- [ ] The publish mutation is scoped to the authorized row (IDOR-safe,
      `federation-mesh-retract.ts:63-67` shape) with a regression test on the
      read-then-write rebind race
- [ ] Rating gate folded in: an `nsfw-gated` resource cannot publish above the
      caller's limit (`isRatingAllowed`)
- [ ] Tests cover: non-owner, anonymous caller, admin override, rating-blocked,
      and the rebind race
- [ ] No public internet route or distribution-platform upload is added — this
      is the predicate, not the publishing surface
