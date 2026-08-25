# FEAT: Federate blog system via ActivityPub (Lemmy/Mastodon/Reddit)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Scoped per matrix-protocol-chat-group-integration.md and the federation epic Protocol Integration Plan. blog_post maps to Lemmy Post or Page and Mastodon Status; threaded blog_comment maps to Lemmy Comment or Note and Mastodon reply; blog_follows maps to ActivityPub Follow. Covers the Reddit/X-like family (Lemmy, Mastodon, Reddit-shape; ATProto later). STATUS: BLOCKED - do not implement until G15 blog_comments parent_comment_id threading (git 69d45a5) is closed and G17 ActivityPub-ignores-blog (git 81b59cf) is resolved via extending FEAT-activitypub-federation or absorbing this ticket. Outbound routes through the NSFW and moderation gate; identity mapping per G1.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
