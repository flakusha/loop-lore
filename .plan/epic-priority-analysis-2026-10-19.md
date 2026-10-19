<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic priority analysis — 2026-10-19

Analysis of which epic to tackle next, conducted 2026-10-19 against the
`character-outfit-wardrobe` worktree. Read-only record; no code changes.

Scope: all epics with `Not Started` status in `.plan/epics/`, evaluated against
live `src/` and `.plan/backlog/` state.

## A. The plan cannot rank itself — three independent reasons

### A1. `epics-index.md` Tasks column is zero for nearly every epic

The `Tasks` column in `epics-index.md` is `0` for the overwhelming majority of
epics. Only ~5 rows show a non-zero count. Any mechanical rank-by-ticket-count
strategy produces an essentially flat list. The column is decorative, not
operational.

### A2. Backlog freshness lag

`backlog/priority.md` self-reports "Last updated 2026-09-10". On the review date
(2026-10-19), 13 database migrations (052–064) had landed within roughly the
preceding 2 days. The declared workstack predates substantial shipped work. The
priority tier files reflect a snapshot ~5 weeks stale.

### A3. Breadth of WIP is the actual constraint

A very large number of epics and tickets are simultaneously `In Progress`. The
project is not starved for ideas — it is starved for prioritization bandwidth.
The next epic to start is the one whose slice is smallest and most independent
of the in-flight set.

---

## B. Plan-vs-code divergences

### B1. `epic-frontend-age-gate` — status field was wrong, not the code

**Filed:** `Status: Not Started`, `Scope: TBD`, `Tickets: TBD`

**Evidence:** Backend is fully shipped and wired:

- `src/routes/v1/base-surface.ts:61` — mounts `ageGateRoutes`
- `src/server/start.ts:41` — calls `initAgeGate`
- Hot-reload wiring: `src/config/hot-apply.ts:36-39` and
  `src/config/hot-apply-consumers.ts:11,34-41`
- Schema: `users.birth_date` / `users.age_gate_accepted_at` at
  `src/db/migrations/001_init.ts:231-232`
- Typed at: `src/db/schema-core.ts:238-239`
- 8 test files under `src/age-gate/`

**Verdict:** Only the UI was absent. The epic's `Status: Not Started` field was
wrong — the backend was complete. The status metadata, not the implementation,
was the defect.

### B2. `epic-chat-product-features` — residual scope is narrower than filed

**Filed:** `Status: Not Started`

**Evidence:** Nine migrations have already landed under this umbrella:

- 013 — chat branches
- 014 — active_branch
- 032 — name-unique constraint
- 037 — federation consent
- 044 — chat_purpose
- 045 — messages idempotency
- 046 — mesh outbox
- 047 — conversation merge
- 048 — chats timeline id

Additionally: `src/crypto/key-rotation/` exists, and four integration test
files exist under the feature area. The epic has been partially executed; only
a subset of the declared scope remains unimplemented.

**Verdict:** Needs re-scoping before scheduling. The residual work
(membership-change re-key and ownership transfer) is likely a single epic
or two tickets, not the full original epic scope.

### B3. `TASK-assistant-entity-access-*` tickets reference absent adapter layer

**Claim in `**Related:**` fields:** `src/assistant/adapter/entity.ts` and
`src/assistant/adapter/duplicate.ts`

**Evidence:** `src/assistant/adapter/` does not exist in the tree. Only
`src/assistant/quality/` exists under `src/assistant/`. The adapter layer
described in the ticket `**Related:` fields is absent.

**Verdict:** Ticket file pointers describe intent, not present state. The
backlog correctly marks this as "currently-under-planning". The `src/search/`
directory is real — whether the adapter layer is wired to it is the pivotal
UNVERIFIED question (see §G).

### B4. `TASK-rag-decomposition-index-pipeline` — documents/chunks tables absent

**Claim:** `TASK-rag-decomposition-index-pipeline.md` states "documents / chunks
tables do not exist at HEAD"

**Evidence:** Confirmed across migrations 001–064. No migration creates a
`documents` or `chunks` table. The epic's `schema-needed` premise is correct.

**Verdict:** Accurate self-description. The epic's starting assumption is valid.

---

## C. Candidates that survived verification

### C1. `epic-frontend-age-gate` — highest confidence, lowest cost

**Declared priority:** P2 (from `priority-p3-p5.md`)
**Verified status:** Backend shipped; only UI absent
**Smallest viable slice:** 3 new files: one route handler, one service,
one HTML template
**Migration needed:** None
**Confidence:** High

Rationale: The backend exists and is wired. The epic is effectively a frontend
ticket, not a full epic. Fixing the status field and shipping the UI is the
cheapest real win and doubles as the proof case for the drift thesis
recommended in §F.

### C2. `epic-chat-variants-taxonomy` — medium confidence

**Declared priority:** P2
**Verified status:** Declares no migration required; `src/chat/mode-switch.ts`
and `src/views/new-chat.html` exist
**Module status:** `src/chat/` exists; no taxonomy module found (UNVERIFIED)
**Confidence:** Medium — column path and module absence not fully verified

The epic claims no migration. If that holds, the residual is a single module
with two existing wiring points. Medium confidence until the module path is
confirmed absent vs. just unvisited.

### C3. `epic-chat-product-features` — needs re-scoping

**Declared priority:** P1
**Verified status:** 9 migrations landed; residual is membership-change re-key
and ownership transfer
**Confidence:** Medium — re-scoping required before scheduling

