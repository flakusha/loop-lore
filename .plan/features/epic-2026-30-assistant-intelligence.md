# Epic 2026-30: Assistant Intelligence

**Status:** Not Started (P2)
**Priority:** Medium
**Source:** docs/spec/assistant-commands.md, docs/frontend/chat/assistant.md

## Summary

Intelligent assistant features: regex transforms, smart-regen, creative studio, lore consistency checking, and prompt injection safety.

## Linked Tasks

| Task          | Title                          | Priority | Status      |
| ------------- | ------------------------------ | -------- | ----------- |
| FEAT-2026-013 | Regex output transforms        | Low      | Not Started |
| FEAT-2026-014 | Smart-regen transforms         | Low      | Not Started |
| FEAT-2026-018 | Creative Studio Extension      | Medium   | Not Started |
| FEAT-2026-024 | Lore Consistency Checker       | Medium   | Not Started |
| FEAT-2026-032 | Prompt Injection Risk Analysis | Medium   | Not Started |

## Intelligence Features

### Regex Transforms

- Parse LLM output for structured data
- Extract dice rolls, stat blocks, item cards
- Transform to UI components

### Smart-Regen

- One-click draft improvement
- Grammar/style suggestions
- Alternative phrasings

### Creative Studio

- `/improve` command
- `/image` command
- Document analysis (RAG)
- RPG item generation

### Lore Consistency

- Cross-reference character/world data
- Flag contradictions
- Suggest corrections

## Implementation Phases

### Phase 1: Regex Transforms

- [ ] Output parser for common patterns
- [ ] Transform registry
- [ ] UI component injection

### Phase 2: Smart-Regen

- [ ] Improvement prompt templates
- [ ] Draft comparison UI
- [ ] Confidence scoring

### Phase 3: Creative Studio

- [ ] /improve command handler
- [ ] /image command handler
- [ ] Document analysis pipeline
- [ ] Item generation pipeline

### Phase 4: Lore Consistency

- [ ] World state cross-reference
- [ ] Contradiction detection
- [ ] Suggestion engine

## Files

- `src/assistant/transforms/regex.ts` — Regex parser
- `src/assistant/transforms/smart-regen.ts` — Draft improvement
- `src/assistant/commands/improve.ts` — /improve
- `src/assistant/commands/image.ts` — /image
- `src/assistant/commands/analyze.ts` — Document analysis
- `src/assistant/commands/generate-item.ts` — Item generation
- `src/assistant/lore-checker.ts` — Lore consistency
