<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Expose DEK export and import over the federation wire routes

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Expose DEK export and import on the federation wire routes so an encrypted-tier chat can span instances.

**Context:**

`exportChatDekForPeer` (`src/federation/dek-rewrap.ts:73`) and `importChatDek` (`:184`) are fully implemented and covered by `dek-rewrap.test.ts`. Export requires a `ChatClearance`, a branded type only `authorizeChatExport` can construct — the brand symbol is unexported (`src/federation/clearance.ts:20-22,28-29`), so the export path is physically unbypassable by construction, not by convention. That is a genuinely good design and must survive this ticket intact.

Neither function has a wire route, so no encrypted-tier chat can cross an instance boundary. `authorizeChatExport` refuses any chat whose `encryption_level` is not `standard`, with reason `tier-not-exportable` (`clearance.ts:93-95`). The gap is plumbing, not a missing control — which is why this ticket must not weaken the clearance binding to make the route easier to write.

**Direction:**

1. Add `POST /api/federation/dek/export` taking `{ chatId, peerOrigin }`. Resolve clearance **only** via `authorizeChatExport`, then call `exportChatDekForPeer` with the peer's inbound key.
2. Add `POST /api/federation/dek/import` accepting the `RewrappedDek` artifact; call `importChatDek`.
3. Apply the same mesh authz as the existing `/api/mesh-*` routes (`src/routes/federation.ts`): the receiver must pass `assertTrustedPeer` for the sender's origin, and vice versa.
4. Keep `revokeDekExportsForPeer` reachable so defederation invalidates outstanding exports.
5. Assert in a test that the route path cannot obtain a `ChatClearance` without passing through `authorizeChatExport` — the type already enforces it; the test pins it.

**Acceptance Criteria:**

- [ ] An encrypted-tier chat federates end to end: export on sender, import on receiver, content readable on the receiver
- [ ] A chat without clearance is refused with reason `tier-not-exportable`
- [ ] No route constructs a `ChatClearance` without calling `authorizeChatExport`, asserted by a test
- [ ] `encrypted_chat_key` is never placed on the wire verbatim — the wire carries only the rewrapped artifact
- [ ] Both routes enforce `assertTrustedPeer` against the counterparty origin
- [ ] `revokeDekExportsForPeer` invalidates outstanding exports for a removed peer
- [ ] `bun run check` green

**Dependencies:**

- `TASK-add-consent-route-and-ui-to-grant-and-revoke-chat-federation.md` — clearance requires consent, which currently cannot be granted
- `TASK-bootstrap-mesh-peers-from-config-federation-peers-at-boot.md` — inbound keys are keyed by trusted sender origin
- `TASK-federation-dek-re-wrap-protocol-server-to-server-key-export.md` (Done) — designed this protocol; it shipped the service layer only

**Out of Scope:**

- Supporting `at-rest` or `none` tiers — both are structurally unexportable by design
- Forward secrecy or ratchet changes to the chat DEK itself
- Key rotation policy for peer content keys (owned by `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl.md`)
