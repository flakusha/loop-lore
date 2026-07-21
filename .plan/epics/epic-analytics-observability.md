# EPIC: Analytics & Observability

**Status:** ⬜ Not Started
**Priority:** Medium
**Plan.md:** §50
**Issue:** `EPIC-2026-37`

## Summary

Conversation analytics dashboard, model A/B comparison, knowledge graph visualization.

## Tasks

| Task                                            | Files                            | Effort | Source         |
| ----------------------------------------------- | -------------------------------- | ------ | -------------- |
| Conversation analytics dashboard                | `src/routes/analytics.ts` (new)  | High   | plan.md §50    |
| Model comparison A/B (uses `model_comparisons`) | `src/routes/analytics.ts`        | Med    | plan.md §50    |
| Knowledge graph visualization                   | `src/routes/analytics.ts` (new)  | High   | plan.md §50    |
| Generation quality metrics                      | `src/analytics/quality.ts` (new) | Med    | plan.md §50    |
| Sentiment over time per chat                    | `src/analytics/sentiment.ts`     | Med    | ideas #27      |
| Word clouds per chat                            | `src/analytics/wordcloud.ts`     | Low    | ideas #27      |
| Token cost tracking dashboard                   | `src/analytics/cost.ts`          | Med    | ideas #27      |
| Story-beat map per chat                         | `src/analytics/storybeats.ts`    | Med    | ideas #27      |
| Synthetic fine-tune data export                 | `src/analytics/finetune-export.ts` | High | ideas #29      |
| Automated balance playtest bot                  | `src/analytics/playtest-bot.ts`  | High   | ideas #30      |

## Ideas Merged

- `docs/ideas/analytics-meta.md` — ideas #27 (conversation analytics), #28 (model comparison), #29 (fine-tune export), #30 (playtest bot)

## Dependencies

- `model_comparisons` table (specced in `docs/spec/notifications-expansion.md`)
- Artifacts system for fine-tune export (`docs/spec/artifacts-system.md`)
- RPG engine for playtest bot (`docs/spec/rpg-mechanics.md`)
