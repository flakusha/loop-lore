# TASK: Structured LLM output utils — heal, revalidate, size-check, approve/cancel

**Epic:** epic-hidden-carriage-context.md
**Status:** Open
**Priority:** High

## Scope

- New shared utils for `json`/`toml`/`yaml` model output: deterministic
  healing (salvage largest parseable prefix/document, close truncated
  tables/arrays), schema revalidation, byte/size cap check, explicit
  approve-or-cancel return (never silent partial accept).
- Consumed first by the hidden carriage, designed for reuse by quest,
  note, and scene-transition structured payloads.
- Unit tests per format: truncated, over-size, schema-violating, and
  valid inputs; each asserts approve vs cancel + reason code.

## Acceptance

- Fuzz-corrupted TOML either heals to valid schema or cancels with code.
- Oversize payload always cancels, never truncates silently.
