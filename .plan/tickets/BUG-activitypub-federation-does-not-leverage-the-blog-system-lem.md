<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: ActivityPub federation does not leverage the blog system (Lemmy/Mastodon primitive)

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-federation-swarm-sync

## Summary

`FEAT-activitypub-federation` models World, Channel, or Character as fediverse actors (Group, Person, Service) but does not federate the blog system, which is the natural Lemmy/Mastodon Reddit/X-like primitive: `blog_post` maps to Lemmy Post/Page and Mastodon Status, `blog_comment` (threaded) maps to Lemmy Comment/Note and Mastodon reply, `blog_follows` maps to ActivityPub Follow.

**Fix**: extend `FEAT-activitypub-federation` or add a FEAT to federate blog posts, comments, and follows via ActivityPub, reusing the existing blog schema and moderation. See `matrix-protocol-chat-group-integration.md`.

## Acceptance Criteria

- [ ] `blog_posts` federate as Lemmy Post/Page + Mastodon Status via `Create`/`Announce` (reuse `src/routes/blog/posts.ts`, `src/rpg/blog/service/posts.ts`)
- [ ] Threaded `blog_comments` (`parent_comment_id`) federate as Lemmy Comment/Note + Mastodon reply (reuse `src/routes/blog/comments.ts`, `src/rpg/blog/service/comments.ts`)
- [ ] `blog_follows` maps to ActivityPub Follow/Accept (reuse `src/routes/blog/follows.ts`, `src/rpg/blog/service/follows.ts`)
- [ ] Outbound + inbound content routes through existing NSFW/moderation gate (`src/routes/blog/moderation.ts`, `src/crypto/activitypub-keys.ts` consent gate)
- [ ] Scope into `FEAT-activitypub-federation` (`epic-federation-swarm-sync.md`) or new FEAT; blocked on G15 threading + G16 adapter per epic plan

