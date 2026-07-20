# Epics Consolidation

**Last Updated:** 2026-07-20
**Source:** `.plan/epics/`, `.plan/features/`, `.plan/tickets/`, `.plan/backlog.md`

> **Numbering rule:** `docs/meta/plan.md` is the canonical source for epic numbers.
> `.plan/epics/` files use **name-based filenames** (no number prefix) to avoid collisions.
> New epics get the next available number in plan.md when promoted from draft.

---

## Status Summary

### v0.1 Foundation (Complete)

| # | Name | Status | Plan Ref | Epic File |
|---|------|--------|----------|-----------|
| 10 | Generation Foundation | ✅ Complete | plan.md §10 | — |
| 11 | Admin & Settings | ✅ Complete (core) | plan.md §11 | `epic-14.md` |
| 12 | Memory Foundation | ✅ Complete | plan.md §12 | — |
| 13 | Frontend Responsive | ✅ Complete | plan.md §13 | — |
| 14 | Import/Export | ✅ Complete | plan.md §14 | `epic-14.md` |
| 18 | Local Inference Integrations | ✅ Complete | plan.md §18 | — |
| 19 | Chat Notifications | ✅ Complete | plan.md §19 | — |

### v0.1 Active (In Progress / Not Started)

| # | Name | Status | Priority | Plan Ref | Epic File |
|---|------|--------|----------|----------|-----------|
| 15 | i18n & Accessibility | ⬜ Not Started | High | plan.md §15 | — |
| 16 | Observability & CI | 🟡 In Progress | High | plan.md §16 | `epic-16.md` |
| 17 | Encryption Foundation | ⬜ Not Started | High | plan.md §17 | — |
| 20 | E2E Performance Benchmarks | ⬜ Not Started | Medium | plan.md §20 |
| 21 | Notification Expansion | ⬜ Not Started | Medium | plan.md §21 |
| 22 | RPG Mechanics Core | ⬜ Not Started | Medium | plan.md §22 |
| 23 | Assistant Commands | ⬜ Not Started | Medium | plan.md §23 |
| 24 | Filtering & Pagination | ⬜ Not Started | Medium | plan.md §24 |
| 25 | Memory Systems | ⬜ Not Started | Medium | plan.md §25 |
| 26 | Avatar & Expression System | ⬜ Not Started | Medium | plan.md §26 |
| 27 | Testing Infrastructure | ⬜ Not Started | High | plan.md §27 |
| 28 | Asset Support Expansion | ⬜ Not Started | Medium | plan.md §28 |
| 29 | Provider & Plugin Ecosystem | ⬜ Not Started | Medium | plan.md §29 |
| 30 | Assistant Intelligence | ⬜ Not Started | Medium | plan.md §30 |
| 31 | World Persistence & Sync | ⬜ Not Started | Medium | plan.md §31 |

### New Epics (from docs reconciliation)

| # | Name | Status | Priority | Epic File |
|---|------|--------|----------|-----------|
| 32 | Deployment Topologies & Packaging | 📝 Draft | Medium | `epic-deployment-topologies.md` |
| 33 | Multi-Instance Reconciliation | 📝 Draft | High | `epic-multi-instance-reconciliation.md` |
| 34 | Data Integrity & ACID Guarantees | 📝 Draft | High | `epic-data-integrity-acid.md` |
| 35 | Configuration Extensions (ECE) | 📝 Draft | Medium | `epic-config-extensions.md` |
| 36 | Chat Lifecycle & Moderation | ⬜ Not Started | High | `epic-chat-lifecycle-moderation.md` |
| 37 | Plugin System & Extensibility | ⬜ Not Started | High | `epic-plugin-system.md` |
| 38 | World & Locations | ⬜ Not Started | Medium | `epic-world-locations.md` |
| 39 | Item System Extensions | ⬜ Not Started | High | `epic-item-system-extensions.md` |
| 40 | Blog System | ⬜ Not Started | Medium | `epic-blog-system.md` |
| 41 | Chat Transfer & Location Change | ⬜ Not Started | Medium | `epic-chat-transfer-location.md` |
| 42 | Assistant Generation Extensions | ⬜ Not Started | Medium | `epic-assistant-generation-extensions.md` |
| 43 | NSFW Game Mechanics | 📝 Draft | Medium | `epic-nsfw-game-mechanics.md` |
| 44 | Worlds Extension | ⬜ Not Started | Medium | `epic-worlds-extension.md` |

