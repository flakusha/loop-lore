---
name: agent-commit
description: >
  Commit staged changes as the AI agent (GPG-signed). User stays Author;
  agent is Committer (signs with dedicated agent GPG key) and Co-author
  trailer. NEVER pushes under any circumstances.
  Trigger: "agent commit", "commit as agent", "/agent-commit".
---

# Agent Commit — loop-lore override

**This file overrides the global `~/.agents/skills/agent-commit/` skill.**
All agent identity comes from `.credentials.env` — never hardcoded.

## Overview

Agent acts as **Committer**. User remains **Author**. Git separates these
two identities; GPG signature is always tied to the Committer (agent).

| Role      | Identity     | GPG Key            |
| --------- | ------------ | ------------------ |
| Author    | User (human) | User key (private) |
| Committer | Agent        | Agent key          |

---

## Configuration — `.credentials.env`

Agent identity is read from `$REPO_ROOT/.credentials.env` (gitignored):

```bash
# .credentials.env (NEVER commit this file)
AGENT_GPG_KEY_ID="<fingerprint>"
AGENT_GPG_NAME="<committer name>"
AGENT_GPG_EMAIL="<committer email>"
```

Shared loader: `scripts/worktree/utils/credentials.mjs` — single source
of truth for both bash and mjs scripts. Usage:

```bash
# Bash — eval into shell (direct, or via the bash wrapper):
eval "$(bun run scripts/worktree/utils/credentials.mjs)"
eval "$(./scripts/worktree/load-credentials.sh)"   # idiomatic bash wrapper

# mjs — import
import { credentials } from "./utils/credentials.mjs";
```

`scripts/worktree.sh` and `scripts/worktree/index.mjs` both use
this loader. For manual commits, read values with the loader or
parse `.credentials.env` directly.

**Never hardcode agent identity.** If `.credentials.env` is missing,
ask the user to create it from `.credentials.env.example`.

---

## Passphrase Gate — out-of-Band GPG-Agent Unlock

`gpg-agent` is a per-user daemon. Its passphrase cache is shared across
all processes of the same Linux user. opencode's `git commit -S` reuses
a warm cache silently — pinentry is never invoked inside opencode.

### One-Time System Setup (User, Do Once)

**`~/.gnupg/gpg-agent.conf`** — add if not present:

```
allow-loopback-pinentry
default-cache-ttl 28800
max-cache-ttl 86400
```

Then reload: `gpg-connect-agent reloadagent /bye`

### Per-Session Unlock (User, Once Per Session Before Agent Commits)

Run this in a **real terminal** (not inside opencode). Use the helper
script which reads `.credentials.env` automatically:

```bash
./scripts/gpg-unlock.mjs
```

Or, if the script is not executable, invoke via bun:

```bash
bun run scripts/gpg-unlock.mjs
```

Either way it reads `AGENT_GPG_KEY_ID` from `.credentials.env` automatically.

Or manually — use the key ID from `.credentials.env`:

```bash
gpg --pinentry-mode loopback \
    --sign --local-user <AGENT_GPG_KEY_ID> \
    --output /dev/null /dev/null
```

After TTL expires, run again in a real terminal.

### Non-TTY / CI Environments

In headless environments (CI, SSH without agent forwarding), pinentry
cannot display. The `gpg_merge_flags()` function in `worktree.sh`
auto-detects `/tmp/gpg-loopback` — a wrapper that passes
`--batch --pinentry-mode loopback --passphrase ""` to gpg. Create it:

```bash
cat > /tmp/gpg-loopback << 'EOF'
#!/bin/bash
exec gpg --batch --pinentry-mode loopback --passphrase "" "$@"
EOF
chmod +x /tmp/gpg-loopback
```

When present, `worktree.sh merge` and `finalize` use this wrapper
automatically for merge commit signing.

### Agent Commit Behavior

