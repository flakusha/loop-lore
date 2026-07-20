# Epics Consolidation

**Last Updated:** 2026-07-20
**Source:** `.plan/features/`, `.plan/epics/`, `.plan/tickets/`, `.plan/backlog.md`

## Status Summary

| Epic | Name | Status | Priority | Tickets |
| ---- | ---- | ------ | -------- | ------- |
| 10 | Generation Foundation | ✅ Complete | — | 0 |
| 11 | Admin & Settings | ✅ Complete (core) | — | 1 remaining |
| 12 | Memory Foundation | ✅ Complete | — | 0 |
| 13 | Frontend Responsive | ✅ Complete | — | 0 |
| 14 | Import/Export | ✅ Complete | — | 0 |
| 15 | i18n & Accessibility | ⬜ Not Started | High | 0 |
| 16 | Observability | 🟡 In Progress | High | 0 |
| 17 | Encryption Foundation | ⬜ Not Started | High | 8 |
| 19 | Chat Notifications | ✅ Complete | — | 0 |
| 26 | Avatar & Expression | ⬜ Not Started | Medium | 8 |

### Permanently Ongoing Epics

| Epic | Name | Status | Priority | Tickets |
| ---- | ---- | ------ | -------- | ------- |
| — | Code Quality & Best Practices | 🟡 Permanently Ongoing | High | 2 |
| — | Testing & Quality Assurance | 🟡 Permanently Ongoing | High | 2 |
| — | Platform Research & Feature Adoption | 🟡 Permanently Ongoing | Medium | 3 |
| — | User Story & Use Case Improvements | 🟡 Permanently Ongoing | Medium | 2 |
| — | Tooling Support & Improvement | 🟡 Permanently Ongoing | Medium | 4 |
| — | Logic Reconciliation | 🟡 Permanently Ongoing | High | 11 |

### Additional Epics

| Epic | Name | Status | Priority | Tickets |
| ---- | ---- | ------ | -------- | ------- |
| — | Headless Mode & Alternative Frontends | ⬜ Not Started | Medium | 0 |
| — | Transport Layer Expansion | ⬜ Not Started | Medium | 0 |
| — | Multi-Session Support | ⬜ Not Started | Medium | 0 |
| — | Impersonation System | ⬜ Not Started | Medium | 0 |
| — | Assistant/GM Flows Reconciliation | ⬜ Not Started | Medium | 0 |
| — | Chat/Group Chat Transfer & Location Change | ⬜ Not Started | Medium | 0 |
| — | RPG Mechanics & Extensible Game Systems | ⬜ Not Started | Medium | 19 |
| — | Deno Support (Possible Node) | ⬜ Not Started | Low | 0 |
| — | Two-Factor / Multi-Factor Auth | ⬜ Not Started | Medium | 0 |
| — | Platform Integrations | 📝 Draft (TBD) | Low | 0 |

## Active Epics

### Epic 16: Observability

**Status:** 🟡 In Progress
**Priority:** High

Telemetry, admin analytics, CI config, Playwright responsive tests.

| Task | Status |
| ---- | ------ |
| Telemetry | 🟡 In Progress |
| Admin analytics | 🟡 In Progress |
| CI config | 🟡 In Progress |
| Playwright responsive tests | 🟡 In Progress |

### Epic 17: Encryption Foundation

**Status:** ⬜ Not Started
**Priority:** High

E2E encryption for private chats/worlds/locations, asset encryption, access management, key rotation. Two models: symmetric (local/public chats) and asymmetric (e2e/private chats).

| Task | Priority | Status |
| ---- | -------- | ------ |
| Architecture clarification (symmetric vs asymmetric) | High | ⬜ Not Started |
| Wire message pipeline | High | ⬜ Not Started |
| Key management UI | High | ⬜ Not Started |
| Group key distribution | High | ⬜ Not Started |
| Key rotation | Medium | ⬜ Not Started |
| Asset encryption | Medium | ⬜ Not Started |
| Access management | Medium | ⬜ Not Started |
| Browser pre-encrypt | Medium | ⬜ Not Started |

### Epic 26: Avatar & Expression System

**Status:** ⬜ Not Started
**Priority:** Medium

3D character avatars with emotion detection and expression mapping. Includes: 3D avatars, animated mugshots, emotion detection, chat backgrounds, and section navigation.

| Task | Priority | Status |
| ---- | -------- | ------ |
| 3D Character Avatars (Three.js/VRM) | High | ⬜ Not Started |
| Emotions Avatar Edit Model | High | 🔴 Blocked (edit model) |
| Rigged Model Buffer Render (sprite sheets) | Medium | ⬜ Not Started |
| Dynamic Avatars Dota Style (animated mugshots) | High | ⬜ Not Started |
| Emotion Intent Detection (extensible emotions) | Medium | ⬜ Not Started |
| Chat Backgrounds (static/dynamic + location sync) | Medium | ⬜ Not Started |
| Chat Sectioning (multi-location spanning, research) | High | ⬜ Not Started |
| Chat Flow (section navigation & story spanning UI) | Medium | ⬜ Not Started |

## Completed Epics

### Epic 10: Generation Foundation

**Status:** ✅ Complete

Tool-call loop, provider failover, SSE reconnect.

### Epic 11: Admin & Settings

**Status:** ✅ Complete (core)

Admin UI, per-user preferences, plugin management. Core implemented; plugin management API remaining.

| Task | Status |
| ---- | ------ |
| Admin middleware & routes | ✅ Complete |
| User preferences | ✅ Complete |
| Plugin management API | ⬜ Not Started |

### Epic 12: Memory Foundation

**Status:** ✅ Complete

Keyword filtering, type enum, context compaction, A/N injection.

### Epic 13: Frontend Responsive

**Status:** ✅ Complete

Mobile breakpoints, touch targets, keyboard shortcuts, HTMX.

### Epic 14: Import/Export

**Status:** ✅ Complete

Character card multi-format import (CCv2/CCv3/CHARX/PNG), chat export, bulk export.

### Epic 19: Chat Notifications

**Status:** ✅ Complete

Cross-chat SSE, read-state schema, unread badge, toast.

## Standalone Tickets (No Epic)

| Task | Priority | Status |
| ---- | -------- | ------ |
| Conversation Branching | Medium | ⬜ Not Started |
| Character Relationships | Medium | ⬜ Not Started |
| Prompt Library | Low | ⬜ Not Started |
| Regex Extraction Tests | Medium | ⬜ Not Started |
| Thinking Tag Context Prune | Medium | ⬜ Not Started |
| Test Performance Shared State | Medium | ⬜ Not Started |
| Agents Scripts Worktree Docs | Low | ⬜ Not Started |
| GitHub Pages VitePress | Low | ⬜ Not Started |
| Frontend E2E Improvements | High | ⬜ Not Started |
| Branch Workflow dev→stg→master | Low | ⬜ Post-0.1.0 |
| Dev Tooling Updates | — | ✅ Complete |

## Epic Status by Priority

### P0 — Immediate (In Progress)

- Epic 16: Observability 🟡

### P1 — Next Cycle (Not Started)

- Epic 15: i18n & Accessibility ⬜
- Epic 17: Encryption Foundation ⬜

### P2 — Specified, Not Implemented

- Epic 26: Avatar & Expression System ⬜

### P3 — Deferred (Post-MVP)

- Conversation Branching ⬜
- Character Relationships ⬜
- Prompt Library ⬜