### Permanently Ongoing Epics

No number — these are continuous efforts, not scheduled features.

| Name | Status | Priority | Epic File |
|------|--------|----------|-----------|
| Code Quality & Best Practices | 🟡 Ongoing | High | `epic-code-quality.md` |
| Testing & Quality Assurance | 🟡 Ongoing | High | `epic-testing-qa.md` |
| Platform Research & Feature Adoption | 🟡 Ongoing | Medium | `epic-platform-research.md` |
| User Story & Use Case Improvements | 🟡 Ongoing | Medium | `epic-user-stories.md` |
| Tooling Support & Improvement | 🟡 Ongoing | Medium | `epic-tooling-improvement.md` |
| Logic Reconciliation | 🟡 Ongoing | High | `epic-logic-reconciliation.md` |

### RPG Sub-Systems (grouped under Epic 22)

These extend Epic 22 (RPG Mechanics Core). No independent numbers — tracked as sub-epics.

| Name | Status | Priority | Epic File |
|------|--------|----------|-----------|
| RPG Mechanics & Extensible Game Systems | ⬜ Not Started | Medium | `epic-rpg-mechanics.md` |
| Battle & Action Systems | ⬜ Not Started | Medium | `epic-battle-action-systems.md` |
| Magic & Spell Systems | ⬜ Not Started | Medium | `epic-magic-spell-systems.md` |
| Crafting & Professions | ⬜ Not Started | Medium | `epic-crafting-professions.md` |
| Companion, Pet & Mount | ⬜ Not Started | Medium | `epic-companion-pet-mount.md` |
| Housing & Base Building | ⬜ Not Started | Medium | `epic-housing-base-building.md` |
| Stealth & Crime Systems | ⬜ Not Started | Medium | `epic-stealth-crime.md` |
| Disease & Poison Systems | ⬜ Not Started | Medium | `epic-disease-poison.md` |
| Social Interaction Systems | ⬜ Not Started | Medium | `epic-social-interaction.md` |
| Weather & Environmental Effects | ⬜ Not Started | Medium | `epic-weather-environment.md` |
| Exploration & Discovery Systems | ⬜ Not Started | Medium | `epic-exploration-discovery.md` |
| Economy & Trading Systems | ⬜ Not Started | Medium | `epic-economy-trading.md` |
| Player Agency — Story Points | ⬜ Not Started | Medium | `epic-agency-story-points.md` |
| Emergent Narrative Design | ⬜ Not Started | Medium | `epic-emergent-narrative-design.md` |
| Faction & Reputation | ⬜ Not Started | Medium | `epic-faction-reputation.md` |
| Resolution System | ⬜ Not Started | Medium | `epic-resolution-system.md` |

### Infrastructure Epics (Not Numbered)

Deferred or long-term infrastructure work.

| Name | Status | Priority | Epic File |
|------|--------|----------|-----------|
| Headless Mode & Alternative Frontends | ⬜ Not Started | Medium | `epic-headless-alternative-frontends.md` |
| Transport Layer Expansion | 🟡 Partial | Medium | `epic-transport-expansion.md` |
| Multi-Session Support | ⬜ Not Started | Medium | `epic-multi-session.md` |
| Impersonation System | ⬜ Not Started | Medium | `epic-impersonation.md` |
| Assistant/GM Flows Reconciliation | ⬜ Not Started | Medium | `epic-assistant-gm-flows.md` |
| Deno Support (Possible Node) | ⬜ Not Started | Low | `epic-deno-support.md` |
| Two-Factor / Multi-Factor Auth | ⬜ Not Started | Medium | `epic-2fa-mfa.md` |
| LLM Request Throughput & Scheduling | ⬜ Not Started | Medium | `epic-llm-queue.md` |
| Platform Integrations | 📝 Draft | Low | `epic-platform-integrations.md` |
| Testing & Benchmarking | ⬜ Not Started | High | `epic-testing-benchmarking.md` |
| Embeddable Engine (Far Fetched) | ⬜ Not Started | Low | `epic-embeddable-engine-game-frontend.md` |

