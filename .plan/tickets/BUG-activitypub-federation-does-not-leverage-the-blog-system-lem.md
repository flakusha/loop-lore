<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: ActivityPub federation does not leverage the blog system (Lemmy/Mastodon primitive)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
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

## Definition (2026-10-04, p3-bugfix-2026-10-04)

Publisher threading defined in `FEAT-activitypub-federation.md` → "Blog Publisher
Threading": blog post/comment create/update publish signed `Page`/`Note` activities via
`src/crypto/activitypub-keys.ts` + outbox fan-out, behind `config.federation.enabled`
and the NSFW/moderation gate. Runtime scope remains
`FEAT-federate-blog-system-via-activitypub-lemmy-mastodon-reddit` (blocked on G15/G16);
this ticket's acceptance was definitional, so no shipped code was demanded here.

**Resolved:** 2026-10-06 registry-driven close: git issue 81b59cf (registry tip: 79e9e69da Konstantin Fedotov Close issue)

## Closure (2026-10-05, federation resolution review)

RESOLUTION TYPE: **decision-only — documentation, no implementation.**

Decision is recorded in `FEAT-activitypub-federation.md` → "Blog Publisher Threading":
"blog_post create/update publishes a `Page`/`Note` activity from the owning world's
actor; threaded `blog_comment` (`parent_comment_id`) publishes a `Note` reply with
`inReplyTo`", signed with `getActiveActivityPubKey`
(`src/crypto/activitypub-keys.ts` over `activitypub_actor_keys`), fanned out through the
same outbox/inbox routes as world events, gated on `config.federation.enabled` and the
NSFW/moderation gate; `blog_follows` maps to ActivityPub `Follow`/`Accept`.

What exists today in the repo: the blog subsystem is real and unimplemented for
federation — `src/routes/blog/{posts,comments,follows,moderation}.ts` and
`src/rpg/blog/service/{posts,comments,follows}.ts` (29 files), with `blog_posts`,
`blog_comments` (`parent_comment_id` at `src/db/schema-blog.ts:18`), `blog_follows`,
`blog_tags`, `blog_rag_sources` in `src/db/schema-blog.ts`. No ActivityPub publishing
code exists in `src/`: grep for `federated_identities|actor_uri|mapping_mode` returns no
matches, and the only `activitypub` hits are the signing-keypair table
(`src/db/migrations/001_init.ts:797`), the key service, the consent gate, and a
`protocols: ["activitypub"]` string in the NodeInfo route. The unchecked AC boxes above
are therefore expected: they are runtime criteria carried by the follow-on FEAT, not
satisfied by this definitional ticket.

Follow-on FEAT carrying the implementation:
`FEAT-federate-blog-system-via-activitypub-lemmy-mastodon-reddit` (Not Started, marked
BLOCKED on G15/G17 per `epic-federation-swarm-sync.md`). This ticket is closed as the
decision being written down; the code work is not done and is tracked there.
