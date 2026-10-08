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
3. **Authorization — two distinct trust boundaries, both mandatory.**

   **(a) User-facing export route.** `POST /api/federation/dek/export` is reached by a logged-in user, so it needs a *user* check, not a peer check: call `checkChatSettingsAccess(database, chatId, sessionUserId, sessionUserRole)` (`src/chat/service/access.ts:175`) before resolving clearance, mapping `forbidden` → 403. Unauthenticated → 401. Verified: `authorizeChatExport` (`src/federation/clearance.ts:74-80`) takes `(database, {chatId, peerOrigin})` and **no actor** — it proves the chat exists, is `standard`-tier, and is consented, but proves nothing about whether the caller may touch it. It is not an ownership check and must not be relied on as one.

   **(b) Mesh-facing import route.** `POST /api/federation/dek/import` is a service-to-service entry point. Reuse `authorizeMeshPeer` (`src/routes/federation-mesh.ts:44-60`), which canonicalizes the claimed origin (400 when unusable) and requires `assertTrustedPeer` to return `state === "trusted"` (403 otherwise). Note this is **peer** authorization, not user authorization — `assertTrustedPeer` (`src/federation/sharing.ts:67-79`) answers "is this origin a trusted sender", never "may this user export this chat". Do not let one substitute for the other.

   The trust boundary for (b) rests on the shared mesh PSK (unauthenticated HTTP carrying an encrypted, integrity-protected envelope from a trusted origin), which is a real boundary — but it is only as good as the `mesh_peers` row. Since ticket `TASK-bootstrap-mesh-peers-from-config-federation-peers-at-boot.md` creates those rows from config at boot, a misconfigured `federation.peers` entry grants inbound DEK import to that origin. Keep peer removal (`revokeDekExportsForPeer`) reachable so a removed peer loses access immediately rather than at next restart.
4. Keep `revokeDekExportsForPeer` reachable so defederation invalidates outstanding exports.
5. Assert in a test that the route path cannot obtain a `ChatClearance` without passing through `authorizeChatExport` — the type already enforces it; the test pins it.

**Acceptance Criteria:**

- [ ] An encrypted-tier chat federates end to end: export on sender, import on receiver, content readable on the receiver
- [ ] A chat without clearance is refused with reason `tier-not-exportable`
- [ ] No route constructs a `ChatClearance` without calling `authorizeChatExport`, asserted by a test
- [ ] `encrypted_chat_key` is never placed on the wire verbatim — the wire carries only the rewrapped artifact
- [ ] Both routes enforce `assertTrustedPeer` against the counterparty origin
- [ ] **IDOR check:** user A cannot export user B's chat DEK by supplying B's `chatId` to the export route — 403, tested explicitly with two distinct users
- [ ] The export route 401s when unauthenticated, before any clearance lookup
- [ ] The import route 403s an origin that is absent from `mesh_peers` or in any state other than `trusted`
- [ ] Authorization is enforced server-side in the route; a test that deletes the authz call and observes a 200 is treated as a failure, not a skipped case
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
