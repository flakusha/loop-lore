<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Principal + scoped credentials (shared primitive)

**Overview:** (see sections below)

**Status:** Done
**Status Note:** DONE 2026-11-11 (branch `principal-kind` over dev @ `f8c5d6fc0`; `typecheck - backend` + `lint - eslint` gates and the touched suites green under `bun test --isolate`). Task 2's scoped-token slice landed earlier via `epic-agentic-integration`; task 1's PrincipalKind model + server-side resolution (`src/middleware/principal-kind.ts` — branded closed vocabulary, actors-row mapping, fail-closed narrow; commit `eac352c0e` on dev plus this branch's centralization) and task 3's fail-closed seam (kind REQUIRED at every construction; no default-principal fallbacks at the guard, facade, or MCP entry points) are delivered. `user-worktree` is vocabulary-valid with no credential path minting it yet — its resolver is the project-spaces worktree-session binding the sibling epics consume. §DECISIONS owner questions unaffected. (Originally promoted from evaluated research `.tmp/research/EPIC-principal-scoped-credentials-DRAFT.md` per RSI-RepoAccess-EVALUATION §B2.1.)
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** principal, credentials, api-keys, auth-seam, fail-closed, security, shared-primitive
**Depends on:**
**Related Epics:** epic-harness-rsi-repo-access.md, epic-agentic-integration-mcp-acp.md, epic-auth-access.md

## Summary

Shared primitive extracted from the evaluated repo-access draft (tasks #1/#4) per RSI-RepoAccess-EVALUATION §B2.1: a server-resolved principal identity plus a scoped credential/secret model, extending the verified existing auth seam. Consumed by BOTH epic-harness-rsi-repo-access and epic-agentic-integration-mcp-acp; keeping it here avoids coupling a low-risk integration epic to the RSI security epic and avoids two epics independently migrating the credential surface.

## Trust boundary

- The principal is NEVER caller-supplied: tool params, chat context, and request bodies can never assert a principal kind — it is resolved server-side from a verified credential at ONE assertion point. AC: a param-supplied principal is ignored.
- `PrincipalKind` = `user | user-worktree | internal-service | external-agent` (renamed from draft `lolo`: the shipped CLI binary is a client identity, not the server principal). `internal-service` binds to an `actors` row with `actor_type: "system"` so audit rows FK cleanly; PrincipalKind composes with `userRole`, which remains the RBAC vocabulary.

## Credential model

- Minimal seam (evaluation MAJOR: bootstrap-token-ordering fix): issue/verify/revoke interface + ONE issuer; full lifecycle stays cited as future work (RSI ticket #22). One credentials story should cover RSI bootstrap, repo-access, and the agentic API-key table (evaluation §5 Q4 — OPEN owner decision).
- API keys: separate table for integration clients (audit + revoke), scoped (read-only / chat-write / admin as consumed by agentic-integration; repo capability scopes as consumed by repo-access).
- Fail-closed shape: a sibling of the `authenticate()` derive + `requireAuthGuard` pipeline (`elysia-app.ts:107-154`). Unknown credential = 401/403 (never a downgrade); claims verified per call; revocation = row deletion; a presented-but-invalid credential never falls back (precedent: `authenticate.ts:157-165`, `token.ts:106-110` historical bug).

## Tasks

- [x] PrincipalKind model + server-side resolution (actors-row mapping; param-supplied principal ignored) — commit `eac352c0e` added the server-resolved `principalKind` to the request context (actors-row mapping in `verifyTokenContext`; `external-agent` minted by the integration-token seam); the vocabulary slice centralized it in `src/middleware/principal-kind.ts` — the closed kind set as a branded type minted ONLY via `principalKind()` / `toPrincipalKind()` (fail-closed narrow: any string outside the set → null, never a guessed kind) + `principalKindForActor()` as the ONE actors-row mapping (`actor_type: "system"` → internal-service, every other actors evidence or no row → user). The param-supplied-principal AC stays asserted at the facade trust boundary (`registry.test.ts` adversarial-body test, `routes.test.ts` POST identity test). `user-worktree` is vocabulary-valid with no credential path minting it yet — its resolver is the project-spaces worktree-session binding the RSI/agentic lanes consume, deliberately not this task.
- [x] Scoped credential model + API-key table (issue/verify/revoke + one issuer; db:sync gates) — ADMIN-SCOPED SLICE landed on `epic-agentic-integration` (commit "feat(integrations): admin-scoped integration tokens"): migration `095_integration_tokens` (+ `IntegrationTokenScope` enum, db:sync regenerated), verification seam `src/middleware/auth/authenticate-request.ts` (sibling of `authenticate` + `requireAuthGuard`; fail-closed), `authorizeFacadeOp` now ENFORCES FacadeScope tiers (JWT users keep both tiers), token CRUD at `/api/v1/admin/integration-tokens`, per-token budget buckets (facade + governance), audit rows carry tokenId/tokenName. Deliberate refinements: revocation = row-VALUE `revoked_at` (audit trail; fail-closed identical), expiry OPTIONAL default-non-expiring (open ADR lifetime question), subject binding = ISSUING ADMIN's userId with `principalKind: "external-agent"` and `userRole: null` (closes TASK-byok-agent-subject-binding's explicit-attribution AC). OAuth-style slice (§Decision b) remains Proposed pending the ADR open questions.
- [x] Fail-closed seam extension (sibling of authenticate derive + requireAuthGuard; no-downgrade tests) — LANDED on `principal-kind`: `createRequestContext` REQUIRES the kind (the silent `?? "user"` default-principal fallback is gone — pinned by a `@ts-expect-error` compile probe in `principal-kind.test.ts`; solo, guest, token, and derive construction sites all name their kind), `requireAuthGuard` 401s an identity whose userId carries no resolved kind (deny-by-default; `require-auth-guard.test.ts` pins it), and the facade/MCP POST handlers reject a kind-less principal instead of assuming `"user"` (Elysia cannot type app-level derive fields, so the entry points enforce it at runtime). No-downgrade tests: presented-but-invalid-token 401s pinned in `authenticate.test.ts` + `integration-token.test.ts` (expired / bad-signature / revoked-session / unknown-llri_ never fall back to solo); the seam tests pin token-principal consistency (kind external-agent, issuer attribution, null userRole, credential fields).

## Non-goals

- No scope-root resolution per kind (epic-harness-rsi-repo-access).
- No capability grants on chat_branches (epic-harness-rsi-repo-access).
- No escalation/approval queue (epic-harness-rsi-repo-access).
- No MCP/ACP/facade surfaces (epic-agentic-integration-mcp-acp).
- No OAuth-style provider (evaluation §5 Q4 open).

## Dependencies

None — this is the shared primitive both sibling epics consume.

## Related Epics

`epic-harness-rsi-repo-access.md`, `epic-agentic-integration-mcp-acp.md`, `epic-auth-access.md`.

## DECISIONS (owner questions pending — RSI-RepoAccess-EVALUATION §5)

- §5 Q1 split ratification: this epic IS the recommended split (provisional until ratified).
- §5 Q2 internal-service runtime shape: OPEN (affects credential storage).
- §5 Q4 credentials story (scoped admin-issued tokens vs OAuth-style): OPEN.


git issue: e23cb34
