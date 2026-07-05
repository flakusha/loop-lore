# Recommendations

## Schema Design
- Every entity with lifecycle states gets a `StateDef` + `StateMachine` in its enum file
- Composite states (status × visibility) validated via `CompositeValidator`
- Prefer `TEXT` columns with string enums over `INTEGER` magic constants
- JSON blob columns OK for flexible settings; typed fields for queryable data

## Code Structure
- One class/feature per file; `<200` lines preferred; `index.ts` exports public API
- Feature family grouped in `src/<name>/` with `service.ts | controller.ts | types.ts`
- Avoid circular imports — import from `enums.ts` barrel, never sibling feature modules
- **Options-object parameters** — functions with 3+ params take a single destructured object (`function fn({a, b, c, d?})`) over positional args (`function fn(a, b, c, d?)`). Benefits: named at call site, optional without placeholders, auto-declared variable names inside function, extensible without breaking callers

## Error Handling
- Controllers: try/catch → proper HTTP (200/201/204/400/401/403/404/422/500/501)
- Services: throw typed errors (`NotFoundError`, `ValidationError`)
- Pipeline: `compose([errorBoundary, authenticate], handler)` wraps all routes

## State Machine Patterns
- Non-terminal states: `sending`, `partial` (system auto-transitions)
- Terminal states: `confirmed`, `failed`, `rejected`, `cancelled` (wait user action)
- Retry/continue always flows through `partial` — single re-entry point
- Never add `is_*` booleans to avoid status explosion; extend the enum instead

## DB Access
- Kysely queries always use bind parameters (never string interpolation)
- Kysely Migrator for schema changes; migration = source of truth
- Test assertions against raw SQL inserts to catch migration drift

## Async Hygiene
- Always `await` promises or `.catch()` explicitly
- No bare `.then()` waterfalls — `async/await` only
- Timeout all external calls (LLM, file uploads) with `AbortController`

## Allocation & Performance
- Chained `.map().filter().reduce()` allocates intermediate arrays (k·n memory). Use single `for..of` pass or single `.reduce()` for hot paths
- Pre-allocate result buffers when size is known: `new Array(len)` instead of repeated push
- In-place mutation (`.sort()`, `.splice()`, direct index assignment) preferred over creating new arrays for same-collection transforms
- Exception: readability wins for small/non-hot-path data (&lt;100 items, non-critical path) — keep chains legible

## LLM Generation
- Status tracked in `generation_attempts` table, not on message
- Message status reflects persistence + delivery, not generation pipeline
- `CancelReason` enum covers all abort causes (user, repetition, policy, limit, timeout, error)

## Testing
- Prefer raw SQL inserts in tests over fixtures (catches migration drift)
- Test edge states: every composite state pair, every transition
- `bun test` with Jest-compatible assertions

## Documentation
- Avoid embedding quantitative metrics (token counts, percentages, benchmark numbers) in `.agents/` docs
- Metrics go stale when code changes; they're never updated reliably
- Describe behavior qualitatively — "compresses aggressively" not "saves 46%"
- If metrics must appear, source them from automated CI output, not hand-maintained

## Agent References (this directory)
- `.agents/references/banned-patterns.md` — anti-patterns to reject in code review
- `.agents/references/recommendations.md` — preferred approaches to adopt
- Loaded via AGENTS.md `cat` includes or skill `context_files` refs
- One-page each, concrete examples, project-specific
