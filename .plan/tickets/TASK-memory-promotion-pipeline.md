# TASK: Implement memory promotion pipeline

**Issue:** 22f6cd99-562f-4df1-a09a-f7f343a41b69
**Status:** open
**Priority:** medium
**Epic:** epic-memory-knowledge-systems

## Overview

Wire message promotion to memory extraction and storage.

## Problem

`ContextWindow.promotedToMemory` is always empty. `selectMessagesForPromotion()` identifies messages to promote, but no pipeline extracts memories from them.

## Scope

- When context window trims messages, extract memories from promoted messages
- Detect scope: character (if message is from/about a character), world (if world-linked), assistant (if system-generated)
- Store extracted memories in `actor_memories` with correct scope
- Wire `transitions.ts` → `memory/extraction.ts` → DB

## Acceptance Criteria

- [ ] Promoted messages trigger memory extraction
- [ ] Extracted memories get correct scope (character/world/assistant)
- [ ] `promotedToMemory` array is populated in ContextWindow
- [ ] Existing memory extraction tests still pass

## Files

- `src/chat/transitions.ts` (modify)
- `src/chat/context-window.ts` (may modify)
- `src/memory/extraction.ts` (read-only)
