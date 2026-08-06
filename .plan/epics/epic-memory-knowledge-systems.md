# Epic: Memory & Knowledge Systems

**Status:** 🟡 Partial (three-tier scopes, budget, extraction, injection, provision, shareability, decay, promotion, purge built)
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** memory, knowledge, three-tier, episodic, semantic, procedural

## Overview

Three-tier memory system — episodic, semantic, and procedural memory. Covers memory selection UI, lorebook activation, and cross-chat memory persistence.

## Reference

- Spec: `docs/spec/memory-system.md`
- Future features plan: `.plan/future-features-plan.md` (Tier 2)

## Features

| Feature             | ID           | Effort | Description                                      |
| ------------------- | ------------ | ------ | ------------------------------------------------ |
| Three-tier memory   | FEA-2026-052 | High   | Episodic/semantic/procedural per spec            |
| Memory selection UI | FEA-2026-053 | Med    | Mid-chat panel for pinning, selection            |
| Lorebook activation | FEA-2026-054 | Med    | Sticky entries, cooldowns, activation conditions |
| Cross-chat memory   | FEA-2026-055 | Med    | Persistent persona/knowledge across workspaces   |

## Acceptance Criteria

- [ ] Three-tier memory system implemented
- [ ] Memory selection UI functional
- [ ] Lorebook activation with cooldowns works
- [ ] Cross-chat memory persists across workspaces

## Dependencies

- `actor_memories` table (existing)
- Memory system spec (`docs/spec/memory-system.md`)
