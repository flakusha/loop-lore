# TASK: Keyphrase-Triggered Memory Recall

**Status:** Not Started
**Priority:** Low-Medium
**Effort:** Low-Medium
**Created:** 2026-08-14
**Source:** Platform research deep-dive (Kindroid journals)

## Description

Implement keyphrase-triggered memory recall system where specific memories can be reliably retrieved when the user mentions keyphrases. Inspired by Kindroid's journal entry system (up to 8 keyphrases per entry, 3 recalled per message).

## Requirements

1. **Keyphrase Assignment**: each memory can have up to 8 case-insensitive keyphrases
2. **Reliable Recall**: when user message contains a keyphrase, associated memory is always recalled
3. **Per-Message Limit**: max 3 keyphrase-triggered recalls per message (prevent context flooding)
4. **Global vs Character**: global keyphrases shared across all characters, character-specific ones private
5. **Keyphrase Management UI**: view, edit, add/remove keyphrases per memory
6. **Best Practices**: unique, non-generic keyphrases; concise and precise wording

## Mapping

- **Platform Candidate**: Kindroid journal pattern
- **Epic**: Memory & Knowledge Systems (FEA-2026-060)
- **Integration**: memory retrieval, lorebook activation (complementary)

## Acceptance Criteria

- [ ] Memories can have keyphrases assigned
- [ ] Keyphrase match triggers reliable recall
- [ ] Per-message recall limit configurable (default 3)
- [ ] Global vs character keyphrase separation
- [ ] UI for managing keyphrases

## References

- Kindroid journal entries: https://kindroid.ai/docs/article/memory/
