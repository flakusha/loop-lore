# Immediate Plan

> **Last updated:** 2026-07-30 — Post-reconciliation priorities
> **Status:** P0 foundations in progress

---

## P0 — Critical Path (Blocking)

| Priority | Epic / Task                                                    | Key Deliverables                                                                                                                                                                  | Status         |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **P0**   | **Data Integrity Phase 1** — Config Guards & Backend Selection | • Reject `sqlite` when `INSTANCE_COUNT > 1`<br>• Warn on network filesystem WAL path<br>• Fix stale MySQL claim in `architecture.md`                                              | ⬜ Not Started |
| **P0**   | **NSFW Moderation Safety Infrastructure**                      | • NSFW enable/disable per chat/user/world<br>• Non-public audit log of NSFW gate decisions<br>• Consent state tracking (from Shared Schemas)<br>• Generation boundary integration | ⬜ Not Started |
| **P0**   | **Shared Schemas** — Reputation, Consent, NSFW Rating          | • Unified `ReputationScore` (Social, Faction, NSFW)<br>• Unified `ConsentState` (NSFW + Chat Lifecycle)<br>• `NSFWContentRating` runtime enforcement at generation boundary       | ⬜ Not Started |

---

## P1 — High Priority (Post-P0)

| Priority | Epic / Task                                                           | Key Deliverables                                                                                                                                                                                                  | Status         |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **P1**   | **NSFW Integration Gaps** — Housing, Weather, Social, Disease         | • Housing: private spaces → encounter modifiers<br>• Weather: mood/pheromone/location availability<br>• Social: shared reputation, skill prerequisites<br>• Disease: reproductive health, STD transmission        | ⬜ Not Started |
| **P1**   | **Battle Integration Gaps** — Items, Social, NPC, Weather, Resolution | • Equipment stats → combat modifiers<br>• Social skills (intimidate/negotiate) in combat<br>• NPC personality-driven AI<br>• Weather/terrain environmental modifiers<br>• Unified dice resolution for all systems | ⬜ Not Started |
| **P1**   | **Data Integrity Phase 2** — `data_version` Optimistic Concurrency    | • `UPDATE ... WHERE data_version = ?` on high-contention tables<br>• `409 Conflict` on version mismatch<br>• Unit + integration tests                                                                             | ⬜ Not Started |

---

## P2 — Core Gameplay Systems (Post-P1)

| Priority | Epic                  | Key Deliverables                                                                | Status         |
| -------- | --------------------- | ------------------------------------------------------------------------------- | -------------- |
| **P2**   | **RPG Mechanics**     | Dice engine, stat system, combat engine, XP/loot                                | ⬜ Not Started |
| **P2**   | **Character System**  | Multi-personality switching, mood/happiness meter, memory injection probability | ⬜ Not Started |
| **P2**   | **World Locations**   | Location discovery, travel time, world NPC integration                          | ⬜ Not Started |
| **P2**   | **Three-tier Memory** | Episodic/semantic/procedural memory system                                      | ⬜ Not Started |

---

## P3 — Advanced Features (Post-P2)

| Priority | Epic                  | Key Deliverables                               | Status         |
| -------- | --------------------- | ---------------------------------------------- | -------------- |
| **P3**   | **Artifact System**   | Code/docs/datasets as assets                   | ⬜ Not Started |
| **P3**   | **Visual Novel Mode** | Image + text overlay, transitions, typewriter  | ⬜ Not Started |
| **P3**   | **Plugin Ecosystem**  | Plugin management API, marketplace, sandboxing | ⬜ Not Started |

---

## Milestone Gates

| Gate       | Trigger | Criteria                                                                                                                                    |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gate A** | Post-P0 | All observability + testing infrastructure stable; Data Integrity Phase 1 complete; NSFW moderation live; Shared schemas enforced           |
| **Gate B** | Post-P1 | Import/Export + Admin functional with encryption; NSFW integrations complete; Battle integrations complete; Data Integrity Phase 2 complete |
| **Gate C** | Post-P2 | Core RPG + Memory systems live; Character + World systems functional                                                                        |
| **Gate D** | Post-P3 | Advanced features + plugin ecosystem operational                                                                                            |

---

## Notes

- **P0 items are blocking** — no safe multi-instance deployment without Data Integrity Phase 1; no NSFW content without moderation infrastructure; no cross-system data integrity without Shared Schemas
- **NSFW content is a competitive differentiator** — opt-in by default, but safety infrastructure must exist before mechanics
- **Cross-system integration gaps** (Battle, NSFW) are high-leverage — fixing them unblocks multiple downstream features
- **Reconciliation complete** — backlog/roadmap now reflect actual implementation state (see `backlog.md`)
