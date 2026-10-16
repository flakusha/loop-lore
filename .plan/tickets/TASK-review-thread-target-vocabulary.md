<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Review Thread Target Vocabulary (Closed-Union Decision)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-editorial-workflow
**Related:** `TASK-review-thread-comment-model.md`, `TASK-inline-markdown-suggestion-model.md`, `TASK-beta-reader-feedback-surface.md`, `epic-narrative-publishing-workflows.md`, `epic-blog-system.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Land the entity vocabulary a review thread can hang off — as an explicit,
decision-recording change to a closed union, not an incidental column addition.
The two v1 targets are `publication_unit` and `blog_post`; today no member of
any closed union in the repo names either.

## Context

The polymorphic asset-link vocabulary `AssetLinkEntity`
(`src/db/enums-content.ts:73-84`) is a `const` object + derived union type with
exactly ten members — `chat, character, world, actor, location, quest, item,
memory, message, asset` — consumed by `asset_links.entity_type`
(`src/db/schema-content.ts:19`), `AssetLinkInput` (`src/assets/service/types.ts:74-78`),
and route bodies (`src/assets/controller.ts:391`). There is no `blog_post` and
no `publication_unit`. A comment on a chapter currently has nothing to
reference.

The two honest options, and this ticket must pick one and record why:

1. **A dedicated `ReviewThreadTarget` union** — a new closed enum
   (`publication_unit | blog_post`) in the enums file that owns the
   publication/blog vocabulary, consumed by the new `review_threads` table only.
2. **Extend `AssetLinkEntity`** with `BlogPost: "blog_post"` and
   `PublicationUnit: "publication_unit"` members, reusing the existing
   polymorphic shape.

Option 1 is the default recommendation: comments are not assets, and widening
`AssetLinkEntity` makes every exhaustive `switch` over it and every
`asset_links` consumer carry two members that can never legitimately appear in
`asset_links.entity_type`. Review threads are their own table with their own
lifecycle; the vocabulary should live next to that table, not inside the asset
layer. Option 2 is acceptable only with a written argument that the thread
model must be discoverable through the asset-link query surface — and then it
must carry the `asset_links`-side consequences, not just the enum line.

Either way the enum lands in `src/db/enums-*.ts` (the file owning the
neighboring vocabulary — not `enums-content.ts` by reflex), with the exhaustiveness
checks over the union updated in the same change. Adding a member to a closed
union without touching its switch sites is how a build breaks in a sibling
worktree.

Migration: this epic claims `061_review_threads.ts` — the first number after
the publishing epic's `057`/`058` claims and after `epic-publication-i18n.md`'s
`059`/`060` claims. If another epic took `061` first, take the next free number
(the filename is the identity in `kysely_migration`; see
`src/db/migrations/README.md` — append-only, one `ADD COLUMN` per `alterTable`).
Under option 1 the migration creates the `review_threads` table itself; under
option 2 no new table is needed for the vocabulary and the migration is only
whatever the thread table requires (`TASK-review-thread-comment-model.md`'s).

## Acceptance Criteria

- [ ] The chosen vocabulary exists as a closed `const` object + derived union
      type with both `publication_unit` and `blog_post` members, in the enums
      file that owns the neighboring vocabulary
- [ ] The decision (option 1 or 2) and its reason are recorded in the ticket's
      `## Context` at implementation time — the next reader must not re-derive it
- [ ] Every exhaustiveness site over the touched union is updated in the same
      change; `bun run typecheck` is green with no new `assertNever` fallout
- [ ] If option 2 is taken, `asset_links`-side consumers are audited and the two
      new members are explicitly documented as invalid for `asset_links`
- [ ] The migration (whichever shape the decision implies) follows
      `src/db/migrations/README.md`; regeneration chain
      (`bun run db:sync-types && bun run db:sync-manifest` + `bun run schemas:check`)
      is run
- [ ] A unit test asserts the union rejects an unknown target string at the
      service boundary (unknown target = named error, not a stored row)
