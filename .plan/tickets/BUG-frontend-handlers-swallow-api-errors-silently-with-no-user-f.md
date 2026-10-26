<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: frontend handlers swallow API errors silently with no user feedback

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-frontend-components

**Summary:**

Three frontend VN/character-page handlers use bare `catch { return null; }` or
`catch { /* ignore */ }` with no user-facing error feedback. When the API call
fails (non-OK, network error), the user gets zero indication and the UI state
does not update.

## Evidence

1. `src/frontend/pages/characters.ts:192-193` — deleteCharacter:

   ```ts
   } catch {
     /* ignore */
   }
   ```

   Non-OK DELETE responses land in the catch block silently. No toast, no error
   message; the modal stays open and the character stays in the grid.

2. `src/frontend/vn/choice-cards.ts:230-231` — selectChoice:

   ```ts
   } catch {
     return null;
   }
   ```

   The caller receives null with no error indication. The choice card stays
   unselected.

3. `src/frontend/vn/question-cards.ts:225-226` — answerQuestion:

   ```ts
   } catch {
     return null;
   }
   ```

   Same pattern: the question card stays unanswered with no user feedback.

## Source

- review-assets-db-frontend.md blocking findings B1, B2, B3
- review-consolidated.md (positive controls section confirms the pattern)
- File:line: `src/frontend/pages/characters.ts:192`,
  `src/frontend/vn/choice-cards.ts:230`, `src/frontend/vn/question-cards.ts:225`

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 1e2c548 (registry tip: 82464fcdc Konstantin Fedotov Close issue)
