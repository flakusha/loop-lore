# EPIC: Deno Support (Possible Node)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Issue:** `821ab24`
**Type:** Research Epic

## Summary

Add Deno (and possible Node.js) support alongside Bun. Allow running loop-lore on alternative runtimes for broader ecosystem compatibility.

## Scope

- Deno runtime support (TypeScript native, URL imports, Web APIs)
- Node.js compatibility layer (if feasible)
- Runtime detection and abstraction
- Build targets for each runtime
- Documentation for each runtime

## Research Questions

- Can we abstract runtime-specific APIs (file system, process, crypto)?
- What Bun-specific APIs are we using that need shims?
- Is Deno's `bun:sqlite` equivalent viable (`deno:sqlite`)?
- Performance tradeoffs between runtimes

## Tasks

- [ ] Audit Bun-specific API usage across codebase
- [ ] Research Deno SQLite options
- [ ] Design runtime abstraction layer
- [ ] Create Deno entry point and build target
- [ ] Test core functionality on Deno
- [ ] Document Deno setup and usage

### Fresh.js Frontend Strategy

Fresh.js (Deno-native, islands architecture, zero client JS by default) can serve
as an alternative frontend for the headless API. Integration points:

| Concern | Solution |
|---------|----------|
| Entry point | `src/runtime/deno/fresh.ts` — Fresh app adapter |
| Routing | Fresh routes consume OpenAPI endpoints |
| State | Fresh handlers call `/api/*` endpoints |
| Build target | `deno task fresh:build` → static assets |
| Deployment | Deno Deploy native, Docker fallback |

## Tasks (Deno + Fresh.js)

- [ ] Create `src/runtime/adapters/` abstraction layer
- [ ] Add Fresh.js frontend entry point with OpenAPI client
- [ ] Replace Bun-specific APIs: `bun:sqlite` → `drizzle-sqlite` or Deno KV
- [ ] Migrate `process.versions.bun` checks to runtime feature detection
- [ ] Create `deno.json` with tasks for dev/build/deploy
- [ ] Test Fresh.js frontend against OpenAPI backend
- [ ] Add Deno Deploy configuration (`deployctl.json`)
- [ ] Document Fresh.js setup in `docs/spec/deno-support.md`

## Files

- `src/runtime/` — runtime abstraction (does not exist yet)
- `src/server.ts` — entry point (needs abstraction)
- `src/db/index.ts` — SQLite layer (needs abstraction)
- `deno.json` — Deno configuration
- `docs/spec/deno-support.md` — Deno support specification

## Linked Tasks

- TASK-deno-support.md
