<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# `scripts/plan` — plan-metadata normalizers

Four CLIs that converge `.plan/` header fields onto the spellings giwt
actually reads. None of them derives a value; they only make an author-written
value visible to the generators.

| Script                       | Command                                             | Owns                                                                          |
| ---------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `normalize-plan-metadata.ts` | `bun run plan:metadata`                             | `**Tags**`, `**Epic**`, and the `index.json` projection of both               |
| `normalize-statuses.ts`      | `bun run plan:status:normalize`                     | `**Status:**` (epic + ticket)                                                 |
| `epic-owner-pick.ts`         | `bun run scripts/plan/epic-owner-pick.ts [--apply]` | multi-epic `**Epic:**` collapse (first-existing-wins + generated title table) |
| `report-plan-metadata.ts`    | `bun run plan:report`                               | read-only index ↔ frontmatter reconciliation queries (never writes)           |

**The flags are not interchangeable — read them off `--help`, not off each
other:**

| CLI                       | Report-only mode              | Applies with              | `--json` |
| ------------------------- | ----------------------------- | ------------------------- | -------- |
| `normalize-plan-metadata` | `--dry-run`                   | (default)                 | yes      |
| `normalize-statuses`      | `--check`                     | (default)                 | no       |
| `epic-owner-pick`         | dry-run is the DEFAULT        | `--apply` (`--gen` exits) | no       |
| `plan:report`             | always — it has no write path | never                     | yes      |

The three writers are safe to re-run: a second run over an already-normalized
tree reports 0 changes.

## Module layout

The logic lives in four shared modules so the header grammar is parsed one way
everywhere; each CLI is a thin shell over them.

