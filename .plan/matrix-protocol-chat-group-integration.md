# Protocol → Chat / Group-Chat / Blog Integration Matrix

Companion to `epic-federation-swarm-sync.md` and `matrix-federation-swarm.md`. Maps external protocols' chat/group primitives onto loop-lore's **verified** seams (chat = 1:1, group-chat = multi-participant, blog = posts + comments + follows). Research date 2026-08-25.

Verified against loop-lore source (`src/transport/protocol.unified.ts`, `src/db/schema-blog.ts`, `src/group-chat/turn-selector.ts`; existence of `src/integrations/` and `src/social-hub/` confirmed absent) and current protocol specs (Lemmy/Mastodon/Matrix/IRC/XMPP/Nostr).

## Verified loop-lore seams

- **chat** (1:1, e.g. user ↔ assistant/character) — orchestrated by `src/chat/service/*`. The DM primitive.
- **group-chat** (multi-participant) — `src/group-chat/turn-selector.ts` schedules AI participants; mention-parser resolves @-mentions. The room/channel/MUC primitive.
- **blog** (posts + comments + follows + visibility tiers) — `src/db/schema-blog.ts` (`blog_posts`, `blog_comments`, `blog_tags`, `blog_follows`). Posts are chat-shaped. **Comments are currently FLAT (no `parent_comment_id`)** — threading is planned but not in the schema. This is the Reddit/X-like primitive: a post + threaded comments + follows ≈ Lemmy community thread / Mastodon toot+replies / Reddit post.
- **transport `ProtocolHandler`** (`src/transport/protocol.unified.ts`) — low-level byte/connection layer (`connect`/`send`/`get`/`close`). **Not** a chat/IM adapter.

## Protocol mapping

| Protocol | Native chat/group model | loop-lore seam | Federation path | Notes |
|---|---|---|---|---|
| Lemmy (ActivityPub) | Community=Group, Post=Page, Comment=Note (threaded) | blog (post+comment+follow) | ActivityPub S2S | Reddit-like; community ≈ blog with `world_id`/`tags` + follows |
| Mastodon (ActivityPub) | Status=Note, replies=thread, boost/follow | blog (post+comment+follow) | ActivityPub S2S | Microblog / X-like |
| Reddit | Subreddit, post + nested comments, upvotes | blog | ActivityPub (future) | Reddit/X-like; same shape as Lemmy |
| AT Protocol / Bluesky | Post + thread, DID identity, custom feeds | blog | ATProto (future) | Portable identity |
| Matrix | Room=group, DM=1:1, Space=org, E2EE (Olm/Megolm) | group-chat + chat | Matrix CS/SS API | Appservices bridge IRC/Discord/Slack |
| IRC | Channel=group, PM=1:1, flat, RFC 1459/2812 | group-chat + chat | IRC network | Legacy; no E2EE/auth; bouncer for persistence |
| XMPP | MUC=group, 1:1 chat, OMEMO E2EE (Double Ratchet) | group-chat + chat | XMPP | Members-only MUC for OMEMO |
| Discord | Guild/Channel(text)=group, DM, threads | group-chat + chat | Bot API (bridge) | `FEAT-messaging-bridge-extensions` |
| Telegram | Supergroup/channel=group, DM, topics | group-chat + chat | Bot API (bridge) | `FEAT-messaging-bridge-extensions` |
| Signal | Group + 1:1, Signal Protocol E2EE | group-chat + chat | signald (deferred) | `FEAT-messaging-bridge-extensions` |
| Nostr | NIP-28 public chat / NIP-29 groups=group; kind 1 note=blog | group-chat + blog | relay WebSocket | `IDEA-consider-nostr-as-a-lightweight-fediverse-axis` |

## Key finding

The **blog system is the Lemmy/Mastodon/Reddit/ATProto federation primitive**, not the World/Channel/Character actor model alone. A blog post + threaded comments + follows + visibility tiers already encodes the Reddit/X-like shape. Federating the blog system via ActivityPub (and ATProto/Nostr) yields Lemmy/Mastodon/Reddit parity directly. The chat-room family (Matrix/IRC/XMPP/Discord/Telegram/Signal) maps to **group-chat** (room/channel/MUC + members + mentions + AI turn-selector); 1:1 maps to **chat**.

## Gaps (verified)

- **G15** `blog_comments` lacks `parent_comment_id` (flat) — blocks Lemmy/Mastodon/Reddit thread parity. → `BUG-blog-comments-lack-threading-parent-comment-id-blocking-lemm`
- **G16** chat/IM adapter abstraction duplicated (`ProtocolAdapter` vs `SocialAdapter`), no code; real transport is `ProtocolHandler` (bytes). Consolidate. → `BUG-chat-im-adapter-abstraction-duplicated-protocoladapter-vs-so`
- **G17** `FEAT-activitypub-federation` does not federate the blog system. → `BUG-activitypub-federation-does-not-leverage-the-blog-system-lem`
- **G18** IRC integration unscoped as group-chat (only in social-hub adapter list). → `BUG-irc-integration-unscoped-as-group-chat-only-in-social-hub-ad`

## Recommendations

1. Scope Lemmy/Mastodon/Reddit/ATProto federation as **blog-system federation** (extend `FEAT-activitypub-federation` / new FEAT), reusing blog schema + moderation.
2. Add `parent_comment_id` threading to `blog_comments` before federation work.
3. Consolidate the chat/IM adapter on ONE abstraction above `ProtocolHandler`; retire the duplicate.
4. Scope IRC (and confirm Matrix/XMPP) as group-chat integrations reusing the consolidated adapter.
5. Keep Nostr as a lightweight alternative (`IDEA-consider-nostr-as-a-lightweight-fediverse-axis`).

## References

- Lemmy federation: join-lemmy.org/docs/contributors/05-federation.html ; DeepWiki Lemmy ActivityPub
- Mastodon API statuses/threads: docs.joinmastodon.org/methods/statuses ; ActivityPub spec
- Matrix spec: spec.matrix.org/latest ; Spaces DeepWiki
- IRC RFC 1459 / 2812
- XMPP MUC + OMEMO XEP-0384
- Nostr NIP-28 (public chat), NIP-29 (groups)
