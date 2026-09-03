# Trust-boundary audits

Read-only security audits that enumerate which route handlers in
`src/routes/` cross a trust boundary (HTTP / authenticated session ↔
authenticated user / owned data) and how each crossing is currently scoped.

Audits here are evidence documents, not refactors. They classify risk and
recommend fixes; they do not modify production code.

| Audit | Scope | Status |
|---|---|---|
| [trust-boundary.md](./trust-boundary.md) | Route handlers that read `actorId` from query / body / params and whether they scope the operation by `ctx.userId`. | done |

## How to read these

Each row in the trust-boundary table lists:

- **file:line** — the exact handler entry point.
- **pattern** — `read` / `write` / `delete` and which actorId field is
  consumed (`query.actorId`, `body.actorId`, `params.actorId`).
- **current scoping** — `session` (uses `ctx.userId` via a session-bound
  guard), `client-supplied` (echoes the value with no ownership check),
  `none` (no `requireUserId` or ownership check at all).
- **risk** — `none` / `low` / `medium` / `high` / `critical`.
- **recommended fix** — concrete change; empty when already safe.

Severity rubric:

- `critical` — anonymous user can mutate or exfiltrate another user's data.
- `high` — authenticated user can mutate or exfiltrate another user's data
  because the ownership check is missing or applied to the wrong field.
- `medium` — authenticated user can read another user's data, or the
  ownership check is bypassable (e.g. worldId ownership instead of actorId
  ownership with a shared world).
- `low` — handler does not currently cross users, but the pattern
  (`body.actorId` without an explicit guard) makes future regressions easy.
- `none` — handler is gated by `requireUserId` + ownership check before any
  data is read or written.

## Adding a new audit

1. Create `docs/audit/<topic>.md`.
2. Keep it evidence-first: every row must cite a `file:line`.
3. Read-only — never modify `src/` from an audit branch.