| Module                     | Owns                                                                                                                         | Used by                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `plan-markdown-fields.ts`  | the field grammar: `fieldLines`, `tagsOf`, `epicOf`, `normalizeEpicRef`, `planFile`/`applyRewrites`, `relatedRefs`           | normalizer, `plan:report`     |
| `plan-index-projection.ts` | `projectIndex` (`.md` fields → `index.json` entries) and `canonicalIndexOrder` (giwt's `localeCompare` key order)            | normalizer, `epic-owner-pick` |
| `plan-index-guard.ts`      | the `index.json` write guard: `probeWorktree` (the only subprocess), `decideIndexWrite`, `projectIndexOntoDisk`, `loadIndex` | normalizer                    |
| `plan-report-queries.ts`   | the read-only queries: `aggregate`, `byTag`, `byEpic`, `orphanTags`, `orphanBindings`, `danglingRelated`                     | `plan:report`                 |

Alongside them: the four CLI files above, and `epic-titles.generated.ts` —
**DO NOT EDIT**, `epic-owner-pick.ts --gen` owns it.

## Header-field vocabulary

giwt reads these fields out of `.plan/tickets/*.md` and `.plan/epics/*.md`:

| Field  | Canonical spelling        | Also seen in the wild                                             | Normalized to canonical |
| ------ | ------------------------- | ----------------------------------------------------------------- | ----------------------- |
| Tags   | `**Tags:** a, b, c`       | `**Tags**: a, b, c`, `**Labels**: a, b, c`, `**Labels:** a, b, c` | yes                     |
| Epic   | `**Epic:** epic-slug`     | `**Epic**: epic-slug`, `**Epic**: epic-slug.md`                   | yes (spelling only)     |
| Status | `**Status:** Not Started` | emoji prefixes, case variants, off-vocabulary values              | yes                     |

**Tags** is freeform: comma-separated words, no closed vocabulary. Placeholders
(`(none)`, `n/a`, `-`, `tbd`) mean "no tags" and are left alone.

**Epic** names exactly one epic, in any of these shapes:

```
epic-items                       epic-items.md              `epic-items`
.plan/epics/epic-items.md        epic-items.md (MVP Tier 1)  `epic-items` (7.6)
```

Anything else — `(if applicable)`, `Epic 26 (Avatar & Expression)`, a list of two
epics, `proposed:epic-x` — is **not** an epic reference and is left untouched.
Resolving those needs a human who knows which epic was meant; the script reports
them instead of guessing.

### Why the spellings matter

The field NAME is not cosmetic. `giwt sync` parses `**Tags:**` and `**Epic:**`
only (`node_modules/giwt/src/tickets/sync-parse.ts`), and the epic↔ticket linkage
gate matches the bold-epic-with-colon form only
(`plan/validate/format-gates.ts:117`). A ticket written with the colon outside the
bold is silently **unbound**: the index records an empty epic and the matrix files
it under `(unbound)`. Same for `**Labels:**`, which nothing reads at all — those
tags never reach `index.json`, so the ticket lands in `(untagged)`.

## The `index.json` projection

`giwt sync --fix` writes `tags` and `epic` onto an index entry only when it
**adopts an orphan** `.md` (`sync-fix-index.ts:202`). For an entry already in the
index it repairs hashes and source paths but never re-reads the ticket's fields —
so adding `**Tags:**` to a long-filed ticket changes nothing until the ticket is
deleted and re-added. `normalize-plan-metadata.ts` closes that gap: after
rewriting the markdown it projects each ticket's `.md` tags and epic onto its
index entry. Tags are **frontmatter-wins**: an entry whose `tags` are empty OR
diverge from the `.md` list is rewritten from the `.md` — giwt's parser reads each
field as the first bold-colon match inside the first 30 lines, so an inline field
mention in header prose can scrape prose fragments into an entry, and a fill-only
rule would preserve that corruption forever (it happened to
`TASK-plan-index-tagging-binding-reconciliation`). A `.md` with no `Tags:` line
still leaves the entry untouched — nothing is inferred. `epic` stays
fill-only-empty; ownership has its own resolver (`epic-owner-pick.ts`).

Run it _before_ the generators:

```
bun run plan:metadata && bun run plan:matrix
```

`feature-matrix.md` projects `index.json`, so the matrix gate fails if the index
moves without the matrix being regenerated.

**In a linked worktree the projection is report-only.** `giwt` deliberately
refuses to write `index.json` outside the main checkout
(`sync-index-write.ts:20`): a worktree-local index would be `git add -A`-ed onto
the feature branch and conflict at merge time, because the index is regenerated
post-merge on the target branch. This script honours that guard — it prints the
counts and a `NOT WRITTEN` note instead. Re-run it in the main checkout to
persist. The `.md` rewrites are unaffected; only the index write is gated.

### The guard is fail-closed

`plan:metadata` mostly runs in `tree/` worktrees, so a broken git environment is
a routine condition here, not an edge case. The guard is therefore split so the
DECISION is testable without git, and it refuses to guess:

- `plan-index-guard.ts` holds the guard, split so the DECISION is testable
  without git:
  - `probeWorktree` — the only subprocess: `git -C <root> rev-parse --git-dir
    --git-common-dir`. Two identical paths ⇒ main checkout; two different paths
    ⇒ linked worktree.
  - `classifyProbe` — pure, and the only place a probe result becomes a
    verdict. Exactly two path lines is the ONLY shape that authorizes anything:
    a non-zero exit, an empty answer, or any other line count resolves to
    `skip-probe-failed` with the shape named, so a truncated pipe or a `git`
    wrapper that prints usage cannot read as "main checkout".
  - `decideIndexWrite` — turns the probe into the write decision. A probe that
    cannot be run or exits non-zero (no git on `PATH`, a `safe.directory`
    refusal, a spawn failure) resolves to `skip-probe-failed` and **never** to
    `write`. The cause is named on stderr and in the report, so a held-back
    write can never be mistaken for a clean `tags backfilled: N`.
  - `projectIndexOntoDisk` is the only path that performs the write, and the
    normalizer calls `loadIndex` BEFORE the `.md` pass.
- The decision is always reported: the human line ends with it (`write`,
  `skip-linked-worktree`, `skip-probe-failed`, …), and `--json` carries it as
  `indexWrite`.

### A malformed index aborts before anything is written

`index.json` is parsed BEFORE the `.md` pass, so conflict markers left there by
a ticket-branch merge fail fast with the tree untouched, instead of leaving some
`.md` files rewritten and then dying on a raw `SyntaxError` — a half-applied
state that looks exactly like a failed no-op at the terminal. A _missing_ index
still degrades to the `.md` pass alone. Nothing else in the repo checks
JSON well-formedness here: `scripts/check/parallel/gates.mjs` runs plan-sync,
plan-validate and matrix freshness, none of which parse `index.json`, and
`.githooks/pre-commit` has no `plan:` hook — so this fast-fail is the only
guard, and it only runs when someone runs `plan:metadata`.

## `epic-owner-pick.ts` — multi-epic owner rule

Tickets that name two or more epics in one `**Epic:**` header (separator
lists, `+`-joined pairs, or legacy prose titles) collapse to one owner:
**first listed candidate that names an existing `.plan/epics/*.md` wins**
(a bare slug, or an exact hit in `epic-titles.generated.ts`, itself
regenerated from epic H1s via `--gen`). Unresolvable values — numbered
`Epic 26` aliases, `NPC/Actor System` prose, `proposed:epic-x` placeholders,
dangling slugs — are reported, never guessed.

Dry-run is the default. `--apply` rewrites the `.md` headers whose `.md` value
and index value agree on the same owner, projects onto `index.json` in
`canonicalIndexOrder` (canonically ordered, so the write is a byte-level no-op
when nothing changed), then `bun run plan:matrix` regenerates the matrix.
Entries where the `.md` header and the index value pick DIFFERENT owners are held
back and listed under `remainder`, as are unresolvable values. `--gen` rewrites
`epic-titles.generated.ts` from the epics' `# EPIC:` H1s and exits.

Unlike `plan:metadata`, this script has no linked-worktree guard — `--apply`
writes `index.json` wherever it is run.

## `plan:report` — read-only reconciliation

`plan:report` never writes. It ships here rather than as a `giwt plan report`
subcommand because giwt is a pinned external dependency; the queries live in
`plan-report-queries.ts` and share the normalizer's field parsing.

| Invocation                      | Answers                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bun run plan:report`           | `aggregate` — ticket/tag/binding totals, top tags, top epics, orphan row count                            |
| `bun run plan:report tags <t>`  | every index entry carrying that tag (case-insensitive)                                                    |
| `bun run plan:report epic <id>` | every index entry bound to that epic (case-insensitive)                                                   |
| `bun run plan:report orphans`   | (a) index tags no `.md` declares, (b) `epic` values naming no epic file, (c) dangling `**Related:**` refs |
| any of the above `--json`       | the same result, machine-readable                                                                         |

Orphans are advisory: nothing fails on them.

## What it deliberately does not do

- **No inferred tags.** A tag is never derived from a ticket title, body, type
  prefix, `src/` path, or bound epic. A large share of tickets have no
  deterministic tag source; they stay untagged. A wrong guessed tag is worse
  than no tag — it puts the ticket in a bucket nobody chose.
- **No epic resolution.** Some epic references name an epic file that does not
  exist. Reported, never auto-fixed.
- **No `**Related:**` rewriting.** That field holds prose, not a parseable list.
  The script counts the refs it can resolve and lists the ones that dangle; it
  does not impose a syntax on the legacy corpus.
- **No `**Status:**` edits.** Owned by `normalize-statuses.ts`. The rewrites here
  are matched per line, so a status line cannot shift.

## Read-only gates

`bun run plan:validate` is **not** read-only in this repo — it shells out to
`giwt sync`, which rewrites ticket files and `index.json`. To check without
writing, use:

```
bun run plan:metadata:check        # this script, dry-run
bun run plan:status:normalize:check
bun run plan:report                # read-only by construction — no write path
bun run plan:matrix:check
bun run plan:docs:check
bun run plan:map:check
```
