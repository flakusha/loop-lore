<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Per-Unit Scheduled Serialization (Book → Drip-Published Post Sequence)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-blog-system.md`
**Related:** `TASK-blog-publish-unit-to-post-bridge.md`, `TASK-blog-rss-atom-sitemap.md`, `src/db/schema-blog.ts`, `src/rpg/blog/service/posts.ts`, `epic-blog-system.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Serialize a book into an ordered sequence of blog posts published over time
(chapter per interval), built on the scheduled-publish activation queue the
blog schema has been missing: `scheduled_at` exists, but nothing activates a
scheduled post when its time arrives.

## Context

**Verified ground state:**

- `blog_posts.scheduled_at` (`src/db/schema-blog.ts:41`) is set at create time
  and flips the post to `scheduled`
  (`src/rpg/blog/service/posts.ts:53-54`) — and that is all. No cron, queue, or
  activation path exists. The epic records this as an unticketed gap
  (`epic-blog-system.md:47`, Current-State row `:40`).
- Serialization is the first real consumer of scheduled activation, so the
  activation queue lands in this ticket rather than as speculative
  infrastructure.

**Depends on** `TASK-blog-publish-unit-to-post-bridge.md`: the bridge produces
the posts (with provenance columns); this ticket staggers their
`scheduled_at` across the unit order and activates them on time.

**Reuse, do not build:**

- The existing scheduler machinery (`src/cron/`) — pattern precedent for
  time-driven row activation is the scheduled-messages/reminders migration
  (`src/db/migrations/043_scheduled_messages_reminders.ts`), which pairs a
  table with a due-time scan. Follow that shape; no new scheduler framework.
- Visibility tiers + `scheduled_at` stay the shared blog fields
  (`src/db/schema-blog.ts:41`); the follower-gated listing
  (`src/rpg/blog/service/posts.ts:162`) needs no change.

**Ordering and failure:** the sequence order is the publication's unit order;
each post keeps the provenance link from the bridge. A cancelled or failed
unit must not stall the rest of the sequence — the activation is per-post, not
per-book.

**Feed interaction:** a `scheduled` post is not published — it must stay out of
public reads and out of the feed/sitemap until activation
(`TASK-blog-rss-atom-sitemap.md`'s exclusion list covers this state).

## Acceptance Criteria

- [ ] Scheduled-publish activation exists: a due `scheduled` post flips to
      `published` with `published_at` set, via the existing cron/queue
      machinery (pattern: `043_scheduled_messages_reminders.ts`) — no new
      scheduler framework
- [ ] Serialization plan: ordered units → posts with staggered `scheduled_at`;
      per-post cancel and reschedule supported
- [ ] A cancelled or failed unit does not stall the remaining sequence
- [ ] Not-yet-due posts are invisible to public reads and to feeds/sitemap
- [ ] Activation is idempotent under concurrent runs (no double-publish, no
      post skipped)
- [ ] Tests cover due / not-due / cancel / concurrent-activation; each post's
      provenance link survives the transition
