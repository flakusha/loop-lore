> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Access Model Clarifications

## Gallery Access

### Current

- Raw endpoint with Bearer auth

### Proposed

- Signed URLs with expiration (1 hour default)
- `GET /api/assets/:id/download?token=xxxx`
- Token generated per-request, reusable within expiration window
- If download fails first time, redownload can be retried

## Chat Access

### Ownership Model

- Chat creator = master
- Participants have roles: member, gm, observer
- Private chats: members only
- Public chats: anonymous access allowed

### Permission Matrix

| Action    | Master | GM | Member | Observer | Anonymous   |
| --------- | ------ | -- | ------ | -------- | ----------- |
| Read      | ✓      | ✓  | ✓      | ✓        | public only |
| Write     | ✓      | ✓  | ✓      | ✗        | ✗           |
| Invite    | ✓      | ✓  | ✗      | ✗        | ✗           |
| GM Config | ✓      | ✓  | ✗      | ✗        | ✗           |

## Encrypted Content Access

### Private Tier

- Only chat participants with valid keys
- Key derivation: Argon2id(password) -> actor key -> chat key
- Assets inherit chat's encryption tier

### Shared Links

- Public tier chats: accessible via share token
- Standard tier: requires auth
- Private tier: share token includes encrypted key for recipient

## Admin/Moderator Functions

### Moderator Role

- Can view flagged content
- Can resolve reports
- Cannot modify system config
- Access via `/moderate` endpoints

### Admin Role

- Full access to all sections
- User management
- System configuration
- Content review
- Access via `/admin` endpoints

## World Rules for Commands

Commands can be whitelisted/blacklisted per world:

- World config: `allowed_commands: ["dice", "stats", ...]`
- GM can override individual command access
- Solo mode bypasses all restrictions
