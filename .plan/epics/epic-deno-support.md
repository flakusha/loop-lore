# EPIC: Deno Support (Possible Node)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
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

## Files

- `src/runtime/` — runtime abstraction (does not exist yet)
- `src/server.ts` — entry point (needs abstraction)
- `src/db/index.ts` — SQLite layer (needs abstraction)
- `deno.json` — Deno configuration
- `docs/spec/deno-support.md` — Deno support specification
