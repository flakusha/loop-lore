# Immediate Plan

> **Last updated:** 2026-07-30 — Validated P0/P1 against code; accessibility assessed
> **Status:** P0 foundations in progress; P1 partially complete; accessibility ~60% done

---

## P0 — Critical Path (Blocking)

| Priority | Epic / Task                                                    | Key Deliverables                                                                                                                                                                  | Status         |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **P0**   | **Data Integrity Phase 1** — Config Guards & Backend Selection | • Reject `sqlite` when `INSTANCE_COUNT > 1`<br>• Warn on network filesystem WAL path<br>• Fix stale MySQL claim in `architecture.md`                                              | ⬜ Not Started |
| **P0**   | **NSFW Moderation Safety Infrastructure**                      | • NSFW enable/disable per chat/user/world<br>• Non-public audit log of NSFW gate decisions<br>• Consent state tracking (from Shared Schemas)<br>• Generation boundary integration | 🟡 Partial — mechanics exist, safety infra missing |
| **P0**   | **Shared Schemas** — Reputation, Consent, NSFW Rating          | • Unified `ReputationScore` (Social, Faction, NSFW)<br>• Unified `ConsentState` (NSFW + Chat Lifecycle)<br>• `NSFWContentRating` runtime enforcement at generation boundary       | ✅ Complete — `src/schemas/` implemented |

---

## P1 — High Priority (Post-P0)

| Priority | Epic / Task                                                           | Key Deliverables                                                                                                                                                                                                  | Status      |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **P1**   | **Memory Tiers Wiring** — Selection UI, Lorebook, Cross-Chat          | • Memory selection UI (pinning, mid-chat panel)<br>• Lorebook activation with cooldowns<br>• Cross-chat memory persistence across workspaces<br>• Full generation pipeline integration                            | ✅ Complete |
| **P1**   | **NSFW Integration Gaps** — Housing, Weather, Social, Disease         | • Housing: private spaces → encounter modifiers<br>• Weather: mood/pheromone/location availability<br>• Social: shared reputation, skill prerequisites<br>• Disease: reproductive health, STD transmission        | ✅ Complete |
| **P1**   | **Battle Integration Gaps** — Items, Social, NPC, Weather, Resolution | • Equipment stats → combat modifiers<br>• Social skills (intimidate/negotiate) in combat<br>• NPC personality-driven AI<br>• Weather/terrain environmental modifiers<br>• Unified dice resolution for all systems | ❌ **NOT COMPLETE** — zero battle files in src/rpg/ |
| **P1**   | **Data Integrity Phase 2** — `data_version` Optimistic Concurrency    | • `UPDATE ... WHERE data_version = ?` on high-contention tables<br>• `409 Conflict` on version mismatch<br>• Unit + integration tests                                                                             | ✅ Complete |

---

## P1.5 — Accessibility (Parallel with P1 residual)

| Priority | Epic / Task                                                  | Key Deliverables                                                                                             | Status         | Effort |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------- | ------ |
| **P1.5** | **Accessibility — remaining gaps**                           | • `focus-visible` CSS on all focusable elements<br>• Focus trap for modals<br>• Skip links<br>• Screen reader live regions<br>• Touch gesture library<br>• 44×44px mobile tap targets | 🟡 ~60% done   | Medium |

**Already done**: i18n phases 1-5 ✅, keyboard shortcuts (4 bindings), 43 ARIA attributes in HTML, template adoption (39/44 templates)
**Remaining**: `src/frontend/a11y/` module (focus-manager, touch-gestures, screen-reader utils, responsive helpers), `a11y.css` (focus-visible, reduced-motion, high-contrast), skip links, modal focus traps

---

## P2 — Core Gameplay Systems (Post-P1)

| Priority | Epic                 | Key Deliverables                                                                | Status         |
| -------- | -------------------- | ------------------------------------------------------------------------------- | -------------- |
| **P2**   | **RPG Mechanics**    | Dice engine, stat system, combat engine, XP/loot                                | ⬜ Not Started |
| **P2**   | **Character System** | Multi-personality switching, mood/happiness meter, memory injection probability | ⬜ Not Started |
| **P2**   | **World Locations**  | Location discovery, travel time, world NPC integration                          | ⬜ Not Started |

---

## P3 — Advanced Features (Post-P2)

| Priority | Epic                  | Key Deliverables                               | Status         |
| -------- | --------------------- | ---------------------------------------------- | -------------- |
| **P3**   | **Artifact System**   | Code/docs/datasets as assets                   | ⬜ Not Started |
| **P3**   | **Visual Novel Mode** | Image + text overlay, transitions, typewriter  | ⬜ Not Started |
| **P3**   | **Plugin Ecosystem**  | Plugin management API, marketplace, sandboxing | ⬜ Not Started |

---

## Milestone Gates

| Gate       | Trigger | Criteria                                                                                                                                                                                         |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Gate A** | Post-P0 | All observability + testing infrastructure stable; Data Integrity Phase 1 complete; NSFW moderation live; Shared schemas enforced                                                                |
| **Gate B** | Post-P1 | Import/Export + Admin functional with encryption; NSFW integrations complete; Battle integrations complete; Data Integrity Phase 2 complete; Memory tiers wired with UI + cross-chat persistence |
| **Gate C** | Post-P2 | Core RPG + Memory systems live; Character + World systems functional                                                                                                                             |
| **Gate D** | Post-P3 | Advanced features + plugin ecosystem operational                                                                                                                                                 |

---

## Notes

- **P0 items are blocking** — no safe multi-instance deployment without Data Integrity Phase 1; no NSFW content without moderation infrastructure; no cross-system data integrity without Shared Schemas
- **NSFW content is a competitive differentiator** — opt-in by default, but safety infrastructure must exist before mechanics
- **Cross-system integration gaps** (Battle, NSFW) are high-leverage — fixing them unblocks multiple downstream features
- **Reconciliation complete** — backlog/roadmap now reflect actual implementation state (see `backlog.md`)
