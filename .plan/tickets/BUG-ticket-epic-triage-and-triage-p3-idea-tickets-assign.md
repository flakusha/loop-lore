<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: ticket-epic-triage and triage-p3-idea-tickets assign mutually exclusive metadata to epic-npc-to-npc-social

**Status:** Blocked
**Priority:** high
**Effort:** Medium

**Summary:** Two unmerged branches assign incompatible planning metadata to the same NPC-to-NPC social-simulation entity. They cannot both land without one silently rewriting the other. This ticket records the contradiction and the reconciliation options; it does **not** choose between them.
**Acceptance Criteria:** Framing chosen by a human; `.plan/epics/epic-npc-bdi-autonomy.md` resolves to exactly one version; the contested ticket carries exactly one Status value and one deliberate epic-binding decision; indexes agree; the losing branch reduced so merging it changes nothing contested. Enumerated under the Acceptance Criteria heading below.

**Context:** Branches `ticket-epic-triage` (`8b11813dd`) and `triage-p3-idea-tickets` (`66cd9573c`) share merge-base `cf13fabb` and both independently created `.plan/epics/epic-npc-bdi-autonomy.md` and both rewrote `.plan/tickets/IDEA-epic-npc-to-npc-social-2026-09-26.md`. Neither epic exists on `dev` yet. `git merge-tree --write-tree ticket-epic-triage triage-p3-idea-tickets` reports 10 conflicted paths, including:

- `.plan/tickets/IDEA-epic-npc-to-npc-social-2026-09-26.md` — content conflict
- `.plan/epics/epic-npc-bdi-autonomy.md` — **add/add**
- `.plan/epics/epic-tool-calling-mcp.md` — add/add
- `.plan/epics-index.md` — content conflict
- `.plan/feature-matrix.md` — 5 conflicts
- `.plan/tickets/index.json` — content conflict

## The contradiction

Both branches edit the same ticket file with incompatible results.

`.plan/tickets/IDEA-epic-npc-to-npc-social-2026-09-26.md`, `**Status:**`:

| Branch | Line | Value |
| --- | --- | --- |
| `ticket-epic-triage` | line 6 | `**Status:** Not Started` |
| `triage-p3-idea-tickets` | line 6 | `**Status:** Done` |
| `dev` | line 6 | `**Status:** Not Started` |

Same file, `**Epic:**` field:

| Branch | Line | Value |
| --- | --- | --- |
| `ticket-epic-triage` | line 9 | `**Epic:** epic-npc-bdi-autonomy.md` |
| `triage-p3-idea-tickets` | — | field **absent** (removed; a `## Resolution (2026-10-01)` section is inserted at line 9 instead) |
| `dev` | — | field absent |

`git diff --numstat ticket-epic-triage triage-p3-idea-tickets -- <file>` is `13 8`. Relative to merge-base `cf13fabb`, branch A changed this file by `1 0` and branch B by `13 7`.

## Referenced epic files

| File | `ticket-epic-triage` | `triage-p3-idea-tickets` | `dev` |
| --- | --- | --- | --- |
| `.plan/epics/epic-npc-bdi-autonomy.md` | **exists** (2607 bytes, 65 lines) | **exists** (6176 bytes) | absent |
| `.plan/epics/epic-npc-to-npc-social.md` | absent | **exists** | absent |

**Correction to the original report:** the report stated `epic-npc-bdi-autonomy.md` "does not exist on `ticket-epic-triage`". It does exist — it was created there by `55f555cd1` ("chore(plan): link orphan tickets to epics, add 4 epics"). It is a complete epic, not a stub: it carries Summary, Scope, Tasks, Acceptance Criteria, and a `## Linked Tickets` table whose row 11 is `` `IDEA-epic-npc-to-npc-social-2026-09-26.md` ``. The two branches' copies are **not** the same file: they are an **add/add** pair with different titles (`# EPIC: NPC BDI Autonomy — Character-Level Goal-Pursuit and Between-Session Continuity` on A vs `# EPIC: Character-Level Goal-Pursuit & Between-Session Continuity` on B) and different section sets (A has `## Linked Tickets`; B has `## Rationale` / `## Open Questions` / `## Dependencies` and no `## Linked Tickets`).

