# BUG: Blog comments lack threading (parent_comment_id) blocking Lemmy/Mastodon/Reddit parity

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium

## Summary

Blog comments are flat — no `parent_comment_id` column or self-reference. Blocks Lemmy/Mastodon/Reddit parity (threaded replies are core).

**Fix**: add `parent_comment_id` (nullable, self-FK on `blog_comments`), depth limit, and rendering for nested replies. Ensure federation ticket `BUG-activitypub-federation-does-not-leverage-the-blog-system-lem` can wire threaded replies to Mastodon/Lemmy Note in reply to Note.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: 011_blog.ts:21 parent_comment_id self-FK cascade; comments.ts:41; blog-types.ts:27.
