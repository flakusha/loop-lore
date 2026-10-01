<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Cross-instance conversation threading (Mention, inReplyTo)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Postponed
**Priority:** medium
**Effort:** Medium

## Summary

Extension: FEAT-activitypub-federation names only Create or Announce; cross-instance Mention and inReplyTo resolution is missing, needed for real fediverse UX. Add threading AC and a mention-resolution helper.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Resolution

Postponed — no implementation. Investigation confirmed there is no ActivityPub
implementation in this repository to extend, so `Mention` and `inReplyTo` resolution has
nothing to attach to.

The parent FEAT is unimplemented: `FEAT-activitypub-federation.md:6` is `**Status:** Not
Started` and its own Current State section states "No ActivityPub code, schema, or ticket
exists."

`src/federation/` is a naming collision, not the ActivityPub host code:

- `ContentEnvelope` is a sealed blob — `{id, origin, clock, type, hash, size, ciphertext}`
  with AES-GCM ciphertext (`src/federation/envelope.ts:13`,
  `src/federation/envelope.ts:71`) — not an AS2 activity object. No `@context` and no AP
  type vocabulary exist anywhere in `src/federation/`.
- The only HTTP surface is two PSK-gated mesh endpoints, `POST /api/mesh-reserve`
  (`src/routes/federation-mesh.ts:46`) and `POST /api/mesh-deliver`
  (`src/routes/federation-mesh.ts:121`), plus NodeInfo discovery
  (`src/routes/federation.ts:59`, `src/routes/federation.ts:80`,
  `src/routes/federation.ts:105`). There is no inbox, no outbox, no `OrderedCollection`.

Absent prerequisites (each verified by search, not assumption):

- No Fedify or equivalent AP library in `package.json`.
- No HTTP-signature verification module; the sole mention of HTTP Signatures in `src/` is
  a comment at `src/crypto/activitypub-keys.ts:13`.
- No WebFinger or actor-document resolution, and no `federated_identities` / `ap_id` /
  `actor_uri` mapping table. `BUG-federation-identity-mapping-to-local-users-undefined`
  tracks this and states it blocks all federation.
- The only AP-named schema is `activitypub_actor_keys`
  (`src/db/schema-manifest.ts:968`, `src/db/migrations/001_init.ts:793`) — key storage
  with no reader in any live code path, not the protocol.

Why no test was written: the security-relevant case this ticket implies — a remote actor
attaching a thread to a local conversation must be rejected — has no inbox, no verifier,
and no ownership model to assert against. Any such test would assert against machinery
invented for the test, which proves nothing.

Where the local thread tree will come from: `blog_comments.parent_comment_id`
(`src/db/schema-blog.ts:17`), owned by
`FEAT-federate-blog-system-via-activitypub-lemmy-mastodon-reddit`, which is itself blocked
on the blog-system FEAT.

Reopen when the dependency chain closes: `FEAT-activitypub-federation` first, then
`BUG-federation-identity-mapping-to-local-users-undefined`. The full chain is documented
in `FEAT-activitypub-federation.md`.
