<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: blog scheduled-publish activation queue

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-blog-system
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Headline gap from content-generation review rec 1. Blog epic has scheduled_at column but no activation queue: createPost sets Scheduled when scheduled_at present yet notifies followers unconditionally on create (even drafts/scheduled — premature-notify bug this ticket fixes by moving notify to activation time). Scope: publishDuePosts() in src/rpg/blog/service/posts.ts (due-query + flip + notify-moved-here) + blog.scheduled-publish job in src/cron/jobs.ts (import-lazy, default hourly, config-overridable) + migration adding composite index idx_blog_posts_scheduled_due on blog_posts (status, scheduled_at) mirroring migration 043 scheduled_messages pattern + read-guard (scheduled never listed as published to non-authors; published_at <= now check) + allow scheduled in post-moderate allowlist (moderation.ts:80).

Owner: epic-blog-system.md (In Progress; scheduled-publish activation Not Started, enum only for LLM authoring). Reuse: MessageContentFormat single markdown, BlogPostStatus incl Scheduled, BlogAuthorType incl Llm (no producer), moderation routes, cron infra (defaultJobs catalog of thin import-lazy bodies, Bun.cron registry, jobs.test.ts/registry.test.ts runOnce-testable), 043 due-index precedent. Adapt static-site publish-guard WHERE pattern into post-read-policy/list filters. Defer comment moderation route+UI, follower tiers + notification prefs, profile visibility, LLM authoring modes + RAG consumption, creative generation/promotion bridge, version history + rich-text editor, admin bulk/analytics, RSS/static export, narrative-publishing + reference-conditioned epics.

Refs: .tmp/meta-research/content-generation-epics-review.md; https://unfoldcms.com/blog/cms-content-scheduling-guide; https://docs-v3.strapi.io/developer-docs/latest/guides/scheduled-publication.html; https://dev.to/jean_carloschmitz/how-i-schedule-blog-posts-on-a-100-static-site-for-0-no-server-no-cms-no-runtime-database-12j8

Acceptance: post created with future scheduled_at gets status=scheduled, published_at=null, invisible to non-author readers, NO follower notification at create; after due time + job run: status=published, published_at set, visible, followers notified exactly once; double-run idempotent (no duplicate notify, no published_at rewrite); past-scheduled_at create publishes on next tick (no stuck rows); bun test src/rpg/blog src/cron green incl new due-flip + idempotency + read-guard tests; review recs 2,3,5 explicitly left open as follow-ups.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