The epic needs a ticket split: close the epic for what has landed, open a
new ticket or epic for the residual membership-change work. Cannot be
scheduled as-is.

### C4. `epic-assistant-entity-access` — pivotal question unresolved

**Declared priority:** P1 (backlog: currently-under-planning)
**Verified status:** `src/search/` is real; adapter layer absent
**Pivotal question:** Is `src/search/` wired to the rest of the stack,
or orphaned?
**Confidence:** Medium

If `src/search/` is wired, the epic is narrower than the ticket
`**Related:` fields imply. If orphaned, the epic is larger. This is the
highest-leverage open question for any agent doing prioritization work.

### C5. `epic-rag-evaluation-observability` — blocking edge is high leverage

**Declared priority:** P2
**Verified status:** Self-reports as blocking shipping of two other items
**Confidence:** Low — blocking-edge claim not independently verified

A blocking edge is high leverage: removing a blocker unblocks two other items.
But the blocking relationship was not independently confirmed.

---

## D. Explicitly NOT next

### D1. P6+ deferred waves

All carry `Status: Not Started`. Declared non-blocking for 0.1.0. Do not
advance the release. Rationale: the constraint is prioritization bandwidth,
not idea supply — adding more parallel WIP on already-deferred items is
counterproductive.

### D2. MFA / auth-channel provisioning

Blocked pending human triage. Cannot be scheduled by an automated priority
ranker.

### D3. Low / speculative set

These are explicitly speculative or infrastructure-only:

- 3D generation
- Deno support
- Desktop app
- Mobile app
- CI/CD pipeline

None are on the critical path to 0.1.0.

### D4. Perpetual maintenance epics

These epics carry `Status: Done` but also self-describe as "ongoing" or
"never fully close":

- `epic-code-quality` (code quality is a permanent concern, not a shippable
  epic)
- `epic-cross-layer-reconciliation` (infrastructure, not user-facing)
- `epic-logic-reconciliation` (same)

They should not appear in a "what to build next" ranking because they are
never "done" in the delivery sense.

---

## E. Metadata defects that corrupt mechanical ranking

These are listed separately because each one silently causes any script that
ranks work by status to produce incorrect output:

1. **One ticket carries a full sentence as its `**Status:**` value** instead of
   an enum member: `BUG-abort-hard-resets-dev-when-a-stash-pop-conflicts-…`
   The value is outside the allowed vocabulary.

2. **A large number of ticket files carry duplicate `**Status:**` lines** — line
   count in the file exceeds file count (one file, two status lines).

3. **Twelve epic files carry multiple `**Status:**` lines.** Three are genuine
   contradictions:
   - `epic-character-core-system` — "In Progress" then "Done"
   - `epic-observability-telemetry` — "Not Started" then "In Progress"
   - `epic-rpg-patterns` — "Not Started" but self-declared
     "research-only (no implementation)" — an epic with zero implementable
     tickets mis-ranks as available work

4. **`TASK-character-spec-unified-api.md`** backticks its `**Epic:` value,
   defeating bare-key linkage. Any system that resolves epic references by
   exact string match will miss this ticket.

5. **`epic-agency-story-points.md`** carries a `**Status Note:**` documenting
   that its own status field previously contradicted the shipped code — and
   was corrected. This is the correct pattern. The other epics with
   self-contradicting status fields should follow it.

---

## F. Recommended sequencing

1. **Fix `epic-frontend-age-gate` status field** and ship the UI. This is the
   cheapest epic that produces a real user-visible outcome. It also validates
   the drift thesis: if the backend is as shipped as the code shows, the
   plan is the problem, not the implementation.

2. **Re-scope `epic-chat-product-features`** into a shipped epic (close it)
   and a new residual epic for membership-change re-key + ownership transfer.

3. **Reconcile all epic status metadata** before any future ranking run. The
   three genuine status contradictions (§E.3) mean any rank-by-status script
   will mis-sort those items. The `epic-agency-story-points.md` pattern
   (`**Status Note:**` with evidence) should become the convention.

4. **Resolve the `src/search/` wired-vs-orphaned question** for
   `epic-assistant-entity-access`. This is the highest-leverage single
   verification step for the backlog.

---

## G. Method and its limits

Verification was conducted by reading migration files, source file headers,
and epic/ticket frontmatter in the `character-outfit-wardrobe` worktree. It
was partially rate-limit-truncated on the source-reading side; several
candidates therefore carry UNVERIFIED markers rather than asserted absences.

### Open questions (UNVERIFIED)

- Whether `src/search/` is wired to the rest of the stack or is orphaned
  dead code — pivotal for `epic-assistant-entity-access`
- Whether any chat ownership-transfer code exists beyond the 9 migrations
- The exact key-rotation membership-change gap (which specific code path
  is missing)
- Whether `world-lore-panel.html` is included by any view

### Scratch artifacts

Research notes from the `character-outfit-wardrobe` worktree (not this one)
used during this review:

- `.tmp/epic-inventory.md` — epic metadata dump
- `.tmp/status-dump.md` — ticket and epic status field dump
- `.tmp/backlog-dump.md` — backlog tier file dump
- `.tmp/epic-status-anom.txt` — status anomalies found across epics
- `.tmp/analyze.ts` — analysis script used
- `.tmp/verify.py` — verification script used

These files live in `tree/character-outfit-wardrobe/.tmp/` and are not
carried into this worktree.
