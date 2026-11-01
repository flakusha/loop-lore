<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# `.plan/` — In-Repository Planning

Spec-driven planning system. Specs live in `.plan/`, active tracking via `git issue`.

## Directory Structure

| Folder                | Purpose |
| --------------------- | ------- |
| `tickets/`            | Task specs (authoring, review, iteration) |
| `epics/`              | Epic definitions (major initiatives, includes merged design/roadmaps/ideas/research/features) |
| `epics-index.md`      | Epic registry index (generated; `giwt plan gen-docs`); replaces the retired `.plan/epics.md` snapshot |
| `priority-matrix.md`  | Generated priority × status view (`bun run plan:priority`; advisory `plan - priority` freshness gate) |
| `backlog-archive.md`  | Historical archive of the dropped hand-maintained backlog tier files (2026-11-01) |

## Backlog tier files (dropped 2026-11-01)

The hand-maintained backlog tier files (`priority*.md`, `open*.md`,
`security-review-2026-08-25.md`, …) were removed: they duplicated ticket/epic
metadata in a second, manual shape and had drifted from the ticket index.
Historical content is preserved verbatim in
[`backlog-archive.md`](./backlog-archive.md).

- **Status** — `.plan/tickets/index.json` (synced with git issues by
  `bun run plan:sync`; validated by `plan - validate`).
- **Priority** — ticket `**Priority:**` frontmatter + epic `**Priority:**`;
  the generated view is [`priority-matrix.md`](./priority-matrix.md)
  (`bun run plan:priority`, freshness `bun run plan:priority:check`, advisory
  `plan - priority` gate). It reads the ticket index through the same pinned
  giwt machinery as `plan:matrix`, so it cannot drift from the index format.

## Ticket Priority (`/find-work` contract)

`/find-work` (omp-plugins) resolves a ticket's priority via a two-step chain:

1. **Explicit label** — frontmatter `labels:` or a `**Labels:**`/`**Tags:**` header
   line carrying `p0`–`p6`, `priority: pN`, or a severity word
   (`critical`/`blocker`→P0, `high`/`urgent`→P1, `medium`/`normal`→P2,
   `low`/`minor`/`trivial`→P3).
2. **Default** — otherwise `P3`.

**Priority ordering input (2026-11-01):** the backlog tier files were dropped.
Set the ticket's own `**Priority:**` frontmatter (`High`, `P1 — Critical`, … —
the ticket-index canon): `bun run plan:priority` projects ticket + epic
priorities into `.plan/priority-matrix.md`, the generated priority × status
view. Add an explicit `pN`/severity label when you need `/find-work` itself to
rank a ticket above the `P3` default (e.g. a hotfix).

> Until 2026-11-01 a middle step resolved priority from `backlog/priority-*.md`
> tier placement when no label carried one; that resolver is gone with the tier
> files (archived in [`backlog-archive.md`](./backlog-archive.md)).

## Git Issue Integration

Git issues track active work. Each issue references its spec:

- **Spec source**: `.plan/tickets/<name>.md`
- **Git issue**: Active tracking, status updates, comments
- **Link**: Comment contains `Plan spec: .plan/tickets/<name>.md`

### Workflow

1. **Author spec** in `.plan/tickets/` (markdown, detailed)
2. **Create git issue** when work begins (references spec)
3. **Update** via `git issue comment` or `git issue state`
4. **Close** git issue when done; spec remains for reference

### Commands

```bash
# List open issues
bun node_modules/giwt/src/cli.ts issues

# Show issue details
bun node_modules/giwt/src/cli.ts show TASK-023

# Add comment (e.g., plan reference)
bun node_modules/giwt/src/cli.ts comment TASK-023 -m "Plan spec: .plan/tickets/TASK-3d-view-modes.md"

# Change state (open/closed)
bun node_modules/giwt/src/cli.ts state TASK-023 closed
```

## Ticket Naming

