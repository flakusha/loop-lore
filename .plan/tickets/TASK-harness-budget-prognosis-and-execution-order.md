<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness budget prognosis and execution order

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-harness-integration
**Tags:** harness, planning

**Summary:**

Rank all nine harness items (4 filed + 5 remaining) by urgency first,
complexity second, and fix the execution order for the next
implementation wave. Read-only analysis; the only change this ticket
makes is this filing.

**Caveats:** plan-only ticket (no src/ change); sibling owns H14/H15 doc
fixes — not re-ranked here; costs are rough (S/M/L) and assume the
Wave-0 slug enabler below is already shipped.

**Context:**

- Filed chain (fixed order): `BUG-harness-queue-claim-ignores-affected-rows-double-executes-tu.md`
  (H1) -> `BUG-harness-queue-boot-recovery-fails-other-instances-inflight-t.md`
  (H16) -> `BUG-harness-queue-per-profile-serialization-is-process-local-not.md`
  (H17). Independent: `BUG-server-second-instance-silently-splits-port-by-address-famil.md`
  (H3, epic `epic-deployment-topologies.md`).

- Remaining findings (`.tmp/research/06-next-steps-proposal.md` §2 table):
  H2 queue replays stale role snapshot (S, authz, bites single-instance
  too — `src/integrations/harness/queue.ts:213` `role: row.requested_role`);
  H4 `system_config` overrides are global rows (M —
  `src/admin/config.ts:48` `selectAll`, no instance scope); H5 permission
  queue is a process-local Map (M —
  `src/integrations/harness/permission-queue.ts:109`); H12 run records
  carry no instance id (S — `src/harness/types.ts` `HarnessRunRecord`
  has no instance field); H13 jj/pijul tickets rest on a nonexistent VCS
  seam (doc-premise rewrite, low federation impact).

- H14 (epic LSP-stdio stale line) and H15 (Radicle unreferenced) are
  sibling-owned doc fixes — excluded from this ranking, do not touch.

- Code shapes verified read-only: `queue-store.ts:107-118` claim discards
  the affected-row count while `cancelQueuedTurn` (`:166-174`) already
  shows the `numUpdatedRows` pattern to copy; `queue-store.ts:182-198`
  boot recovery is owner-blind; `queue.ts:169,192-195` per-profile lock is
  a process-local `inFlight` Map; `start.ts:244-250` binds `hostname`
  without a family pin; `HarnessRunRecord` (`types.ts:25-63`) has
  `pid`/`branch` but no instance slot.

- Enabler (already shipped, Wave 0): `resolveInstanceSlug` in
  `packages/core/src/config/state-dir.ts:119`. H4/H5/H12/H16 consume it —
  no new identity system is needed.

**Ranking (urgency first, complexity second):**

| # | item | one-line why | must land first | cost |
|---|---|---|---|---|
| 1 | H1 claim ignores affected rows | double-executed turns = duplicated model spend + side effects; head of the queue-store chain | none | M |
| 2 | H2 stale role snapshot | the only authz defect that bites single-instance (wrong role executed) | none (sequence with #5 — same file `queue.ts`) | S |
| 3 | H16 boot recovery kills peer turns | booting instance B fails instance A's live turns (data loss / double charge) | H1 (owner column written at claim) | M |
| 4 | H17 per-profile lock process-local | two instances drive one ACP profile concurrently (session corruption) | H1 + H16 (owner + cross-process claim) | M |
| 5 | H3 silent port split by family | second instance binds same port on the other family, no EADDRINUSE, no log; independent track | landed slug/port-conflict work only | M |
| 6 | H5 permission queue process-local | approvals parked in one process are invisible to the peer (human-gate integrity) | slug enabler (shipped) | M |
| 7 | H4 system_config global rows | one instance's admin toggle leaks to all instances on a shared DB | slug enabler (shipped) | M |
| 8 | H12 run records lack instance id | spend/attribution unreadable per instance; additive optional field | slug enabler (shipped) | S |
| 9 | H13 jj/pijul premise rewrite | doc-only; zero runtime impact on the harness | none | S(doc) |

**Model-capability note (mechanical = fast-worker-safe, judgment = good-worker-needed):**

- H1 mechanical — copy the `numUpdatedRows` pattern already in `cancelQueuedTurn`; two-connection test.
- H2 small but judgment — one-line area (`queue.ts:213`), but the fix chooses the authz source of truth for "current role".
- H16 judgment — schema migration + recovery scoping + orphaned-turn (dead-owner) policy.
- H17 judgment — check-and-claim atomicity and the `(profile, status)` index design.
- H3 mechanical — pin one family, log `host:port`, two-server EADDRINUSE regression test.
- H5 judgment — cross-instance approval visibility needs a design (DB-backed queue vs notify), not just a move.
- H4 judgment — per-instance scoping needs a key-taxonomy + migration decision first.
- H12 mechanical — additive optional `instanceId` on `HarnessRunRecord`, populate from slug, extend read-models.
- H13 mechanical — doc-premise edit, no code.

**Execution order (staffing for the next wave):**

File-sharing constraint: H1/H16 share `queue-store.ts`; H2/H17 share
`queue.ts`. Same-file items sequence; cross-file tracks parallelize.

1. H1 (queue-store.ts claim) — one worker; unblocks 3 + 4.
2. H2 (queue.ts dispatch role) — SMALL authz win; lands before 5 to avoid same-file collision (different function, same file — sequence, do not parallelize).
3. H16 (queue-store.ts owner column + migration) — same worker as 1, right after it.
4. H3 (start.ts bind family) — parallel with 1-3, different worker OK (mechanical).
5. H17 (queue.ts DB-backed exclusion + index) — after 1 + 3 and sequenced after 2 (same file).
6. H12 (types.ts instance id) — parallel anytime, different worker OK (mechanical).
7. H5 (permission-queue design + build) — good worker; needs slug (shipped); can start parallel with the chain but expect a design decision first.
8. H4 (system_config scoping) — good worker; after/with 7 with a shared instance-scope decision; different file from 7 so implementation can parallelize once the decision lands.
9. H13 (doc premise rewrite) — anytime, anyone, trivial.

Suggested staffing: worker A (good) runs the chain 1 -> 3 -> 5 with 2
folded in before 5; worker B (fast) runs 4 + 6 + 9 in parallel; worker C
(good) takes 7 + 8 after one shared scope-design note. Total rough cost:
6M + 2S + 1 doc-line.

**Acceptance Criteria:**

- [ ] This ticket is filed under `epic-harness-integration` with the ranking, capability note, and execution order above.
- [ ] `bun run plan:sync` shows no new fallout from this filing; `bun run plan:validate` outcome reported (pre-existing advisories are not chased).
- [ ] The filing commit touches ONLY `.plan/tickets/**` paths and is GPG-signed.
