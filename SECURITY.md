# Security Policy

## Supported Versions

| Version | Support Status     |
| ------- | ------------------ |
| 0.x     | Active development |

## Reporting a Vulnerability

Please report security vulnerabilities by opening a private issue or contacting maintainers directly.

Do not open public issues for security vulnerabilities.

## Security Considerations

loop-lore handles user data and API keys. If you discover:

- Authentication bypasses
- SQL injection vectors
- XSS in chat messages
- Improper encryption handling
- Path traversal in asset uploads

Please report immediately.

## Encryption Support

See `docs/spec/encryption.md` for encryption architecture. Client-side encryption is optional and under development.

## Age Gate

Content warnings: loop-lore supports age-gated content. See `src/age-gate/` for implementation.
