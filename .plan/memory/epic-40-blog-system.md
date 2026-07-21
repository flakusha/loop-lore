# Memory: Epic 40 Blog System Expansion

**Date:** 2026-07-21
**Worktree:** chore-docs-reconcile
**File:** `.plan/epics/epic-blog-system.md` (450 lines)

## What was done

Expanded Epic 40 (Blog System) with full human authoring support alongside existing LLM authoring.

### Sections added/updated

1. **Human-Authored Blogs** — New section covering:
   - Authoring workflow (draft → media → tags → preview → publish → schedule → edit)
   - Post management (draft management, version history, bulk ops, analytics, re-publish)
   - Tags & categories (`BlogPostTags` interface with free tags, category, world/character links)
   - Scheduled publishing (`BlogSchedule` interface with pending/published/cancelled states)
   - Rich text authoring (CommonMark + GFM, media insertion, code blocks, embeds, auto-save)

2. **Content Moderation** — Expanded with:
   - Moderation pipeline (pre-publish, post-publish, comment, bulk)
   - Moderation actions (hide, disable, approve, flag)
   - `ModerationConfig` interface with LLM behavior gates, human behavior gates, hide/disable policies

3. **Chat Record Reuse** — Detailed reuse of chat infrastructure for blog posts (already existed, kept as-is)

4. **Creative World Generation** — Detailed `CreativeGeneration`, `WorldSeed`, `ItemBlueprint`, `ScenarioBlueprint` interfaces with promotion workflow

5. **Visibility Tiers** — Post/profile visibility (public/followers/private), follower tiers (reader/subscriber/patron/vip) with `FollowerTierConfig`

6. **Tags updated** — Added `human-authored` to epic tags

7. **Tasks added** — 7 new human-authoring tasks (UI, drafts, version history, tags, scheduling, post management, rich text editor)

8. **Files added** — 4 new files: `editor.ts`, `drafts.ts`, `schedule.ts`, `routes/blog-admin.ts`

### Git issues created (in master repo)

| ID | Title |
|---|---|
| 3f5f343 | FEA Blog: Human authoring UI |
| 0aec837 | FEA Blog: Draft management |
| ae4bfe2 | FEA Blog: Tags and categories |
| cd3e698 | FEA Blog: Scheduled publishing |
| fb17310 | FEA Blog: Post management |
| be60182 | FEA Blog: Content moderation pipeline |
| d8cf081 | FEA Blog: Visibility and follower tiers |
| 3c16044 | FEA Blog: Creative world generation |

### Migration

Master unstaged files (pre-commit `--allow-no-files` fix, FEAT-065 tickets, `docs/spec/template-system.md`) already present in worktree — no migration needed.
