<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

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
- **Prompt injection** — see `docs/spec/prompt-injection.md` for the current risk analysis
  (known vectors, trust posture of each prompt section, and open remediation items)

Please report immediately.

## Encryption Support

See `docs/spec/encryption.md` for encryption architecture. Client-side encryption is optional and under development.

## Age Gate

Content warnings: loop-lore supports age-gated content. See `src/age-gate/` for implementation.