| Type  | Prefix | Use for                          |
| ----- | ------ | -------------------------------- |
| TASK- | TASK-  | Small tasks, implementation work |
| FEAT- | FEAT-  | Feature requests                 |
| BUG-  | BUG-   | Bug reports                      |
| FIX-  | FIX-   | Non-bug fixes                    |
| IDEA- | IDEA-  | Research/experimental ideas      |
| SOL-  | SOL-   | Architectural solutions          |
| EPIC- | EPIC-  | Major epics (matches `epics/`)   |

## Integration Matrices

Cross-system integration tracking lives in top-level `matrix-*` files at `.plan/`
root — one file per domain scope:

| File | Scope | Companion epic |
| ---- | ----- | -------------- |
| `matrix-cross-mechanics.md` | RPG sub-system cross-mechanics gaps (G1–G42) + standardized `## Integration Points` template | (many RPG epics) |
| `matrix-federation-swarm.md` | Fediverse, messaging bridges, swarm CRDT sync — feature evaluation + integration points | `epic-federation-swarm-sync.md` |
| `matrix-precompiled-hot-binaries.md` | Native hot binary module integration points | `epic-precompiled-hot-binaries.md` |
| `matrix-story-coherence.md` | Story-coherence pipeline — pairwise integration gaps SC1–SC10 + shared contracts across the five coherence epics | `epic-perspective-narration-voice.md` +4 |
| `matrix-emotion-avatar-assets.md` | Emotion-avatar & asset platform — integration gaps AV1–AV13, shared contracts, ticket reconciliation, post-land bookkeeping | `epic-emotion-avatar-message-binding.md` +5 |
| `matrix-authentication-channels.md` | Authentication channels — verified-factor login/unlock provisioning across messenger / e-mail / federated systems; gaps AC1–AC12, shared contracts, 2FA ticket reconciliation | `epic-auth-channel-provisioning.md` +9 |

**Naming rule:** every integration matrix is named `matrix-<scope>.md` (kebab-case scope),
lives at `.plan/` root, and aggregates one domain's cross-system integration surface. Epics
carry their own `## Integration Points` section using the standardized template defined in
`matrix-cross-mechanics.md`; a matrix aggregates pairwise gaps and domain-scoped integration
points that span multiple epics.

**Next steps:** add further domain matrices (e.g. frontend↔backend, platform integrations)
as needed; new epics and tickets reference the relevant `matrix-<scope>.md` for cross-system
integration tracking.

## Commit Trailers

Link commits to issues:

```
Issue: TASK-023
Epic: EPIC-26
Status: done
```

## Plan ↔ Code Discovery

Two tools reconcile `.plan/` + `docs/` with `src/` so you can jump either
direction without grepping prose:

| Tool | Direction | Command |
| ---- | --------- | ------- |
| `check-md-links.ts` | `src/` comments → `.plan/` + `docs/` (stale-citation guard) | `bun run md:links` |
| `plan-code-map.ts` | `.plan/` + `docs/` → `src/` (reverse index) | `bun run plan:map` |

- **Reverse index** (`.plan/code-map.json`, generated): maps every `src/…` path
  referenced in plan/spec prose to the tickets/epics/specs that own it.
  `bun run plan:find src/rpg/quests/service` lists owners (exact or directory
  prefix match). Regenerate with `bun run plan:map`; freshness is gated in
  `bun run check` (`code-map - freshness`).
- **Source-comment guard**: `md:links` now also scans TypeScript comment text
  for `.plan/…` and `docs/…` citations and flags ones whose target no longer
  resolves (catches rot when specs/epics are renamed or merged).

### Interconnection reporting

Producer, consumer, and sibling relationships are derived, not hand-authored:

1. Explicit `**Epic:**` and `Related` links win.
2. TypeScript source comments naming `.plan/…` / `docs/…` files are producer evidence.
3. `src/…` references in plan/spec prose and `.plan/code-map.json` establish ownership.
4. Shared tags and matrix membership establish siblings only when direction is
   not already decided.

The generated `.plan/feature-matrix.md`, `.plan/code-map.json`, and existing
link checks are the inputs. When the pinned `giwt` dependency includes
`FEAT-plan-links-derive-and-validate-producers-consumers-siblings`, regenerate
the derived graph with:

```bash
bun node_modules/giwt/src/cli.ts plan links
bun node_modules/giwt/src/cli.ts plan links --check
```
