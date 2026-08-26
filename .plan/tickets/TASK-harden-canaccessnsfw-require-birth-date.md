# TASK: harden canaccessnsfw require birth date

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Epic:** review-dev-2026-08-26-security-data-integrity-merges

## Summary

canAccessNsfw skips the age check when user.birth_date is null (only checks age_gate_accepted_at). A user who accepted the age gate without a birth_date bypasses the hard min-age check. Now invoked on the generation path (0e682a38). Hardening (non-blocking, pre-existing shared logic): require birth_date when enforcing nsfwMinAge; deny if missing.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
