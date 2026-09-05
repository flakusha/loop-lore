<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: vn choice FE/BE contract mismatch renders blank labels

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Small

## Resolution

Fixed in `fix-batch-vn-assets-fe` (commit pending). The FE now rides the `/api/v1` versioned contract (user confirmed `v1` is required) and tolerates both backend shapes:

- `src/frontend/vn/choice-cards.ts` `loadChoices` reads `data.choices ?? data.data ?? []`, maps `selected: c.selected === 1 || c.selected === true || c.is_active === 1` and `label: c.label ?? c.text ?? "Untitled choice"`. URLs kept at `/api/v1/chats/${chatId}/vn-choices?sceneIndex=` (GET), `/api/v1/chats/${chatId}/vn-choices/:choiceId/select` (POST), `/api/v1/chats/${chatId}/location` (PUT).
- The guarded backend (`src/routes/chats/vn-choices.ts` mounted inside `chatsRoutes` with `/api/v1` prefix from `src/routes/v1/index.ts`) returns `{ choices: [{ label, selected: 0|1, ... }] }` — the FE's `label`/`selected` mapping matches it directly.

Test: `src/routes/chats/vn-choices.test.ts` — participant lists choices at `GET /api/v1/chats/:id/vn-choices` (200, `{ choices: [{ label: "Approach the glowing door", selected: 0 }] }`); non-participant 404 (not owner-only). 15/15 pass, typecheck EXIT=0, dprint clean.

## Summary

src/frontend/vn/choice-cards.ts:83-93 loads ?scene= expecting data[].text/is_active/selection_count/choice_index; new backend returns {choices:[{label,selected,selected_at}]} reading ?sceneIndex; legacy {data:[{label,status,...}]}. selected always false; label undefined -> blank. Align one backend shape + query key to FE (or update FE).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
