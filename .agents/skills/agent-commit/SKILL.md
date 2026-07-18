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

| Role      | Identity              | GPG Key            |
|-----------|-----------------------|--------------------|
| Author    | User (human)          | User key (private) |
| Committer | Agent                 | Agent key          |

---

## Configuration — `.credentials.env`

Agent identity is read from `$REPO_ROOT/.credentials.env` (gitignored):

```bash
# .credentials.env (NEVER commit this file)
AGENT_GPG_KEY_ID="<fingerprint>"
AGENT_GPG_NAME="<committer name>"
AGENT_GPG_EMAIL="<committer email>"
```

The script `scripts/worktree.sh` sources this file automatically. For
manual commits, read the values and use them in the canonical command below.

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

Run in a **real terminal — NOT inside opencode**. Use the key ID from
`.credentials.env`:

```bash
gpg --pinentry-mode loopback \
    --sign --local-user <AGENT_GPG_KEY_ID> \
    --output /dev/null /dev/null
```

After TTL expires, run again in a real terminal.

### Agent Commit Behavior

If cache is cold, `git commit -S` fails with a pinentry/no-passphrase
error. Agent MUST NOT retry silently or fall back to unsigned. On failure:
stop, tell user to run the unlock command above, then retry.

---

## Canonical Commit Command

Read agent identity from `.credentials.env`, then:

```bash
GIT_COMMITTER_NAME="<AGENT_GPG_NAME>" \
GIT_COMMITTER_EMAIL="<AGENT_GPG_EMAIL>" \
git -c user.signingkey=<AGENT_GPG_KEY_ID> \
    -c commit.gpgsign=true \
    commit -S \
    --author="<user name> <<user email>>" \
    -m "<type>(<scope>): <subject>

Co-authored-by: <AGENT_GPG_NAME> <<AGENT_GPG_EMAIL>>"
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

1. **Detect repo commit conventions** — check `git log --oneline -20`.
   Match detected convention exactly.

2. **Stage explicitly** — confirm with user which files are staged.
   Never run `git add .` silently.

3. **Compose message** — follow Version-Bump Guard below.

4. **Show full command and message** — wait for user confirmation.

5. **Execute commit** (via canonical command above).

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
