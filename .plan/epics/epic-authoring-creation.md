# EPIC: Authoring & Creation Tools

**Status:** ⬜ Not Started
**Priority:** Medium
**Plan.md:** §47
**Issue:** `EPIC-047`

## Summary

Builder-layer tools: procedural asset generation, plot autopilot, what-if branching, community template sharing.

## Tasks

| Task                                    | Files                              | Effort | Source    |
| --------------------------------------- | ---------------------------------- | ------ | --------- |
| Procedural asset pipelines              | `src/generation/asset-pipeline.ts` | Med    | ideas #15 |
| Plot autopilot (AI proposes next beats) | `src/story/plot-autopilot.ts`      | Med    | ideas #16 |
| What-if branch simulator + diff/merge   | `src/story/whatif-simulator.ts`    | High   | ideas #17 |
| Community template / lorebook share     | `src/routes/marketplace.ts`        | Low    | ideas #18 |

## Ideas Merged

- `docs/ideas/authoring-creation.md` — ideas #15 (procedural assets), #16 (plot autopilot), #17 (what-if simulator), #18 (community share)

## Dependencies

- Image + audio generation providers for procedural assets
- Quest engine for plot autopilot
- Conversation branching for what-if simulator
- Export/share infra for community templates
