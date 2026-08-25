# BUG: html lang hardcoded, no dir handling for i18n

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/views/layout.html:5 hardcodes lang=en class=dark while app ships full i18n (locale cookie, detectLocale, translated nav). Lang never follows locale; no dir attr -> RTL locales broken, wrong SR announcement.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