---

## Standalone Tickets (No Epic)

| Task | Priority | Status |
|------|----------|--------|
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

---

## Priority Tiers

### P0 — Immediate (In Progress)

- **Epic 16:** Observability & CI 🟡

### P1 — Next Cycle (Not Started)

- **Epic 15:** i18n & Accessibility ⬜
- **Epic 17:** Encryption Foundation ⬜
- **Epic 27:** Testing Infrastructure ⬜
- **Epic 33:** Multi-Instance Reconciliation 📝
- **Epic 34:** Data Integrity & ACID 📝
- **Epic 36:** Chat Lifecycle & Moderation ⬜
- **Epic 37:** Plugin System & Extensibility ⬜

### P2 — Specified, Not Implemented

- **Epic 20:** E2E Performance Benchmarks ⬜
- **Epic 21:** Notification Expansion ⬜
- **Epic 22:** RPG Mechanics Core ⬜ (+ 15 sub-systems)
- **Epic 23:** Assistant Commands ⬜
- **Epic 24:** Filtering & Pagination ⬜
- **Epic 25:** Memory Systems ⬜
- **Epic 26:** Avatar & Expression System ⬜
- **Epic 28:** Asset Support Expansion ⬜
- **Epic 29:** Provider & Plugin Ecosystem ⬜
- **Epic 30:** Assistant Intelligence ⬜
- **Epic 31:** World Persistence & Sync ⬜
- **Epic 32:** Deployment Topologies 📝
- **Epic 35:** Configuration Extensions (ECE) 📝
- **Epic 38:** World & Locations ⬜
- **Epic 39:** Item System Extensions ⬜
- **Epic 40:** Blog System ⬜
- **Epic 43:** NSFW Game Mechanics 📝
- **Epic 44:** Worlds Extension ⬜

### P3 — Deferred (Post-MVP)

- Infrastructure epics (Headless, Transport, Multi-Session, etc.)
- Embeddable Engine (Far Fetched)
- Vision epics from `docs/ideas/`

---

## Epic Dependency Graph

```
Epic 33 (Multi-Instance) ──→ Epic 32 (Deployment Topologies)
                          ──→ Epic 34 (Data Integrity)

Epic 34 (Data Integrity) ──→ Epic 32 (Deployment Topologies)

Epic 22 (RPG Core) ──→ 15 sub-systems (Battle, Magic, Crafting, etc.)

Epic 37 (Plugin System) ──→ Epic 29 (Provider & Plugin Ecosystem)

Epic 35 (ECE) ──→ Epic 26 (Avatar & Expression, via emotions)
               ──→ Epic 22 (RPG, via status effects)
               ──→ Epic 37 (Plugin, via extension store)
```

---

## Idea → Epic Pipeline

Ideas in `docs/ideas/` become epics when they get a detailed plan in `.plan/epics/`.
Top recommendations from the ideas hub:

| # | Idea | Effort | Status |
|---|------|--------|--------|
| 6 | Regex output transforms | Low | Quick Win Q1 |
| 1 | Emotion-reactive portraits | Med | Covered by Epic 26 + Epic 35 |
| 7 | Auto-translation layer | Med | Covered by Epic 15 |
| 10 | Lore-consistency checker | High | Covered by Epic 25 |
| 14 | World continues without you | High | Covered by Epic 31 |

**Dynamic re-addition:** To promote an idea to an epic:
1. Create `.plan/epics/epic-<name>.md` with implementation plan
2. Add numbered row to this file and `plan.md`
3. Add to `roadmap.md` if user-facing
