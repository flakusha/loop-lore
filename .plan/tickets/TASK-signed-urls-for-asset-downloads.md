# TASK: Signed URLs for Asset Downloads

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** epic-asset-support-expansion

## Summary

Generate signed, time-limited URLs for secure asset downloads. Prevents direct file access and enables access control. From `epic-asset-support-expansion.md` (inferred).

## Scope

### Signed URL Generation

- Time-limited URLs (5-15 min expiry)
- HMAC signature for integrity
- Path-based signing

### Access Control

- Permission checks before signing
- User/role-based access
- Asset ownership verification

### Integration

- Download endpoints use signed URLs
- Frontend requests signed URLs
- Asset storage abstraction

## Acceptance Criteria

- [ ] Signed URL generation with HMAC signature
- [ ] Time-limited URLs with configurable expiry
- [ ] Permission checks before URL generation
- [ ] Asset ownership verification
- [ ] Download endpoints use signed URLs
- [ ] Frontend requests signed URLs for assets
- [ ] Unit tests for URL signing
- [ ] Integration tests for download workflow

## Notes

- Consider CDN integration for asset delivery
- Balance URL expiry time vs. security
- Reference existing asset system in `src/assets/`
