<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publish a Publication Unit / Book to a Blog Post (Provenance-Preserving Bridge)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-blog-system.md`
**Related:** `TASK-blog-rss-atom-sitemap.md`, `TASK-blog-unit-scheduled-serialization.md`, `TASK-markdown-canonical-intermediate-contract.md`, `epic-narrative-publishing-workflows.md`, `src/db/schema-blog.ts`, `src/rpg/blog/service/types.ts`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Bridge a generated publication (unit or whole book) into a `blog_posts` row as
a projection of canonical markdown, preserving provenance and the source's
author type. This fills the epic's Current-State row "Creative generation +
promotion workflow | Not Started" (`epic-blog-system.md:42`) and ends the
hand-copy-markdown workflow.

## Context

**Verified ground state:**

- Shipped: `blog_posts` / `blog_comments` / `blog_follows` / `blog_tags` /
  `blog_rag_sources` (`src/db/schema-blog.ts`), routes under `src/routes/blog/`
  mounted at `src/routes/v1/content-surface.ts:62`, service at
  `src/rpg/blog/service/`, reader UI `src/views/blog.html` +
  `src/frontend/alpine/blog.ts`.
- `blog_posts` (`src/db/schema-blog.ts:30-45`) has **no `publication_id` /
  `unit_id`** — publishing a generated chapter today means hand-copying
  markdown out of one surface and into the create form. Provenance is the
  missing column, not a missing renderer.
- `BlogAuthorType = {Human, Llm}` is verified at
  `src/rpg/blog/service/types.ts:21-26` — the `llm` value exists on the column
  but no generation path writes it.

**Publication-agnostic by design.** The bridge consumes a canonical markdown
document plus a source reference — not a `publications` row specifically. A
publication unit, a chat markdown export, or a pasted file are all valid
sources. The canonical-intermediate contract is
`TASK-markdown-canonical-intermediate-contract.md`: the unit body **is**
markdown, and every output format is a projection of it. This bridge is
exactly that projection, pointed at the blog.

**Reuse, do not rebuild:**

- `marked` — the repo's only markdown parser (`package.json` deps; configured
  at `src/frontend/chat-vendor.ts:12`).
- `SANITIZE_CONFIG` (`src/frontend/alpine/chat-utils/sanitize.ts:9-47`) — the
  blog body lands in innerHTML on the reader surface
  (`src/frontend/alpine/blog.ts`), so the same allowlist applies; server-side
  derivation must sanitize, never ship raw `marked.parse` output.
- Blog visibility tiers + `scheduled_at` (`src/db/schema-blog.ts:41`) and the
  follower-gated listing that already exists
  (`src/rpg/blog/service/posts.ts:162`) — no new scheduling or visibility
  concept.
- `createAsset` / `linkAsset` (`src/assets/service/`) for any post media.

**Out of scope:** publishing export formats (epub/pdf/markdown/zip) are owned
by `TASK-publication-export-formats.md` + `TASK-markdown-derive-other-formats.md`
under `epic-narrative-publishing-workflows.md`. This ticket moves markdown
between two internal surfaces; it writes no export artifact.

**Migration policy:** append-only per `src/db/migrations/README.md`. HEAD is
`src/db/migrations/056_xp_ledger_dedupe_unique.ts`, so the provenance columns
land as `src/db/migrations/NNN_*.ts` with `up`/`down`; regenerate via
`bun run db:sync-types && bun run db:sync-manifest` then `bun run
schemas:check`.

## Acceptance Criteria

- [ ] `src/db/migrations/NNN_blog_post_provenance.ts` (or similar) appends
      nullable provenance columns to `blog_posts` (source kind + source id +
      optional unit id); `up`/`down`; auto-discovered
- [ ] The bridge takes a canonical markdown body + source ref and writes one
      `blog_posts` row; it does **not** hard-depend on the publications tables
      (a plain markdown source works)
- [ ] Provenance preserved: the post links back to its source unit; publishing
      the same unit twice is idempotent (no duplicate posts)
- [ ] Author type carried from the source through `BlogAuthorType`
      (`src/rpg/blog/service/types.ts:21-26`), never assumed `human`
- [ ] Body rendered via the shared `marked` config and sanitized through
      `SANITIZE_CONFIG`; no raw parse output stored or served
- [ ] Visibility + `scheduled_at` set from the existing blog fields; a
      followers-only or private source never becomes a public post by default
- [ ] Regeneration chain clean (`db:sync-types && db:sync-manifest &&
      schemas:check`); `bun test src/db/migrations.test.ts
      src/db/migration-roundtrip.test.ts` green