If cache is cold, `git commit -S` fails with a pinentry/no-passphrase
error. opencode cannot display pinentry itself. Agent MUST NOT retry
silently or fall back to unsigned. On failure: stop, tell user to run
the unlock command above **in their terminal**, then retry.

---

## Canonical Commit Command

**Worktree commits** — use the mjs CLI (recommended):

```bash
# Via worktree.sh (delegates to mjs):
./scripts/worktree.sh agent-commit <branch> "<type>(<scope>): <subject>"

# Direct mjs:
bun run scripts/worktree/index.mjs agent-commit <branch> "<message>"
```

**Main repo commits** — load credentials and use raw git:

```bash
eval "$(bun run scripts/worktree/utils/credentials.mjs)"
GIT_COMMITTER_NAME="$AGENT_GPG_NAME" \
GIT_COMMITTER_EMAIL="$AGENT_GPG_EMAIL" \
git -c user.signingkey="$AGENT_GPG_KEY_ID" \
    -c commit.gpgsign=true \
    commit -S \
    --no-verify \
    --author="<user name> <<user email>>" \
    -m "<type>(<scope>): <subject>"
```

Result: Author=user, Committer=agent, GPG signature=agent key.

---

## Worktree Signing

`scripts/worktree.sh` auto-configures GPG signing when creating worktrees:

```bash
# Auto-configured on create/new:
./scripts/worktree.sh new feature-xyz

# Configure on existing worktree:
./scripts/worktree.sh sign feature-xyz
```

The script sets `commit.gpgsign=true` and `user.signingkey` in the
worktree's local git config. It does **NOT** set `user.name`/`user.email`
— those are provided at commit time via `GIT_COMMITTER_*` env vars.

### Worktree Commit Pattern

```bash
cd tree/<branch>
GIT_COMMITTER_NAME="<AGENT_GPG_NAME>" \
GIT_COMMITTER_EMAIL="<AGENT_GPG_EMAIL>" \
git -c user.signingkey=<AGENT_GPG_KEY_ID> \
    -c commit.gpgsign=true \
    commit -S \
    --author="<user name> <<user email>>" \
    -m "<type>(<scope>): <subject>"
```

---

## Workflow

**MANDATORY**: Use `scripts/worktree.sh agent-commit` for worktree commits.

```bash
# CORRECT — use the script:
./scripts/worktree.sh agent-commit <branch> "<type>(<scope>): <subject>"

# WRONG — never use raw git commit in worktrees:
git commit -S -m "..."
```

For non-worktree commits (main repo), use the canonical command below.

### Steps

1. **Detect repo commit conventions** — check `git log --oneline -20`.
   Match detected convention exactly.

2. **Stage explicitly** — confirm with user which files are staged.
   Never run `git add .` silently.

3. **Compose message** — follow Version-Bump Guard below.

4. **Show full command and message** — wait for user confirmation.

5. **Execute commit**:
   - **Worktree**: `./scripts/worktree.sh agent-commit <branch> "<message>"`
   - **Main repo**: Use canonical command below

6. **Verify**:
   ```bash
   git log --show-signature -1
   ```
   Confirm: Author=user, Committer=agent, signature=agent key.

---

## Version-Bump Guard

- `feat:` — ONLY for genuinely new user-facing capability.
- `fix:` — bugs, defects, regressions.
- `refactor:` — structural change, no behavioral difference.
- `chore:` — tooling, config, build, deps, maintenance.
- `perf:` — measurable performance improvement.
- `docs:` — documentation only.
- `test:` — test-only changes.
- `ci:` — CI/CD pipeline changes.

When unsure whether a change qualifies as `feat:`, ask the user.

---

## Hard Rules

- **NEVER run `git push`** in any form.
- **NEVER use user's private GPG key** — agent signs only with `AGENT_GPG_KEY_ID`.
- **NEVER edit `~/.gitconfig`** or any global git config.
- **Always confirm** staged files and commit message with user.
- **Always verify** signature with `git log --show-signature -1`.
- **On GPG failure** — stop, tell user to unlock gpg-agent, retry.
