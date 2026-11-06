<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: federation-instance-issued-scoped-tokens

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-instance-federation

**Summary:**

Head-issued, revocable, FacadeScope-tiered credentials that a member instance presents to the head's facade/MCP surface. Research findings (2026-11-05 credential pass): the facade is per-process (`[branch epic-agentic-integration] src/integrations/loop-lore-facade/instance.ts:23-42`); a member calling the head's facade gets a scoped key with row-deletion revocation (per `epic-principal-scoped-credentials.md:29-30`), `principalKind: "external-agent"` with the instance identity in the new credential table's subject column, consuming `FacadeScope` tiers ("read" | "chat-write", [branch] `types.ts:20,48-65`) and per-key rate policies. These tokens authorize WORK only and never assert user identity — AC8 of `matrix-authentication-channels.md:30`: "mesh/swarm nodes must not become auth authorities"; a member user talking to the head authenticates as themselves via the head's own auth (`epic-instance-federation.md:27`). Seal any new instance-issued secret encrypted at rest with a `key_version` column, no plaintext column — but coordinate with federation-peer-token-key-domain on the key domain.

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Acceptance Criteria:**

- [ ] Head can issue/revoke (row deletion) FacadeScope-tiered credentials per member instance
- [ ] Tokens authorize work only; never usable to assert a member user's identity (AC8)
- [ ] Fail-closed verification middleware sibling of `authenticate`/`requireAuthGuard`; per-key rate policies and audit rows

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
