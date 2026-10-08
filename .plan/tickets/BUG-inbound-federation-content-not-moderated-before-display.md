<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Inbound federation content not moderated before display

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Wontfix
**Priority:** high
**Effort:** Medium

## Summary

FEAT-activitypub-federation routes outbound through the NSFW or moderation gate but inbound only supports blocklists or defederation, with no gating before display. Safety gap. Fix: add AC that inbound Create or Announce pass the existing moderation service before persistence or display; define blocklist effect on already-delivered objects. Reuse the existing moderation service.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Resolution

REFUTED — there is no inbound content to moderate. `receiveDelivery`
(`src/federation/delivery.ts:40`) calls `openEnvelope(envelope, cipher,)` and
DISCARDS the return value; the decrypted plaintext is never bound to a name,
and it is not read after that line.

`mesh_deliveries` has five metadata columns and no payload column
(`src/db/migrations/001_init.ts:3753-3760`): `content_id`, `origin`,
`content_hash`, `clock`, `received_at`. Its only reader selects
`clock`/`content_hash` for staleness comparison
(`src/federation/delivery.ts:43`). Nothing anywhere reads or displays inbound
decrypted content, so "moderate before display" has no content to act on.

This is a FEATURE, not a missing control. Delivering it requires prerequisites
that do not exist yet: a payload column on `mesh_deliveries`, an identity to
attribute the content to, and a display surface. The ticket's "reuse the
existing moderation service" premise is also wrong — `src/chat/moderation.ts` is
a participant-action module (`applyBan`, `applyKick`, `applyMute`, `applyFlag`,
`isBlocked`, `isBanned`), not a content classifier. The only content classifier
is `callAux({ task: "moderation" })` (`src/aux-pipeline/runner.ts:50`), which
would need to be wired into a receive path that does not yet exist.

Wontfix: recording the real work as a federation FEAT is the right home for
this, not a BUG closure.
