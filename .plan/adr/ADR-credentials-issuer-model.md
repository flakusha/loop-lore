<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# ADR: Credentials issuer model (dual issuer — admin-scoped tokens + OAuth-style BYOK)

**Status:** Proposed
**Date:** 2026-11-05
**Decides:** epic-principal-scoped-credentials §5 Q4 (and the same §5 Q4 amendment in epic-agentic-integration-mcp-acp)
**Ticket:** TASK-credentials-story-decision-record
**Related:** epic-principal-scoped-credentials.md, epic-agentic-integration-mcp-acp.md, epic-harness-rsi-repo-access.md, matrix-authentication-channels.md (AC8)

## Context

Both sibling epics carried §5 Q4 — "credentials story (scoped admin-issued tokens vs OAuth-style)" — as an OPEN owner decision (epic-principal-scoped-credentials §DECISIONS; epic-agentic-integration-mcp-acp §DECISIONS), and each declares the shared credentials epic as its single dependency. Resolving it unblocks all seven downstream implementation tickets.

Two distinct access scenarios must be served by one credentials story:

| Scenario | Who holds the key | What it authorizes |
| -------- | ----------------- | ------------------ |
| Server-provided capability | The instance (admin) | Agentic/facade work against THIS server — chat, generation, remaining domains — by integration clients (external agents, MCP/ACP callers) |
| Personal BYOK | The USER (their own provider keys) | The user's own personal use of the platform with their own keys — the base case |

Research findings (2026-11-05 credential research pass, recorded in the ticket):

- BYOK needs agent-key→subject binding — a presented integration credential must resolve to a principal without ever exposing the underlying provider key.
- Federation needs instance-issued work tokens and a peer principal (matrix-authentication-channels AC8: human-identity federation is absent everywhere; swarm/mesh nodes never become auth authorities; auth decisions are local-server only; OIDC RP is the single external-assertion path).
- Design constraints already fixed by the shared-principal epic: ONE issuer, ONE credential table, tier vocabulary = FacadeScope (`"read" | "chat-write"` today, extendable), and a fail-closed verification seam that is a sibling of `authenticate` + `requireAuthGuard`.
- Existing posture to respect (unchanged): `src/integrations/harness/isolation-gate.ts` binds one allowed harness execution to exactly ONE `userId` — subscriptions are never shared across users; `src/integrations/harness/provider-tos.ts` marks subscription-backed harness flavors as the ToS grayzone (explicit acknowledgement required) and keeps local/api profiles ungated; the branch credential-policy header in `src/integrations/loop-lore-facade/authz.ts` (epic-agentic-integration) states admin/subscribed harness API keys are LOCKED and defers BYOK/federation scenarios to exactly this decision.

## Decision

**DUAL ISSUER SUPPORT** (owner decision, recorded verbatim-fidel):

a) **ADMIN-SCOPED TOKENS** — for **NON-SUBSCRIPTION-BASED** access (server-provided capability). The admin mints scoped integration tokens (tier vocabulary = FacadeScope: `"read" | "chat-write"`), revocable by row deletion, audited per call.

b) **OAUTH-STYLE** — for users who BYOK their own personal keys. Personal use is the **BASE** case. Sharing personal keys with others is **OPT-IN and QUOTAED** — the sharer grants a quota; consumers draw against it.

Exact semantics of opt-in quota sharing:

- The SHARER sets the quota. A user sharing their personal key decides the budget others may consume; there is no server-side default share.
- Consumers DRAW against that quota — each consumer's usage decrements the sharer-granted budget, never an unbounded draw on the sharer's key.
- The sharer is REVOCABLE — sharing is the sharer's grant: they (or the row's deletion) end it at any time, fail-closed like any other revocation.

Structural commitments (fixed by the shared-principal epic, unchanged here):

- ONE issuing seam: one credential table, conceptually split by issuer kind (admin-issued integration token vs user-owned OAuth-style/BYOK grant). One issue/verify/revoke interface; issuer kind is data, not a second code path.
- FacadeScope is THE tier vocabulary (`FacadeScope = "read" | "chat-write"`, branch `src/integrations/loop-lore-facade/types.ts:20`; extendable). It becomes an enforced key-tier check at the verification seam.
- Fail-closed verification seam: a sibling of the `authenticate()` derive + `requireAuthGuard` pipeline. Unknown or revoked credential = 401/403, never a downgrade; claims verified per call; revocation = row deletion; a presented-but-invalid credential never falls back.
- Audit rows carry `principalKind` + scope on every credential-bearing call.

**HARD CONSTRAINT (unchanged, already encoded):** admin/SUBSCRIPTION harness API keys are locked forever — ToS: 1 subscription = 1 person. No credential backed by a subscription harness key is ever MINTED, SHARED, or PROXIED. Encoded today at `src/integrations/harness/isolation-gate.ts` (one execution = one principal), `src/integrations/harness/provider-tos.ts` (subscription-backed usage class + acknowledgement gating), and the branch credential-policy header in `src/integrations/loop-lore-facade/authz.ts` (epic-agentic-integration).

**Federation note (AC8):** instance-issued tokens authorize WORK, never IDENTITY. Federated/peer instances receive instance-issued work tokens plus a peer principal for delegation of tasks; they never assert or carry human identity, and mesh transports never become auth authorities.

## Consequences

- Positive: unblocks all seven implementation tickets across epic-principal-scoped-credentials, epic-agentic-integration-mcp-acp, and epic-harness-rsi-repo-access with a single credentials story.
- Positive: personal BYOK stays the base case — no user is forced into any sharing arrangement; sharing exists only as an explicit, bounded, revocable grant.
- Positive: the subscription-key hard constraint needs no new enforcement surface — the existing isolation gate, ToS matrix, and credential-policy header already deny it; the credential layer simply never mints such a credential.
- Positive: one table + one verify path keeps lifecycle (issue/verify/revoke/audit) in exactly one seam, with issuer kind as a column — no second auth machinery.
- Cost: quota sharing needs draw-down accounting (a consumption ledger against sharer-granted quotas) — new bookkeeping beyond plain row revocation.
- Cost: BYOK agent-key→subject binding must be designed so the platform stores provider keys without ever re-exposing them to consumers.
- Deferred: the OAuth-style slice waits on the open questions below; the admin-scoped-token slice is fully specified by this ADR and can land first.

## Rejected alternatives

- Subscription-key sharing — minting, sharing, or proxying any credential backed by an admin/subscription harness key. Rejected: violates provider ToS (1 subscription = 1 person); locked forever as a hard constraint.
- Single-issuer-only (admin-issued tokens as the only credential kind) — rejected: it breaks the BYOK base case by forcing users to hand personal keys to the admin for minting, and it has no model for bounded, revocable personal-key sharing (a raw shared secret would be neither opt-in-quotaed nor individually revocable).

## Open questions

- OAuth provider choice detail: self-hosted authorization server vs trusted external IdP (the issuer-kind split works under either; only the token-minting mechanics differ).
- Token lifetime (and any refresh/rotation policy for both issuer kinds).
- Quota accounting mechanics for the opt-in sharing ledger (reset period, overflow behavior — deny vs degrade — when a quota is exhausted).
