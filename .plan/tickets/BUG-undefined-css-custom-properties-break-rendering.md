# BUG: Undefined CSS custom properties break rendering

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Multiple rules reference tokens defined in no theme file: (1) src/public/css/app.css:558 var(--bg-elevated) inside color-mix() — declaration invalid, background dropped. (2) app.css:2743-2957 reaction/command chip block uses foreign namespace --color-border/--color-surface/--color-primary/--color-text-secondary (themes define --border-default/--accent-primary/--text-secondary) -> invisible chips. (3) src/public/css/vn.css:597 .badge-current uses undefined --accent and --bg-primary -> badge fully invisible. (4) vn.css:276,784,820,881 var(--border-color) -> border falls back to currentColor. (5) story.css:152-359 --success/--warning frozen to hardcoded fallbacks regardless of theme. Fix: map to real theme tokens.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
