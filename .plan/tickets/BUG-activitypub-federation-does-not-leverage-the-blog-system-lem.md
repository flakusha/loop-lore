# BUG: ActivityPub federation does not leverage the blog system (Lemmy/Mastodon primitive)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large

## Summary

`FEAT-activitypub-federation` models World, Channel, or Character as fediverse actors (Group, Person, Service) but does not federate the blog system, which is the natural Lemmy/Mastodon Reddit/X-like primitive: `blog_post` maps to Lemmy Post/Page and Mastodon Status, `blog_comment` (threaded) maps to Lemmy Comment/Note and Mastodon reply, `blog_follows` maps to ActivityPub Follow.

**Fix**: extend `FEAT-activitypub-federation` or add a FEAT to federate blog posts, comments, and follows via ActivityPub, reusing the existing blog schema and moderation. See `matrix-protocol-chat-group-integration.md`.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
