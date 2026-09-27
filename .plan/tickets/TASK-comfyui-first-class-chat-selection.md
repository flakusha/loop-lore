<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI Chat + User Preferred Workflow Selection

**Effort:** Medium
**Summary:** Let a chat (or a user) persist a preferred ComfyUI workflow, with sane defaults behind it.
**Context:** `image-gen-route.ts` accepts a `workflow?: string` body param, but nothing persists a preference and no UI surfaces the choice. `pickSdProvider()` picks a provider by `purpose` with no workflow or model-family awareness.
**Acceptance Criteria:** A pure `resolveWorkflow` resolver over a documented specificity order, preference columns for chat and user, and a chat settings control.

**Priority:** P1 — High
**Status:** Not Started
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** `TASK-comfyui-first-class-workflow-library`, `TASK-comfyui-first-class-admin-workflows`

## Description

Phase 3 of `epic-comfyui-first-class-citizen`.

`handleImageGeneration` (`src/generation/image-gen-route.ts:53`) reads a `workflow`
string from the request body and passes it to `generateImages`. That is the whole
of the selection surface: the caller must already know a workflow id. There is no
stored preference, no default, and no way for a user to say “in this chat I want
Anima” once instead of on every generation call.

### Resolution order

A pure function, most-specific-first:

```
resolveWorkflow(bodyWorkflow?, chatPref?, userPref?, familyHint?) →
  bodyWorkflow                              // explicit request param, wins
  ?? chatPref
  ?? userPref
  ?? default row for (familyHint, category)
  ?? single enabled row for that family
  ?? null
```

Pure and unit-testable; at most three row reads. When it returns `null`, the
caller falls back to today's behavior (no workflow, provider default) rather than
erroring — selection must never be a new hard failure mode.

`familyHint` exists so a caller with domain knowledge (a VN scene wanting a
particular model family) can steer the default without hardcoding a workflow id.

### Preference storage

New nullable columns on `chats` and `users`, following the existing
preference-column pattern (compare `nsfw_user_preferences` in the schema
manifest). A dedicated preferences table is the alternative; prefer the column
unless per-user workflow sets grow (epic Open Question 4 — default is
server-wide).

## Acceptance Criteria

- [ ] `resolveWorkflow` implemented as a pure function with no I/O.
- [ ] Unit tests cover every rung of the specificity order: explicit body param
      beats chat pref; chat pref beats user pref; user pref beats the family
      default; a family default beats a lone enabled workflow; no candidate →
      `null`.
- [ ] Unit test that a `null` return does not throw and callers degrade to the
      pre-existing no-workflow path.
- [ ] Migration adds nullable preference columns to `chats` and `users`.
- [ ] `handleImageGeneration` consumes the resolver; an explicit `workflow` body
      param still takes precedence (backward compatible).
- [ ] Chat settings UI: preferred-workflow picker, grouped by family/category,
      showing only `enabled` workflows, with a clear/reset affordance.
- [ ] User-level preference surfaced and settable (defaults unset).
- [ ] A disabled workflow is not selectable as a preference, and an existing
      preference pointing at a disabled workflow degrades gracefully (falls
      through to the next rung) instead of failing the request.
- [ ] Preference write path is ownership-checked — a user cannot set another
      user's image preference.

## Technical Notes

- `handleImageGeneration` already runs `checkChatAccess` on `chatId`; the chat
  preference read must not become an existence oracle for chats the caller cannot
  access.
- `generateImages` currently dispatches on a single `ImageProviderConfig`; there
  is no image-provider failover loop (the `buildFailoverList` in
  `src/generation/providers/registry.ts` is LLM-only). Do not assume a fallback
  chain exists for image generation here.
- `resolveBackendUrls` (`src/generation/lora/routes/urls.ts:23-28`) resolves
  ComfyUI base URLs by scanning `sd[]` for `apiFamily === "comfyui"`, defaulting
  to `http://localhost:8188`. Workflow selection is downstream of that and must
  not duplicate the lookup.
- Keep the resolver pure so the specificity order is testable without a DB —
  that is the whole reason for the ticket boundary.


git issue: 5831b4d
