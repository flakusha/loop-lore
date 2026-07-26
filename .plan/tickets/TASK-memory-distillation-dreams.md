# TASK: Memory Distillation & Dream System

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-memory-systems-three-tier
**Tags:** memory, distillation, dreams, recall, consolidation

## Description

Add memory distillation and dream mechanics to the Three-Tier Memory System epic — characters can distill memories into stronger forms, experience dreams that blend memories, and share memories with companions. Extends the memory system beyond storage into transformation and experience.

## How It Extends Existing Work

Builds on the Three-Tier Memory System epic's episodic/semantic/procedural memory tiers. Adds distillation, dreaming, and sharing mechanics on top of the existing memory storage and decay logic.

## Acceptance Criteria

- [ ] Memory distillation — convert weak memories into stronger, more vivid forms
- [ ] Dream system — characters experience dream sequences that blend memories
- [ ] Memory sharing with companions (trust-based, privacy-aware)
- [ ] Distillation cost (time, resources, relationship investment)
- [ ] Dream journal — record and reflect on dream content
- [ ] `GET/POST /api/memory/distill` route
- [ ] `GET /api/memory/dreams` route
- [ ] `POST /api/memory/share` route
- [ ] Frontend memory distillation interface
- [ ] Frontend dream journal with dream visualization
- [ ] Frontend memory sharing consent panel

## Technical Notes

- Distillation uses existing memory decay rate as a cost factor
- Dreams are procedurally generated from memory fragments using LLM
- Memory sharing respects privacy levels from Character Memory Injection (TASK-character-memory-injection)
- Integrates with Memory Promotion Pipeline for auto-distillation of promoted memories
