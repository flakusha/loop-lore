# BUG: Blog comments lack threading (parent_comment_id) blocking Lemmy/Mastodon/Reddit parity

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Blog comments are flat — no `parent_comment_id` column or self-reference. Blocks Lemmy/Mastodon/Reddit parity (threaded replies are core).

**Fix**: add `parent_comment_id` (nullable, self-FK on `blog_comments`), depth limit, and rendering for nested replies. Ensure federation ticket `BUG-activitypub-federation-does-not-leverage-the-blog-system-lem` can wire threaded replies to Mastodon/Lemmy Note in reply to Note.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
