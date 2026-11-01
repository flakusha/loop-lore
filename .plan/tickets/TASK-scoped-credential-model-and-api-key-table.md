<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Scoped credential model and API-key table

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-principal-scoped-credentials
**Tags:** security, db
**Depends on:** `TASK-principal-kind-model-and-server-side-resolution`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Minimal credential seam per the evaluation bootstrap-token-ordering fix: an issue/verify/revoke interface plus ONE issuer; the full lifecycle stays cited as future work (RSI ticket #22). API-key table for integration clients with scoped grants — read-only / chat-write / admin for agentic consumers, repo capability scopes for repo-access consumers. One credentials seam shared by RSI bootstrap, repo-access, and agentic keys (evaluation §5 Q4 token shape OPEN, owner decision).
AC: migration follows one-ALTER-per-statement (banned-patterns.md:143-145); db:sync-types, db:sync-manifest, and schemas:check gates pass; no passphrase storage (GPG stays agent-side).
Extracted from repo-access draft task #4 per RSI-RepoAccess-EVALUATION §B2.1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Migration follows one-ALTER-per-statement; db:sync-types, db:sync-manifest, and schemas:check gates pass
- [ ] No passphrase storage (GPG stays agent-side); revocation = row deletion
