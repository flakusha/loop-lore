# TASK: Assistant scenario-source store — real implementation (DB + service + blog bridge)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Large
**Epic:** epic-assistant-generation-extensions (Phase 4), epic-blog-system

## Summary

The scenario-source module (`src/assistant/scenario-source.ts`) was **deleted
2026-08-14 (`915842dc`)** as a "dead stub, all TODO" and recovered to
`tree/recover-deleted-features` (branch `recover-deleted-features`, commit
`1cc36b9c`). It is implementable: the recovered file is a *design seed*, not dead
code — all four functions are TODO stubs returning fake IDs/empty arrays, and
**no backing DB table exists**. The blog system it bridges into IS active
(`src/routes/blog/*`, `src/rpg/blog/service/*`). This task builds the real
scenario-source feature from the recovered interface.

## Current State (verified 2026-08-14)

- `src/assistant/scenario-source.ts` (98 lines) declares:
  - `ScenarioOrigin = "creative_llm" | "blog_seed" | "manual"`
  - `ScenarioSource` (id, origin, world_sketch, reusable, tags[], created_at, last_used_at?)
  - `storeScenarioSource(db, source)` → TODO: insert
  - `findScenarioSources(db, query, limit)` → TODO: FTS search, returns `[]`
  - `getRandomScenarioSource(db)` → TODO: random select, returns `null`
  - `bridgeToBlog(db, scenarioId, blogPostId)` → TODO: link to blog world seed
- **No DB table**: `scenario_sources` / `world_seed` absent from `src/db/schema-blog.ts`
  and `src/db/schema.ts` (blog tables present: `blog_posts`, `blog_comments`,
  `blog_tags`, `blog_follows`, `blog_rag_sources` only). No migration exists.
- Blog system active: `src/routes/blog/{posts,comments,follows,rag,moderation}.ts`,
  `src/rpg/blog/service/*`. Creative generation (`FEAT-098`, closed) described
  "world seeds / scenario blueprints" but produced no scenario-source table.
- Zero importers of `src/assistant/scenario-source.ts` (so it never broke the build).

## Acceptance Criteria

### Phase 1 — DB (required)

- [ ] New migration `src/db/migrations/*` creating `scenario_sources`:
      id (pk), origin (enum: creative_llm|blog_seed|manual), world_sketch (text),
      reusable (bool), tags (json array), usage_count (int, default 0),
      created_at, last_used_at (nullable). Add `scenario_blog_bridges`
      (scenario_id FK, blog_post_id FK) if bridge is persisted separately.
- [ ] Regenerate downstream schema: `bun run db:sync-types && bun run db:sync-manifest`;
      verify `bun run db:schemas:check` green. Do NOT hand-edit generated files.
- [ ] Update Kysely `DB` types + `src/validation/db-schemas.ts` via the generator.

### Phase 2 — Service (required)

- [ ] Implement `storeScenarioSource` / `findScenarioSources` / `getRandomScenarioSource`
      against the new table (real Kysely queries; `find` matches world_sketch + tags,
      orders by relevance + last_used_at; `getRandom` selects by reusable).
- [ ] Implement `bridgeToBlog` linking a scenario source to `blog_post` world seed.
- [ ] Follow patterns: structured logging, `Result` type, no bare `any`, no
      DB-specific imports in non-Kysely modules. Keep file < 200 lines.

### Phase 3 — Wire + tests (required)

- [ ] Route or consumer: expose scenario source behind a route or assistant command
      (recommend reusing recovered `src/assistant/` home; register where `/image`
      generation dispatches). State the chosen integration point in the ticket.
- [ ] Unit tests `src/assistant/scenario-source.test.ts` (or service test) covering:
      store→find roundtrip, tag/world_sketch match, random-reusable-only, bridge
      insert. Run `bun test src/assistant/`.
- [ ] `bun run check` green (typecheck ×4, lint, dprint, db schema gate).

## Notes / Risks

- This is **new scope, not recovery**: the recovered file is the contract, not the
  implementation. Do not ship a "finished" ticket when it is unbuilt — mark Stages
  done as landed.
- Do NOT restore `sd.ts` — the real SD stack exists (`src/generation/providers/*`,
  `services/sd-discovery.ts`). Scenario-source is independent of SD.
- Tags stored as JSON: follow existing `metadata` JSON-column pattern
  (`blog_posts.metadata` is a generated string) for consistency.
- Blog `generated_world_seed` bridging may be partially speculative — confirm the
  blog creative-generation path before finalizing the bridge mapping (FEAT-098 closed,
  but rpg/blog service is live).

## Linked Epics

- `epic-assistant-generation-extensions.md` (Phase 4: "Scenario source store + reuse in generation")
- `epic-blog-system.md` ("consume generated-world seeds")
- `EPIC-055` (Assistant Generation Extensions, git issue `29d4e8c`)