## Index and matrix divergence

`.plan/epics-index.md` (neither epic is present on `dev`):

- `ticket-epic-triage` line 249: `| Not Started | NPC BDI Autonomy — Character-Level Goal-Pursuit and Between-Session Continuity | Medium | Large | 13 | `epic-npc-bdi-autonomy.md` |` — **no** `epic-npc-to-npc-social` row.
- `triage-p3-idea-tickets` line 44: `| Not Started | Autonomous NPC-to-NPC Social Simulation | Medium | Medium | 13 | `epic-npc-to-npc-social.md` |` and line 61 `| Not Started | Character-Level Goal-Pursuit & Between-Session Continuity | Medium | Large | 13 | `epic-npc-bdi-autonomy.md` |`.

`.plan/feature-matrix.md`:

- `ticket-epic-triage` line 1838: `| epic-npc-bdi-autonomy.md | 1 | 0 | 0 | 1 | 0 | 0 | 0 |` and line 3845 `` - `epic-npc-bdi-autonomy.md` (1): FEAT-2026-028 ``. No `npc-to-npc-social` row.
- `triage-p3-idea-tickets`: **no** rows for either epic (its matrix lists 806 `epic-` rows vs A's 912). The matrix gate reports OK on both branches, so this asymmetry is unvalidated bookkeeping drift.

## Would `plan:validate` catch it?

Partly. Established empirically in the `chore-file-epic-binding-ticket` worktree.

**Caught (error-level).** The `linkage` gate fails hard when a `**Epic:**` field points at a file that does not exist (`giwt/src/plan/validate.ts` lines 229-235). Deleting `.plan/epics/epic-npc-bdi-autonomy.md` while keeping A's ticket binding produced:

```
✗ linkage      FAIL (1 error(s), 1 warning(s))
  ✗ IDEA-epic-npc-to-npc-social-2026-09-26.md: **Epic:** references non-existent file epic-npc-bdi-autonomy.md
```

**Not caught (warn-level, by design).** With the epic file present, A's binding validates clean (`✓ linkage OK`). But a ticket with **no** `**Epic:**` field is only an aggregated advisory (`validate.ts` lines 241-249): `⚠ 1255 ticket(s) not bound to an epic (advisory)`. The source comment at lines 238-240 states this is intentional. So B's removal of the `Epic:` field costs nothing at gate level — **nothing detects that B silently deleted A's binding**, and nothing detects that A's binding asserts a parent relationship that B denies. `status-vocab` accepts both `Not Started` and `Done`, so the status contradiction is likewise invisible.

**Net:** the *mechanical* breakage (dangling filename) is gated. The *semantic* contradiction (same entity, two incompatible parents/statuses) is not. It can only be caught by a human reconciling before either branch lands.

## The two framings

**Framing 1 — Sibling-of-BDI (`ticket-epic-triage`):** the social simulation is a child of `epic-npc-bdi-autonomy`, sharing its BDI machinery, status `Not Started`. The ticket's own Open Questions already say the dependency chain is "traits → BDI (separate epic) → relationships", and both branches' epics agree the social runtime *consumes* BDI triggers. Cost: the status asserts the work is open, and A's bdi epic file is an add/add that must be reconciled with B's longer copy.

**Framing 2 — Standalone (`triage-p3-idea-tickets`):** it is its own top-level epic, already `Done`, no parent. B's `## Resolution (2026-10-01)` states the ticket is `Done` "on the strength of that promotion" — i.e. `Done` means *the proposal was promoted to an epic*, not *the code shipped*. The promoted epic file itself is `**Status:** Not Started`, so the ticket-level `Done` and the epic-level `Not Started` describe different things. Cost: the BDI dependency survives only as prose in `**Related:**` and a `## Dependencies`-style bullet, with no machine-checkable parent edge.

**Trade-off, stated honestly:** Framing 1 records a machine-checkable parent but points it at a file that is itself contested (add/add). Framing 2 makes the promotion explicit and adds a real epic file, but drops the parent edge entirely — the BDI dependency becomes unenforced documentation, and the `Done` status is ambiguous between "promoted" and "shipped". Neither framing is clearly correct under repo convention: the `linkage` gate only validates that a named file exists, never that the relationship is semantically right, and `.plan/` has no convention requiring every derived epic to declare a parent.

## Acceptance Criteria

- [ ] One of the two framings is chosen by a human, recorded here with rationale.
- [ ] `.plan/epics/epic-npc-bdi-autonomy.md` resolves to exactly one version (A's 65-line form or B's 6176-byte form) — the add/add pair cannot survive.
- [ ] `.plan/tickets/IDEA-epic-npc-to-npc-social-2026-09-26.md` has exactly one `**Status:**` and either one `**Epic:**` or a documented deliberate absence.
- [ ] `.plan/epics-index.md` and `.plan/feature-matrix.md` both reflect the chosen framing, with no orphaned epic rows.
- [ ] The losing branch is reduced so that merging it changes nothing contested.

## Reconciliation path

**Which branch wins:** `triage-p3-idea-tickets`, but only after its bdi epic file is reconciled — it carries both epics, the `## Resolution` rationale, and the corrected `epic-relationships.md` references (B's `999770d58` fixed `epic-character-relationships.md` → `epic-relationships.md`, a rename A never picked up, so A's file references a name that does not exist anywhere).

**What the loser must be reduced to:** `ticket-epic-triage` should be **discarded, not rebased**. Its unique contribution is the `**Epic:**` binding pass over orphan tickets, which is a separate concern from this epic conflict and worth re-landing on its own after the conflict is settled. Rebasing it would drag the contested bdi epic file and the contested status through a second conflict resolution for no gain.

**Observable completion state:**

1. `git merge-base --is-ancestor triage-p3-idea-tickets dev` returns 0.
2. `git show dev:.plan/tickets/IDEA-epic-npc-to-npc-social-2026-09-26.md | grep -c '^\*\*Status:\*\*'` returns 1.
3. `git show dev:.plan/epics/epic-npc-bdi-autonomy.md` succeeds, and `git log --diff-filter=A dev -- .plan/epics/epic-npc-bdi-autonomy.md` lists exactly ONE introducing commit. Scoping to `dev` (not `--all`) is required: run against `--all` it currently prints two commits (`55f555cd1` and `fa40bfd06`), one from each branch, and would not prove the add/add pair was resolved.
4. `bun run plan:validate --gates linkage,backlog,matrix` on `dev` is clean, **and** the contested ticket is no longer listed in the `ticket(s) not bound to an epic` advisory (check by grepping the advisory output for the ticket name — do NOT rely on the total count, which stays at 1256 whether or not this ticket is counted).

## Notes

- Pre-existing on `dev`, unrelated to this conflict: the `linkage` advisory reporting 1256 unbound tickets, and `feature-matrix.md` lacking rows for epics that do not exist on `dev`.
- No gate run in this investigation used `--fix`, `giwt sync`, `plan:sync:fix`, or any mutating operation. The only temporary edit to this worktree (a probe of the linkage gate against A's content) was reverted; `git status --porcelain` is clean.
- Filing this ticket makes the `tickets` and `code-map` gates fail on this branch with "ticket index out of sync" and "code-map.json is stale". Both are caused solely by this file being absent from `.plan/tickets/index.json`. Verified by control: removing this file and re-running `--gates tickets,code-map` returns `✓ tickets OK / ✓ code-map OK`, so both are green on `dev`. The documented remedy is `giwt sync --fix --import` after staging, which was out of scope for this task; whoever finalizes this branch should run it before the gates.
