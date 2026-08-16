<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: User Story & Use Case Improvements (Permanently Ongoing)

**Status:** 🟡 Permanently Ongoing
**Priority:** Medium
**Effort:** Continuous
**Type:** Ongoing Epic

## Summary

New use cases and user story improvements. Continuously improve user experience based on feedback, analytics, and evolving needs. This epic is a **holding bin** for UX/use-case refinements that don't belong to a feature epic — concrete items get their own tickets and move to their owning epic when one exists.

## Scope

- User feedback integration
- UX improvements
- Workflow optimizations
- Accessibility enhancements
- Performance improvements
- Mobile experience improvements

## Current Items (2026-08-16)

| Item | Ticket | Status |
| ---- | ------ | ------ |
| Chat flow section navigation (multi-location journey UI) | `TASK-chat-flow-section-navigation` | 🟢 Complete — Phases 1-6 shipped (commits c5270239, d726e108): inline dividers w/ count+time, jump, story map (counts/current highlight/actor presence/split-party badge), sticky location header w/ scrollspy, transfer w/ transition picker + narrative insertion + fade + location/background sync, bulk move-all |
| Chat backgrounds location sync | `TASK-chat-backgrounds-location-sync` | ⬜ Not Started |
| User story backlog grooming | `TASK-user-stories` | ⬜ Not Started — refine requirements, add acceptance criteria, align specs with user needs |
| User seeding & role expansion (configurable test roles) | `TASK-user-seeding-role-expansion` | ⬜ Not Started — Epic: Logic Reconciliation |
| User block/ban/shadow (moderation) | `TASK-user-block-ban-shadow` | ⬜ Not Started — Epic: Chat Lifecycle & Moderation (low priority, postponed) |

## Triage Rule

New UX ideas land here first. When an idea matures into a scoped feature, create a ticket under its owning epic (chat → `epic-chat-*`, auth → `epic-auth-access`, admin → `epic-frontend-admin`) and remove from this epic's linked list. This epic only keeps items with no better home.

## Files

- `docs/frontend/` — UX specifications
- `src/views/` — page templates
- `src/frontend/alpine/` — Alpine.js components
- `src/components/` — reusable components