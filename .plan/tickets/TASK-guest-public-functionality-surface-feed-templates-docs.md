<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Guest public functionality surface: feed, templates, docs

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-guest-access

**Summary:**

## Problem

Read-only public surfaces (proposed public story feed epic-public-feed, public templates TASK-public-templates-routes done, docs) assume an authenticated session; guests get no entry point.

## Change

- Public story feed: guest can read the feed (moderation still applies); posting/reactions stay authenticated-only.
- Public templates routes: guest can list/read templates; apply/copy stays authenticated.
- Docs: guest can browse docs.public sections (already anonymous-capable in static handler).
- Login page gains 'continue as guest' entry when auth.guestAccess=true (entry point lands in epic-frontend-login.md).

## Acceptance

- Guest reads feed and templates with no account.
- Guest cannot post, react, or apply templates.
- Login page shows guest entry only when flag on.
- Docs public sections render for guest without session.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
