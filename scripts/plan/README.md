<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# `scripts/plan` — plan-metadata normalizers

Two idempotent scripts that converge `.plan/` header fields onto the spellings giwt
actually reads. Neither derives a value; both only make an author-written value
visible to the generators.

| Script                       | Command                         | Owns                                                            |
| ---------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `normalize-plan-metadata.ts` | `bun run plan:metadata`         | `**Tags**`, `**Epic**`, and the `index.json` projection of both |
| `normalize-statuses.ts`      | `bun run plan:status:normalize` | `**Status:**` (epic + ticket)                                   |

Both accept `--dry-run` (report, touch nothing) and `--json` (machine-readable).
Both are safe to re-run: a second run reports 0 changes.

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
index entry, but **only where the index is empty**. A value the index already has
is never overwritten.

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

## What it deliberately does not do

- **No inferred tags.** A tag is never derived from a ticket title, body, type
  prefix, `src/` path, or bound epic. ~2100 tickets have no deterministic tag
  source; they stay untagged. A wrong guessed tag is worse than no tag — it puts
  the ticket in a bucket nobody chose.
- **No epic resolution.** 57 epic references name an epic file that does not
  exist. Reported, never auto-fixed.
- **No `**Related:**` rewriting.** That field holds prose, not a parseable list.
  The script counts the refs it can resolve and lists the ones that dangle; it
  does not impose a syntax on 600 legacy files.
- **No `**Status:**` edits.** Owned by `normalize-statuses.ts`. The rewrites here
  are matched per line, so a status line cannot shift.

## Read-only gates

`bun run plan:validate` is **not** read-only in this repo — it shells out to
`giwt sync`, which rewrites ticket files and `index.json`. To check without
writing, use:

```
bun run plan:metadata:check        # this script, dry-run
bun run plan:status:normalize:check
bun run plan:matrix:check
bun run plan:docs:check
bun run plan:map:check
```
